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
import { findMaterialByName } from './crafting';

// OTA-741 — biome-aware forage. On a tile whose location tags name a biome
// (mud, aether, silt, …), a foraged/dug material that SHARES that tag becomes
// much more common, so the Mud Seas actually rains mud stock instead of the
// flat everywhere-pool. Playtest: "been in the mud seas twice and still no mud
// materials" — because the pool ignored biome entirely. Lore stays in content:
// we read each pool item's tags from the material catalog, so this works for
// any pack that tags its materials (mud, aether, etc.).
export const BIOME_FORAGE_BOOST = 4;

/** True when the named material carries a tag that the current tile's biome
 *  tags include (e.g. Mud Fragment [mud] on a 'mud'-tagged tile). */
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

// Per-item dig effectiveness. Higher = bigger chance of finding something
// AND a better chance at higher-rarity buckets. 0 = cannot dig with this
// item (e.g. a robe). null = item not declared explicitly — fall through
// to the heuristic.
//
// Lore: most physical objects in a mud-world function as scoops. Bare
// hands work, but slowly.
const ITEM_DIG_SCORE: Record<string, number> = {
  // Bare hands (no item required) — handled separately as score 1.
  // Weapons that double as digging tools:
  'Rusted Blade': 3,
  'Tartarian Spear': 4,
  'Aetheric Crystal Blade': 5,
  'Sentinel Cleaver': 5,
  "Founder's Edge": 6,
  'Salvaged Bow': 1, // limp wood — barely
  'Bone Crossbow': 1,
  'Mud-fist Wraps': 2, // hardened mud-glass over the knuckles
  // Cheap knives + trowels: high dig score, low durability — the tradeoff.
  // Best dig tool you can carry without sacrificing a real weapon.
  'Pocket Knife': 4,
  'Bone Shiv': 4,
  "Reclaimer's Trowel": 5,
  'Order Letter-Opener': 3,
  // Improvised emergency weapons — sticks and rocks dig poorly; iron
  // and shard heads pry decently because they have an edge to scrape with.
  'Club': 1,            // dry wood; bare-hands tier
  'Cudgel': 2,          // rock-headed, can pry
  'Stone Spear': 3,     // chipped rock point digs like a knife
  'Iron Spear': 4,      // proper iron edge, scrapes well
  'Aether-Shard Spear': 4,
  // Cooking / camp:
  'Trail Rations': 0,
  'First Aid Kit': 0,
  // Misc gear:
  'Climbing Rope': 2,
  'Aetheric Torch': 2,
  'Aetheric Compass': 1, // metal casing
  'Aetheric Locket': 0,
  // Crafting stock — can be repurposed:
  'Scrap Metal': 4, // an actual flat bit of metal
  'Mudstone': 2,
  // Armor pieces:
  'Rough-Hewn Chestplate': 2, // edge of the plate
  // Runecasters:
  'Pyric Wand': 1,
  'Storm Rod': 1,
};

// Tag-based fallback when an item isn't explicitly listed. Used by the
// stamping heuristic below.
const TAG_DIG_SCORE: Record<string, number> = {
  weapon: 2,
  melee: 3,
  metal: 4,
  scaled: 2,
  plate: 2,
  light: 1, // light/torch
  scholarly: 1,
  ring: 0,
  amulet: 0,
  food: 0,
  healing: 0,
};

