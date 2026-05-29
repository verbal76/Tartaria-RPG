// wastelandEncounters — roll for an encounter during long-distance
// cardinal travel. Data-driven via app/data/world/wasteland_encounters.json.
//
// Player goal: "walking into the desert and finding an old bus with a
// note in it that tells you a direction to travel and to look for a
// rock or something and then you inspect it and find a special weapon
// or money or a body with a sad story and a small keepsake. Layer
// those up every 2 or 3 movements and you can make the world massive."
//
// Each archetype declares matchers (location tags it fires in), a
// narration template, optional loot, optional NPC dialogue, optional
// lore note that hints at a chase-up later. Adding a new encounter
// type is a JSON edit — engine stays generic.
//
// Pacing: the caller (stepDirection in gameStore) tracks
// `stepsSinceLastEncounter` and only rolls once that counter hits the
// threshold (3 by default). When it does, ~40% of those rolls produce
// an actual encounter — the rest are quiet steps. Math is tuned to
// land an encounter roughly every 7-8 cardinal travel steps on
// average, dense enough to be interesting without becoming theme-park.

import data from '../data/world/wasteland_encounters.json';
import type { Location } from './types';

export interface WastelandLootEntry {
  name: string;
  weight: number;
  min: number;
  max: number;
  kind: 'consumable' | 'misc';
  tags: string[];
}

export type WastelandEncounterType = 'treasure' | 'npc' | 'skirmish' | 'mini_dungeon' | 'fusion_bench';

export interface WastelandArchetype {
  type: WastelandEncounterType;
  /** Selection weight among archetypes that match the current biome. */
  weight: number;
  /** Location tags the archetype is valid in. ANY-match — if a single
   *  tag is in the location's tags array, the archetype is eligible. */
  matchers: string[];
  /** Scene narration template. `{enemy}` substitution for skirmishes. */
  narration: string;
  /** Weighted loot pool. Empty for pure-NPC or pure-skirmish encounters. */
  loot?: WastelandLootEntry[];
  /** Optional NPC dialogue lines, picked one at random. */
  npc_lines?: string[];
  /** Optional lore note appended on a separate world-channel line —
   *  the "and you find a note in the bus that says…" beat. */
  lore_note?: string;
  /** For skirmish archetypes: pool of enemy names to spawn (one). */
  enemyPool?: string[];
  /** Mini-dungeon only — optional bandit pool. When set, an enemy
   *  spawns INTO the dungeon scene alongside the loot. The player
   *  has to fight (or flee) to walk away with what they found.
   *  Same enemy names as enemyPool; separate field so authors can
   *  write loot-only mini-dungeons too. */
  bandit_pool?: string[];
  /** Mini-dungeon only — optional quest hook. When the player
   *  enters this dungeon, the named hunt or mystery is added to
   *  their active contract board WITHOUT a vendor handoff — the
   *  user's explicit ask: "we need a way to start quests" that
   *  isn't tied to a faction vendor. */
  quest_hook?: { kind: 'hunt' | 'mystery'; id: string };
}

// Filter out the "_description" key from the JSON.
const RAW = data as Record<string, unknown>;
const ARCHETYPES: Record<string, WastelandArchetype> = Object.fromEntries(
  Object.entries(RAW).filter(
    (entry): entry is [string, WastelandArchetype] =>
      typeof entry[1] === 'object' && entry[1] !== null && 'type' in (entry[1] as object),
  ),
);

export interface WastelandEncounter {
  archetypeId: string;
  type: WastelandEncounterType;
  narration: string;
  /** Resolved loot entry (rolled) — null when no loot pool. */
  loot: { name: string; quantity: number; kind: 'consumable' | 'misc'; tags: string[] } | null;
  /** Resolved NPC line (rolled) — null when no dialogue pool. */
  npcLine: string | null;
  /** Optional follow-up narration appended on a separate log entry. */
  loreNote: string | null;
  /** For skirmishes AND mini-dungeons with bandit_pool: resolved
   *  enemy name to spawn into the scene. */
  enemyName: string | null;
  /** Mini-dungeon only — quest to auto-add to the player's active
   *  board. Null when the dungeon is loot-only. */
  questHook: { kind: 'hunt' | 'mystery'; id: string } | null;
}

interface PickOptions {
  /** Step counter — encounters only fire when this hits the threshold. */
  stepsSinceLastEncounter: number;
  /** Minimum steps between encounter attempts. */
  threshold?: number;
  /** Probability of producing an encounter on an eligible step. */
  rollChance?: number;
  /** Math.random injection for tests. */
  rng?: () => number;
  /** 2026-05-25 OTA-045 — depleted-player encounter bias. When true,
   *  archetypes of type 'treasure' or 'mini_dungeon' (the high-value
   *  options — loot caches, vendor stalls, hooked quests) get their
   *  selection weight doubled. Player at low HP / low stamina / low
   *  TC walks into a juicier temptation, not a wandering monster. */
  depleted?: boolean;
}

