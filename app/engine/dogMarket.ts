import type { DogStartingProfile, PlayerCharacter, WorldMemory } from './types';
import type { VendorInstance } from './vendors';
import {
  ALL_DOG_BREEDS, breedsForVendor, rollProspectiveDog,
  type DogBreed, type ProspectiveDog, type Rng,
} from './dogBreeds';

/** ⚠⚠⚠ OTA-1726 — WHERE A REPLACEMENT DOG COMES FROM.
 *
 *  The owner's canon, stated in full:
 *    · the original first-dog encounter remains the introduction to the system;
 *    · once dog gameplay is unlocked, losing an individual dog does NOT
 *      permanently remove access to dogs;
 *    · an individual dog's death is still permanent — a replacement inherits
 *      nothing: not identity, bond, progression, equipment, history or status;
 *    · ordinary replacements are bought, at substantial cost, "centered around
 *      roughly 600 TC";
 *    · faction dogs stay better and specialised, and cost faction access on top
 *      of money;
 *    · neglect-abandonment buys you nothing.
 *
 *  ⚠ 600 IS NOT A GUESS AND NOT A NEW RUNG. `techniqueTextPrice` already charges
 *  exactly 600 TC for a Rare aether procedure — the game's other "this is the
 *  only route into a whole feature" purchase — so the owner's number lands on a
 *  price the economy already carries.
 *
 *  ⚠⚠ THIS FILE DELIBERATELY HAS NO STORE IN IT. Gates in a pure function, so
 *  the whole acquisition can be tested without booting the native ML stack.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  ⚠⚠⚠ AND THEN THE MARKET BECAME A MARKET.
 *
 *  Owner, on the audit that proved dogs were suppressed while you owned one:
 *  *"That is NOT the final owner design contract."* The dog system is meant to
 *  carry an ongoing companion market and an upgrade/replacement lifecycle — a
 *  player with a living dog must still be able to encounter, inspect, compare
 *  and adopt another.
 *
 *  Two things changed here and nothing else did:
 *
 *  ⚠ `hasActiveDog` IS NO LONGER A GATE. It was the one line that made the
 *  market invisible to anyone who already had a dog, and it is gone. The gates
 *  that remain are the ones the owner kept by name: the first-dog rescue is
 *  still the introduction (`hadDogEver`), and an acquisition already in flight
 *  still blocks a second (`onboardingPending`).
 *
 *  ⚠ THE ROW IS AN ANIMAL, NOT A CATALOG ENTRY. Every vendor dog is now rolled
 *  inside its breed's ranges (see dogBreeds.ts), so two stalls selling Border
 *  Collies are selling two different dogs, and the one the player inspected is
 *  the one the confirm must hand over. The rolled sheet rides on the offer. */

/** The Rare rung. The owner's number and the game's existing price for a
 *  feature-opening purchase are the same number. Kept as the ordinary market's
 *  centre — the breed bands in dogBreeds.ts are written around it. */
export const REPLACEMENT_DOG_PRICE = 600;

/** ⚠ Faction dogs cost more because they ARE more, and because rapport is a gate
 *  you pay in work rather than coin. Kept as the faction floor the breed bands
 *  are written around. */
export const FACTION_DOG_PRICE = 900;

export interface DogMarketRow {
  /** What the player types after `buy`, and what the shelf shows. */
  readonly itemName: string;
  readonly price: number;
  readonly profile: DogStartingProfile;
  /** null for a dog any trader can sell. */
  readonly faction: string | null;
  /** One line of shelf copy — this is a living animal on a stall, and the row
   *  has to read like one or the purchase reads like buying a hat. */
  readonly blurb: string;
}

function rowOf(b: DogBreed): DogMarketRow {
  return {
    itemName: b.label,
    price: b.price[0],
    profile: b.profile,
    faction: b.faction,
    blurb: b.trait,
  };
}

/** ⚠ Every breed is a market name now, so `buy <breed>` keeps working and the
 *  collision check (no market name may equal a catalog item) still has one
 *  list to walk. */
export const ALL_DOG_MARKET_ROWS: readonly DogMarketRow[] = ALL_DOG_BREEDS.map(rowOf);

/** ⚠⚠⚠ WHAT THE SHELF ACTUALLY ASKS — DERIVED, NEVER TYPED TWICE.
 *
 *  The teaching card quoted `REPLACEMENT_DOG_PRICE` as a flat figure, which
 *  was true while one catalog row cost one number. It is not true now: a dog
 *  is priced off its own rolled potential inside its breed's band, so a player
 *  told "600 TC" and shown 675 has been misinformed by his own tutorial.
 *
 *  ⚠ COMPUTED FROM THE BANDS rather than written down beside them. A number in
 *  the card and a number in the table are two readings of one rule, and this
 *  project has repaired that shape repeatedly — the card cannot go stale
 *  against a breed the next OTA adds, because it is not a copy. */
