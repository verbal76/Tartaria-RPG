// ⚠⚠⚠ OTA — THE DOG MARKET SELLS POTENTIAL, NOT A FINISHED DOG.
//
// Owner's contract, stated in full:
//   · one active dog, always — no kennel, no second slot;
//   · a vendor may show a dog WHILE you already have one;
//   · one prospective dog per eligible vendor, refreshed with the stall;
//   · breed sets RANGES, the individual is rolled inside them;
//   · "you buy potential, not a finished dog" — a purchased dog is never
//     fully developed, and an expensive one may be WEAKER TODAY than the
//     veteran already walking beside you;
//   · exact CURRENT / MAXIMUM is shown for both dogs — no vague "high
//     potential" abstraction;
//   · faction breeds are exclusive to their faction's vendors.
//
// ⚠⚠ THE MECHANICAL AXIS IS `startingProfile`, NOT `breed`. This is the fact
// the whole file is built around and it came out of the audit rather than out
// of a preference: `DogCompanion.breed` is PLAYER FREE TEXT, capped at 24
// chars, blank-allowed, and its own type comment says "Pure flavor — no
// mechanical effect". The five-value `DogStartingProfile` union is what the
// engine has always read. So a breed here CARRIES a profile rather than
// replacing it, and every dog this file mints is a dog the existing engine
// already knows how to run, train, feed, equip and bury.
//
// ⚠ AND THE CEILING IS PER-DOG NOW. Before this the only cap was
// `DOG_MAX_TRAINED_STAT = 30` — one module-private constant shared by every
// dog alive, which is exactly why "this dog could go further than that one"
// could not be said. 30 survives as the ABSOLUTE ENGINE MAXIMUM; what is new
// is that each dog carries its own ceiling at or below it.
import type { DogStartingProfile } from './types';

/** The three stats the dog engine has always had. */
export interface DogStatTriple {
  strength: number;
  dexterity: number;
  intelligence: number;
}
export const DOG_STAT_KEYS = ['strength', 'dexterity', 'intelligence'] as const;
export type DogStatName = (typeof DOG_STAT_KEYS)[number];

/** Inclusive [min, max]. */
export type Band = readonly [number, number];

export interface DogBreed {
  readonly id: string;
  /** What the shelf and the comparison card call it. */
  readonly label: string;
  /** null = the ordinary market any trader draws from.
   *  non-null = EXCLUSIVE to that faction's vendors (never leaks — see
   *  `breedsForVendor`). */
  readonly faction: string | null;
  /** The existing engine profile this breed runs on. */
  readonly profile: DogStartingProfile;
  /** The individual's STARTING stats are rolled in here. */
  readonly base: Readonly<Record<DogStatName, Band>>;
  /** The individual's CEILING is rolled in here. */
  readonly potential: Readonly<Record<DogStatName, Band>>;
  /** Starting max HP band — rolled like the stats, not read off a table. */
  readonly hp: Band;
  /** Price band. See `priceFor`. */
  readonly price: Band;
  /** One line the comparison card shows. Flavour with a mechanical hint —
   *  it names what the breed is FOR, which is the whole reason to prefer a
   *  lower-stat dog over a higher one. */
  readonly trait: string;
}

/* ─────────────────────── THE ORDINARY MARKET ───────────────────────
 * Real breeds, chosen because each one reads as a different ANSWER rather
 * than a different number: a guard, a sprinter, a thinker, a generalist and
 * a pup you are buying entirely on the future. Price bands sit inside the
 * established ~500–700 ordinary market the owner set, centred near 600 —
 * `REPLACEMENT_DOG_PRICE` in dogMarket.ts is that centre and is unchanged. */
