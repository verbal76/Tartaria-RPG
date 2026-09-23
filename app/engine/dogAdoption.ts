import type {
  InventoryItem,
  PendingDogOnboarding,
  PlayerCharacter,
  ReleasedDog,
  WorldMemory,
} from './types';
import type { ProspectiveDog } from './dogBreeds';
import { wornDogVestInstanceId } from './dogCompanion';

/** ⚠⚠⚠ THE ADOPTION IS ONE TRANSACTION, AND IT LIVES HERE BECAUSE IT IS THE
 *  MOST DANGEROUS WRITE IN THE DOG SYSTEM.
 *
 *  Owner contract, in his words: *"Until FINAL confirmation: no TC spent, no old
 *  dog released, no gear destroyed, no prospective dog acquired."* And: *"Do not
 *  permit an interrupted onboarding flow to produce: old dog gone / TC gone /
 *  new dog vanished."*
 *
 *  Four irreversible things happen at once — coin leaves, a living companion is
 *  set free, an equipped vest leaves the pack with it, and an onboarding opens.
 *  Split across four call sites they could interleave, half-apply, or be
 *  re-entered. So the whole thing is TWO PURE FUNCTIONS:
 *
 *    · `planDogAdoption` decides and computes. It touches nothing.
 *    · `applyDogAdoption` writes, in ONE object, from a plan it did not make.
 *
 *  The store's job is reduced to calling them inside a single `set`, which is
 *  synchronous — so there is no window in which the coin is gone and the dog is
 *  not, and a reload mid-onboarding finds a save where the purchase completed
 *  and only the naming card is outstanding.
 *
 *  ⚠ THIS FILE DELIBERATELY HAS NO STORE IN IT, for the reason dogMarket.ts
 *  gives: the whole acquisition is testable without booting the native stack.
 *
 *  ⚠ A RELEASED DOG IS NOT A DEAD DOG. Nothing here touches `fallenDogs`, the
 *  Last Walk, or the death flags. The owner ruled that out by name. */

export type DogAdoptionRefusalCode =
  /** No player, or the vendor vanished between the card opening and the tap. */
  | 'no_vendor'
  /** ⚠ RULE 27. The stall refreshed and the animal on the card is no longer the
   *  animal on the shelf. Fail safe — never quietly sell the replacement. */
  | 'offer_gone'
  /** An acquisition is already in flight. */
  | 'onboarding_pending'
  | 'insufficient_tc';

export interface DogAdoptionRefusal {
  readonly ok: false;
  readonly code: DogAdoptionRefusalCode;
  /** Ready to hand to appendLog — the caller supplies the vendor's name. */
  readonly message: string;
}

export interface DogAdoptionPlan {
  readonly ok: true;
  readonly price: number;
  readonly dog: ProspectiveDog;
  /** ⚠ null when there was no LIVING companion — a dead or abandoned
   *  `player.dog` is a record, not a dog at your side, so nothing is released
   *  and the OTA-1726 replacement-after-death path is byte-for-byte unchanged. */
  readonly released: ReleasedDog | null;
  /** The one inventory instance that leaves with the released dog, if it was
   *  still wearing something. Resolved through the OTA-956 authority so this
   *  cannot disagree with the badge the player was looking at. */
  readonly surrendered: { readonly id: string; readonly name: string } | null;
}

export type DogAdoptionOutcome = DogAdoptionPlan | DogAdoptionRefusal;

/** How many released dogs the world remembers. Flavour-only identity (see
 *  `ReleasedDog`), so it is capped the same way `chainMemos` is: a save that
 *  runs for a thousand days must not carry an unbounded list nobody reads. */
export const RELEASED_DOG_MEMORY = 50;

function livingDog(player: PlayerCharacter): PlayerCharacter['dog'] | null {
  const dog = player.dog;
  if (!dog) return null;
  // The same predicate `hasActiveDog` uses. Kept as a local read rather than a
  // store import so this file stays store-free.
  if (dog.status !== 'with_player' && dog.status !== 'waiting_at_base') return null;
  return dog;
}

/** ⚠⚠⚠ DECIDES. WRITES NOTHING.
 *
 *  Every refusal below returns BEFORE any mutation is computed, which is what
 *  makes "no TC spent, no old dog released, no gear destroyed" a property of
 *  the code rather than a promise in a comment. */
