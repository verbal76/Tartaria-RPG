/* eslint-disable @typescript-eslint/no-require-imports */
// Narrative hook engine — turns the random "feature sightings" and "casual
// look" plants into stateful, multi-stage chains the player can pursue.
// Hooks are drawn from canonical Tartaria Prima lore — half-buried spires,
// Etheric storms, Aether Golem stirrings, Black Cloak shadows, etc.

import { getHooksOverride, getGenericHooks, type HooksOverride } from './contentPack';

export type HookKind =
  // Tier-1: atmospheric finds (the originals)
  | 'smoke'
  | 'footprints'
  | 'obelisk'
  | 'wagon'
  | 'arch'
  | 'glint'
  | 'handprint'
  | 'thread'
  | 'resonance'
  // Tier-2: canonical Tartarian features
  | 'half_buried_spire'
  | 'etheric_storm'
  | 'pulsing_mud'
  | 'frozen_statue'
  | 'sentinel_patrol'
  | 'mud_golem_stir'
  | 'temporal_eddy'
  | 'spatial_warp'
  | 'whisper_crystal'
  | 'black_cloak'
  | 'giant_silhouette'
  | 'bioluminescent_path'
  | 'wreck_construct'
  | 'submerged_steeple'
  | 'black_market_lantern'
  | 'aether_grid_hum'
  | 'sealed_vault_door'
  | 'preserved_corpse'
  // OTA-418 — Tier-3: INTERIOR finds (indoors-only). Planted by the indoor
  // hook pool when the player investigates / looks around inside a hub room or
  // a building, so a candle in a house surfaces an interior lead (a loose
  // floorboard, a bricked-up doorway) instead of an outdoor sighting.
  | 'loose_floorboard'
  | 'hidden_compartment'
  | 'watching_portrait'
  | 'bricked_doorway'
  | 'bloodstain_rug'
  | 'open_ledger'
  | 'childs_drawing'
  | 'stopped_clock'
  | 'scratched_door'
  | 'warm_chair'
  | 'crooked_shelf'
  | 'ceiling_drip'
  | 'bolted_strongbox'
  | 'aether_tang'
  | 'barefoot_prints';

export interface Hook {
  id: string;
  kind: HookKind;
  /** Nouns the parser should match against to route an action to this hook. */
  nouns: string[];
  /** Human-readable line shown when the hook is first planted. */
  plantedLine: string;
  /** How many resolution steps the player has taken so far. */
  stage: number;
  /** Whether the chain is fully complete (no more payoffs). */
  resolved: boolean;
  /** Cross-scene chain id, set when the hook is part of a multi-scene story. */
  chainId?: string;
  /** OTA-129 — hook-puzzle progress, set when the hook's HookKind has
   *  a PUZZLE_DEFINITIONS entry. Survives save/load + scene departure
   *  so the player can come back to a half-solved tumbler and pick
   *  up where they left off. Undefined on hooks without a puzzle. */
  puzzleProgress?: import('./hookPuzzles').PuzzleProgress;
  /** OTA-773 — legacy flag from the random-gamble torch (kept for old saves). */
  torchProbed?: boolean;
  /** OTA-776 — the player aimed the Aetheric Torch at this lead and CHARGED it.
   *  The torch reveals + takes over a chosen open lead (stage 0, unresolved);
   *  this flag rides the hook until it resolves, where it pays out an upgraded,
   *  WISDOM-scaled Rare/Legendary drop on top of the lead's normal reward. It
   *  does NOT resolve the hook — the lead's own content still plays when the
   *  player works it. Set once; a charged lead can't be re-charged. */
  torchCharged?: boolean;
}

// Plant lines, paired with the nouns that should resolve to that hook kind.
export const HOOK_PLANTS: Record<HookKind, { line: string; nouns: string[] }[]> = require('../data/hooks/hook-plants.json');

export interface HookOutcome {
  line: string;
  arbiterLine?: string;
  effects: HookEffect[];
  done: boolean;
  /** Nouns the stage's narration introduced that should NOW match this hook
   *  going forward. Lets a multi-stage chain stay reachable after the
   *  scene reveals new objects/people — "approach the smoke" reveals "a
   *  figure crouched over the coals", so subsequent "talk to the figure"
   *  / "approach the figure" should advance the chain, not bail. */
  addNouns?: string[];
  /** Optional next hook to plant for the player's next wander (cross-scene chain). */
  nextChain?: { kind: HookKind; chainId: string };
}

