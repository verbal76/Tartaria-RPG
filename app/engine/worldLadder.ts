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
  /** Author-declared interactable nouns for this room. Same contract as
   *  Location.interactables / HubRoom.interactables — surfaced as Search /
   *  Approach modal chips and recognised as parser targets. Lowercase,
   *  no punctuation, singular preferred. When present, replaces the
   *  heuristic extractor pass on environmental_description for this
   *  sub-room. Part of the Phase 2 author-declared-content rollout. */
  interactables?: string[];
}

/** A neighborhood / quarter inside a Macro biome. */
export interface MicroLocation {
  id: string;
  name: string;
  description: string;
  /** OTA-749 — an ENCLOSED interior / buried-underworld micro-area whose rooms read
   *  as indoors. Must NOT be handed to an OUTDOOR surface tile (that stamped an indoor
   *  room name + hall exits onto a player traveling open silt). Surface assignment
   *  skips them; the DESCEND path still reaches them. */
  indoor?: boolean;
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

/**
 * Maps a top-level Location id (from `app/data/locations/locations.json`) to
 * the Macro biome it sits inside. Locations not in this table fall back to
 * the flat Location description on scene entry — they have no Micro-Micro
 * override and the LLM gets the legacy environmental text.
 *
 * The taxonomy:
 *   lost_capitals       — Tartarian capital cities + their landmarks
 *   subterranean_empire — True Tartarian underground enclaves
 *   aetherstone_deep    — buried Tartarian facilities / vaults
 *   silt_wastes         — surface mud-flood terrain
 *   borderlands         — liminal markets / dig sites / frontier scenes
 */
export const LOCATION_TO_MACRO: Record<string, string> = {
  // Capital cities + landmarks → Lost Capitals
  asgardar: 'lost_capitals',
  // ⚠ The ASGARDAR spire is a capital landmark and belongs here. The ETHERIA spire does
  // NOT any more — it moved into the Black Reach and re-macro'd to aetherstone_deep
  // (below). These two lines used to sit adjacent in this table under near-identical
  // names, which is a fair part of why the two towers kept getting discussed as one place.
  grand_spire_of_asgardar: 'lost_capitals',
  samarran: 'lost_capitals',
  thametans_tower: 'lost_capitals',
  nimari: 'lost_capitals',
  red_tower_of_nimari: 'lost_capitals',
  drakova: 'lost_capitals',
  // arb96 — the four OTA-052 Lost Capitals had atlas coords + Core/Guardian
  // status but no macro mapping, so they fell through to the legacy global
  // encounter roll (and read as "(unmapped)" in the world brief). Bind them
  // to the Lost Capitals biome like the other Core-cities.
  karok_sa: 'lost_capitals',
  yuldra_tul: 'lost_capitals',
  ostragar: 'lost_capitals',
  iskan_veil: 'lost_capitals',
  // Subterranean enclaves → Subterranean Empire
  varakush: 'subterranean_empire',
  tartarian_enclave: 'subterranean_empire', // arb96 — underground True Tartarian enclave
  // Tartarian deep facilities → Aetherstone Deep
  obsidian_pillars: 'aetherstone_deep',
  endless_stair: 'aetherstone_deep',
  zharaks_teeth: 'aetherstone_deep',
  cradle_of_dusk: 'aetherstone_deep',
  giant_vault: 'aetherstone_deep',
  etheric_chamber: 'aetherstone_deep',
  mud_flood_nexus: 'aetherstone_deep',
  // ⚠⚠ The Black Reach is the Deep's OPEN door — owner: *"it's another access point to the
  // deep below."* Every other way in is a vault, a seal or a guarded chamber; this one is
  // just a floor that ends. The Etheria spire rides down with it: the chasm took the tower
  // whole, so the tower is Deep terrain now, not a capital landmark.
  black_reach: 'aetherstone_deep',
  grand_spire_of_etheria: 'aetherstone_deep',
  // Surface mud wastes → Silt Wastes
  great_tartary_plains: 'silt_wastes',
  mud_seas: 'silt_wastes',
  sinking_cathedral: 'silt_wastes',
  buried_cities: 'silt_wastes',
  voronov: 'silt_wastes',
  // Edge / liminal → Borderlands
  tartarian_outskirts: 'borderlands',
  parley_ground: 'borderlands', // arb96 — neutral meeting flats on the frontier
  // arb92 — themed faction-start frontier outposts. All map to the
  // starter-safe Borderlands biome (danger-2, tame curated pools) so a fresh
  // character lands gently; the Lost Capitals remain the dangerous journey.
  monarch_waystation: 'borderlands',
  dynasty_border_post: 'borderlands',
  pilgrim_waycamp: 'borderlands',
  builders_survey_camp: 'borderlands',
  giant_watch_shrine: 'borderlands',
  revivalist_field_camp: 'borderlands',
  reclaimer_stake: 'borderlands',
  architect_blind: 'borderlands',
};

/** Convenience: returns the Macro for a Location, or null if not mapped. */
export function macroForLocation(locationId: string): MacroLocation | null {
  const macroId = LOCATION_TO_MACRO[locationId];
  return macroId ? findMacro(macroId) : null;
}

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
  opts?: { includeIndoor?: boolean },
): LadderTriple | null {
  const macro = findMacro(macroId);
  if (!macro) return null;
  const candidates: LadderTriple[] = [];
  for (const micro of macro.microLocations) {
    // OTA-749 — a SURFACE tile never adopts an indoor micro-area; only DESCEND
    // (includeIndoor) reaches those. An all-indoor macro yields no surface micro-area.
    if (micro.indoor && !opts?.includeIndoor) continue;
    for (const microMicro of micro.microMicroLocations) {
      candidates.push({ macro, micro, microMicro });
    }
  }
  if (candidates.length === 0) return null;
  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx] ?? null;
}

/**
 * Picks a Micro-Micro DIFFERENT from the given one, preferring siblings
 * in the same parent Micro location and falling back to the wider Macro.
 * Used by the exit-following travel path so the player who types "go
 * through the broken window" gets a thematically nearby room rather than
 * a teleport to an unrelated biome.
 *
 * Returns null if the source id is unknown or its parents contain no
 * other rooms.
 */
export function pickSiblingMicroMicro(
  sourceMicroMicroId: string,
  rng: () => number = Math.random,
): LadderTriple | null {
  const source = findMicroMicroAnywhere(sourceMicroMicroId);
  if (!source) return null;
  // Tier 1: sibling rooms in the same Micro location.
  const intraMicro = source.micro.microMicroLocations.filter(
    (mm) => mm.id !== sourceMicroMicroId,
  );
  if (intraMicro.length > 0) {
    const pick = intraMicro[Math.floor(rng() * intraMicro.length)]!;
    return { macro: source.macro, micro: source.micro, microMicro: pick };
  }
  // Tier 2: any other room anywhere in the same Macro biome.
  const intraMacro: LadderTriple[] = [];
  for (const micro of source.macro.microLocations) {
    for (const mm of micro.microMicroLocations) {
      if (mm.id !== sourceMicroMicroId) intraMacro.push({ macro: source.macro, micro, microMicro: mm });
    }
  }
  if (intraMacro.length === 0) return null;
  return intraMacro[Math.floor(rng() * intraMacro.length)] ?? null;
}
