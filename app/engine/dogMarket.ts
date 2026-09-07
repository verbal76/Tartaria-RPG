import type { DogStartingProfile } from './types';

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
 *  price the economy already carries. Measured against a real purse: the owner's
 *  most recent log shows him holding 459 TC, so 600 is a sum he must go and earn
 *  and cannot ignore. That is what "substantial" has to mean to be worth writing.
 *
 *  ⚠⚠ THIS FILE DELIBERATELY HAS NO STORE IN IT. It is the same shape as
 *  `techniqueTextOfferFor` — gates in a pure function, so the whole acquisition
 *  can be tested without booting the native ML stack — and for the same reason. */

/** The Rare rung. See above: the owner's number and the game's existing price
 *  for a feature-opening purchase are the same number. */
export const REPLACEMENT_DOG_PRICE = 600;

/** ⚠ Faction dogs cost more because they ARE more, and because rapport is a gate
 *  you pay in work rather than coin. 900 sits deliberately between the Rare rung
 *  (600) and the Legendary one (1400): a player who has finished a faction's
 *  rapport quest can reach it, and it never competes with the most expensive
 *  purchase in the game. */
export const FACTION_DOG_PRICE = 900;

export interface DogMarketRow {
  /** What the player types after `buy`, and what the shelf shows. */
  readonly itemName: string;
  readonly price: number;
  readonly profile: DogStartingProfile;
  /** null for the ordinary dog any trader can sell. */
  readonly faction: string | null;
  /** One line of shelf copy — this is a living animal on a stall, and the row
   *  has to read like one or the purchase reads like buying a hat. */
  readonly blurb: string;
}

/** The dog anyone will sell you. `mongrel` is the balanced profile (10/10/10,
 *  16 HP) — the one that is neither a specialisation nor a puppy, which is
 *  exactly what "ordinary replacement" means. */
export const ORDINARY_DOG: DogMarketRow = {
  itemName: 'Kennel Dog',
  price: REPLACEMENT_DOG_PRICE,
  profile: 'mongrel',
  faction: null,
  blurb: 'Grown, sound, and already used to a lead. Someone else raised it; the rest is yours.',
};

/** ⚠⚠ THREE FACTIONS, NOT NINE — the same restraint `techniqueTextOfferFor`
 *  shows (four factions carry a procedure, five carry none). A dog per faction
 *  would be nine names for three distinct stat profiles, which is six rows that
 *  differ only in their label. Each of these is the ONE profile that faction
 *  would actually breed for. */
export const FACTION_DOGS: Readonly<Record<string, DogMarketRow>> = {
  true_tartarians: {
    itemName: 'Tartarian War Shepherd',
    price: FACTION_DOG_PRICE,
    profile: 'shepherd',
    faction: 'true_tartarians',
    blurb: 'Bred heavy in the chest and trained to hold a line. It has already stood in front of someone.',
  },
  reclaimers_guild: {
    itemName: "Reclaimer's Scent Hound",
    price: FACTION_DOG_PRICE,
    profile: 'hound',
    faction: 'reclaimers_guild',
    blurb: 'Light, fast, and worth more than the salvage it finds. The Guild does not sell these to strangers.',
  },
  forgotten_order: {
    itemName: "Order's Seeker",
    price: FACTION_DOG_PRICE,
    profile: 'mutt',
    faction: 'forgotten_order',
    blurb: 'Quiet, watchful, and taught to flag what it does not understand rather than dig it up.',
  },
};

export const ALL_DOG_MARKET_ROWS: readonly DogMarketRow[] = [
  ORDINARY_DOG,
  ...Object.values(FACTION_DOGS),
];

/** Is this name a dog on a shelf? The buy path asks BEFORE the catalog lookup,
 *  the same way it asks about procedures and recipes — a dog must never mint as
 *  an inventory item. Case-insensitive because the player types it. */
export function dogMarketRowByName(name: string | null | undefined): DogMarketRow | null {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  return ALL_DOG_MARKET_ROWS.find((r) => r.itemName.toLowerCase() === lower) ?? null;
}

/** ⚠⚠⚠ THE OFFER A VENDOR ADDS, OR NULL — every canon gate in one place.
 *
 *  `hadDogEver` is the load-bearing one and it is the FIRST canon point: the
 *  rescue encounter is still how you meet the dog system, so the market is
 *  invisible until you have had a dog. Without that gate a new character could
 *  buy their way past the introduction, and the rescue arc — five authored
 *  scenarios — would be optional content nobody sees.
 *
 *  ⚠ Nothing here reads the death flag. That is the point. Under the old design
 *  the ONLY route to another dog was `puppyVendorOwed`, a single-shot flag that
 *  flipped on death and retired itself forever; a player whose pack was empty
 *  when the offer fired had it retired for nothing and could never hold a dog
 *  again. The market is open on the same terms every time, which is what "loss
 *  does not permanently remove access" has to mean. */
export function dogOfferFor(opts: {
  vendorFaction: string | null | undefined;
  hasRapport: boolean;
  hadDogEver: boolean;
  hasActiveDog: boolean;
  onboardingPending: boolean;
}): { itemName: string; price: number; quantity: number } | null {
  if (!opts.hadDogEver) return null;
  if (opts.hasActiveDog) return null;
  if (opts.onboardingPending) return null;
  const factionRow = opts.vendorFaction ? FACTION_DOGS[opts.vendorFaction] : undefined;
  const row = factionRow && opts.hasRapport ? factionRow : ORDINARY_DOG;
  return { itemName: row.itemName, price: row.price, quantity: 1 };
}