export type HookEffect =
  | { type: 'grant_tc'; amount: number }
  | { type: 'grant_item'; name: string }
  | { type: 'spawn_enemy_tag'; tag: string }
  | { type: 'heal'; amount: number }
  | { type: 'damage'; amount: number; cause: string }
  | { type: 'unlock_location'; locationId: string }
  | { type: 'rep_change'; factionId: string; amount: number }
  | { type: 'advance_time'; hours: number }
  | { type: 'memo'; text: string }
  // OTA-185 — spawn a temporary vendor into the current scene.
  // Used by friendly-encounter hooks (campfire Reclaimer, road
  // priest, etc.) so the narration's "trade if you want" promise
  // is actually backed by an interaction. Vendor lives until the
  // scene refreshes or the hook advances.
  | { type: 'spawn_vendor'; vendor: HookVendorSpec }
  // OTA-214 — grant a real quest hook (hunt / mystery) from the
  // wasteland_encounters.json quest_hook pool. Replaces the OTA-???
  // "memo" approach (player ran a temporal eddy and got vague
  // "you learned a name" narration with no actual payload; the
  // playtester explicitly asked: "I'd rather have a quest hook
  // happen"). The handler picks a random unfired hook from the
  // pool and routes through grantQuestHook so the entry lands in
  // player.activeQuests with the canonical arbiter narration.
  | { type: 'grant_random_quest_hook'; pool: 'hunt' | 'mystery' | 'any' };

// OTA-185 — minimal vendor-spec for hook-spawned traders. Mirrors
// the VendorInstance fields the engine needs to render + serve a
// vendor banner without round-tripping through the data/vendors
// JSON catalog.
export interface HookVendorSpec {
  id: string;
  name: string;
  title: string;
  faction: string | null;
  description: string;
  offers: { itemName: string; price: number }[];
  demeanor?: 'honest' | 'sketchy';
}

const CHAINS: Record<HookKind, HookOutcome[]> = require('../data/hooks/hook-chains.json') /* built-in hooks; reskins override via getHooksOverride/generic pack */;

// engine_Dev — the live hook tables. An uploaded 'hooks' override replaces the
// built-in Tartaria plants/chains wholesale; resolved at runtime (not module load)
// so an upload mirrored after boot is honored. Kinds are opaque strings here so a
// re-skin can define its own hook ids.
type PlantMap = Record<string, { line: string; nouns: string[] }[]>;
type ChainMap = Record<string, HookOutcome[]>;
// engine_Dev — the active hook set: author override → installed generic default → built-in
// Tartaria. Mirrors whispers' layering so the stock generic game uses neutral "the Reaches"
// hooks instead of leaking the built-in Tartaria pool (Reclaimer / Aetheric Torch / etc.).
function activeHooks(): HooksOverride | null {
  const author = getHooksOverride();
  if (author?.plants && Object.keys(author.plants).length > 0) return author;
  const generic = getGenericHooks();
  if (generic?.plants && Object.keys(generic.plants).length > 0) return generic;
  return null;
}
function getPlants(): PlantMap {
  const o = activeHooks();
  return o?.plants && Object.keys(o.plants).length > 0 ? o.plants : (HOOK_PLANTS as PlantMap);
}
function getChainMap(): ChainMap {
  const o = activeHooks();
  return o?.chains && Object.keys(o.chains).length > 0 ? (o.chains as ChainMap) : (CHAINS as ChainMap);
}
function getHookWeights(): Record<string, number> {
  const o = activeHooks();
  if (o?.weights && Object.keys(o.weights).length > 0) return o.weights;
  // Custom plants with no declared weights → even weight over the authored kinds.
  if (o?.plants && Object.keys(o.plants).length > 0) {
    const w: Record<string, number> = {};
    for (const k of Object.keys(o.plants)) w[k] = 1;
    return w;
  }
  return HOOK_WEIGHTS as Record<string, number>;
}
function getIndoorKinds(): ReadonlySet<string> {
  const o = activeHooks();
  if (o?.indoor) return new Set(o.indoor);
  // Custom hook set with no indoor declaration → treat all as outdoor.
  if (o?.plants && Object.keys(o.plants).length > 0) return new Set<string>();
  return INDOOR_HOOK_KINDS as ReadonlySet<string>;
}