const ORDINARY: readonly DogBreed[] = [
  {
    id: 'anatolian_shepherd',
    label: 'Anatolian Shepherd',
    faction: null,
    profile: 'shepherd',
    base: { strength: [11, 13], dexterity: [8, 10], intelligence: [8, 10] },
    potential: { strength: [24, 28], dexterity: [14, 17], intelligence: [14, 17] },
    hp: [17, 20],
    price: [600, 700],
    trait: 'Bred to stand between a flock and whatever wants it. Slow to move, hard to move.',
  },
  {
    id: 'rottweiler',
    label: 'Rottweiler',
    faction: null,
    profile: 'shepherd',
    base: { strength: [11, 13], dexterity: [9, 11], intelligence: [9, 11] },
    potential: { strength: [23, 27], dexterity: [16, 19], intelligence: [16, 19] },
    hp: [16, 19],
    price: [575, 675],
    trait: 'Drover stock. Takes a hit without giving ground and expects to be told why.',
  },
  {
    id: 'belgian_malinois',
    label: 'Belgian Malinois',
    faction: null,
    profile: 'hound',
    base: { strength: [9, 11], dexterity: [11, 13], intelligence: [10, 12] },
    potential: { strength: [17, 20], dexterity: [24, 27], intelligence: [19, 22] },
    hp: [14, 17],
    price: [625, 700],
    trait: 'Working line. Quick, wound tight, and miserable without a job to do.',
  },
  {
    id: 'greyhound',
    label: 'Greyhound',
    faction: null,
    profile: 'hound',
    base: { strength: [7, 9], dexterity: [12, 14], intelligence: [9, 11] },
    potential: { strength: [11, 14], dexterity: [26, 30], intelligence: [13, 16] },
    hp: [12, 15],
    price: [550, 650],
    trait: 'Built for one thing and unbeatable at it. Ask nothing of it in a brawl.',
  },
  {
    id: 'border_collie',
    label: 'Border Collie',
    faction: null,
    profile: 'mutt',
    base: { strength: [8, 10], dexterity: [10, 12], intelligence: [11, 13] },
    potential: { strength: [14, 17], dexterity: [19, 22], intelligence: [25, 29] },
    hp: [13, 16],
    price: [600, 700],
    trait: 'Reads a situation before you have finished walking into it.',
  },
  {
    id: 'mudland_mongrel',
    label: 'Mudland Mongrel',
    faction: null,
    profile: 'mongrel',
    base: { strength: [9, 11], dexterity: [9, 11], intelligence: [9, 11] },
    potential: { strength: [22, 26], dexterity: [20, 24], intelligence: [18, 22] },
    hp: [15, 18],
    price: [500, 600],
    trait: 'No line worth naming. Hard as the flats that bred it — and about as quick to think.',
  },
  {
    id: 'yard_pup',
    label: 'Yard Pup',
    faction: null,
    profile: 'puppy',
    base: { strength: [7, 9], dexterity: [8, 10], intelligence: [8, 10] },
    potential: { strength: [22, 26], dexterity: [22, 26], intelligence: [19, 23] },
    hp: [11, 14],
    price: [500, 575],
    trait: 'Half-grown and hopeless today. Body all ahead of it; the head may never quite catch up.',
  },
];

/* ─────────────────────── FACTION BREEDS ───────────────────────
 * ⚠ EXCLUSIVE. `breedsForVendor` never hands one of these to an ordinary
 * trader, and the faction gate (rapport) is enforced one layer up in
 * dogMarket.dogOfferFor exactly as it was before this file existed.
 *
 * ⚠ AND NOT "+N TO EVERYTHING". Each faction breeds for the thing that
 * faction actually does, which is why a faction dog can be the WRONG buy:
 * the Order's Seeker will never hit like the Royal Hound. */
const FACTION: readonly DogBreed[] = [
  {
    id: 'tartarian_royal_hound',
    label: 'Tartarian Royal Hound',
    faction: 'true_tartarians',
    profile: 'shepherd',
    base: { strength: [12, 14], dexterity: [10, 12], intelligence: [10, 12] },
    potential: { strength: [27, 30], dexterity: [18, 21], intelligence: [18, 21] },
    hp: [19, 22],
    price: [950, 1100],
    trait: 'Throne stock, bred before the flood to walk beside Monarchs. It knows it.',
  },
  {
    id: 'tartarian_war_shepherd',
    label: 'Tartarian War Shepherd',
    faction: 'true_tartarians',
    profile: 'shepherd',
    base: { strength: [12, 14], dexterity: [9, 11], intelligence: [9, 11] },
    potential: { strength: [26, 29], dexterity: [17, 20], intelligence: [17, 20] },
    hp: [18, 21],
    price: [900, 1000],
    trait: 'Bred heavy in the chest and trained to hold a line. It has already stood in front of someone.',
  },
  {
    id: 'reclaimer_scent_hound',
    label: "Reclaimer's Scent Hound",
    faction: 'reclaimers_guild',
    profile: 'hound',
    base: { strength: [9, 11], dexterity: [12, 14], intelligence: [11, 13] },
    potential: { strength: [17, 20], dexterity: [27, 30], intelligence: [21, 24] },
    hp: [15, 18],
    price: [900, 1025],
    trait: 'Light, fast, and worth more than the salvage it finds. The Guild does not sell these to strangers.',
  },
  {
    id: 'orders_seeker',
    label: "Order's Seeker",
    faction: 'forgotten_order',
    profile: 'mutt',
    base: { strength: [8, 10], dexterity: [10, 12], intelligence: [12, 14] },
    potential: { strength: [14, 17], dexterity: [20, 23], intelligence: [28, 30] },
    hp: [14, 17],
    price: [900, 1025],
    trait: 'Quiet, watchful, and taught to flag what it does not understand rather than dig it up.',
  },
];

export const ALL_DOG_BREEDS: readonly DogBreed[] = [...ORDINARY, ...FACTION];

