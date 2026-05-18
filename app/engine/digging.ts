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
  for (const t of item.tags ?? []) {
    const s = TAG_DIG_SCORE[t.toLowerCase()];
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
  { name: 'Mud Fragment', rarity: 'Common', baseWeight: 30 },
  { name: 'Aether Residue', rarity: 'Common', baseWeight: 25 },
  { name: 'Aether Mud', rarity: 'Common', baseWeight: 20 },
  { name: 'Small Rock', rarity: 'Common', baseWeight: 22 },
  { name: 'Big Rock', rarity: 'Common', baseWeight: 8 },
  { name: 'Stick', rarity: 'Common', baseWeight: 14 },
  { name: 'Spider Silk', rarity: 'Common', baseWeight: 12 },
  { name: 'Patched Cloth', rarity: 'Common', baseWeight: 10 },
  { name: 'Trail Rations', rarity: 'Common', baseWeight: 8 },
  { name: 'Aether Crystal', rarity: 'Common', baseWeight: 8 },
  // Uncommon — relic-grade finds.
  { name: 'Aetheric Shard', rarity: 'Uncommon', baseWeight: 5 },
  { name: 'Aetheric Dust', rarity: 'Uncommon', baseWeight: 4 },
  { name: 'Mud Essence', rarity: 'Uncommon', baseWeight: 3 },
  { name: 'Drone Core', rarity: 'Uncommon', baseWeight: 2 },
  { name: 'Scrap Metal', rarity: 'Uncommon', baseWeight: 4 },
  { name: 'Energy Fragment', rarity: 'Uncommon', baseWeight: 2 },
  // Rare — buried Tartarian goods. Dig score has to be high to pull these.
  { name: 'Aetheric Cloth', rarity: 'Rare', baseWeight: 1 },
  { name: 'Mudstone', rarity: 'Rare', baseWeight: 1 },
  { name: 'Aetheric Pelt', rarity: 'Rare', baseWeight: 1 },
  { name: 'Golem Core', rarity: 'Rare', baseWeight: 1 },
];

// Roll the dig outcome. Returns null when nothing was found (always
// possible, especially with low score). Includes a flat "found nothing"
// chance that decreases as score increases.
export function rollDig(score: number): { found: DigEntry | null; nothing: boolean } {
  // P(nothing) = roughly 55% at score 1 → 18% at score 6.
  const pNothing = Math.max(0.18, 0.55 - score * 0.06);
  if (Math.random() < pNothing) return { found: null, nothing: true };

  // Rarity weights scale with score: higher score boosts uncommon / rare.
  const weights = DIG_LOOT.map((e) => {
    let w = e.baseWeight;
    if (e.rarity === 'Uncommon') w *= 1 + (score - 1) * 0.4;
    if (e.rarity === 'Rare') w *= 1 + (score - 1) * 0.8;
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