export function getHookOutcome(kind: HookKind, stage: number): HookOutcome | null {
  const chain = getChainMap()[kind];
  if (!chain || stage >= chain.length) return null;
  return chain[stage] ?? null;
}

/** arb120 — a CLUE thread's terminal payoff is a MEMO (a lore line / warning),
 *  nothing lootable. That clue reads the same wherever the prop turns up, so the
 *  full reveal should play only ONCE per save — a second portrait / ledger in the
 *  next room shouldn't replay the identical thread. Returns the terminal memo's
 *  text, or null when the thread carries loot (item / TC / location), which is
 *  worth repeating per room and must stay repeatable. */
export function clueThreadMemoText(kind: HookKind): string | null {
  const chain = getChainMap()[kind];
  if (!chain || chain.length === 0) return null;
  const terminal = chain[chain.length - 1];
  const memoEff = terminal?.done
    ? (terminal.effects ?? []).find((e) => e.type === 'memo')
    : undefined;
  if (!memoEff || memoEff.type !== 'memo') return null;
  for (const st of chain) {
    for (const e of st.effects ?? []) {
      if (e.type === 'grant_item' || e.type === 'grant_tc' || e.type === 'unlock_location') return null;
    }
  }
  return memoEff.text;
}

export const ALL_HOOK_NOUNS: ReadonlySet<string> = new Set(
  Object.values(HOOK_PLANTS).flatMap((arr) => arr.flatMap((p) => p.nouns.map((n) => n.toLowerCase()))),
);

// OTA-432 — match a player target against a hook's nouns on WORD boundaries
// rather than raw substrings. The old test (`t.includes(n) || n.includes(t)`)
// let a tiny fragment match a much longer noun — a 2–3 char token could snag
// half the nouns in a room, and a short word could route an indoor "investigate
// the candle" into an outdoor "ridge"/"ridgeline" hook. A single-word noun now
// matches only when the target contains it as a whole word, or shares a ≥4-char
// word prefix (so "stone" → "stonework" still helps); a multi-word noun matches
// as a phrase. Exact target always matches.
function hookNounMatches(t: string, nouns: readonly string[]): boolean {
  const words = t.split(/[^a-z0-9]+/).filter(Boolean);
  for (const raw of nouns) {
    const n = raw.toLowerCase();
    if (!n) continue;
    if (t === n) return true;
    if (n.includes(' ')) {
      // Multi-word noun ("hand rope"): keep phrase containment.
      if (t.includes(n)) return true;
      continue;
    }
    for (const w of words) {
      if (w === n) return true;
      // Helpful prefix overlap, but never on a tiny fragment (kills the
      // 1–3 char false positives that fired the wrong hook).
      if (w.length >= 4 && (w.startsWith(n) || n.startsWith(w))) return true;
    }
  }
  return false;
}

// Match a player target string (or resolved noun) against an active hook's
// noun list. Used to route "sneak up to the smoke" → the smoke hook.
export function matchHookNoun(target: string | undefined, hooks: readonly Hook[]): Hook | null {
  if (!target) return null;
  const t = target.toLowerCase();
  for (const hook of hooks) {
    if (hook.resolved) continue;
    if (hookNounMatches(t, hook.nouns)) return hook;
  }
  return null;
}

/** Same as matchHookNoun but does NOT skip resolved hooks. Used by
 *  the investigate handler to detect a player re-targeting a hook
 *  they've already exhausted, so we can hard-print "already
 *  searched" instead of falling through to MiniLM / area-search and
 *  giving them noisy guess-text. */
export function matchAnyHookNoun(target: string | undefined, hooks: readonly Hook[]): Hook | null {
  if (!target) return null;
  const t = target.toLowerCase();
  for (const hook of hooks) {
    if (hookNounMatches(t, hook.nouns)) return hook;
  }
  return null;
}

