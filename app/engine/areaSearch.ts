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
// Rebalanced 2026-05-21 — playtester report "haven't seen rocks or
// sticks for a while". Pre-fix weights had rocks+sticks at 26/111
// = ~23% of material outcomes (and material is only ~25% of all
// search rolls, so net ~5.8% per attempt). The rulebook framing
// promises these as the cheap stock items every starter relies on
// to build clubs / spears, so they should dominate the pool.
// Bumped Small Rock / Big Rock / Stick to be 50% of the material
// pool by weight. Mud / Aether commodity weights lowered slightly
// to compensate.
const SMALL_FINDS: { name: string; rarity: Rarity; weight: number }[] = [
  // Rocks / sticks / scrap — the "normal stuff you'd find on the
  // ground." Highest weights so the player keeps stocking the
  // cheap-kit pool the rulebook promises.
  { name: 'Mud Fragment', rarity: 'Common', weight: 12 },
  { name: 'Aether Residue', rarity: 'Common', weight: 8 },
  { name: 'Aether Mud', rarity: 'Common', weight: 6 },
  // OTA 021 — rocks / sticks bumped HARD because the playtester
  // hadn't seen a Big Rock in their session at all. These are the
  // rulebook-promised cheap-stock items every starter relies on
  // for clubs / spears / improvised throwing. After the OTA 012
  // food additions diluted the pool, rocks+sticks dropped to ~28%
  // of material drops; the bumps below put them back at ~40%.
  { name: 'Small Rock', rarity: 'Common', weight: 40 },
  { name: 'Big Rock', rarity: 'Common', weight: 22 },
  { name: 'Stick', rarity: 'Common', weight: 38 },
  // OTA 227 — Firewood drops fairly often from look-around / area
  // search. Weightless, single-purpose (campfire fuel).
  { name: 'Firewood', rarity: 'Common', weight: 18 },
  { name: 'Spider Silk', rarity: 'Common', weight: 6 },
  { name: 'Patched Cloth', rarity: 'Common', weight: 6 },
  { name: 'Aether Crystal', rarity: 'Common', weight: 4 },
  { name: 'Bone Bolt', rarity: 'Common', weight: 4 },
  { name: 'Trail Rations', rarity: 'Common', weight: 3 },
  { name: 'Aetheric Shard', rarity: 'Uncommon', weight: 2 },

  // OTA 002 — wild foods. Playtester: "I want to find wild onions,
  // wild carrots... blueberries, raspberries, grapes picked from a
  // vine. these foods need to be eaten or drank and they should
  // all give you health back to varying degrees." Per-item HP /
  // stamina lives in the catalog effect; eat handler reads it.
  // Common foods (5-9 weight each — ~30% of all material drops
  // combined). Uncommon fruits + protein at lower weight, rare
  // Wild Chicken sparingly.
  { name: 'Wild Onion', rarity: 'Common', weight: 8 },
  { name: 'Wild Carrot', rarity: 'Common', weight: 8 },
  { name: 'Wild Lettuce', rarity: 'Common', weight: 6 },
  { name: 'Rhubarb Stalk', rarity: 'Common', weight: 5 },
  { name: 'Wild Oats', rarity: 'Common', weight: 7 },
  { name: 'Speckled Egg', rarity: 'Uncommon', weight: 3 },
  { name: 'Blueberries', rarity: 'Uncommon', weight: 4 },
  { name: 'Raspberries', rarity: 'Uncommon', weight: 4 },
  { name: 'Wild Grapes', rarity: 'Uncommon', weight: 3 },
  { name: 'Wild Chicken', rarity: 'Rare', weight: 1 },

  // Colored mushrooms — Phase 4 will combine these in the craft
  // tab for color-coded potions. Eaten raw, they give minimal
  // healing — the real value comes from cooking / distilling.
  { name: 'Red Cap Mushroom', rarity: 'Common', weight: 5 },
  { name: 'Blue Cap Mushroom', rarity: 'Common', weight: 5 },
  { name: 'Violet Cap Mushroom', rarity: 'Uncommon', weight: 2 },
  { name: 'Orange Sporecap', rarity: 'Common', weight: 5 },

  // Empty bottles — water-bottle Phase 3 (OTA 004). Low weight so
  // the player has to do some looking before bottle stock outpaces
  // the new fill-bottle verb's water-source detection.
  { name: 'Empty Water Bottle', rarity: 'Common', weight: 4 },

  // Rare trinkets — "every now and then you'll find a trinket
  // like a locket or ring or something good but rarely."
  { name: 'Aetheric Locket', rarity: 'Common', weight: 1 },

  // OTA 029 — improvised / found weapons. Playtester request: the
  // wasteland should occasionally cough up a rusted blade-thing the
  // player can pick up and swing. Low weights so weapons stay a
  // happy surprise, not a flood. Mix of common improvised
  // (cudgel/stone spear/pocket knife/bone shiv), faction-flavored
  // commons (bone knife/rust dagger) and one uncommon aetheric.
  { name: 'Cudgel', rarity: 'Common', weight: 3 },
  { name: 'Stone Spear', rarity: 'Common', weight: 3 },
  { name: 'Pocket Knife', rarity: 'Common', weight: 2 },
  { name: 'Bone Shiv', rarity: 'Common', weight: 2 },
  { name: 'Bone Knife', rarity: 'Common', weight: 2 },
  { name: 'Rust Dagger', rarity: 'Common', weight: 2 },
  { name: 'Aetherium Spear', rarity: 'Common', weight: 1 },
  { name: 'Aether-Shard Spear', rarity: 'Uncommon', weight: 1 },
];

