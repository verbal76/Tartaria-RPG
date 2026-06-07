// climbableSpawns — 2026-05-24, playtester-spec curated climbable pool.
//
// The substring climbable matcher in interactionTags.ts is fine for
// turning authored ambient nouns into climb targets, but it produces
// repetition (every other scene has "arch" + "pillar") and zero
// inside/outside awareness — so a stone arch could spawn inside an
// observatory.
//
// This module overlays a curated list of 15 scene props, each tagged
// `inside` / `outside` / `both`, with a fixed tier height. At scene
// generation time we inject 2 (indoor) or 3 (outdoor) of these into the
// scene's ambient noun list with a random adjective prefix so each scene
// reads distinct from the next.

import type { Location } from './types';

export interface ClimbableSpawn {
  /** Canonical noun as it'll appear in the climb modal. The runtime
   *  may prepend an adjective for flavor; the height lookup matches
   *  the canonical word via substring so the prefix doesn't break it. */
  name: string;
  /** Where the prop can appear. 'both' fires in either context — leave
   *  blank entries for items strongly tied to one. */
  context: 'inside' | 'outside' | 'both';
  /** Climb tiers (segments). Looked up by climbHeight.ts. */
  height: number;
}

// Outside-tagged props — anything that wouldn't make sense inside a
// vault / observatory / library / armory etc.
export const OUTSIDE_CLIMBABLES: ClimbableSpawn[] = [
  { name: 'ruined skyscraper',          context: 'outside', height: 4 },
  { name: 'petrified mud wave',         context: 'outside', height: 2 },
  { name: 'obsidian pillar',            context: 'outside', height: 3 },
  { name: 'submerged giant statue',     context: 'outside', height: 3 },
  { name: 'buried strip mall rooftop',  context: 'outside', height: 2 },
  { name: 'endless stair landing',      context: 'outside', height: 4 },
  { name: "zharak's teeth spire",       context: 'outside', height: 4 },
  // 2026-05-25 [CONTENT-1] — watchtower as a 4-step outside climbable.
  // User reported investigating a watchtower scene and the world text
  // described it as "half-swallowed" by silt without a climb option.
  // Authored as 4-step (matches the existing ruined-skyscraper /
  // endless-stair-landing rung-count for visually-tall structures).
  { name: 'watchtower',                 context: 'outside', height: 4 },
];

// Inside-tagged props — for vaults, libraries, engine chambers, etc.
export const INSIDE_CLIMBABLES: ClimbableSpawn[] = [
  { name: 'dormant architectural sentinel', context: 'inside', height: 4 },
  { name: 'grand spire capacitor',          context: 'inside', height: 4 },
  { name: 'submerged library shelf',        context: 'inside', height: 1 },
  { name: 'engine chamber scaffolding',     context: 'inside', height: 3 },
  { name: 'aether-tether grapple point',    context: 'inside', height: 1 },
  { name: 'maintenance tunnel ladder',      context: 'inside', height: 2 },
  { name: 'royal vault pedestal',           context: 'inside', height: 1 },
];

// Adjective prefixes for variety — applied at spawn time so each visit
// to a similar scene reads distinct. Skipped for proper-noun items
// that already carry context ("zharak's teeth spire" reads weird with
// an adjective in front).
const FLAVOR_ADJECTIVES = [
  'ancient', 'weathered', 'leaning', 'broken', 'half-buried',
  'shattered', 'rusted', 'cracked', 'tilting', 'jagged',
];

const SKIP_ADJECTIVE_PATTERNS = ["'s "]; // possessive proper-noun roots

function shouldPrefixAdjective(name: string): boolean {
  return !SKIP_ADJECTIVE_PATTERNS.some((p) => name.toLowerCase().includes(p));
}

/** Heuristic: does this location read as inside (sealed walls) or
 *  outside (open sky / fields / streets)? Uses the location's `type`
 *  and `tags` fields. Hub micro-micros (vendor rooms, vaults) default
 *  to inside; surface regions / cities default to outside. */
export function isIndoorLocation(loc: Partial<Location> | null | undefined): boolean {
  if (!loc) return false;
  const type = (loc.type ?? '').toLowerCase();
  const tags = (loc.tags ?? []).map((t) => t.toLowerCase());
  // Explicit indoor types
  if (/tower|stronghold|chamber|vault|library|armory|observatory|temple|crypt|chapel/.test(type)) {
    return true;
  }
  // Open / surface / regional
  if (tags.includes('open') || /region|plain|wastes|outskirts|field|surface/.test(type)) {
    return false;
  }
  // Cities default to outside (streets) — micro-micro rooms inside
  // them route through the hub system which sets indoor separately.
  if (/city|capital|metropolis|suburb/.test(type)) return false;
  // Anything else (hub rooms, sub-locations) defaults to indoor.
  return true;
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Pick N climbables for a scene of the given indoor/outdoor flavor.
 *  Returns the noun strings, with random adjective prefixes for
 *  flavor where appropriate. */
export function pickClimbablesForScene(
  loc: Partial<Location> | null | undefined,
  rng: () => number = Math.random,
): string[] {
  const indoor = isIndoorLocation(loc);
  const pool = indoor ? INSIDE_CLIMBABLES : OUTSIDE_CLIMBABLES;
  const cap = indoor ? 2 : 3;
  const shuffled = shuffle(pool, rng);
  const picked = shuffled.slice(0, cap);
  const shuffledAdj = shuffle(FLAVOR_ADJECTIVES, rng);
  return picked.map((spawn, i) => {
    if (!shouldPrefixAdjective(spawn.name)) return spawn.name;
    const adj = shuffledAdj[i % shuffledAdj.length] ?? '';
    return adj ? `${adj} ${spawn.name}` : spawn.name;
  });
}

/** Lookup the height for a curated climbable noun (or any noun that
 *  contains one of the canonical names as a substring after the
 *  adjective prefix). Returns null if not in the curated pool — the
 *  caller falls back to the existing substring-based climbHeight. */
export function curatedClimbHeight(noun: string): number | null {
  const n = noun.toLowerCase();
  for (const spawn of [...OUTSIDE_CLIMBABLES, ...INSIDE_CLIMBABLES]) {
    if (n.includes(spawn.name.toLowerCase())) return spawn.height;
  }
  return null;
}
