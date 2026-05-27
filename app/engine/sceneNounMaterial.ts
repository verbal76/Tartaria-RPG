// Scene-noun material & hardness classifier.
//
// Used by the no-enemy attack handler to decide what happens when a
// player whomps on a SCENE object instead of an enemy. The classifier
// runs purely on the noun text the player typed (or the ambient-noun
// match the engine resolved to). It returns a material (loot family)
// and a hardness (whether a body attack can win).
//
// Why a keyword classifier instead of per-scene authoring: scenes are
// procedurally generated, so authoring every plausible noun would
// never finish. Keywords cover ~90% of plausible inputs; a small
// SPECIFIC_OVERRIDES table handles the cases where general keyword
// matching gets the wrong answer (a stone chest is wood-sturdy, not
// stone-hard).

import type { Rarity } from './types';

export type NounMaterial =
  | 'wood'
  | 'stone'
  | 'metal'
  | 'glass'
  | 'jewelry_box'
  | 'bone'
  | 'fabric'
  | 'unknown';

export type NounHardness =
  | 'fragile'  // glass, jewelry box, fabric — body attack breaks, no roll
  | 'sturdy'   // wood, bone — body attack rolls STR vs DC 12
  | 'hard';    // stone, metal, machinery — body attack bruises

export interface NounClassification {
  material: NounMaterial;
  hardness: NounHardness;
}

// Default hardness per material. Each material maps to exactly one
// hardness so the rules stay simple to reason about.
const HARDNESS_OF: Record<NounMaterial, NounHardness> = {
  wood: 'sturdy',
  bone: 'sturdy',
  stone: 'hard',
  metal: 'hard',
  glass: 'fragile',
  jewelry_box: 'fragile',
  fabric: 'fragile',
  unknown: 'sturdy', // give the player a fair roll on novel nouns
};

// Specific-phrase overrides — matched FIRST as substring against the
// lowered noun. A reliquary is jewelry-box even though "reliquary"
// shares no letters with "jewelry" / "box". Order matters: more
// specific (multi-word) phrases first.
const SPECIFIC_OVERRIDES: { phrase: string; material: NounMaterial }[] = [
  { phrase: 'jewelry box', material: 'jewelry_box' },
  { phrase: 'jewel box', material: 'jewelry_box' },
  { phrase: 'locket box', material: 'jewelry_box' },
  { phrase: 'treasure box', material: 'jewelry_box' },
  { phrase: 'lock box', material: 'jewelry_box' },
  { phrase: 'lockbox', material: 'jewelry_box' },
  { phrase: 'reliquary', material: 'jewelry_box' },
  { phrase: 'casket', material: 'jewelry_box' },
];

// Per-material keyword tables. Word-boundary matched against the
// lowered noun text. Larger / more specific words appear early so a
// "stone wall" classifies stone, not wood (which doesn't appear).
const MATERIAL_KEYWORDS: Record<Exclude<NounMaterial, 'unknown'>, string[]> = {
  wood: [
    'door', 'doorway', 'plank', 'board', 'crate', 'chest', 'box', 'table',
    'chair', 'beam', 'wagon', 'cart', 'trunk', 'shutter', 'barrel', 'cask',
    'wooden', 'wood', 'log', 'fence', 'gate',
  ],
  stone: [
    'pillar', 'column', 'wall', 'statue', 'boulder', 'slab', 'brick', 'masonry',
    'stone', 'rock', 'monolith', 'altar', 'plinth', 'obelisk', 'arch',
    'mudstone', 'aetherstone',
  ],
  metal: [
    'emitter', 'scanner', 'machine', 'gear', 'pipe', 'anvil', 'lever',
    'automaton', 'drone', 'lock', 'chain', 'rail', 'pylon', 'turbine',
    'iron', 'steel', 'bronze', 'copper', 'brass',
    'defense light', 'light',
  ],
  glass: [
    'window', 'pane', 'lantern', 'jar', 'bottle', 'glass', 'mirror', 'phial',
    'vial', 'flask',
  ],
  jewelry_box: [],
  bone: [
    'skeleton', 'skull', 'bone', 'rib', 'corpse', 'skeletal', 'remains',
  ],
  fabric: [
    'banner', 'curtain', 'tarp', 'cloak', 'robe', 'cloth', 'sheet', 'shroud',
    'rag', 'rags',
  ],
};

