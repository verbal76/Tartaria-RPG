import worldLadderData from '../data/world/worldLadder.json';

// ---------------------------------------------------------------------------
// Types — the three-tier procgen hierarchy from the TDD.
// ---------------------------------------------------------------------------

/**
 * A specific "room" or chunk the player can be in. Holds the strings the
 * Context Injector hands to the LLM (room_name, environmental_description,
 * exits) and the catalog-name pools (possibleEncounters, lootTable) the
 * encounter and loot systems roll against.
 */
export interface MicroMicroLocation {
  id: string;
  name: string;
  environmental_description: string;
  /** Human-readable exit phrases like "down the stairwell". Plural to allow
   *  hierarchical traversal in a later phase; current scene flow does not
   *  use these for movement, only for narration. */
  exits: string[];
  /** Names of enemies (matching enemies.json) that can spawn here. */
  possibleEncounters: string[];
  /** Names of loot items (matching loot_tables.json) found here. */
  lootTable: string[];
}

/** A neighborhood / quarter inside a Macro biome. */
export interface MicroLocation {
  id: string;
  name: string;
  description: string;
  microMicroLocations: MicroMicroLocation[];
}

/** A top-level biome. The Silt Wastes, The Aetherstone Deep, etc. */
export interface MacroLocation {
  id: string;
  name: string;
  subtitle: string;
  ambient: string;
  tags: string[];
  microLocations: MicroLocation[];
}

export interface WorldLadder {
  version: number;
  description: string;
  macroLocations: MacroLocation[];
}

export const WORLD_LADDER = worldLadderData as WorldLadder;
export const MACRO_LOCATIONS: MacroLocation[] = WORLD_LADDER.macroLocations;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function findMacro(macroId: string): MacroLocation | null {
  return MACRO_LOCATIONS.find((m) => m.id === macroId) ?? null;
}

export function findMicro(macroId: string, microId: string): MicroLocation | null {
  const macro = findMacro(macroId);
  if (!macro) return null;
  return macro.microLocations.find((m) => m.id === microId) ?? null;
}

export function findMicroMicro(
  macroId: string,
  microId: string,
  microMicroId: string,
): MicroMicroLocation | null {
  const micro = findMicro(macroId, microId);
  if (!micro) return null;
  return micro.microMicroLocations.find((mm) => mm.id === microMicroId) ?? null;
}

/**
 * Walk the entire ladder and return a flat list of every Micro-Micro along
 * with its parents. Lets call sites that don't know the macro/micro IDs
 * search by single ID. Linear scan; the ladder is ~30 nodes — not worth
 * indexing yet.
 */
export interface LadderTriple {
  macro: MacroLocation;
  micro: MicroLocation;
  microMicro: MicroMicroLocation;
}

export function findMicroMicroAnywhere(microMicroId: string): LadderTriple | null {
  for (const macro of MACRO_LOCATIONS) {
    for (const micro of macro.microLocations) {
      const found = micro.microMicroLocations.find((mm) => mm.id === microMicroId);
      if (found) return { macro, micro, microMicro: found };
    }
  }
  return null;
}

/**
 * Picks a random Micro-Micro from a given Macro biome. Used when the player
 * enters a biome without a specific drill-down target — scene generation
 * gets a richer environmental description than the top-level Location alone
 * can provide. Returns null if the Macro has no Micro-Micros.
 */
export function pickRandomMicroMicroIn(
  macroId: string,
  rng: () => number = Math.random,
): LadderTriple | null {
  const macro = findMacro(macroId);
  if (!macro) return null;
  const candidates: LadderTriple[] = [];
  for (const micro of macro.microLocations) {
    for (const microMicro of micro.microMicroLocations) {
      candidates.push({ macro, micro, microMicro });
    }
  }
  if (candidates.length === 0) return null;
  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx] ?? null;
}
