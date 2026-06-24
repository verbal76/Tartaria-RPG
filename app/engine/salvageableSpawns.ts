// salvageableSpawns — 2026-05-24, playtester-spec curated salvage pool.
//
// Mirror of climbableSpawns.ts for the salvage chip row. Playtester
// noticed table and gate dominated every scene's salvage chips because
// they're the most over-authored stock interactables in static_hub.json
// + worldLadder.json + locations.json. The substring SALVAGE_PATTERN
// in SalvageModal.tsx matches ~70 noun types, so the matcher's fine —
// the data just leans on the same handful.
//
// This pool injects 2 (indoor) / 3 (outdoor) curated salvageables per
// scene so the row reads varied. Same architecture as climb: scene
// gen pre-pends these to ambient nouns; SalvageModal prefers curated
// matches and caps common-stock salvageables at 1.
//
// Heights / tiers don't apply — salvage is one-shot, no segments.

import type { Location } from './types';
import { isIndoorLocation } from './climbableSpawns';
import { getScenePropsOverride } from './contentPack';

/** All active salvageables: the author's scene-props override when present, else the
 *  built-in setting-neutral fallback. Override entries default to context 'both'. */
function allActiveSalvageables(): SalvageSpawn[] {
  const ov = getScenePropsOverride();
  return ov?.salvageables?.length
    ? ov.salvageables.map((s) => ({ name: s.name, context: s.context ?? 'both' }))
    : [...OUTSIDE_SALVAGEABLES, ...INSIDE_SALVAGEABLES];
}

/** Active salvageables filtered to the scene context, falling back to the full active
 *  set when the override supplies none for this context. */
function activeSalvageables(indoor: boolean): SalvageSpawn[] {
  const want = indoor ? 'inside' : 'outside';
  const all = allActiveSalvageables();
  const matched = all.filter((s) => s.context === want || s.context === 'both');
  return matched.length ? matched : all;
}

export interface SalvageSpawn {
  /** Canonical noun as it appears in the chip row. Adjective prefix
   *  may be applied at spawn time for flavor. */
  name: string;
  context: 'inside' | 'outside' | 'both';
}

// Outside salvageables — exposed-element wreckage, abandoned vehicles, debris.
// SETTING-NEUTRAL by design: the engine FALLBACK pool, used until an author
// supplies their own via the scene-props override, so it must not fight any setting.
export const OUTSIDE_SALVAGEABLES: SalvageSpawn[] = [
  { name: 'half-buried wagon',           context: 'outside' },
  { name: 'wrecked machine husk',        context: 'outside' },
  { name: 'broken drone shell',          context: 'outside' },
  { name: 'cracked supply crate',        context: 'outside' },
  { name: 'toppled stone fragment',      context: 'outside' },
  { name: 'rusted frame rig',            context: 'outside' },
  { name: 'crashed machine chassis',     context: 'outside' },
  { name: 'salt-crusted lockbox',        context: 'outside' },
  { name: 'buried supply cache',         context: 'outside' },
  { name: 'shattered signal relay',      context: 'outside' },
];

// Inside salvageables — vault/library/armory/engine-chamber contents.
export const INSIDE_SALVAGEABLES: SalvageSpawn[] = [
  { name: 'library archive console',     context: 'inside' },
  { name: 'glass display case',          context: 'inside' },
  { name: 'vault storage pedestal',      context: 'inside' },
  { name: 'capacitor coil rack',         context: 'inside' },
  { name: 'engine room toolbench',       context: 'inside' },
  { name: 'sealed storage locker',       context: 'inside' },
  { name: 'old power conduit',           context: 'inside' },
  { name: 'diagnostic console',          context: 'inside' },
  { name: 'stripped maintenance panel',  context: 'inside' },
  { name: 'hidden weapon locker',        context: 'inside' },
];

const FLAVOR_ADJECTIVES = [
  'rusted', 'salt-crusted', 'cracked', 'broken', 'shattered',
  'weathered', 'tilted', 'stripped', 'dust-buried', 'mud-glazed',
];

// Items already carrying their own modifier ("half-buried", "rusted",
// "cracked", "broken", etc.) skip the auto-prefix to avoid
// "rusted rusted exoframe" / "broken cracked supply crate". Detect by
// matching the first word against the adjective set.
function shouldPrefixAdjective(name: string): boolean {
  const firstWord = name.split(/\s/)[0]?.toLowerCase() ?? '';
  if (!firstWord) return false;
  if (FLAVOR_ADJECTIVES.includes(firstWord)) return false;
  // Two-word adjective compounds we shipped with: half-buried,
  // salt-crusted, dust-buried, mud-glazed. Same skip rule.
  if (/^(half-|salt-|dust-|mud-)/.test(firstWord)) return false;
  return true;
}

// Common-stock nouns that dominate authored interactables and need
// throttling so the curated pool gets visible space. SalvageModal
// caps these at 1 per scene's chip row.
const COMMON_STOCK_SALVAGEABLES = new Set([
  'table', 'gate', 'bench', 'shelf', 'lantern', 'banner', 'chair',
]);

export function isCommonStockSalvageable(noun: string): boolean {
  const n = noun.toLowerCase().trim();
  // Match any common-stock word as a discrete word inside the noun
  // (so "shelf" matches but "shelfbeams" wouldn't, though no such
  // noun exists in current data).
  for (const stock of COMMON_STOCK_SALVAGEABLES) {
    const re = new RegExp(`\\b${stock}\\b`, 'i');
    if (re.test(n)) return true;
  }
  return false;
}

export function isCuratedSalvageable(noun: string): boolean {
  const n = noun.toLowerCase();
  for (const spawn of allActiveSalvageables()) {
    if (n.includes(spawn.name.toLowerCase())) return true;
  }
  return false;
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Pick N salvageables for a scene of the given indoor/outdoor flavor.
 *  Returns noun strings with random adjective prefixes where flavor
 *  doesn't already include one. Same cap shape as climbables. */
export function pickSalvageablesForScene(
  loc: Partial<Location> | null | undefined,
  rng: () => number = Math.random,
): string[] {
  const indoor = isIndoorLocation(loc);
  const pool = activeSalvageables(indoor);
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