const spanOf = (breeds: readonly DogBreed[]): readonly [number, number] => [
  Math.min(...breeds.map((b) => b.price[0])),
  Math.max(...breeds.map((b) => b.price[1])),
];
export const ORDINARY_DOG_PRICE_SPAN = spanOf(ALL_DOG_BREEDS.filter((b) => b.faction === null));
export const FACTION_DOG_PRICE_SPAN = spanOf(ALL_DOG_BREEDS.filter((b) => b.faction !== null));

/** Is this name a dog on a shelf? The buy path asks BEFORE the catalog lookup,
 *  the same way it asks about procedures and recipes — a dog must never mint as
 *  an inventory item. Case-insensitive because the player types it. */
export function dogMarketRowByName(name: string | null | undefined): DogMarketRow | null {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  return ALL_DOG_MARKET_ROWS.find((r) => r.itemName.toLowerCase() === lower) ?? null;
}

/** ⚠⚠⚠ IS THIS SHELF ROW A LIVING ANIMAL? — asked by every path that would
 *  otherwise treat it as stock.
 *
 *  `buyFromVendor` has asked the dog lookup BEFORE the catalog lookup since
 *  OTA-1726, for the stated reason that a dog must never mint as an inventory
 *  item. `stealFromVendor` never asked. That was not reachable in practice
 *  while the dog row was hidden from anyone who already owned a dog and showed
 *  up at only a fraction of stalls — but the companion market puts a
 *  prospective animal on EVERY eligible counter, so `steal <breed>` became a
 *  broadly available way to drop a living creature into the pack as bare
 *  'misc', with no `use` handler, no dossier and no way back out.
 *
 *  ⚠ Both readings, because a row can be a dog two ways: it carries a rolled
 *  animal (`dog`), or its name is a breed this market sells. */
export function offerIsALivingAnimal(offer: { itemName: string; dog?: unknown }): boolean {
  return !!offer.dog || !!dogMarketRowByName(offer.itemName);
}

/** ⚠ A REFUSAL, NOT A SILENT RETURN (B15). The player's instinct here is a
 *  reasonable one, so the answer is a rule about what a dog IS rather than a
 *  shrug about a missing feature. */
export const STEAL_A_DOG_REFUSAL =
  'The Arbiter puts a hand flat against your chest. "That is not stock. It is an animal, '
  + 'and it will follow whoever it chooses to follow — not whoever gets a hand on the lead."';

/** ⚠⚠⚠ THE OFFER A VENDOR ADDS, OR NULL — every canon gate in one place.
 *
 *  `hadDogEver` is the load-bearing one and it is the FIRST canon point: the
 *  rescue encounter is still how you meet the dog system, so the market is
 *  invisible until you have had a dog. Without that gate a new character could
 *  buy their way past the introduction, and the rescue arc — five authored
 *  scenarios — would be optional content nobody sees.
 *
 *  ⚠ Nothing here reads the death flag, and nothing here reads whether a dog is
 *  currently at your side. The first is OTA-1726's point (the market is open on
 *  the same terms every time, which is what "loss does not permanently remove
 *  access" has to mean). The second is the owner's correction: a living dog no
 *  longer hides the stall, because comparing your companion against what is on
 *  offer IS the feature.
 *
 *  ⚠ ONE DOG. An eligible vendor has exactly one prospective animal — not a
 *  kennel of rows — and it rides this vendor's inventory. When the stall
 *  refreshes, this runs again and a different individual may be standing there.
 *  Nothing is remembered about a dog the player never owned. */
export function dogOfferFor(opts: {
  vendorFaction: string | null | undefined;
  hasRapport: boolean;
  hadDogEver: boolean;
  onboardingPending: boolean;
  /** Injectable only so a test can be deterministic. */
  rng?: Rng;
}): { itemName: string; price: number; quantity: number; dog: ProspectiveDog } | null {
  if (!opts.hadDogEver) return null;
  if (opts.onboardingPending) return null;
  const rng = opts.rng ?? Math.random;
  const pool = breedsForVendor({ vendorFaction: opts.vendorFaction, hasRapport: opts.hasRapport });
  if (pool.length === 0) return null;
  const breed = pool[Math.floor(rng() * pool.length)] ?? pool[0]!;
  const dog = rollProspectiveDog(breed, rng);
  return { itemName: dog.breedLabel, price: dog.price, quantity: 1, dog };
}