export function planDogAdoption(args: {
  player: PlayerCharacter | null | undefined;
  worldMemory: WorldMemory;
  vendorName: string;
  /** The offer the player is looking at, re-read from the LIVE vendor. */
  liveOffer: { price: number; dog?: ProspectiveDog } | null | undefined;
  /** The identity the comparison card was opened with. */
  expectedOfferId: string;
}): DogAdoptionOutcome {
  const { player, worldMemory, vendorName, liveOffer, expectedOfferId } = args;
  if (!player) {
    return { ok: false, code: 'no_vendor', message: "There's no one here to trade with." };
  }
  /* ⚠ OWNER RULE 27, THE WHOLE OF IT. The card holds an `offerId`; the shelf
   *  holds an animal. If a refresh put a different individual on the counter
   *  between the two, the sale is refused outright — it is NOT retargeted to
   *  whatever is standing there now. The player inspected one dog and would be
   *  handed another, and that is exactly the failure this identity exists for. */
  const dog = liveOffer?.dog;
  if (!dog || dog.offerId !== expectedOfferId) {
    return {
      ok: false,
      code: 'offer_gone',
      message: `${vendorName} has already moved that dog on. Take another look at what's on the counter.`,
    };
  }
  if (worldMemory.pendingDogOnboarding) {
    return {
      ok: false,
      code: 'onboarding_pending',
      message: "You're still settling the dog you just took on.",
    };
  }
  /* ⚠ THE PRICE THAT IS CHARGED IS THE PRICE ON THE LIVE OFFER, not the one the
   *  card was rendered with. They agree — the offer is re-found by identity a
   *  few lines up — and reading the live row means they cannot ever stop
   *  agreeing. */
  const price = liveOffer!.price;
  if ((player.tc ?? 0) < price) {
    return {
      ok: false,
      code: 'insufficient_tc',
      message: `${vendorName} keeps a hand on the lead. "${price} TC, and I don't come down on a good dog. Come back heavier."`,
    };
  }

  const outgoing = livingDog(player);
  const released: ReleasedDog | null = outgoing
    ? {
        id: outgoing.id,
        name: outgoing.name,
        breed: outgoing.breed,
        releasedAtHour: player.hoursElapsed ?? 0,
      }
    : null;

  /* ⚠⚠⚠ THE GEAR LEAVES WITH THE DOG (owner rule 20) AND THIS IS THE ONLY
   *  DESTRUCTIVE INVENTORY WRITE IN THE PACKAGE.
   *
   *  A worn vest NEVER leaves `player.inventory` — equipping only writes the
   *  dog's `equipped` pair — so "it leaves with the dog" means an inventory
   *  instance is deleted, and a wrong instance id here destroys an object the
   *  player earned. It is therefore resolved through `wornDogVestInstanceId`,
   *  the OTA-956 authority that the inventory badge itself uses: id first, then
   *  a name match constrained to things that ARE dog armor. If that returns
   *  null NOTHING is removed — an unresolvable vest is left in the pack, which
   *  is the failure direction that cannot lose anything. */
  const wornId = outgoing ? wornDogVestInstanceId(player) : null;
  const wornItem = wornId ? (player.inventory ?? []).find((it) => it.id === wornId) : null;

  return {
    ok: true,
    price,
    dog,
    released,
    surrendered: wornItem ? { id: wornItem.id, name: wornItem.name } : null,
  };
}

/** Removes exactly ONE unit of `id`. A stack loses a unit; a singleton is
 *  dropped. Never touches another instance, even a same-named one. */
function withoutOneUnit(inventory: readonly InventoryItem[], id: string): InventoryItem[] {
  const out: InventoryItem[] = [];
  let done = false;
  for (const it of inventory) {
    if (!done && it.id === id) {
      done = true;
      const qty = Math.max(1, it.quantity ?? 1);
      if (qty > 1) out.push({ ...it, quantity: qty - 1 });
      continue;
    }
    out.push(it);
  }
  return out;
}

/** ⚠⚠⚠ WRITES. DECIDES NOTHING.
 *
 *  Returns the complete post-transaction `player` and `worldMemory` as one
 *  object so the caller can hand both to a single `set` — there is deliberately
 *  no way to apply half of this. */
export function applyDogAdoption(
  player: PlayerCharacter,
  worldMemory: WorldMemory,
  plan: DogAdoptionPlan,
): { player: PlayerCharacter; worldMemory: WorldMemory } {
  const inventory = plan.surrendered
    ? withoutOneUnit(player.inventory ?? [], plan.surrendered.id)
    : (player.inventory ?? []);

  /* ⚠ THE ONBOARDING CARRIES THE ROLLED SHEET. Without `market` here,
   *  `createDogCompanion` would build the breed's average and the comparison
   *  card would have promised one animal and delivered another. The breed is
   *  pre-filled too — a shelf dog arrives with its breed already named, and the
   *  card shows it as an editable default because breed is free text with no
   *  mechanical effect. */
  const pendingDogOnboarding: PendingDogOnboarding = {
    stage: 'breed',
    rescueData: {
      scenario: 'market',
      startingProfile: plan.dog.profile,
      market: {
        breedId: plan.dog.breedId,
        breedLabel: plan.dog.breedLabel,
        stats: { ...plan.dog.stats },
        potential: { ...plan.dog.potential },
        hpMax: plan.dog.hpMax,
      },
    },
    breed: plan.dog.breedLabel,
  };

  /* ⚠ DEDUPED BY THE DOG'S OWN ID. One animal can only be released once, so a
   *  replayed write (a resumed save, a double dispatch that got past every
   *  other guard) cannot write a second record for it. */
  const priorReleased = (worldMemory.releasedDogs ?? []).filter(
    (r) => !plan.released || r.id !== plan.released.id,
  );
  const releasedDogs = plan.released
    ? [...priorReleased, plan.released].slice(-RELEASED_DOG_MEMORY)
    : worldMemory.releasedDogs;

  return {
    player: {
      ...player,
      tc: (player.tc ?? 0) - plan.price,
      inventory,
      /* ⚠ THE OLD DOG IS GONE FROM THE PLAYER, NOT KILLED. `finalizeDogOnboarding`
       *  overwrites `player.dog` wholesale with the new companion a moment later;
       *  clearing it here is what makes the intervening state honest — during
       *  naming there is genuinely no dog at your side. */
      dog: null,
    },
    worldMemory: {
      ...worldMemory,
      ...(releasedDogs ? { releasedDogs } : {}),
      pendingDogOnboarding,
    },
  };
}
