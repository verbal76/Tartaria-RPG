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
//
// OTA-912 — each summit holds a NAMED BOSS: the tower's master guardian, still
// awake at the crown. You climb into the heart of the disaster. Beating it drops
// an Aether Collection Beacon and hands you that climb's Skyreacher piece; all
// five beacons break down into the Beacon Rifle (OTA-913). The bosses are Tartarian
// machines built into the collector towers, so they read as vulnerable to the
// anti-machine elements (electrical + acid) — exactly what the Boltcaster deals.

import type { Enemy } from './types';

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
    // ⚠⚠ THE CLIMB MOVED WITH THE TOWER. Owner: *"move asgardars tower to the outskirts as
    // discussed"* / *"I agree, move it to it's own location."* The spire is now its own
    // tile, `grand_spire_of_asgardar`, and the climb has to be anchored there — this line
    // is the whole difference between the ★ CLIMB button appearing at the tower and it
    // appearing in the middle of the capital, two tiles from anything to climb.
    //
    // ⚠ Consequence worth stating plainly: standing in Asgardar city and typing "climb the
    // spire" no longer starts this ascent, and that is correct now. The tower is somewhere
    // you travel to. `greatClimbForLocation` drives the chip off this same id, so the
    // button and the verb move together and cannot disagree.
    locationId: 'grand_spire_of_asgardar',
    // ⚠ OWNER, 2026-08-17: *"change all names to grand spire not buried."* The tower at
    // the capital is the GRAND Spire of Asgardar. "Buried" is gone from every player-facing
    // string; only the historical OTA notes in buildInfo keep the old name, because those
    // are a record of what shipped and rewriting them would make the ledger lie.
    noun: 'the Grand Spire of Asgardar',
    // ⚠⚠ TOKENS NAME THE SPIRE, NOT THE CITY. The old token list was `['asgardar']` alone,
    // which under-matched in the one way that mattered: `asgardar`'s own interactable list
    // LEADS with the bare noun `spire`, so a player standing in the capital who typed
    // "climb the spire" matched neither great climb and fell through to a generic 3-tier
    // ascent at a 14-tier landmark — the symptom the OTA-1304 seam already describes as
    // "reads as the chart having lied". `greatClimbFor` also takes a locationId and refuses
    // a cross-tile match, so spire-shaped tokens cannot leak to the Grand Spire of Etheria.
    tokens: ['grand spire of asgardar', 'spire of asgardar', 'asgardar'],
    tiers: 14,
    rewardArmor: 'Skyreacher Cuirass',
    summitFlavor:
      'You haul over the last lip of the Grand Spire of Asgardar. A giant-forged cuirass hangs from a broken standard here, sized down by some old hand for a climber — plate that has watched Asgardar sink for a very long time.',
  },
  {
    id: 'obsidian_monolith',
    locationId: 'obsidian_pillars',
    noun: 'the Great Obsidian Monolith',
    tokens: ['obsidian monolith', 'great obsidian', 'monolith'],
    tiers: 13,
    rewardArmor: 'Skyreacher Mantle',
    summitFlavor:
      'The tallest of the black pillars ends in a flat, wind-scoured crown. A dark mantle is furled around the old antenna-stump here, snapping in the updraft as if it had been waiting for shoulders to settle on.',
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

/** Look up a great climb by its stable id (used by the Skyreacher Chart map
 *  effect and the summit-boss / beacon plumbing). */
export function greatClimbById(id: string | null | undefined): GreatClimb | null {
  if (!id) return null;
  return GREAT_CLIMBS.find((c) => c.id === id) ?? null;
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

/** OTA-993 — true only when the noun IS one of a climb's authored nouns (article-
 *  stripped, exact), not merely a phrase containing its token. The token
 *  matcher made "Skyreacher Map 2 of 5 — Asgardar Spire" (a purchasable map)
 *  climbable because it contains "asgardar". */
export function isGreatClimbExactNoun(noun: string | null | undefined): boolean {
  const n = (noun ?? '').trim().toLowerCase().replace(/^(?:the|a|an)\s+/, '');
  if (!n) return false;
  return GREAT_CLIMBS.some((c) => c.noun.toLowerCase() === n
    || c.noun.toLowerCase() === `the ${n}`
    || c.noun.toLowerCase().replace(/^(?:the|a|an)\s+/, '') === n);
}

// ── Summit bosses (OTA-912) ────────────────────────────────────────────────

export interface SummitBoss {
  /** GREAT_CLIMBS id this boss guards. */
  climbId: string;
  /** The base boss enemy (boss:true). Scaled to the player at spawn time. */
  base: Enemy;
  /** In-voice beat when the boss unfolds at the summit. */
  approachLine: string;
  /** In-voice beat when it falls. */
  defeatLine: string;
}

/** Trait prefix that marks a summit boss and carries its climb id, so the
 *  defeat handler can recover which climb it belonged to. */
export const SUMMIT_BOSS_TRAIT_PREFIX = 'summit_climb:';

export const SUMMIT_BOSSES: readonly SummitBoss[] = [
  {
    climbId: 'grand_spire',
    base: {
      name: 'Aurenthal, the Crown-Sentinel',
      flavor: 'The last sentinel the grid built to guard its highest collector — a war-scale automaton that has not stood down in an age.',
      type: 'Automation',
      abilityPoint: 'Strength 10',
      attack: 'Choir-Lance',
      damage: '4D8',
      hp: 330,
      rarity: 'Legendary',
      boss: true,
      loot: [],
      aliases: ['aurenthal', 'crown-sentinel', 'crown sentinel', 'sentinel'],
      traits: ['armored', 'aerial', 'savage', 'fast_regen', 'concussive', 'resist:slashing', 'resist:piercing', 'vulnerable:acid'],
    },
    approachLine: 'At the needle-tip of the Grand Spire the wind dies. A war-scale sentinel unfolds from the weathervane socket — AURENTHAL, the Crown-Sentinel, the last thing the grid built to guard its highest collector. It has not stood down in an age. It does not intend to start now.',
    defeatLine: 'Aurenthal comes apart along its seams and slides off the spire into the cloud-deck below. The collector\'s crown is finally quiet.',
  },
  {
    climbId: 'asgardar_spire',
    base: {
      name: 'Draugveil, the Drowned Warden',
      flavor: "The warden of the Grand Spire of Asgardar, caked in a thousand years of mud, its collector-heart still turning behind its ribs.",
      type: 'Automation',
      abilityPoint: 'Strength 9',
      attack: 'Silt-Hammer',
      damage: '4D6',
      hp: 320,
      rarity: 'Legendary',
      boss: true,
      loot: [],
      aliases: ['draugveil', 'drowned warden', 'warden'],
      traits: ['armored', 'slow', 'savage', 'fast_regen', 'resist:slashing', 'resist:piercing', 'vulnerable:acid'],
    },
    approachLine: 'The Grand Spire of Asgardar\'s crown breaks the silt-line, and something rises with it — DRAUGVEIL, the Drowned Warden, caked in a thousand years of Asgardar\'s mud, its collector-heart still turning behind its ribs.',
    defeatLine: 'Draugveil sinks back into the silt it climbed out of, its heart going dark at last.',
  },
  {
    climbId: 'obsidian_monolith',
    base: {
      name: 'Magnetar, the Obsidian Colossus',
      flavor: 'An entire obsidian pillar folded into one dormant machine — it drags every loose blade and buckle toward its lodestone heart.',
      type: 'Mechanism',
      abilityPoint: 'Strength 10',
      attack: 'Lodestone Slam',
      damage: '4D8',
      hp: 350,
      rarity: 'Legendary',
      boss: true,
      loot: [],
      aliases: ['magnetar', 'obsidian colossus', 'colossus'],
      traits: ['armored', 'slow', 'concussive', 'fast_regen', 'resist:slashing', 'resist:piercing', 'resist:bludgeoning', 'vulnerable:acid'],
    },
    approachLine: 'The crown of the Great Obsidian Monolith is a single slab of black glass — and it stands up. MAGNETAR, the Obsidian Colossus, drags every loose blade and buckle toward it as it turns; the whole pillar was one dormant machine.',
    defeatLine: 'Magnetar\'s magnetic heart stutters and dies; the pull lets go and the colossus topples into stillness.',
  },
  {
    climbId: 'thametan_tower',
    base: {
      name: "Zalmar's Cascade-Wraith",
      flavor: "A guardian caught mid-catastrophe atop Thametan's Tower, still screaming the resonance that drowned an empire.",
      type: 'Automation',
      abilityPoint: 'Dexterity 10',
      attack: 'Resonance Cascade',
      damage: '4D8',
      hp: 330,
      rarity: 'Legendary',
      boss: true,
      loot: [],
      aliases: ['cascade-wraith', 'cascade wraith', 'wraith', 'zalmar'],
      traits: ['armored', 'savage', 'fast_regen', 'concussive', 'resist:aetheric', 'resist:piercing', 'vulnerable:acid'],
    },
    approachLine: "You top Thametan's Tower — ground zero, where the world drowned. The Aetheric Engine below still hums, and its guardian still runs the loop that killed an empire: ZALMAR'S CASCADE-WRAITH, a machine caught mid-catastrophe, screaming the same resonance that broke the radiators' seals.",
    defeatLine: "The Cascade-Wraith's loop finally breaks. For the first time in a very long time, the hum under Thametan's Tower goes quiet.",
  },
  {
    climbId: 'zharak_fang',
    base: {
      name: 'Ossika, the Fang-Sentinel',
      flavor: "The machine the mud-sirens have sung to for centuries, still holding the crown of Zharak's tallest fang.",
      type: 'Automation',
      abilityPoint: 'Dexterity 9',
      attack: 'Siren-Talon',
      damage: '3D10',
      hp: 300,
      rarity: 'Legendary',
      boss: true,
      loot: [],
      aliases: ['ossika', 'fang-sentinel', 'fang sentinel', 'sentinel'],
      traits: ['armored', 'aerial', 'quick', 'savage', 'fast_regen', 'resist:slashing', 'resist:piercing', 'vulnerable:acid'],
    },
    approachLine: 'The tallest fang of Zharak ends in a nest of dead antennae, and one of them turns to face you — OSSIKA, the Fang-Sentinel, the machine the mud-sirens have sung to for centuries, still holding the crown of its tower.',
    defeatLine: "Ossika's wings fold and it drops from the fang into the shallows below; the sirens' song falters, then stops.",
  },
] as const;

const SUMMIT_BOSS_BY_ID: Record<string, SummitBoss> = Object.fromEntries(
  SUMMIT_BOSSES.map((b) => [b.climbId, b]),
);

/** The summit boss guarding a given great climb (or null). */
export function summitBossFor(climbId: string | null | undefined): SummitBoss | null {
  if (!climbId) return null;
  return SUMMIT_BOSS_BY_ID[climbId] ?? null;
}

/** A fresh boss Enemy for the climb, stamped with the summit-climb trait so the
 *  defeat handler can recover which climb it belonged to. Returns null if the
 *  climb has no boss. The caller scales it (scaleStaticBoss) before spawning. */
export function buildSummitBoss(climbId: string): Enemy | null {
  const def = summitBossFor(climbId);
  if (!def) return null;
  return {
    ...def.base,
    traits: [...(def.base.traits ?? []), `${SUMMIT_BOSS_TRAIT_PREFIX}${climbId}`],
  };
}

/** Recover a summit boss's climb id from a defeated enemy's traits, or null. */
export function summitClimbIdFromEnemy(enemy: { traits?: readonly string[] } | null | undefined): string | null {
  const t = (enemy?.traits ?? []).find((x) => x.startsWith(SUMMIT_BOSS_TRAIT_PREFIX));
  return t ? t.slice(SUMMIT_BOSS_TRAIT_PREFIX.length) : null;
}

// OTA-915 — codex + lore-gating support for the Great Climbs.

/** The summit bosses as plain enemy records for the BESTIARY. They are NOT in
 *  enemies.json (that pool is rolled for random wild encounters, which would let
 *  a unique tower boss ambush you in open waste); this is the single source of
 *  truth, projected into the codex so a boss catalogues on defeat like any foe.
 *  Uses the un-stamped `base` (no summit_climb trait) so the codex traits stay clean. */
export const SUMMIT_BOSS_BASES: readonly Enemy[] = SUMMIT_BOSSES.map((b) => b.base);

/** True once the player has encountered the Skyreacher questline at all — bought a
 *  chart (soldMapIds), used one to unlock a climb (unlockedGreatClimbs), or crested
 *  one (greatClimbsCrested). Used to keep the Skyreacher title hidden until then. */
export function greatClimbLoreDiscovered(
  wm: {
    soldMapIds?: readonly string[];
    unlockedGreatClimbs?: readonly string[];
    greatClimbsCrested?: readonly string[];
  } | null | undefined,
): boolean {
  if (!wm) return false;
  return (wm.soldMapIds?.length ?? 0) > 0
    || (wm.unlockedGreatClimbs?.length ?? 0) > 0
    || (wm.greatClimbsCrested?.length ?? 0) > 0;
}

/** True when a location hosts a great climb the player has NOT yet unlocked with
 *  its chart — the codex should mask it as "?" until the map reveals it. Returns
 *  false for ordinary (non-climb) locations, which are never map-gated. */
export function isGreatClimbLocationLocked(
  locationId: string | null | undefined,
  wm: { unlockedGreatClimbs?: readonly string[] } | null | undefined,
): boolean {
  const climb = greatClimbForLocation(locationId);
  if (!climb) return false;
  return !((wm?.unlockedGreatClimbs ?? []).includes(climb.id));
}
