// OTA-1101 — WHAT'S ACTUALLY IN THEIR POCKETS.
//
// Owner: "stealing is for items, pickpocket is for what would be in their
// clothing or on them. Maybe their TC, a collectable note, rarely a tower
// map... maybe a single legendary material — something they wouldn't trust
// on the tabletop with all the thieves around."
//
// So the pickpocket payout is a POCKET TABLE, not the mark's market goods:
// the wares live on the table (that's what `steal <item>` is for); the
// pocket holds what a person keeps on their body precisely because it is
// too small, too personal, or too valuable to leave out. Weighted so the
// common lift is coin, the interesting lift is a story, and the once-a-
// session lift is the thing they'd never admit to carrying.
//
// Deterministic given rng — the harnesses seed it.

import { MATERIALS, GEAR } from './crafting';
import { ALL_FRAGMENTS } from './collectables';

export type PocketLoot =
  | { kind: 'tc'; amount: number }
  | { kind: 'fragment'; fragmentId: string }
  | { kind: 'material'; name: string }
  | { kind: 'map'; name: string };

/** The weights, exported so tests can assert the table's shape instead of
 *  hard-coding magic thresholds twice. Order matters: rolled top-down. */
export const POCKET_WEIGHTS = {
  tc: 0.5, // their walking-around money
  fragment: 0.3, // a collectable note, folded small and kept close
  material: 0.15, // a single Legendary material they wouldn't table
  map: 0.05, // rarely — a tower map
} as const;

/** Coin lift: small. A pocket carries walking-around money, not a strongbox. */
const TC_MIN = 3;
const TC_SPAN = 10; // 3..12

const legendaryMaterials = () => MATERIALS.filter((m) => m.rarity === 'Legendary');
const towerMaps = () => GEAR.filter((g) => g.name.startsWith('Skyreacher Map'));

/** Roll the pocket. `ownedCollectables` keeps fragment lifts from duping —
 *  a note the player already owns falls through to coin, because "you found
 *  the same folded page twice" reads as the game losing count. */
export function rollPocketLoot(opts: {
  ownedCollectables: readonly string[];
  rng?: () => number;
}): PocketLoot {
  const rng = opts.rng ?? Math.random;
  const r = rng();
  if (r < POCKET_WEIGHTS.tc) {
    return { kind: 'tc', amount: TC_MIN + Math.floor(rng() * TC_SPAN) };
  }
  if (r < POCKET_WEIGHTS.tc + POCKET_WEIGHTS.fragment) {
    // Unlike biome loot, a pocket travels — any un-owned note is fair game.
    const owned = new Set(opts.ownedCollectables);
    const eligible = ALL_FRAGMENTS.filter((f) => !owned.has(f.id));
    const pick = eligible[Math.floor(rng() * eligible.length)];
    if (pick) return { kind: 'fragment', fragmentId: pick.id };
    return { kind: 'tc', amount: TC_MIN + Math.floor(rng() * TC_SPAN) };
  }
  if (r < POCKET_WEIGHTS.tc + POCKET_WEIGHTS.fragment + POCKET_WEIGHTS.material) {
    const pool = legendaryMaterials();
    const pick = pool[Math.floor(rng() * pool.length)];
    if (pick) return { kind: 'material', name: pick.name };
    return { kind: 'tc', amount: TC_MIN + Math.floor(rng() * TC_SPAN) };
  }
  const maps = towerMaps();
  const pick = maps[Math.floor(rng() * maps.length)];
  if (pick) return { kind: 'map', name: pick.name };
  return { kind: 'tc', amount: TC_MIN + Math.floor(rng() * TC_SPAN) };
}