// Compute dig effectiveness for an item. 0 means cannot dig.
export function digScoreFor(item: InventoryItem): number {
  const explicit = ITEM_DIG_SCORE[item.name];
  if (explicit !== undefined) return explicit;
  // Heuristic from tags (max wins so an "armor plate" outscores "armor cloth").
  let best = 0;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  for (const t of (require('./crafting') as typeof import('./crafting')).canonicalItemTags(item)) {
    const s = TAG_DIG_SCORE[t];
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

// Loot table. Each entry has a base weight (higher = more common) and
// optional rarity. The dig score scales weights — high score boosts
// rare loot probabilities, low score keeps it weighted toward nothing.
interface DigEntry {
  name: string;
  rarity: Rarity;
  baseWeight: number;
}

const DIG_LOOT: DigEntry[] = [
  // Common — silt-tier finds, most of what you'll pull up.
  // Rebalanced 2026-05-21 so the cheap stock items the rulebook
  // promises (rocks / sticks / scraps) actually dominate the
  // common tier. Mud / Aether commodity weights lowered slightly.
  { name: 'Mud Fragment', rarity: 'Common', baseWeight: 18 },
  { name: 'Aether Residue', rarity: 'Common', baseWeight: 14 },
  { name: 'Aether Mud', rarity: 'Common', baseWeight: 10 },
  // OTA 021 — same bump as the area-search pool. Dig was at
  // ~26% rocks/sticks at score 3 after the OTA 012 food
  // additions; these weights restore ~38% so the player who
  // digs with a real tool actually fills their pack with stock.
  { name: 'Small Rock', rarity: 'Common', baseWeight: 55 },
  { name: 'Big Rock', rarity: 'Common', baseWeight: 30 },
  { name: 'Stick', rarity: 'Common', baseWeight: 50 },
  { name: 'Spider Silk', rarity: 'Common', baseWeight: 8 },
  { name: 'Patched Cloth', rarity: 'Common', baseWeight: 8 },
  { name: 'Trail Rations', rarity: 'Common', baseWeight: 6 },
  { name: 'Aether Crystal', rarity: 'Common', baseWeight: 6 },
  // OTA 012 — Firewood / wild foods / Empty Water Bottle were
  // wired into the area-search SMALL_FINDS pool but missed from
  // the dig pool. Player digging with a tool would never find any
  // of the Phase 1-3 items. Mirroring weights from the area-search
  // table where parallel entries exist.
  { name: 'Firewood', rarity: 'Common', baseWeight: 22 },
  { name: 'Wild Onion', rarity: 'Common', baseWeight: 8 },
  { name: 'Wild Carrot', rarity: 'Common', baseWeight: 8 },
  { name: 'Wild Lettuce', rarity: 'Common', baseWeight: 6 },
  { name: 'Rhubarb Stalk', rarity: 'Common', baseWeight: 5 },
  { name: 'Wild Oats', rarity: 'Common', baseWeight: 7 },
  { name: 'Red Cap Mushroom', rarity: 'Common', baseWeight: 5 },
  { name: 'Blue Cap Mushroom', rarity: 'Common', baseWeight: 5 },
  { name: 'Orange Sporecap', rarity: 'Common', baseWeight: 5 },
  // OTA-1723 — 4 -> 12, matching the forage table. Digging is where the owner's
  // own log shows him foraging ("investigate the ground"), so a bottle that is
  // rare here is rare in practice however common it looks elsewhere.
  { name: 'Empty Water Bottle', rarity: 'Common', baseWeight: 12 },
  // Uncommon — relic-grade finds.
  { name: 'Aetheric Shard', rarity: 'Uncommon', baseWeight: 5 },
  { name: 'Aetheric Dust', rarity: 'Uncommon', baseWeight: 4 },
  { name: 'Mud Essence', rarity: 'Uncommon', baseWeight: 3 },
  { name: 'Drone Core', rarity: 'Uncommon', baseWeight: 2 },
  { name: 'Scrap Metal', rarity: 'Common', baseWeight: 4 },
  { name: 'Energy Fragment', rarity: 'Uncommon', baseWeight: 2 },
  // OTA 012 — uncommon wild foods.
  { name: 'Speckled Egg', rarity: 'Uncommon', baseWeight: 3 },
  { name: 'Blueberries', rarity: 'Uncommon', baseWeight: 4 },
  { name: 'Raspberries', rarity: 'Uncommon', baseWeight: 4 },
  { name: 'Wild Grapes', rarity: 'Uncommon', baseWeight: 3 },
  { name: 'Violet Cap Mushroom', rarity: 'Uncommon', baseWeight: 2 },
  // OTA 012 — rare drop, the chicken.
  { name: 'Wild Chicken', rarity: 'Rare', baseWeight: 1 },
  // Rare — buried Tartarian goods. Dig score has to be high to pull these.
  { name: 'Aetheric Cloth', rarity: 'Rare', baseWeight: 1 },
  { name: 'Mudstone', rarity: 'Rare', baseWeight: 1 },
  { name: 'Aetheric Pelt', rarity: 'Rare', baseWeight: 1 },
  { name: 'Golem Core', rarity: 'Rare', baseWeight: 1 },

  // OTA 029 — improvised / found weapons. Same pool as area-search
  // SMALL_FINDS so the player who digs with a real tool can also
  // turn up the occasional cudgel / spear / knife. Weights kept
  // low — the dig pool already has a strong rocks/sticks majority.
  { name: 'Cudgel', rarity: 'Common', baseWeight: 3 },
  { name: 'Stone Spear', rarity: 'Common', baseWeight: 3 },
  { name: 'Pocket Knife', rarity: 'Common', baseWeight: 2 },
  { name: 'Bone Shiv', rarity: 'Common', baseWeight: 2 },
  { name: 'Bone Knife', rarity: 'Common', baseWeight: 2 },
  { name: 'Rust Dagger', rarity: 'Common', baseWeight: 2 },
  { name: 'Aetherium Spear', rarity: 'Common', baseWeight: 1 },
  { name: 'Aether-Shard Spear', rarity: 'Uncommon', baseWeight: 1 },
];

// arb119 — how many PRODUCTIVE digs (an item actually landed) a single
// wild tile yields before the patch reads as worked-out. Wild digs
// deliberately re-roll stackable commodities so the player can gather
// crafting stock in place, but with no cap the loop minted 100+ items
// (incl. rares) over a couple hundred taps on one tile. 16 is plenty to
// build a Stone Spear or Cudgel without walking, yet kills the in-place
// farm dead. Hub/outpost digs use their own restock path and ignore this.
export const DIG_SPOT_PRODUCTIVE_CAP = 16;

/**
 * ⚠⚠⚠ OTA-1554 — IS THIS PATCH WORKED OUT? ONE ANSWER, FOR THE ACTION AND THE
 * BUTTON ALIKE.
 *
 * The owner tapped INVESTIGATE about thirty times on one spent patch before the
 * game admitted it had nothing left. It was not being coy: the dig has a hard
 * ceiling (`groundDigCount >= DIG_SPOT_PRODUCTIVE_CAP`, arb119) and refuses
 * every attempt past it — but that ceiling lived ONLY inside the dig handler.
 * The INVESTIGATE badge counts actionable chips out of the productively-consumed
 * and flavour-exhausted sets, and the pinned surface chip ("the mud" / "the
 * ground" / "the floor") is in NEITHER, because a patch is never "consumed" in
 * that sense — it is worked out, which is a different ledger entirely. So the
 * chip stayed bright and the badge stayed green over ground that could not
 * produce another thing.
 *
 * ⚠⚠ THIS IS THE SAME DEFECT FOR THE FOURTH TIME, and the code is honest about
 * the previous three: OTA-179 (the scanner gate the pinned chip never got),
 * OTA-1124 (the elevation gate the pinned chip never got), OTA-1263 (TAKE and
 * SALVAGE green over an empty picker). Every one is "the state the ACTION checks
 * and the state the BUTTON reads are two different places." So the ceiling stops
 * being a number one handler happens to compare against and becomes a shared
 * predicate: the refusal and the greying call the same function, and a change to
 * one can no longer leave the other behind.
 */
export function digSpotWorkedOut(
  worldMemory: { visitedRooms?: Record<string, { groundDigCount?: number }> } | null | undefined,
  roomKey: string,
): boolean {
  return (worldMemory?.visitedRooms?.[roomKey]?.groundDigCount ?? 0) >= DIG_SPOT_PRODUCTIVE_CAP;
}

// Roll the dig outcome. Returns null when nothing was found (always
// possible, especially with low score). Includes a flat "found nothing"
// chance that decreases as score increases.
export function rollDig(
  score: number,
  biomeTags?: readonly string[],
): { found: DigEntry | null; nothing: boolean } {
  // P(nothing) = roughly 55% at score 1 → 18% at score 6.
  const pNothing = Math.max(0.18, 0.55 - score * 0.06);
  if (Math.random() < pNothing) return { found: null, nothing: true };

  // Rarity weights scale with score: higher score boosts uncommon / rare.
  const weights = DIG_LOOT.map((e) => {
    let w = e.baseWeight;
    if (e.rarity === 'Uncommon') w *= 1 + (score - 1) * 0.4;
    if (e.rarity === 'Rare') w *= 1 + (score - 1) * 0.8;
    // OTA-741 — biome boost: mud materials dominate a mud tile, etc.
    if (materialMatchesBiome(e.name, biomeTags)) w *= BIOME_FORAGE_BOOST;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < DIG_LOOT.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return { found: DIG_LOOT[i]!, nothing: false };
  }
  return { found: DIG_LOOT[DIG_LOOT.length - 1]!, nothing: false };
}
