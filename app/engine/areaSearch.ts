/* eslint-disable @typescript-eslint/no-require-imports */
// Area-search engine — when the player searches a generic SPATIAL or
// MATERIAL target ("the mud", "the rubble", "the doorway", "behind me",
// "to my left"), the engine rolls an outcome on the spot. No reprompt,
// no exact-noun matching required.
//
// The roll is weighted by what's in the scene: ambient nouns shift the
// odds slightly toward planting a hook; otherwise materials, TC, or
// nothing dominate.

import type { Rarity } from './types';
import { resolveFlavor, resolveTable, isReskinActive } from './contentPack';
import { materialMatchesBiome, BIOME_FORAGE_BOOST } from './digging';

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
  | { kind: 'hook'; line: string }
  // OTA-216 — directional find. Player investigates and the engine
  // hints at something in a cardinal direction. When the player
  // travels that way, stepDirection consumes a `pendingDirectionalFind`
  // on the player and spawns the named encounter archetype with the
  // promised hint noun. Investigate sets it; travel cashes it in.
  | { kind: 'directional_find'; direction: 'N' | 'E' | 'S' | 'W'; archetype: string; hintNoun: string; line: string }
  // OTA-216 — standalone story flavor. Single-line atmospheric beat,
  // no mechanical payload. Surfaces with "★ A QUIET MOMENT —" prefix
  // in the world feed so the player can see story is firing even
  // when there's nothing to chase.
  | { kind: 'cool_story'; line: string };

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
// arb61 — investigate's RARE exception drop (Piece C). Investigate's NORM is
// clues + mission hooks; routine common-material foraging was removed, so this
// is the only item investigate yields (food still comes from the separate
// forage path). A mix of Uncommon materials + Uncommon gear — gear names are
// granted through the caller's lookupCraftedItem, so they land as real
// weapons/armor, not inert misc.
const RARE_FINDS: { name: string; rarity: Rarity; weight: number }[] = require('../data/search/find-pools.json').rare;

const SMALL_FINDS: { name: string; rarity: Rarity; weight: number }[] = require('../data/search/find-pools.json').small;

// Empty-search narration. Per the playtest "Lockbox/Wagon"
// feedback, this line MUST be definitive — players were rolling
// atmospheric flavor lines repeatedly and not realising there was
// nothing to find. The line below is the one hard mechanical
// signal the player needs to move on.
// engine_Dev — NEUTRAL defaults (no setting-specific proper nouns). Each pool is
// overridable from the uploaded `flavor` block (keys: searchNothing, searchMaterial,
// searchTc, searchHook). Exported so the flavor template + Tartaria pack can read
// the shapes.
export const NOTHING_LINES = [
  'You search {target}. Nothing turns up — but the thing itself is still here for another pass.',
  'You go over {target} carefully and find nothing this time. It will still be here when you come back.',
];

export const MATERIAL_LINES = [
  'You search {target}. A useful scrap turns up in your hand.',
  'You comb through {target}. You find something half-buried.',
  'You sift {target} and pull out a piece worth keeping.',
];

export const TC_LINES = [
  'You search {target}. A few coins, corroded but spendable.',
  'You comb {target}. Old coin tangled in the debris — yours now.',
  'You find a small purse forgotten in {target}.',
];

