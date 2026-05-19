// containerLoot — derive a loot bundle from a container the player
// opened. Data-driven via app/data/world/container_loot.json.
//
// Each archetype in the JSON declares:
//   - matchers: noun keywords that map an in-scene container to this
//     archetype (e.g. "lockbox" / "strongbox" / "coffer" all share a
//     pool). Matched against the player's exact target string, lower-
//     cased, word-boundary aware. First archetype whose matchers fire
//     wins.
//   - narration: one-line scene description with `{target}` substituted
//     for the player's word, so the engine can keep the noun the
//     player typed ("you take the bear trap apart for parts").
//   - pool: weighted entries with min/max quantity, tags, item kind.
//
// Adding a new container type is now a JSON edit. The engine never
// knows about specific containers — it asks this module "what does
// this noun open into?" and gets back a pool + narration or null.
//
// Phase 3 of the parser-treadmill cleanup. Replaces the hardcoded
// 4-pool table previously inlined in the open intent handler.

import data from '../data/world/container_loot.json';

export interface ContainerLootEntry {
  name: string;
  weight: number;
  min: number;
  max: number;
  tags: string[];
  /** Matches InventoryItem.kind. We default new container drops to
   *  'misc' which is the scrap-material lane the existing inventory
   *  + scrapEngine paths understand. */
  kind: 'misc' | 'consumable';
}

export interface ContainerArchetype {
  matchers: string[];
  narration: string;
  pool: ContainerLootEntry[];
}

// JSON top-level has a 'description' string sibling to the archetypes.
// Filter it out via a type assertion + key guard so callers see just
// the archetype map.
const RAW = data as Record<string, ContainerArchetype | string>;
const ARCHETYPES: Record<string, ContainerArchetype> = Object.fromEntries(
  Object.entries(RAW).filter(
    (entry): entry is [string, ContainerArchetype] =>
      typeof entry[1] === 'object' && entry[1] !== null && 'matchers' in entry[1],
  ),
);

export interface ContainerLootMatch {
  /** The archetype id that matched (lockbox, trap, crate, …). */
  archetypeId: string;
  narration: string;
  pool: ContainerLootEntry[];
}

/**
 * Classify a player-typed container noun. Returns the matching
 * archetype, or null when the noun doesn't read as a container
 * (doors / walls / bare ground fall through to a generic narration
 * path in the caller).
 *
 * Matchers are word-boundary substring tests over the lowercased
 * input so "the bear trap" / "trap field" / "Drakovan trap" all
 * resolve to the 'trap' archetype. Multi-word matchers (e.g.
 * "trap field") are honored as a single token.
 */
export function classifyContainer(target: string): ContainerLootMatch | null {
  const lower = target.toLowerCase().trim();
  if (!lower) return null;
  for (const [id, arche] of Object.entries(ARCHETYPES)) {
    for (const m of arche.matchers) {
      const needle = m.toLowerCase();
      // Word-boundary check on either side of the needle. Avoids
      // false-positive matches inside larger words (e.g. matcher
      // "ax" against "axle").
      const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`);
      if (re.test(lower)) {
        return { archetypeId: id, narration: arche.narration, pool: arche.pool };
      }
    }
  }
  return null;
}

/** Roll one entry from the archetype's weighted pool. Used by the
 *  open intent handler in gameStore.ts. Pure — takes a Math.random
 *  injection for testability. */
export function rollFromPool(
  pool: ContainerLootEntry[],
  rng: () => number = Math.random,
): { entry: ContainerLootEntry; quantity: number } | null {
  if (pool.length === 0) return null;
  const totalWeight = pool.reduce((acc, p) => acc + p.weight, 0);
  if (totalWeight <= 0) return null;
  // rng() ∈ [0, 1). Multiply by totalWeight, walk until cumulative
  // weight crosses the roll.
  const roll = rng() * totalWeight;
  let cumulative = 0;
  for (const entry of pool) {
    cumulative += entry.weight;
    if (roll < cumulative) {
      const span = entry.max - entry.min;
      const quantity = entry.min + (span > 0 ? Math.floor(rng() * (span + 1)) : 0);
      return { entry, quantity };
    }
  }
  // Numerical drift fallback — return the last entry.
  const last = pool[pool.length - 1]!;
  return { entry: last, quantity: last.min };
}

/** Render the narration with `{target}` replaced by the player's
 *  actual word, so the line reads naturally. */
export function narrate(match: ContainerLootMatch, target: string): string {
  return match.narration.replace(/\{target\}/g, target);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Exposed for tests so the test file can verify every archetype
 *  loaded cleanly + all matchers / pools are well-formed. */
export const __TEST_ONLY__ = { ARCHETYPES };
