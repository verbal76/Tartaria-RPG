// Area-search engine — when the player searches a generic SPATIAL or
// MATERIAL target ("the mud", "the rubble", "the doorway", "behind me",
// "to my left"), the engine rolls an outcome on the spot. No reprompt,
// no exact-noun matching required.
//
// The roll is weighted by what's in the scene: ambient nouns shift the
// odds slightly toward planting a hook; otherwise materials, TC, or
// nothing dominate.

import type { Rarity } from './types';
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
const RARE_FINDS: { name: string; rarity: Rarity; weight: number }[] = [
  // rare materials
  { name: 'Aetheric Shard', rarity: 'Uncommon', weight: 6 },
  { name: 'Mud Essence', rarity: 'Uncommon', weight: 5 },
  { name: 'Drone Core', rarity: 'Uncommon', weight: 4 },
  { name: 'Energy Fragment', rarity: 'Uncommon', weight: 4 },
  // OTA-446 — [playability] richer found-gear so WANDERING actually upgrades you.
  // A playtester cleared the start area + walked to the first city and arrived
  // "still pretty average" — the investigate pool yielded only 1–2 Uncommon
  // pieces. Uncommon gear weights bumped (3→4 / 2→3), and two low-weight RARE
  // pieces added so a LUCKY wanderer can find a real upgrade (the "if you're
  // lucky, you can make it" curve). Materials still dominate the pool.
  // rare gear — weapons
  { name: 'Mud-Rend Blade', rarity: 'Uncommon', weight: 4 },
  { name: 'Aetheric Crystal Blade', rarity: 'Uncommon', weight: 3 },
  { name: 'Storm Rod', rarity: 'Uncommon', weight: 3 },
  { name: 'Bone Crossbow', rarity: 'Uncommon', weight: 3 },
  { name: 'Sentinel Cleaver', rarity: 'Rare', weight: 1 },
  // rare gear — armor
  { name: "Salvager's Intuition Band", rarity: 'Uncommon', weight: 3 },
  { name: "Aether-Seeker's Cap", rarity: 'Uncommon', weight: 3 },
  { name: "Architect's Sight Enhancer", rarity: 'Uncommon', weight: 3 },
  { name: "Spirit-Caller's Helm", rarity: 'Uncommon', weight: 3 },
  { name: "Aether-Seeker's Hood", rarity: 'Rare', weight: 1 },
];