export const HOOK_LINES = [
  'You search {target}. Something not-quite-right catches your eye.',
  'You comb {target}. The debris parts on something worth following.',
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

// OTA-741 — biome-aware weighted pick. A foraged material that shares a tag with
// the current tile's biome is BIOME_FORAGE_BOOST× more likely, so a mud region
// actually yields mud stock. materialMatchesBiome reads item tags from the live
// material catalog, so no lore lives here.
function pickWeightedBiome<T extends { weight: number; name: string }>(
  arr: T[],
  biomeTags: readonly string[] | undefined,
): T {
  if (!biomeTags || biomeTags.length === 0) return pickWeighted(arr);
  const boosted = arr.map((x) => ({
    x,
    w: materialMatchesBiome(x.name, biomeTags) ? x.weight * BIOME_FORAGE_BOOST : x.weight,
  }));
  const total = boosted.reduce((s, b) => s + b.w, 0);
  let r = Math.random() * total;
  for (const b of boosted) {
    r -= b.w;
    if (r <= 0) return b.x;
  }
  return arr[arr.length - 1]!;
}

// arb-fix — rarity ordering for the race loot-luck "best of two" draw.
const RARITY_RANK: Record<string, number> = {
  Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4,
};
function rarityRank(r: Rarity): number {
  return RARITY_RANK[r] ?? 0;
}

// ── engine_Dev — content-agnostic area-search loot ──────────────────────────
// SMALL_FINDS / RARE_FINDS above are the built-in TARTARIA pools. In a re-skin
// those names don't exist in the uploaded catalogs, so searching an area handed
// the player inert "improvised" junk (no stats, nothing to do with it). When a
// re-skin is active the search loot is instead drawn from the PACK'S OWN
// catalogs: routine searches pull Common/Uncommon MATERIALS (rarity-weighted,
// Common-heavy), and investigate's rarer find adds Uncommon/Rare materials plus
// a sprinkle of low-tier gear/weapons/armor so a lucky look can surface real
// kit. Built-in Tartaria keeps its curated pools untouched.
interface FindRow { name: string; rarity: Rarity; weight: number }

type CatalogRow = { name?: string; rarity?: string };
function catalogRows(id: 'materials' | 'gear' | 'weapons' | 'armor'): readonly CatalogRow[] {
  return resolveTable<CatalogRow>(id, []);
}

function reskinSmallFinds(): FindRow[] {
  const out: FindRow[] = [];
  for (const m of catalogRows('materials')) {
    if (!m.name) continue;
    const r = (m.rarity ?? 'Common') as Rarity;
    const w = r === 'Common' ? 10 : r === 'Uncommon' ? 4 : r === 'Rare' ? 1 : 0; // Epic/Legendary excluded
    if (w > 0) out.push({ name: m.name, rarity: r, weight: w });
  }
  return out;
}

function reskinRareFinds(): FindRow[] {
  const out: FindRow[] = [];
  for (const m of catalogRows('materials')) {
    if (!m.name) continue;
    const r = (m.rarity ?? 'Common') as Rarity;
    const w = r === 'Uncommon' ? 6 : r === 'Rare' ? 3 : 0;
    if (w > 0) out.push({ name: m.name, rarity: r, weight: w });
  }
  for (const id of ['gear', 'weapons', 'armor'] as const) {
    for (const g of catalogRows(id)) {
      if (!g.name) continue;
      const r = (g.rarity ?? 'Common') as Rarity;
      const w = r === 'Common' ? 3 : r === 'Uncommon' ? 2 : r === 'Rare' ? 1 : 0; // Epic/Legendary excluded
      if (w > 0) out.push({ name: g.name, rarity: r, weight: w });
    }
  }
  return out;
}

// The ACTIVE pools: pack-sourced under a re-skin (falling back to the built-in
// only if the pack somehow ships no usable rows), else the built-in Tartaria pool.
function activeSmallFinds(): FindRow[] {
  if (!isReskinActive()) return SMALL_FINDS;
  const pool = reskinSmallFinds();
  return pool.length > 0 ? pool : [];
}
function activeRareFinds(): FindRow[] {
  if (!isReskinActive()) return RARE_FINDS;
  const pool = reskinRareFinds();
  return pool.length > 0 ? pool : [];
}

// OTA-216 — directional-find pool. Each entry describes a specific
// "go [dir] and find a [thing]" promise. The investigate handler
// picks one at random when this outcome fires; the player gets the
// hint line in the feed and a pendingDirectionalFind is stamped on
// the player. When they step in that direction, stepDirection in
// gameStore consumes the pending and spawns the matching archetype.
// Archetype names must match entries in wasteland_encounters.json
// so the encounter resolver can pull the narration + loot.
export interface DirectionalFindSeed {
  direction: 'N' | 'E' | 'S' | 'W';
  archetype: string;
  hintNoun: string;
  lineTemplate: string;
}
// engine_Dev — NEUTRAL defaults (flavor stripped of proper nouns). Overridable from
// the uploaded `flavor` block under `directionalFinds`; a re-skin should override
// these to point `archetype` at ITS OWN wasteland-encounter ids (the built-in ids
// below are the Tartaria archetypes). Exported for the template + Tartaria pack.
export const DIRECTIONAL_FINDS: DirectionalFindSeed[] = [
  { direction: 'E', archetype: 'abandoned_caravan', hintNoun: 'caravan', lineTemplate: 'You catch a glint to the east — wagon spokes and a half-buried banner. A caravan, slumped in the dirt. Two stretches that way.' },
  { direction: 'N', archetype: 'frozen_traveller', hintNoun: 'still figure', lineTemplate: 'A shape sits north of here, too still to be alive. A body, settled in the cross-legged pose of someone who chose where to die.' },
  { direction: 'W', archetype: 'wandering_drifter', hintNoun: 'drifter', lineTemplate: 'Far west, a thin line of smoke. Someone built a small fire. Whoever they are is alone, and they\'ll talk if you walk up slowly.' },
  { direction: 'S', archetype: 'fusion_crucible', hintNoun: 'workshop', lineTemplate: 'A faint hum, south. The kind of resonance only old ironwork gives off. A workshop, maybe — someone made it, then walked away.' },
  { direction: 'E', archetype: 'old_bus_with_note', hintNoun: 'wreck', lineTemplate: 'Past the next rise east, a long shape — an old transport, tipped onto its side. You can read the wreckage from here. Notes survive longer than people.' },
];

// OTA-216 — cool-story pool. Single-line atmospheric beats that
// surface in the world feed with a "★ A QUIET MOMENT —" prefix.
// No mechanical payload — these exist to make investigate feel
// like a verb that finds stories, not just loot or hooks. The
// player can ignore them safely but they're meant to be read.
// engine_Dev — NEUTRAL atmospheric beats (proper nouns stripped). Overridable from
// the uploaded `flavor` block under `coolStories`. Exported for the template + pack.
export const COOL_STORIES: string[] = [
  'Initials carved in a stone wall: "TM was here. 2019? 2059? The dust does not say."',
  'A tiny shrine, hand-built. Three pebbles stacked, a frayed red ribbon, a coin face-down. Someone took the time.',
  'The bone-white silhouette of a long-dead power coil, threaded with creeping ivy. The coil is older than the ivy. The ivy is older than you.',
  'A child\'s shoe, no mate, dry as paper. The lacing was tied twice. They were taught well.',
  'An empty oil drum, rust-bitten through. Pressed into the rim, almost gentle: "I forgive you."',
  'A drift of glass, the kind that only forms in extreme heat. Whoever was here didn\'t want to be remembered. The glass remembers anyway.',
  'A circle of fourteen footprints in the mud. The center is bare. Whatever stood there left without disturbing the ring.',
  'A copper pocket-watch, hands stopped at 4:14. Pre-flood manufacture. The crystal is whole. Someone wound it.',
  'Three sentences scratched into a board: "We waited. He never came. We walked." The board is half-buried; the sentences face up.',
  'A small cairn of stones in the shape of an animal — a fox, maybe. Crude, but whoever made it loved the fox.',
  'A drowned book, its pages fused. The visible spine letter is "K." The rest is mud and time.',
  'A faded chalk mark on the rock, the kind scavengers use for "safe water nearby." The chalk is twenty years old. The water is not.',
  'A broken iron lantern, the kind that needed two people to carry. Whatever it lit, the people stopped lighting it.',
  'A row of seven shell casings, lined up neat as you\'d expect. Someone wanted the count remembered.',
  'A piece of mirror, no bigger than your palm. You catch your own reflection. The world gives you that back, sometimes.',
  'A hand-stitched cloth doll, its eyes embroidered crossed-shut. Some would have called it a sleeping doll. They\'re for children who can\'t sleep.',
  'Three iron nails driven into a tree at exact head-height. Either a warning or a hex; the language depends on the faction.',
  'A pre-flood photograph, the surface bubbled by water. You can almost make out a wedding. The bride\'s veil is still visible.',
  'A small wooden box, no lid, no nails. Inside: a single dry rose, brown to black. Someone meant to come back for it.',
  'A patch of grass that should not be growing here, formed in the perfect shape of a person lying down. Whatever fertilized it, you don\'t need to know.',
  'A spiral of small stones, twelve in each arm. The arms point north. The center is empty. Whoever drew it knew exactly where they were.',
  'A leather strap, knotted at intervals — a counting cord, one knot per day. You count seventy-three knots before the strap breaks.',
  'A child\'s drawing nailed to a post: a stick figure family, the sun in the corner. The smallest figure has been blacked out with charcoal.',
];

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
  opts?: { hookBonus?: number; intent?: 'search' | 'investigate' | 'harvest'; rareLootBias?: number; biomeTags?: readonly string[] },
): AreaSearchOutcome {
  const bonus = Math.max(0, Math.min(0.4, opts?.hookBonus ?? 0));
  // arb-fix — race loot-luck (Reclaimer / Aetherborn always; Mud Dweller
  // indoors/underground). Widens the material-find window and upgrades the
  // find toward the rare Aetheric gear pool. Clamped so it can't swamp hooks.
  const loot = Math.max(0, Math.min(0.25, opts?.rareLootBias ?? 0));
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
  // arb61 — investigate's NORM is clues + mission hooks. Routine common-
  // material foraging is removed; investigate's only item drop is a RARE
  // (Uncommon) gear-or-material find at ~7% (food still comes from the separate
  // forage path). Search/harvest keep their 25% common SMALL_FINDS pool.
  // Loot-luck widens the material window (taking from the hook share).
  const findCutoff = (isInvestigate
    ? nothingCutoff + 0.07
    : nothingCutoff + 0.25) + loot;
  const tcCutoff = isInvestigate
    ? findCutoff + 0.08
    : findCutoff + 0.20;
  const r = Math.random();
  if (r < nothingCutoff) {
    return { kind: 'nothing', line: format(pick(resolveFlavor('searchNothing', NOTHING_LINES)), target) };
  }
  if (r < findCutoff) {
    const rarePool = activeRareFinds();
    const pool = isInvestigate ? rarePool : activeSmallFinds();
    // engine_Dev — a re-skin with no usable catalog rows leaves the pool empty;
    // yield 'nothing' rather than crashing or leaking a built-in Tartaria name.
    if (pool.length === 0) {
      return { kind: 'nothing', line: format(pick(resolveFlavor('searchNothing', NOTHING_LINES)), target) };
    }
    let found = pickWeightedBiome(pool, opts?.biomeTags);
    // arb-fix — race loot-luck quality bias. On a plain search there's a
    // chance to surface the rarer pool outright; otherwise keep the rarer of
    // two draws so finds skew toward better loot.
    if (loot > 0) {
      if (!isInvestigate && rarePool.length > 0 && Math.random() < loot * 2) {
        found = pickWeightedBiome(rarePool, opts?.biomeTags);
      } else {
        const alt = pickWeightedBiome(pool, opts?.biomeTags);
        if (rarityRank(alt.rarity) > rarityRank(found.rarity)) found = alt;
      }
    }
    return {
      kind: 'material',
      itemName: found.name,
      rarity: found.rarity,
      line: format(pick(resolveFlavor('searchMaterial', MATERIAL_LINES)), target),
    };
  }
  if (r < tcCutoff) {
    const amount = 5 + Math.floor(Math.random() * 12);
    return { kind: 'tc', amount, line: format(pick(resolveFlavor('searchTc', TC_LINES)), target) };
  }
  // OTA-216 — when investigate fires a hook outcome, split the
  // hook share (0.75 of total after arb61 cut the item drop to ~7%)
  // three ways:
  //   - 50% → scene hook chain (the existing 2-3 step narrative
  //           that lives on currentScene.hooks)
  //   - 30% → directional find (schedules a real encounter the
  //           player can travel toward)
  //   - 20% → cool story flavor (atmospheric one-liner, no payload)
  // search / harvest stay 100% scene-hook for the rare hook
  // outcomes they roll.
  if (isInvestigate) {
    const subRoll = Math.random();
    if (subRoll < 0.50) {
      return { kind: 'hook', line: format(pick(resolveFlavor('searchHook', HOOK_LINES)), target) };
    } else if (subRoll < 0.80) {
      const seed = pick(resolveFlavor('directionalFinds', DIRECTIONAL_FINDS));
      return {
        kind: 'directional_find',
        direction: seed.direction,
        archetype: seed.archetype,
        hintNoun: seed.hintNoun,
        line: seed.lineTemplate,
      };
    } else {
      return { kind: 'cool_story', line: pick(resolveFlavor('coolStories', COOL_STORIES)) };
    }
  }
  return { kind: 'hook', line: format(pick(resolveFlavor('searchHook', HOOK_LINES)), target) };
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0]!;
}