/**
 * Maybe roll an encounter for the current scene's location. Returns
 * `null` when the step counter hasn't reached threshold, when the
 * dice say "quiet step," or when no archetype matches the location
 * biome.
 */
export function pickWastelandEncounter(
  location: Location,
  opts: PickOptions,
): WastelandEncounter | null {
  const threshold = opts.threshold ?? 3;
  const rollChance = opts.rollChance ?? 0.4;
  const rng = opts.rng ?? Math.random;

  if (opts.stepsSinceLastEncounter < threshold) return null;
  if (rng() >= rollChance) return null;

  // Filter archetypes whose matchers overlap with the location's tags.
  const locTags = new Set((location.tags ?? []).map((t) => t.toLowerCase()));
  const eligible: Array<{ id: string; archetype: WastelandArchetype }> = [];
  for (const [id, archetype] of Object.entries(ARCHETYPES)) {
    if (archetype.matchers.some((m) => locTags.has(m.toLowerCase()))) {
      eligible.push({ id, archetype });
    }
  }
  if (eligible.length === 0) return null;

  // 2026-05-25 OTA-045 — JIT temptation bias. When the player is
  // depleted (low HP / stamina / TC), high-value archetypes
  // (treasure caches, mini-dungeons with loot) get a 2× weight
  // multiplier. The walking-monster archetypes (skirmish / npc)
  // stay at baseline. Reads more carrot, less stick.
  const isHighValue = (t: WastelandEncounterType): boolean =>
    t === 'treasure' || t === 'mini_dungeon';
  const biasMultiplier = (a: WastelandArchetype): number =>
    opts.depleted && isHighValue(a.type) ? 2.0 : 1.0;
  // Weighted pick among eligible archetypes (bias-adjusted).
  const totalWeight = eligible.reduce(
    (acc, e) => acc + e.archetype.weight * biasMultiplier(e.archetype),
    0,
  );
  const roll = rng() * totalWeight;
  let cumulative = 0;
  let picked = eligible[0]!;
  for (const e of eligible) {
    cumulative += e.archetype.weight * biasMultiplier(e.archetype);
    if (roll < cumulative) { picked = e; break; }
  }

  const archetype = picked.archetype;
  // Skirmish enemies come from enemyPool; mini-dungeon bandits come
  // from bandit_pool. Same shape, separate fields so authors can write
  // loot-only mini-dungeons.
  let enemyName: string | null = null;
  if (archetype.type === 'skirmish' && archetype.enemyPool && archetype.enemyPool.length > 0) {
    enemyName = archetype.enemyPool[Math.floor(rng() * archetype.enemyPool.length)] ?? null;
  } else if (archetype.type === 'mini_dungeon' && archetype.bandit_pool && archetype.bandit_pool.length > 0) {
    enemyName = archetype.bandit_pool[Math.floor(rng() * archetype.bandit_pool.length)] ?? null;
  }

  // Narration — substitute {enemy} when present and we have one.
  let narration = archetype.narration;
  if (enemyName) narration = narration.replace(/\{enemy\}/g, enemyName);

  const npcLine = (archetype.npc_lines && archetype.npc_lines.length > 0)
    ? archetype.npc_lines[Math.floor(rng() * archetype.npc_lines.length)] ?? null
    : null;

  const loot = archetype.loot && archetype.loot.length > 0
    ? rollLoot(archetype.loot, rng)
    : null;

  return {
    archetypeId: picked.id,
    type: archetype.type,
    narration,
    loot,
    npcLine,
    loreNote: archetype.lore_note ?? null,
    enemyName,
    questHook: archetype.quest_hook ?? null,
  };
}

function rollLoot(
  pool: WastelandLootEntry[],
  rng: () => number,
): { name: string; quantity: number; kind: 'consumable' | 'misc'; tags: string[] } | null {
  if (pool.length === 0) return null;
  const totalWeight = pool.reduce((acc, p) => acc + p.weight, 0);
  if (totalWeight <= 0) return null;
  const roll = rng() * totalWeight;
  let cumulative = 0;
  let picked = pool[0]!;
  for (const entry of pool) {
    cumulative += entry.weight;
    if (roll < cumulative) { picked = entry; break; }
  }
  const span = picked.max - picked.min;
  const quantity = picked.min + (span > 0 ? Math.floor(rng() * (span + 1)) : 0);
  return { name: picked.name, quantity, kind: picked.kind, tags: picked.tags };
}

/** Exposed for tests. */
export const __TEST_ONLY__ = { ARCHETYPES };