/** ⚠⚠⚠ OTA-1726 — THE ROAD BACK TO A DOG. Owner's canon: *"once dog gameplay is
 *  unlocked, loss of an individual dog does not permanently remove access to
 *  dogs"* — ordinary replacements bought through market / random-vendor
 *  mechanisms at substantial cost, faction dogs better and gated on faction
 *  access as well as coin.
 *
 *  ⚠ IT LIVES HERE, NOT IN THE STORE. Owner ruling: pure, store-free
 *  dog-market behaviour does not belong inside the monolithic store. It takes
 *  a vendor and returns a vendor; nothing about it needs `get`/`set`.
 *
 *  ⚠ THIRD INSTANCE OF A TWICE-DOCUMENTED PATTERN, not a new system. Same shape
 *  as `withSkyreacherChartOffer` and `withTechniqueTextOffer` directly above:
 *  append one conditional row to a vendor's offers, gates in a pure engine
 *  function so they can be tested without a store. Like the technique text and
 *  unlike the chart there is NO die roll — a route into a whole feature that
 *  appears 18% of the time is indistinguishable from a route that does not
 *  exist, and this is the only route back to a companion.
 *
 *  ⚠⚠ WHAT IT REPLACES. The old road back was the puppy vendor: a single-shot
 *  flag (`puppyVendorOwed`) that flipped on the dog's death, offered you a pup
 *  for one Common item, and told you to type `accept puppy` — a phrase with no
 *  parser verb and no handler anywhere in the app. It could not be completed by
 *  anyone. Worse, its no-tradeable-item branch set `puppyVendorUsed: true` and
 *  retired itself FOREVER, so a player whose pack happened to be empty when it
 *  fired lost access to dogs for the rest of that save. Every part of that
 *  contradicts the canon; none of it was worth repairing. */
export function withReplacementDogOffer(
  vendor: VendorInstance | null,
  player: PlayerCharacter | null,
  wm: WorldMemory,
): VendorInstance | null {
  if (!vendor || !player) return vendor;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { hasFactionRapport } = require('./factionRapport') as typeof import('./factionRapport');
  // ⚠ nativeFaction first, for the reason withTechniqueTextOffer states: OTA-1186
  // skins a site to its OWNER, and a dog belongs to whoever the vendor really
  // answers for.
  const faction = vendor.nativeFaction ?? vendor.faction;
  const offer = dogOfferFor({
    vendorFaction: faction,
    hasRapport: hasFactionRapport(player.completedFactionQuestIds, faction),
    // ⚠⚠ THE FIRST-DOG ENCOUNTER IS STILL THE INTRODUCTION. `player.dog` is
    // non-null for a dead or abandoned dog too (OTA-346 keeps the record), so
    // this reads "has ever had a dog" — exactly the canon gate. Without it a
    // fresh character could buy past five authored rescue scenarios.
    // ⚠ A RELEASED DOG COUNTS TOO. The adoption clears `player.dog` while the
    // naming card is open; without this arm a dismissed card would shut the
    // only route back to a dog for the rest of the save.
    hadDogEver: !!player.dog || (wm.releasedDogs?.length ?? 0) > 0,
    /* ⚠⚠⚠ `hasActiveDog` USED TO BE A GATE HERE AND IS DELIBERATELY GONE.
     *
     *  Owner, after the reachability audit proved the suppression: *"That is
     *  NOT the final owner design contract."* A player with a living dog must
     *  still be able to encounter, inspect and compare another — the
     *  comparison IS the feature, and hiding the stall made it unreachable.
     *  The remaining gates are the two the owner kept by name: the rescue is
     *  still the introduction (`hadDogEver`), and an acquisition already in
     *  flight still blocks a second (`onboardingPending`). Replacing a living
     *  companion is safe because the ADOPTION path makes it safe, not because
     *  the shelf was hidden. */
    onboardingPending: !!wm.pendingDogOnboarding,
  });
  if (!offer) return vendor;
  /* ⚠ ONE PROSPECTIVE DOG PER STALL. Keyed on "is there already a dog row",
   *  not on the name: every breed is a different name now, so a name check
   *  would happily stack a Greyhound beside a Border Collie and turn the
   *  counter into the kennel the owner ruled out. */
  if (vendor.offers.some((o) => !!o.dog)) return vendor;
  return { ...vendor, offers: [...vendor.offers, offer] };
}