const ORDER: Exclude<NounMaterial, 'unknown'>[] = [
  // jewelry_box handled by SPECIFIC_OVERRIDES — leave out of generic pass
  'glass',     // before metal/stone so "glass jar" doesn't match jar→ glass twice
  'bone',      // skeleton wins before any wood-sounding token
  'fabric',
  'wood',
  'metal',
  'stone',     // last — most "wall / rock" generic matches go here
];

export function classifyNoun(noun: string): NounClassification {
  const t = noun.toLowerCase().trim();
  if (!t) return { material: 'unknown', hardness: HARDNESS_OF.unknown };

  // 1) Specific overrides — exact phrase match.
  for (const { phrase, material } of SPECIFIC_OVERRIDES) {
    if (t.includes(phrase)) {
      return { material, hardness: HARDNESS_OF[material] };
    }
  }

  // 2) Per-material keyword pass in defined order.
  for (const material of ORDER) {
    for (const kw of MATERIAL_KEYWORDS[material]) {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`);
      if (re.test(t)) {
        return { material, hardness: HARDNESS_OF[material] };
      }
    }
  }

  return { material: 'unknown', hardness: HARDNESS_OF.unknown };
}

// Break-loot table. Returned to gameStore when a body attack
// succeeds (fragile auto-break, or sturdy STR-roll pass). Matches
// existing catalog item names so grantItem can stamp them properly.
//
// Stone / metal / glass / unknown intentionally return null — stone
// has nothing breakable to retrieve, metal needs a tool not a fist,
// glass has no catalog item to grant, and unknown shouldn't reward
// a novel noun the engine couldn't classify.
export interface BreakLoot {
  itemName: string;
  rarity: Rarity;
  /** Quantity span; caller picks a value in [min, max] inclusive. */
  min: number;
  max: number;
  /** Probability weight within the material's pool. */
  weight: number;
}

const LOOT_POOLS: Partial<Record<NounMaterial, BreakLoot[]>> = {
  wood: [
    { itemName: 'Stick', rarity: 'Common', min: 1, max: 2, weight: 80 },
    { itemName: 'Patched Cloth', rarity: 'Common', min: 1, max: 1, weight: 20 },
  ],
  bone: [
    { itemName: 'Bone Fragment', rarity: 'Common', min: 1, max: 2, weight: 100 },
  ],
  fabric: [
    { itemName: 'Patched Cloth', rarity: 'Common', min: 1, max: 1, weight: 100 },
  ],
  jewelry_box: [
    { itemName: 'Aetheric Locket', rarity: 'Common', min: 1, max: 1, weight: 60 },
    { itemName: 'Mud Gem', rarity: 'Rare', min: 1, max: 1, weight: 15 },
    { itemName: 'Patched Cloth', rarity: 'Common', min: 1, max: 1, weight: 25 },
  ],
};

/** Roll a single break-loot drop for the given material, or null if
 *  this material doesn't drop anything (stone / metal / glass /
 *  unknown). Caller is responsible for granting the item via the
 *  inventory pipeline. */
export function rollBreakLoot(material: NounMaterial): { itemName: string; rarity: Rarity; quantity: number } | null {
  const pool = LOOT_POOLS[material];
  if (!pool || pool.length === 0) return null;
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let pick = Math.random() * total;
  for (const entry of pool) {
    pick -= entry.weight;
    if (pick <= 0) {
      const qty = entry.min === entry.max
        ? entry.min
        : entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
      return { itemName: entry.itemName, rarity: entry.rarity, quantity: qty };
    }
  }
  // Fallback (only reached on FP drift)
  const last = pool[pool.length - 1]!;
  return { itemName: last.itemName, rarity: last.rarity, quantity: last.min };
}