export function dogBreedById(id: string | null | undefined): DogBreed | null {
  if (!id) return null;
  return ALL_DOG_BREEDS.find((b) => b.id === id) ?? null;
}

/** ⚠⚠ THE EXCLUSIVITY GATE, AND IT IS A WHITELIST, NOT A FILTER-OUT.
 *  An ordinary vendor draws from ORDINARY only. A faction vendor the player
 *  has rapport with draws from ITS OWN breeds — not every faction's, and not
 *  the ordinary pool plus a bonus. A faction breed can therefore never be
 *  rolled anywhere but at its own counter. */
export function breedsForVendor(opts: {
  vendorFaction: string | null | undefined;
  hasRapport: boolean;
}): readonly DogBreed[] {
  if (opts.vendorFaction && opts.hasRapport) {
    const own = FACTION.filter((b) => b.faction === opts.vendorFaction);
    if (own.length > 0) return own;
  }
  return ORDINARY;
}

// ───────────────────────── rolling an individual ─────────────────────────

/** Inclusive integer roll. Injectable so a test can be deterministic without
 *  the production path carrying a seed it does not need. */
export type Rng = () => number;
function between(band: Band, rng: Rng): number {
  const [lo, hi] = band;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** What a vendor is offering: a specific animal, not a catalog row. */
export interface ProspectiveDog {
  /** ⚠ STABLE IDENTITY. The comparison card holds this and the confirm
   *  re-finds the offer by it, so a stall that refreshed under an open card
   *  cannot silently sell a different animal (owner rule 27). */
  readonly offerId: string;
  readonly breedId: string;
  readonly breedLabel: string;
  readonly faction: string | null;
  readonly profile: DogStartingProfile;
  /** Where it stands TODAY. */
  readonly stats: DogStatTriple;
  /** Where it could stand. Strictly greater than `stats`, every stat. */
  readonly potential: DogStatTriple;
  readonly hpMax: number;
  readonly price: number;
  readonly trait: string;
}

/** The absolute engine maximum, re-exported so the roller and the legacy
 *  migration both clamp to the same number the trainer does. */
export const DOG_ABSOLUTE_MAX_STAT = 30;

/** ⚠⚠⚠ "YOU BUY POTENTIAL, NOT A FINISHED DOG" — ENFORCED HERE, NOT HOPED FOR.
 *  After the two independent rolls a ceiling could land at or under the base
 *  (the bands overlap by design on a low-potential breed), which would put a
 *  fully-developed animal on the shelf. So every stat is finally forced to
 *  `potential > stats`. That is the one invariant the whole design rests on
 *  and it is cheaper to guarantee than to test for. */
export function rollProspectiveDog(breed: DogBreed, rng: Rng = Math.random): ProspectiveDog {
  const stats = {} as DogStatTriple;
  const potential = {} as DogStatTriple;
  for (const k of DOG_STAT_KEYS) {
    const b = between(breed.base[k], rng);
    const p = between(breed.potential[k], rng);
    stats[k] = b;
    potential[k] = Math.min(DOG_ABSOLUTE_MAX_STAT, Math.max(p, b + 1));
    // A base pressed against the absolute ceiling yields instead: the dog is
    // never sold finished, so the BASE gives way, not the promise.
    if (stats[k] >= potential[k]) stats[k] = potential[k] - 1;
  }
  return {
    offerId: `dogoffer_${Date.now().toString(36)}_${Math.floor(rng() * 1e9).toString(36)}`,
    breedId: breed.id,
    breedLabel: breed.label,
    faction: breed.faction,
    profile: breed.profile,
    stats,
    potential,
    hpMax: between(breed.hp, rng),
    price: priceFor(breed, potential),
    trait: breed.trait,
  };
}

/** ⚠ PRICE FOLLOWS POTENTIAL, NOT TODAY'S STATS — owner rule 14. A pup that
 *  cannot win a fight this week still costs what its ceiling is worth, and a
 *  developed veteran is not for sale at any price. Kept strictly inside the
 *  breed's own band so the ordinary market stays ~500–700 and faction stock
 *  stays ~900+. */
export function priceFor(breed: DogBreed, potential: DogStatTriple): number {
  const lo = DOG_STAT_KEYS.reduce((n, k) => n + breed.potential[k][0], 0);
  const hi = DOG_STAT_KEYS.reduce((n, k) => n + breed.potential[k][1], 0);
  const got = DOG_STAT_KEYS.reduce((n, k) => n + potential[k], 0);
  const t = hi > lo ? Math.min(1, Math.max(0, (got - lo) / (hi - lo))) : 0;
  const [pLo, pHi] = breed.price;
  return Math.round(pLo + t * (pHi - pLo));
}

// ───────────────────── legacy dogs: the migration ─────────────────────

/** ⚠⚠⚠ RESCUE CEILINGS, DERIVED FROM THE AUTHORED GROWTH CURVE.
 *
 *  ⚠ THE FIRST VERSION OF THIS TABLE WAS WRONG AND THE OWNER RULED IT OUT.
 *  It read 17/21/14 — numbers picked to keep a rescued dog under the market.
 *  That silently nerfed every rescued dog from a ceiling of 30 to about 17,
 *  stranded any dog already trained past it (`trainDogStat` returned progress
 *  0 forever), and made the last two tiers of the authored curve unreachable
 *  for the dogs the rescue arc hands out. Seven suites caught it.
 *
 *  Owner ruling: *"Rescued dogs are NOT a disposable starter tier… Preserve
 *  the existing authored 22+/23+ growth tiers for rescued dogs… Derive
 *  deterministic rescue ceilings from the actual existing rescue profiles and
 *  authored progression requirements."* And, just as binding: *"do NOT
 *  interpret 'keep market above' as requiring every purchased dog to have
 *  universally higher ceilings than every rescued dog… A well-developed
 *  rescued dog may remain the better dog permanently."*
 *
 *  ⚠⚠ SO THE NUMBERS ARE DERIVED, NOT CHOSEN. `dogProgressAwardFor` authors
 *  six tiers:
 *
 *      ≤5 → 3    ≤10 → 2    ≤14 → 1    ≤18 → 0.5    ≤22 → 0.25    23+ → 0.1
 *
 *  "Preserve the 22+/23+ tiers" therefore has an exact meaning: the profile's
 *  SIGNATURE stat must not merely touch 23, it must have real room above it,
 *  or the slowest authored tier is decoration a player can never spend time
 *  in. Signature ceilings sit at 25–26 — three levels inside the 0.1 tier,
 *  which at 100 progress per level is a long, deliberate grind and exactly
 *  what that tier was written for. Secondary stats land at 21–22, which
 *  reaches into the 0.25 tier and stops there: a shepherd is still a shepherd.
 *
 *  ⚠ SHAPE FOLLOWS THE PROFILE'S OWN STARTING TABLE (mongrel 10/10/10,
 *  shepherd 12/9/9, hound 9/12/10, mutt 9/10/12, puppy 8/9/9) — whichever stat
 *  the profile already leads with is the one that gets the long ceiling.
 *
 *  ⚠ NOT 30/30/30. The absolute engine maximum stays a separate, higher thing
 *  (`DOG_ABSOLUTE_MAX_STAT`), so "this dog can go further than that one" is
 *  still sayable — it is just no longer said by crippling the free dog. */
const RESCUE_PROFILE_POTENTIAL: Record<DogStartingProfile, DogStatTriple> = {
  // Generalist: good everywhere, exceptional nowhere. Every stat clears 23.
  mongrel:  { strength: 24, dexterity: 24, intelligence: 24 },
  shepherd: { strength: 26, dexterity: 21, intelligence: 21 },
  hound:    { strength: 21, dexterity: 26, intelligence: 22 },
  mutt:     { strength: 21, dexterity: 22, intelligence: 26 },
  // ⚠ A puppy is bought on its future and nothing else, so it gets the most
  // room of any rescue — which is the whole authored point of the pup beats.
  puppy:    { strength: 25, dexterity: 25, intelligence: 25 },
};

/** ⚠⚠⚠ THE OWNER'S RULE, AS ONE LINE OF ARITHMETIC:
 *
 *      migratedPotential(stat) = max(profileCeiling, currentDevelopedStat)
 *
 *  A dog trained past its profile's ceiling KEEPS every point it earned —
 *  the earned development raises the floor of its own potential, which is
 *  intentional. Nothing is ever reduced, nothing is invalidated, and no dog
 *  can end up with a current stat above its own maximum.
 *
 *  ⚠ DETERMINISTIC. No randomness anywhere: the same saved dog always
 *  migrates to the same ceilings, which is what makes a reload idempotent
 *  rather than a re-roll.
 *
 *  ⚠ NOT A GRANDFATHER CLAUSE. A legacy dog does NOT inherit 30 in every
 *  stat; it inherits its profile's shape, lifted only where it has actually
 *  earned more. So a prospective Royal Hound can legitimately show a higher
 *  STRENGTH ceiling than a veteran mongrel while losing to it badly today. */
export function legacyPotentialFor(
  profile: DogStartingProfile,
  currentStats: DogStatTriple,
): DogStatTriple {
  const table = RESCUE_PROFILE_POTENTIAL[profile] ?? RESCUE_PROFILE_POTENTIAL.mongrel;
  const out = {} as DogStatTriple;
  for (const k of DOG_STAT_KEYS) {
    const earned = Math.max(0, Math.round(currentStats[k] ?? 0));
    out[k] = Math.min(DOG_ABSOLUTE_MAX_STAT, Math.max(table[k], earned));
  }
  return out;
}
