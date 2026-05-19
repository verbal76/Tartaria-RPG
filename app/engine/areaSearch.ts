// Area-search engine — when the player searches a generic SPATIAL or
// MATERIAL target ("the mud", "the rubble", "the doorway", "behind me",
// "to my left"), the engine rolls an outcome on the spot. No reprompt,
// no exact-noun matching required.
//
// The roll is weighted by what's in the scene: ambient nouns shift the
// odds slightly toward planting a hook; otherwise materials, TC, or
// nothing dominate.

import type { Rarity } from './types';

// Phrases that count as a generic area / surface / direction search.
// Anything in here triggers an outcome roll instead of "I don't see X".
const AREA_TOKENS = [
  // surfaces
  'mud', 'silt', 'dust', 'ash', 'sand', 'rock', 'rocks', 'stone', 'stones',
  'rubble', 'gravel', 'debris', 'pile', 'piles',
  // built features
  'wall', 'walls', 'doorway', 'door', 'archway', 'corner', 'corners',
  'floor', 'ceiling', 'window', 'columns', 'column', 'pillar',
  'wagon', 'cart', 'crate', 'crates', 'shelf', 'shelves', 'chest', 'box',
  // generic area
  'area', 'ground', 'spot', 'patch', 'side',
  // directional
  'left', 'right', 'front', 'behind', 'back', 'around', 'over', 'under',
  'north', 'south', 'east', 'west', 'up', 'down',
  // ruin-flavor
  'ruin', 'ruins', 'cache', 'pit', 'puddle', 'shadow', 'shadows',
];

// True if the player's target text contains at least one area-ish word.
export function isAreaSearch(target: string): boolean {
  const t = target.toLowerCase();
  for (const w of AREA_TOKENS) {
    // Word boundary so "left" doesn't match "leftover" too aggressively.
    const re = new RegExp(`\\b${w}\\b`);
    if (re.test(t)) return true;
  }
  return false;
}

// Ground-type targets — these are diggable surfaces. When the player
// searches one of these AND has a dig tool, the engine routes to the
// dig loot path (rare access, tool wear) instead of the small area
// search pool. The full AREA_TOKENS list still triggers a search, but
// only ground tokens unlock the dig path.
const GROUND_TOKENS = [
  'mud', 'silt', 'dust', 'ash', 'sand', 'rock', 'rocks', 'stone', 'stones',
  'rubble', 'gravel', 'debris', 'pile', 'piles',
  'floor', 'ground', 'patch', 'spot', 'pit',
];

export function isGroundSearch(target: string): boolean {
  const t = target.toLowerCase();
  for (const w of GROUND_TOKENS) {
    const re = new RegExp(`\\b${w}\\b`);
    if (re.test(t)) return true;
  }
  return false;
}

export type AreaSearchOutcome =
  | { kind: 'nothing'; line: string }
  | { kind: 'material'; itemName: string; rarity: Rarity; line: string }
  | { kind: 'tc'; amount: number; line: string }
  | { kind: 'hook'; line: string };

// Small loot pool for generic area searches. Common only — chunky relic
// finds come from typed hooks, not from poking the mud.
const SMALL_FINDS: { name: string; rarity: Rarity; weight: number }[] = [
  { name: 'Mud Fragment', rarity: 'Common', weight: 18 },
  { name: 'Aether Residue', rarity: 'Common', weight: 14 },
  { name: 'Aether Mud', rarity: 'Common', weight: 10 },
  { name: 'Small Rock', rarity: 'Common', weight: 12 },
  { name: 'Big Rock', rarity: 'Common', weight: 4 },
  { name: 'Stick', rarity: 'Common', weight: 10 },
  { name: 'Spider Silk', rarity: 'Common', weight: 8 },
  { name: 'Patched Cloth', rarity: 'Common', weight: 7 },
  { name: 'Aether Crystal', rarity: 'Common', weight: 6 },
  { name: 'Bone Bolt', rarity: 'Common', weight: 5 },
  { name: 'Trail Rations', rarity: 'Common', weight: 4 },
  { name: 'Aetheric Shard', rarity: 'Uncommon', weight: 3 },
];

// Empty-search narration. Per the playtest "Lockbox/Wagon"
// feedback, this line MUST be definitive — players were rolling
// atmospheric flavor lines repeatedly and not realising there was
// nothing to find. The line below is the one hard mechanical
// signal the player needs to move on.
const NOTHING_LINES = [
  'You search {target}. It is completely empty.',
];

const MATERIAL_LINES = [
  'You search {target}. A useful scrap turns up in your hand.',
  'You comb through {target}. You find something half-buried.',
  'You sift {target} and pull out a piece worth keeping.',
];

const TC_LINES = [
  'You search {target}. A few coins, half-eaten by Aetherstone, but spendable.',
  'You comb {target}. Old coin tangled in the silt — yours now.',
  'You find a small purse forgotten in {target}.',
];

const HOOK_LINES = [
  'You search {target}. Something not-quite-right catches your eye.',
  'You comb {target}. The silt parts on something the Arbiter would call worth following.',
  'You feel through {target} and your fingers close on something that does not belong here.',
];

function pickWeighted<T extends { weight: number }>(arr: T[]): T {
  const total = arr.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of arr) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return arr[arr.length - 1]!;
}

function format(line: string, target: string): string {
  return line.replace(/\{target\}/g, target);
}

// Roll a result. Outcome mix:
//   45% nothing
//   25% small material
//   15% small TC
//   15% atmospheric hook plant (caller plants the hook)
//
// The caller already knows the target string the player used; we pass it
// back into the line so narration uses the player's own phrasing.
export function rollAreaSearch(target: string): AreaSearchOutcome {
  const r = Math.random();
  if (r < 0.45) {
    return { kind: 'nothing', line: format(pick(NOTHING_LINES), target) };
  }
  if (r < 0.70) {
    const found = pickWeighted(SMALL_FINDS);
    return {
      kind: 'material',
      itemName: found.name,
      rarity: found.rarity,
      line: format(pick(MATERIAL_LINES), target),
    };
  }
  if (r < 0.85) {
    const amount = 3 + Math.floor(Math.random() * 12);
    return { kind: 'tc', amount, line: format(pick(TC_LINES), target) };
  }
  return { kind: 'hook', line: format(pick(HOOK_LINES), target) };
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0]!;
}
