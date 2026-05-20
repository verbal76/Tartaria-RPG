// Per-noun salvage outcome pools. When the player salvages a wagon,
// they should get rations / climbing rope / scrap metal — not the
// same generic small-finds pool every other salvageable noun rolls
// from. This module pattern-matches the noun against a curated set
// of category pools and produces an outcome flavored for the thing
// being broken down.
//
// Returns null when no pool matches; callers fall through to the
// generic rollAreaSearch so the existing pipeline keeps working
// for nouns we haven't classified.

import type { Rarity } from './types';

interface PoolEntry {
  name: string;
  rarity: Rarity;
  weight: number;
  min: number;
  max: number;
}

interface SalvagePool {
  /** Pool identifier — for debug logging + test introspection. */
  id: string;
  /** Substring patterns; the FIRST pool whose any-pattern matches
   *  the noun (case-insensitive) is selected. Order matters —
   *  more specific pools should come before general ones. */
  patterns: string[];
  /** Weighted item pool. Weights need not sum to 100; the picker
   *  normalises. min/max set the quantity range (inclusive). */
  items: PoolEntry[];
}

// Pool definitions, ordered most-specific → most-general. The
// matcher walks top-down and stops at the first hit, so weapons
// land in WEAPON_SCRAP before they leak into the broader METAL
// fallback.
const POOLS: SalvagePool[] = [
  {
    id: 'mechanical',
    patterns: [
      'drone', 'sentinel', 'automaton', 'circuit', 'scrap drone',
      'clockwork', 'mechanical',
    ],
    items: [
      { name: 'Automaton Circuit', rarity: 'Common', weight: 30, min: 1, max: 2 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 30, min: 2, max: 4 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Aether Dust', rarity: 'Common', weight: 15, min: 1, max: 3 },
      { name: 'Sentinel Core Plate', rarity: 'Uncommon', weight: 10, min: 1, max: 1 },
    ],
  },
  {
    id: 'wagon',
    patterns: ['wagon', 'cart', 'sled', 'caravan'],
    items: [
      { name: 'Trail Rations', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 25, min: 1, max: 3 },
      { name: 'Climbing Rope', rarity: 'Common', weight: 20, min: 1, max: 1 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 20, min: 3, max: 8 },
      { name: 'Aetheric Torch', rarity: 'Common', weight: 10, min: 1, max: 1 },
    ],
  },
  {
    id: 'weapon_scrap',
    patterns: [
      'blade', 'sword', 'axe', 'pike', 'rifle', 'spear', 'rod',
      'knife', 'cleaver', 'maul', 'hammer', 'gun', 'gauntlet',
      'staff', 'bow', 'harpoon',
    ],
    items: [
      { name: 'Scrap Metal', rarity: 'Common', weight: 40, min: 1, max: 2 },
      { name: 'Rusted Blade', rarity: 'Common', weight: 20, min: 1, max: 1 },
      { name: 'Aether Dust', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Throwing Knife', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 5, min: 1, max: 1 },
    ],
  },
  {
    id: 'engine_parts',
    patterns: [
      'engine', 'console', 'conduit', 'capacitor', 'coil', 'panel',
      'battery', 'core', 'pipe', 'valve', 'pump', 'motor', 'cable',
      'wire', 'relay', 'gear', 'reactor', 'terminal', 'circuit panel',
    ],
    items: [
      { name: 'Automaton Circuit', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 25, min: 1, max: 3 },
      { name: 'Aether Dust', rarity: 'Common', weight: 15, min: 1, max: 3 },
      { name: 'Aetheric Shard', rarity: 'Common', weight: 10, min: 1, max: 1 },
    ],
  },
  {
    id: 'nautical',
    patterns: [
      'hull', 'mast', 'anchor', 'chain', 'hook', 'harpoon', 'rigging',
      'sail', 'plank', 'beam', 'driftwood', 'ship', 'boat',
    ],
    items: [
      { name: 'Scrap Metal', rarity: 'Common', weight: 35, min: 1, max: 3 },
      { name: 'Climbing Rope', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Trail Rations', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 20, min: 5, max: 12 },
    ],
  },
  {
    id: 'light',
    patterns: ['lantern', 'torch', 'lamp', 'flare', 'beacon'],
    items: [
      { name: 'Aether Dust', rarity: 'Common', weight: 40, min: 1, max: 3 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 25, min: 1, max: 1 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Aetheric Torch', rarity: 'Common', weight: 15, min: 1, max: 1 },
    ],
  },
  {
    id: 'tomb',
    patterns: [
      'sarcophagus', 'coffin', 'urn', 'burial', 'skeleton', 'remains',
      'bone', 'skull', 'corpse', 'cadaver',
    ],
    items: [
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 35, min: 3, max: 10 },
      { name: 'Aetheric Locket', rarity: 'Common', weight: 25, min: 1, max: 1 },
      { name: 'Aether Dust', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 20, min: 1, max: 1 },
    ],
  },
  {
    id: 'archive',
    patterns: [
      'archive', 'tome', 'tablet', 'ledger', 'slate', 'blueprint',
      'map', 'parchment', 'scroll', 'journal', 'paper', 'letter',
    ],
    items: [
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 30, min: 2, max: 6 },
      { name: 'Tartarian Map Fragment', rarity: 'Common', weight: 25, min: 1, max: 1 },
      { name: 'Sealed Tartarian Letter', rarity: 'Common', weight: 25, min: 1, max: 1 },
      { name: 'Aether Dust', rarity: 'Common', weight: 20, min: 1, max: 2 },
    ],
  },
  {
    id: 'rubble',
    patterns: [
      'rubble', 'debris', 'mound', 'pile', 'rock', 'stone', 'shard',
      'fragment', 'flagstone', 'masonry', 'brick',
    ],
    items: [
      { name: 'Scrap Metal', rarity: 'Common', weight: 30, min: 1, max: 3 },
      { name: 'Mud Fragment', rarity: 'Common', weight: 25, min: 1, max: 3 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 20, min: 1, max: 1 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 15, min: 2, max: 6 },
      { name: 'Aether Dust', rarity: 'Common', weight: 10, min: 1, max: 2 },
    ],
  },
];

const NOTHING_LINES = [
  'You break {target} apart. Nothing in the wreckage answered.',
  'You strip {target} down to its bones. The bones were already empty.',
  'You salvage {target}. The work tires you out and the take is nothing.',
];

const MATERIAL_LINES = [
  'You strip {target} carefully. Something usable comes free in your hand.',
  'You break {target} apart. Among the pieces, something worth keeping.',
  'You salvage {target}. The take is small but real.',
  'You work {target} over. A part of it comes loose, intact.',
];

export interface SalvageOutcome {
  kind: 'nothing' | 'material';
  /** Pre-formatted narration line. */
  line: string;
  /** Pool id for debug + tests. */
  poolId: string;
  /** Only set when kind === 'material'. */
  itemName?: string;
  rarity?: Rarity;
  quantity?: number;
}

/** Probability that even a matched pool returns nothing. Tuned so
 *  the player gets a positive outcome on most salvages but the
 *  RNG still feels meaningful — about 1 in 4 attempts come up dry. */
const NOTHING_CHANCE = 0.25;

function pickPool(noun: string): SalvagePool | null {
  const lower = noun.toLowerCase();
  for (const pool of POOLS) {
    for (const pat of pool.patterns) {
      if (lower.includes(pat)) return pool;
    }
  }
  return null;
}

function format(lines: string[], noun: string, rng: () => number): string {
  const t = noun.trim();
  const hasLeadingArticle = /^(the|a|an|some|my|your|this|that)\s/i.test(t);
  const display = hasLeadingArticle ? t : `the ${t}`;
  const line = lines[Math.floor(rng() * lines.length)] ?? lines[0]!;
  return line.replace(/\{target\}/g, display);
}

function pickWeighted(items: PoolEntry[], rng: () => number): PoolEntry {
  const total = items.reduce((a, e) => a + e.weight, 0);
  const roll = rng() * total;
  let cum = 0;
  for (const e of items) {
    cum += e.weight;
    if (roll < cum) return e;
  }
  return items[items.length - 1]!;
}

/** Roll a salvage outcome for the named noun. Returns null when no
 *  pool matches — caller should fall through to rollAreaSearch. */
export function rollSalvagePool(noun: string, rng: () => number = Math.random): SalvageOutcome | null {
  const pool = pickPool(noun);
  if (!pool) return null;
  if (rng() < NOTHING_CHANCE) {
    return { kind: 'nothing', poolId: pool.id, line: format(NOTHING_LINES, noun, rng) };
  }
  const entry = pickWeighted(pool.items, rng);
  const span = entry.max - entry.min;
  const quantity = entry.min + (span > 0 ? Math.floor(rng() * (span + 1)) : 0);
  return {
    kind: 'material',
    poolId: pool.id,
    itemName: entry.name,
    rarity: entry.rarity,
    quantity,
    line: format(MATERIAL_LINES, noun, rng),
  };
}

/** Exposed for tests. */
export const __TEST_ONLY__ = { POOLS, NOTHING_CHANCE };