// Empty-search narration. Per the playtest "Lockbox/Wagon"
// feedback, this line MUST be definitive — players were rolling
// atmospheric flavor lines repeatedly and not realising there was
// nothing to find. The line below is the one hard mechanical
// signal the player needs to move on.
const NOTHING_LINES = [
  'You search {target}. Nothing turns up — but the thing itself is still here for another pass.',
  'You go over {target} carefully and find nothing this time. It will still be here when you come back.',
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
  // Auto-prepend "the " when the target reads as a bare noun phrase.
  // Playtest log caught "You search rusted blade. It is completely
  // empty." — missing article. We skip when the target already starts
  // with an article / possessive / quantifier OR when it's a known
  // collective ("ground", "rubble", "area") where bare reads natural.
  const t = target.trim();
  const hasLeadingArticle = /^(the|a|an|some|my|your|this|that|these|those)\s/i.test(t);
  const isCollective = /^(ground|rubble|area|dirt|silt|mud|sand|water|dust)\b/i.test(t);
  const display = hasLeadingArticle || isCollective ? t : `the ${t}`;
  return line.replace(/\{target\}/g, display);
}

// Roll a result. Outcome mix (OTA 030 — bumped TC rate + amount so
// that small TC drops compound into something a roadside trader can
// actually take. Was 45/25/15/15 nothing/mat/tc/hook with 3-14 TC;
// now 40/25/20/15 with 5-16 TC):
//   40% nothing
//   25% small material
//   20% small TC
//   15% atmospheric hook plant (caller plants the hook)
//
// The caller already knows the target string the player used; we pass it
// back into the line so narration uses the player's own phrasing.
/** OTA-198 — optional hookBonus shifts the distribution toward
 *  `hook` outcomes. Used by the Aetheric Vision Lens path in
 *  gameStore: when the player carries the lens, the wider chance
 *  to surface a mission hook fires. A bonus of 0.15 converts
 *  ~15 percentage points away from "nothing" into hook outcomes,
 *  leaving material + TC weights untouched. Clamped to [0, 0.4]
 *  so the lens can't turn every search into a hook.
 *
 *  OTA-213 — new `intent` option flips the entire distribution for
 *  the `investigate` verb. Playtester:
 *    "let's have investigate be more inclined to have you find
 *    story hooks than anything else. ... I don't want this shit to
 *    be a clicking simulator."
 *  Search / harvest stay loot-heavy; investigate becomes hook-heavy
 *  so the player who CHOOSES to investigate is rewarded with story
 *  threads, not loot they could grind from search. */
export function rollAreaSearch(
  target: string,
  opts?: { hookBonus?: number; intent?: 'search' | 'investigate' | 'harvest' },
): AreaSearchOutcome {
  const bonus = Math.max(0, Math.min(0.4, opts?.hookBonus ?? 0));
  // OTA-213 — investigate flips the curve. Default search remains
  // 40% nothing / 25% material / 20% tc / 15% hook. Investigate is
  // 10% nothing / 15% material / 15% tc / 60% hook. hookBonus is
  // still honored on top (with the same 0.4 clamp) for the Vision
  // Lens carry case but matters less here since hook is already the
  // primary outcome.
  const isInvestigate = opts?.intent === 'investigate';
  const nothingCutoff = isInvestigate
    ? Math.max(0, 0.10 - bonus)
    : 0.40 - bonus;
  const materialCutoff = isInvestigate
    ? nothingCutoff + 0.15
    : nothingCutoff + 0.25;
  const tcCutoff = isInvestigate
    ? materialCutoff + 0.15
    : materialCutoff + 0.20;
  const r = Math.random();
  if (r < nothingCutoff) {
    return { kind: 'nothing', line: format(pick(NOTHING_LINES), target) };
  }
  if (r < materialCutoff) {
    const found = pickWeighted(SMALL_FINDS);
    return {
      kind: 'material',
      itemName: found.name,
      rarity: found.rarity,
      line: format(pick(MATERIAL_LINES), target),
    };
  }
  if (r < tcCutoff) {
    const amount = 5 + Math.floor(Math.random() * 12);
    return { kind: 'tc', amount, line: format(pick(TC_LINES), target) };
  }
  return { kind: 'hook', line: format(pick(HOOK_LINES), target) };
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0]!;
}
