// Digging engine — this is a mud-flood world, so most things in your pack
// can serve as improvised shovels. Players type 'dig' (or tap the action
// button) to scrape the silt where they stand; the RNG resolves what — if
// anything — they pull out.
//
// Two-stage lookup:
//   1) Find the best dig tool in the player's inventory (digScore highest).
//   2) Roll a loot bucket weighted by that score. No tool = bare hands,
//      which has a non-zero but small chance of finding anything at all.

import type { InventoryItem, Rarity } from './types';
import { resolveDigging } from './contentPack';
import { findMaterialByName } from './crafting';
import diggingData from '../data/digging/digging.json';

// OTA-741 — biome-aware forage. On a tile whose location tags name a biome
// (mud, aether, …), a foraged material that SHARES that tag becomes much more
// common, so a mud region actually rains mud stock instead of the flat
// everywhere-pool. Content-driven: each pool item's tags come from the live
// material catalog, so an author's pack that tags its materials gets this free.
export const BIOME_FORAGE_BOOST = 4;

/** True when the named material carries a tag the current tile's biome tags
 *  include (e.g. a 'mud'-tagged material on a 'mud'-tagged tile). */
export function materialMatchesBiome(
  name: string,
  biomeTags: readonly string[] | undefined,
): boolean {
  if (!biomeTags || biomeTags.length === 0) return false;
  const mat = findMaterialByName(name);
  if (!mat) return false;
  const biome = new Set(biomeTags.map((t) => t.toLowerCase()));
  return (mat.tags ?? []).some((t) => biome.has(t.toLowerCase()));
}

// engine_Dev — the digging config is now DATA (app/data/digging/digging.json), and
// author-uploadable: override → generic default → built-in. The roll MATH stays here.
interface DigEntry {
  name: string;
  rarity: Rarity;
  baseWeight: number;
}
export interface DiggingConfig {
  itemScores: Record<string, number>;
  tagScores: Record<string, number>;
  productiveCap: number;
  loot: DigEntry[];
}
function cfg(): DiggingConfig {
  return resolveDigging(diggingData as unknown as DiggingConfig);
}

// Compute dig effectiveness for an item. 0 means cannot dig.
export function digScoreFor(item: InventoryItem): number {
  const c = cfg();
  const explicit = c.itemScores[item.name];
  if (explicit !== undefined) return explicit;
  // Heuristic from tags (max wins so an "armor plate" outscores "armor cloth").
  let best = 0;
  for (const t of item.tags ?? []) {
    const s = c.tagScores[t.toLowerCase()];
    if (s !== undefined && s > best) best = s;
  }
  return best;
}

// Pick the highest-score item in inventory the player could use to dig.
// Returns null if the player has nothing useful.
export function bestDigTool(inventory: readonly InventoryItem[]): {
  item: InventoryItem | null;
  score: number;
} {
  let best: { item: InventoryItem | null; score: number } = { item: null, score: 1 }; // bare hands score 1
  for (const i of inventory) {
    if (i.quantity <= 0) continue;
    const s = digScoreFor(i);
    if (s > best.score) best = { item: i, score: s };
  }
  return best;
}

// arb119 — productive-dig cap per wild tile, now from the digging config.
export function digSpotProductiveCap(): number { return cfg().productiveCap; }

// Roll the dig outcome. Returns null when nothing was found (always possible,
// especially with low score). P(nothing) decreases as score increases. The loot
// table + rarity scaling come from the digging config (data-driven).
export function rollDig(
  score: number,
  biomeTags?: readonly string[],
): { found: DigEntry | null; nothing: boolean } {
  const loot = cfg().loot;
  const pNothing = Math.max(0.18, 0.55 - score * 0.06);
  if (Math.random() < pNothing) return { found: null, nothing: true };
  const weights = loot.map((e) => {
    let w = e.baseWeight;
    if (e.rarity === 'Uncommon') w *= 1 + (score - 1) * 0.4;
    if (e.rarity === 'Rare') w *= 1 + (score - 1) * 0.8;
    // OTA-741 — biome boost: mud materials dominate a mud tile, etc.
    if (materialMatchesBiome(e.name, biomeTags)) w *= BIOME_FORAGE_BOOST;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < loot.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return { found: loot[i]!, nothing: false };
  }
  return { found: loot[loot.length - 1] ?? null, nothing: loot.length === 0 };
}
