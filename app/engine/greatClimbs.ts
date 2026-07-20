// greatClimbs — OTA-910. Five landmark "great climbs" tall enough (11–15
// tiers) that they can't be topped in one push: you WILL run your stamina
// dry partway up, so you have to rest mid-climb to finish. And mid-climb
// rest on a great climb needs the Hardened Climbing Strap specifically — a
// Reclaimer's Rope's belay loops aren't rated for a doze this high. Try one
// without the strap and you climb until the tank empties, then fall — and a
// great-climb fall SCALES with how high you'd gotten (see climbFall in
// gameStore). Cresting one hands you a guaranteed piece of the Skyreacher
// set — a Legendary armor set that exists ONLY up these summits (it can't be
// crafted or bought). Collect all five and the Arbiter names you Skyreacher.
//
// The great-climb prop is injected into the scene noun pool at its landmark
// location (see gameStore.beginScene), so the climb is always there to find.
// Detection is by the prop's distinctive noun token, so a great climb never
// collides with the generic curated climbables (an "obsidian pillar", a
// "grand spire capacitor") that can share a location.

export interface GreatClimb {
  /** Stable id. */
  id: string;
  /** The landmark location this climb lives at (locations.json id). */
  locationId: string;
  /** Canonical climbable noun as it appears in the CLIMB modal / narration. */
  noun: string;
  /** Distinctive lowercase tokens that identify this climb even when the
   *  parser shortens or article-strips the noun. Chosen to NOT appear in any
   *  generic curated climbable so the two never cross-match. */
  tokens: string[];
  /** Height in tiers (all > 10, so the strap is mandatory to finish). */
  tiers: number;
  /** The Skyreacher piece granted, guaranteed, on cresting the summit. */
  rewardArmor: string;
  /** One-line summit reward flavor (shown when the piece is granted). */
  summitFlavor: string;
}

export const GREAT_CLIMBS: readonly GreatClimb[] = [
  {
    id: 'grand_spire',
    locationId: 'grand_spire_of_etheria',
    noun: 'the Grand Spire of Etheria',
    tokens: ['spire of etheria', 'grand spire of etheria'],
    tiers: 15,
    rewardArmor: 'Skyreacher Crown',
    summitFlavor:
      'The Grand Spire narrows to a needle above the cloud-deck. Lashed to the weathervane at the very peak, wrapped against fifteen tiers of wind, waits a crown of storm-blued alloy — left for whoever could reach it.',
  },
  {
    id: 'asgardar_spire',
    locationId: 'asgardar',
    noun: 'the Buried Spire of Asgardar',
    tokens: ['asgardar'],
    tiers: 14,
    rewardArmor: 'Skyreacher Cuirass',
    summitFlavor:
      'You haul over the last lip of the buried capital\'s crown-spire. A giant-forged cuirass hangs from a broken standard here, sized down by some old hand for a climber — plate that has watched Asgardar sink for a very long time.',
  },
  {
    id: 'obsidian_monolith',
    locationId: 'obsidian_pillars',
    noun: 'the Great Obsidian Monolith',
    tokens: ['obsidian monolith', 'great obsidian', 'monolith'],
    tiers: 13,
    rewardArmor: 'Skyreacher Greaves',
    summitFlavor:
      'The tallest of the black pillars ends in a flat, wind-scoured crown. A pair of dark greaves stands upright in the glass as if their owner had simply stepped out of them and off the edge.',
  },
  {
    id: 'thametan_tower',
    locationId: 'thametans_tower',
    noun: "Thametan's Tower",
    tokens: ['thametan'],
    tiers: 12,
    rewardArmor: 'Skyreacher Treads',
    summitFlavor:
      'The tower\'s broken parapet opens onto the whole scarred plain of ground zero. Set neatly by the old bell-mount, toes to the drop, wait a pair of treads that never lost their grip on anything.',
  },
  {
    id: 'zharak_fang',
    locationId: 'zharaks_teeth',
    noun: 'the Great Fang of Zharak',
    tokens: ['great fang', 'fang of zharak'],
    tiers: 11,
    rewardArmor: 'Skyreacher Gauntlets',
    summitFlavor:
      'You top the tallest fang of the ridge, the mud-sirens\' song thin and far below now. Jammed into a cleft at the summit, palms open to the sky, wait a pair of gauntlets no storm ever pried loose.',
  },
] as const;

/** All 5 Skyreacher piece names, in set order. */
export const SKYREACHER_SET: readonly string[] = GREAT_CLIMBS.map((c) => c.rewardArmor);

/** Location ids that host a great climb — cheap membership test for beginScene. */
export const GREAT_CLIMB_LOCATION_IDS: ReadonlySet<string> = new Set(
  GREAT_CLIMBS.map((c) => c.locationId),
);

/** The great climb hosted at a location (or null). */
export function greatClimbForLocation(locationId: string | null | undefined): GreatClimb | null {
  if (!locationId) return null;
  return GREAT_CLIMBS.find((c) => c.locationId === locationId) ?? null;
}

/** Resolve a climbed noun to its great climb, if any. Matches the canonical
 *  noun exactly OR any of its distinctive tokens as a substring, so the
 *  parser's shortened/article-stripped forms still resolve. Optionally
 *  double-checks the location when one is supplied (belt-and-suspenders —
 *  the tokens are already unique). */
export function greatClimbFor(
  noun: string | null | undefined,
  locationId?: string | null,
): GreatClimb | null {
  if (!noun) return null;
  const n = noun.toLowerCase().trim();
  if (!n) return null;
  for (const c of GREAT_CLIMBS) {
    const canonical = c.noun.toLowerCase();
    // Match the FULL canonical noun, or any distinctive token as a substring of
    // the input. We deliberately do NOT test `canonical.includes(n)` — that
    // would let a short generic word ("tower") match a canonical that contains
    // it ("thametan's tower") and hijack an ordinary climb. Tokens are the
    // curated, collision-free way in.
    const hit =
      n === canonical ||
      c.tokens.some((t) => n.includes(t));
    if (!hit) continue;
    // When a location is supplied, require it to match — a distinctive token
    // can't leak across landmarks, but this keeps the guarantee explicit.
    if (locationId != null && locationId !== c.locationId) continue;
    return c;
  }
  return null;
}

/** Height (tiers) for a great-climb noun, or null if it isn't one. Checked
 *  BEFORE the generic curated/substring tables in climbHeightFor so a great
 *  climb reports its real 11–15 tiers instead of the generic "spire" 4. */
export function greatClimbHeight(noun: string | null | undefined): number | null {
  const c = greatClimbFor(noun);
  return c ? c.tiers : null;
}

/** True when the noun is a great-climb prop (used to make it a valid climb
 *  target even though its proper-noun form isn't in the substring matcher). */
export function isGreatClimbNoun(noun: string | null | undefined): boolean {
  return greatClimbFor(noun) != null;
}