const SMALL_FINDS: { name: string; rarity: Rarity; weight: number }[] = [
  // Rocks / sticks / scrap — the "normal stuff you'd find on the
  // ground." Highest weights so the player keeps stocking the
  // cheap-kit pool the rulebook promises.
  { name: 'Mud Fragment', rarity: 'Common', weight: 12 },
  { name: 'Aether Residue', rarity: 'Common', weight: 8 },
  // OTA-444 — [playability] golem-fuel + recipe-staple aether mats bumped. A
  // playtester cleared the start area + reached the first city able to craft
  // almost nothing and rarely summon a golem; these are the bottleneck inputs
  // (Aether Mud / Crystal feed every golem; Aether Dust feeds 11 recipes but was
  // UNFORAGEABLE; Aetheric Shard feeds 10). Bumped within the material niche only
  // — food, mushrooms, and the (capped) rocks/sticks are untouched.
  { name: 'Aether Mud', rarity: 'Common', weight: 8 },
  { name: 'Aether Dust', rarity: 'Common', weight: 4 },
  // OTA-447 — Mudstone forageable at a LOW weight. It's the last Mud-Golem fuel
  // gap: pre-fix it dropped only from mud-enemy kills / mud-stone scrap, so a
  // combat-light wanderer couldn't summon even the baseline golem. Low weight
  // keeps it a deliberate gather, not a flood (it's the Rare-tier mud stock).
  { name: 'Mudstone', rarity: 'Rare', weight: 3 },
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
  // OTA-444 — Aether Crystal (golem fuel, 9 recipes) 4→7; Aetheric Shard
  // (10 recipes, 1–3 per craft) 2→4. Still well under the food-tier weights.
  { name: 'Aether Crystal', rarity: 'Common', weight: 7 },
  { name: 'Bone Bolt', rarity: 'Common', weight: 4 },
  { name: 'Trail Rations', rarity: 'Common', weight: 3 },
  { name: 'Aetheric Shard', rarity: 'Uncommon', weight: 4 },

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
  // ⚠⚠⚠ OTA-1723 — 4 -> 12. THE BOTTLE WAS THE BOTTLENECK ALL THREE STEWS
  // SHARED. A filled Water Bottle is an ingredient of every cooked stew in the
  // game and it NEVER drops — what drops is the EMPTY, which you then carry to a
  // water source and fill (5 min, per-room cooldown). At weight 4 of 270 that
  // first step was a 1.5% draw, so the whole cooked-food economy hung off the
  // rarest thing in the pool, and the filled bottle is also the drink you heal
  // with, so cooking competed with survival for the same object. Owner: *"let's
  // fix the spawn rate of the water bottle."*
  { name: 'Empty Water Bottle', rarity: 'Common', weight: 12 },

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

// OTA-741 — biome-aware weighted pick. A foraged material that shares a tag with
// the current tile's biome (mud material on a 'mud' tile) is BIOME_FORAGE_BOOST×
// more likely, so the Mud Seas actually yields mud stock instead of the flat
// everywhere-pool. materialMatchesBiome reads the pool item's tags from the
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
/** OTA-1199 — the same rarity curve `pickLootFromLadder` uses, so a substitution drawn
 *  here and one drawn there cannot skew differently. Legendary stays rare INSIDE an
 *  already-rare 10% window. */
const SITE_RARITY_WEIGHT: Record<Rarity, number> = { Common: 10, Uncommon: 5, Rare: 2, Legendary: 1 };

function rarityRank(r: Rarity): number {
  return RARITY_RANK[r] ?? 0;
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
const DIRECTIONAL_FINDS: DirectionalFindSeed[] = [
  { direction: 'E', archetype: 'abandoned_caravan', hintNoun: 'Reclaimer caravan', lineTemplate: 'You catch a glint to the east — wagon spokes and a half-buried banner. A caravan, slumped in the silt. Two stretches that way.' },
  { direction: 'N', archetype: 'frozen_traveller', hintNoun: 'mud-glassed body', lineTemplate: 'A shape sits north of here, too still to be alive. A body, mud-glassed in the cross-legged pose Reclaimers use when they choose where to die.' },
  { direction: 'W', archetype: 'wandering_drifter', hintNoun: 'drifter', lineTemplate: 'Far west, a thin line of smoke. Someone built a small fire. Whoever they are is alone, and they\'ll talk if you walk up slowly.' },
  { direction: 'S', archetype: 'fusion_crucible', hintNoun: 'Crucible', lineTemplate: 'A faint hum, south. The kind of resonance only Aetheric ironwork gives off. A Crucible, maybe — the old Reclaimers made them, then walked away.' },
  { direction: 'E', archetype: 'old_bus_with_note', hintNoun: 'pre-flood bus', lineTemplate: 'Past the next rise east, a long shape — pre-flood transport, tipped onto its side. You can read the wreckage from here. Notes survive longer than people.' },
];

// OTA-216 — cool-story pool. Single-line atmospheric beats that
// surface in the world feed with a "★ A QUIET MOMENT —" prefix.
// No mechanical payload — these exist to make investigate feel
// like a verb that finds stories, not just loot or hooks. The
// player can ignore them safely but they're meant to be read.
const COOL_STORIES: string[] = [
  'Initials carved in a stone wall: "TM was here. 2019? 2059? The dust does not say."',
  'A tiny shrine, hand-built. Three pebbles stacked, a frayed red ribbon, a coin face-down. Someone took the time.',
  'The bone-white silhouette of a long-dead Aetheric coil, threaded with creeping ivy. The coil is older than the ivy. The ivy is older than you.',
  'A child\'s shoe, no mate, dry as paper. The lacing was tied twice. They were taught well.',
  'An empty oil drum, rust-bitten through. Pressed into the rim, almost gentle: "I forgive you."',
  'A drift of glass, the kind that only forms in Aetheric heat. Whoever was here didn\'t want to be remembered. The glass remembers anyway.',
  'A circle of fourteen footprints in the mud. The center is bare. Whatever stood there left without disturbing the ring.',
  'A copper pocket-watch, hands stopped at 4:14. Pre-flood manufacture. The crystal is whole. Someone wound it.',
  'Three sentences scratched into a board: "We waited. He never came. We walked." The board is half-buried; the sentences face up.',
  'A small cairn of stones in the shape of an animal — a fox, maybe. Crude, but whoever made it loved the fox.',
  'A drowned book, its pages fused. The visible spine letter is "K." The rest is mud and time.',
  'A faded chalk mark on the rock, the kind Reclaimers use for "safe water nearby." The chalk is twenty years old. The water is not.',
  'A broken Aetheric lantern, the kind that needed two people to carry. Whatever it lit, the people stopped lighting it.',
  'A row of seven shell casings, lined up neat as you\'d expect. Someone wanted the count remembered.',
  'A piece of mirror, no bigger than your palm. You catch your own reflection. Tartaria gives you that back, sometimes.',
  'A hand-stitched cloth doll, its eyes embroidered crossed-shut. A Mud Dweller would have called it a sleeping doll. They\'re for children who can\'t sleep.',
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
/** ⚠⚠ OTA-1199 (PUNCHLIST P15) — THE SITE-LOOT SUBSTITUTION RATE.
 *
 *  Owner: *"it goes from the tuned pool and has a small percentage to pull from the
 *  alternate loot table as a replacement item for something already on the list."*
 *
 *  So the tuned pool decides IF you find something and how often — none of that moves —
 *  and this only decides WHAT, occasionally. ⚠ That is a REPLACEMENT, not an addition:
 *  the drop cadence is untouched and no extra objects enter the economy, which is what
 *  makes it safe to turn on without a rebalance.
 *
 *  ⚠⚠ WHY IT COULD NOT SIMPLY REPLACE THE POOL: the 27 authored ladder pools carry ONE of
 *  the eleven materials the crafting and golem loops depend on (Scrap Metal). Swapping the
 *  pool outright would re-break every complaint OTA-444/446/447 were written to fix — no
 *  golem fuel, no club-and-spear stock, no recipe staples. At this rate roughly nine finds
 *  in ten are still the tuned pool.
 *
 *  One number, deliberately: dial it here. */
export const SITE_LOOT_SUBSTITUTION_RATE = 0.10;

export function rollAreaSearch(
  target: string,
  opts?: {
    hookBonus?: number;
    intent?: 'search' | 'investigate' | 'harvest';
    rareLootBias?: number;
    biomeTags?: readonly string[];
    /** OTA-1199 — this place's OWN authored loot rows (engine/encounter.ts
     *  `ladderLootPool`). Empty or absent leaves behaviour exactly as it was. */
    siteLoot?: readonly { name: string; rarity: Rarity }[];
  },
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
    return { kind: 'nothing', line: format(pick(NOTHING_LINES), target) };
  }
  if (r < findCutoff) {
    const pool = isInvestigate ? RARE_FINDS : SMALL_FINDS;
    let found = pickWeightedBiome(pool, opts?.biomeTags);
    // arb-fix — race loot-luck quality bias. On a plain search there's a
    // chance to surface the rare Aetheric gear pool outright; otherwise keep
    // the rarer of two draws so finds skew toward Aetheric loot.
    if (loot > 0) {
      if (!isInvestigate && Math.random() < loot * 2) {
        found = pickWeightedBiome(RARE_FINDS, opts?.biomeTags);
      } else {
        const alt = pickWeightedBiome(pool, opts?.biomeTags);
        if (rarityRank(alt.rarity) > rarityRank(found.rarity)) found = alt;
      }
    }
    // ⚠⚠ OTA-1199 — THE SUBSTITUTION, and it happens LAST. Everything above — the find
    // window, loot-luck, the biome weighting — has already decided that a find happens and
    // what tier it is. This swaps the OBJECT and nothing else, so a place that authored its
    // own loot occasionally hands you something that belongs to it instead of another
    // Small Rock.
    const site = opts?.siteLoot ?? [];
    if (site.length > 0 && Math.random() < SITE_LOOT_SUBSTITUTION_RATE) {
      const swap = pickWeighted(
        site.map((l) => ({ ...l, weight: SITE_RARITY_WEIGHT[l.rarity] ?? 1 })),
      );
      return {
        kind: 'material',
        itemName: swap.name,
        rarity: swap.rarity,
        line: format(pick(MATERIAL_LINES), target),
      };
    }
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
      return { kind: 'hook', line: format(pick(HOOK_LINES), target) };
    } else if (subRoll < 0.80) {
      const seed = pick(DIRECTIONAL_FINDS);
      return {
        kind: 'directional_find',
        direction: seed.direction,
        archetype: seed.archetype,
        hintNoun: seed.hintNoun,
        line: seed.lineTemplate,
      };
    } else {
      return { kind: 'cool_story', line: pick(COOL_STORIES) };
    }
  }
  return { kind: 'hook', line: format(pick(HOOK_LINES), target) };
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0]!;
}