// Atmospheric hooks plant less often so chains feel earned. The lore-heavy
// ones (Sentinel, Giant, Black Cloak, Storm) are deliberately rarer so they
// land like events.
const HOOK_WEIGHTS: Record<HookKind, number> = {
  smoke: 12,
  footprints: 12,
  obelisk: 8,
  wagon: 8,
  arch: 4, // mostly chained from smoke
  glint: 10,
  handprint: 6,
  thread: 8,
  resonance: 5,
  half_buried_spire: 8,
  etheric_storm: 5,
  pulsing_mud: 9,
  frozen_statue: 6,
  sentinel_patrol: 4,
  mud_golem_stir: 4,
  temporal_eddy: 3,
  spatial_warp: 3,
  whisper_crystal: 5,
  black_cloak: 4,
  giant_silhouette: 2, // very rare
  bioluminescent_path: 6,
  wreck_construct: 7,
  submerged_steeple: 3,
  black_market_lantern: 4,
  aether_grid_hum: 6,
  sealed_vault_door: 3, // mostly chained
  preserved_corpse: 6,
  // OTA-418 — interior weights (only ever drawn by the INDOOR picker below).
  loose_floorboard: 8,
  hidden_compartment: 7,
  watching_portrait: 5,
  bricked_doorway: 6,
  bloodstain_rug: 5,
  open_ledger: 6,
  childs_drawing: 4,
  stopped_clock: 5,
  scratched_door: 5,
  warm_chair: 4,
  crooked_shelf: 6,
  ceiling_drip: 6,
  bolted_strongbox: 6,
  aether_tang: 6,
  barefoot_prints: 4,
};

// OTA-418 — the INTERIOR hook kinds. The two pickers below partition HOOK_WEIGHTS
// so an indoor lead never lands outdoors and an outdoor sighting never lands
// indoors (the candle-in-a-house → giant-on-a-ridgeline class of mismatch).
export const INDOOR_HOOK_KINDS: ReadonlySet<HookKind> = new Set<HookKind>([
  'loose_floorboard', 'hidden_compartment', 'watching_portrait', 'bricked_doorway',
  'bloodstain_rug', 'open_ledger', 'childs_drawing', 'stopped_clock', 'scratched_door',
  'warm_chair', 'crooked_shelf', 'ceiling_drip', 'bolted_strongbox', 'aether_tang',
  'barefoot_prints',
]);

/** Weighted pick over the live weights (the kinds passing `include`). Falls back
 *  to any available kind, then the given fallback, so a custom hook set that lacks
 *  the built-in fallback kind still returns one of its own. */
function pickWeightedHookKind(include: (k: string) => boolean, fallback: HookKind): HookKind {
  const entries = (Object.entries(getHookWeights()) as [string, number][]).filter(([k]) => include(k));
  const total = entries.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return (entries[0]?.[0] as HookKind) ?? fallback;
  let roll = Math.random() * total;
  for (const [kind, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return kind as HookKind;
  }
  return (entries[0]?.[0] as HookKind) ?? fallback;
}

/** OUTDOOR random hook — excludes the interior kinds. */
export function pickRandomHookKind(): HookKind {
  const indoor = getIndoorKinds();
  return pickWeightedHookKind((k) => !indoor.has(k), 'glint');
}

/** OTA-418 — INDOOR random hook — only the interior kinds. */
export function pickRandomIndoorHookKind(): HookKind {
  const indoor = getIndoorKinds();
  return pickWeightedHookKind((k) => indoor.has(k), 'loose_floorboard');
}

export function plantHookByKind(kind: HookKind, chainId?: string): Hook {
  const plants = getPlants();
  // Guard a missing kind (e.g. a nextChain reference an override didn't define):
  // fall back to any authored plant so a hook is never planted noun-less.
  const options = plants[kind] ?? Object.values(plants)[0] ?? [{ line: 'Something here catches your eye.', nouns: ['it'] }];
  const choice = options[Math.floor(Math.random() * options.length)] ?? options[0]!;
  return {
    id: `hook_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    nouns: choice.nouns,
    plantedLine: choice.line,
    stage: 0,
    resolved: false,
    chainId,
  };
}
