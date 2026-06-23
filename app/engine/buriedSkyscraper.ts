// OTA-151 — Buried Skyscraper expansion framework (scaffold only).
//
// Post-ending expansion location: a 100-floor inverted skyscraper
// buried in the Buried Cities macro region near the Outskirts. The
// player descends from floor 1 (entry, surface side) to floor 100
// (where their faction's people live), threading a graph of stair-
// segments with varying descent rates and broken-state hazards.
//
// THIS FILE IS FRAMEWORK ONLY. No room content, no NPC dialogue,
// no quest hooks land here yet — those wait on the maps the user
// is hand-authoring per archetype. What ships in this file:
//
//   • Type definitions for floor archetypes, grid cells, stairwell
//     positions / types, and the building's persistent state shape.
//   • Five floor archetypes with placeholder display metadata.
//   • Five stairwell types with distinct descent rates (the "five
//     different types" the user asked the system to remember).
//   • A `canEnterSkyscraper(player)` gate that refuses entry until
//     mainQuest.phase === 'ended' (any of the three Choice endings).
//   • An `emptyBuildingState()` initializer so a new save can pin
//     a fresh skyscraper progression record once the player gets in.
//
// When the floor maps land, each one fills FloorTemplate.grid with
// authored GridCell rows. The building stack reuses templates per
// floor archetype, varying the entry-stairwell mapping between
// stacks so the same template doesn't read identically.

import type { PlayerCharacter } from './types';
import { ensureMainQuest } from './mainQuest';

// ---------------------------------------------------------------------------
// Floor archetypes — 5 flavors. These pin the visual + narrative
// register of each floor. Procedural placement of archetypes across
// the 100-floor stack happens at building-generation time; the
// authored maps the user provides will key into these IDs.
// ---------------------------------------------------------------------------

export type FloorArchetype =
  | 'service_corridor'   // utility / maintenance / piping / drains
  | 'market_level'       // shops, vendors, social hub, errand-runners
  | 'shrine_level'       // Aetherkin sacred space, ritual fixtures
  | 'mechanical_floor'   // Aethercraft engine bay, hazards, machinery
  | 'dig_camp';          // Reclaimer outpost, salvage piles, lanterns

export interface FloorArchetypeMeta {
  id: FloorArchetype;
  label: string;
  flavor: string;
  /** Tint hint for any future floor-card / minimap UI. */
  color: string;
}

export const FLOOR_ARCHETYPES: Record<FloorArchetype, FloorArchetypeMeta> = {
  service_corridor: {
    id: 'service_corridor',
    label: 'Service Corridor',
    flavor: 'Utility level. Pipework, drains, a lantern every twenty paces. The kind of floor the city built to forget.',
    color: '#7a705c',
  },
  market_level: {
    id: 'market_level',
    label: 'Market Level',
    flavor: 'Stalls, vendors, errand-runners. A floor that still believes it is a city.',
    color: '#c9a86a',
  },
  shrine_level: {
    id: 'shrine_level',
    label: 'Shrine Level',
    flavor: 'A sacred space. Censers, candle-grids, low chanting from rooms you have not entered yet.',
    color: '#9888a8',
  },
  mechanical_floor: {
    id: 'mechanical_floor',
    label: 'Mechanical Floor',
    flavor: 'Old engines, hazard plates, the smell of burning fuel. Walk where the floor is dark, not where it glows.',
    color: '#a85a3a',
  },
  dig_camp: {
    id: 'dig_camp',
    label: 'Salvager Dig Camp',
    flavor: 'Salvage piles, foreman tents, a lantern grid the salvagers maintain themselves. Trade if they recognize your colors.',
    color: '#9ec96a',
  },
};

// ---------------------------------------------------------------------------
// Grid cells — top-down 2D map of a single floor. Each cell carries a
// kind (wall / room / corridor / stairwell / hazard / etc.) and an
// optional content tag the authoring layer fills in (NPC, hook,
// vendor, etc.). User-authored maps will translate to GridCell[][].
// ---------------------------------------------------------------------------

export type CellKind =
  | 'wall'
  | 'room'
  | 'corridor'
  | 'stairwell'
  | 'hazard'
  | 'door'
  | 'vendor'
  | 'altar'
  | 'rubble';

export interface GridCell {
  kind: CellKind;
  /** Optional authored tag: NPC id, hook id, vendor id, etc. */
  tag?: string;
  /** Optional flavor line surfaced on `look` in this cell. */
  flavor?: string;
}

// ---------------------------------------------------------------------------
// Stairwells — four corners per floor (NE / NW / SE / SW). Each
// corner hosts ONE stairwell-segment leading down (or, on broken
// stairs, leading nowhere past a certain floor). Five types capture
// the descent-rate variation the user spec'd; the building
// generator picks which type lives at each (floor, corner) slot.
// ---------------------------------------------------------------------------

export type StairwellPosition = 'NE' | 'NW' | 'SE' | 'SW';

export type StairwellType =
  | 'express_drop_5'  // skips down 5 floors per segment
  | 'express_drop_3'  // skips down 3 floors per segment
  | 'local_drop_2'    // 2 floors per segment
  | 'local_drop_1'    // standard 1-floor descent
  | 'broken';         // collapsed; dead-ends at brokenAt floor

export interface StairwellTypeMeta {
  id: StairwellType;
  label: string;
  /** Floors descended in a single use; null for `broken`. */
  descentPerUse: number | null;
  /** Stamina cost per use. Express stairs cost more (no rest beats). */
  staminaCost: number;
}

export const STAIRWELL_TYPES: Record<StairwellType, StairwellTypeMeta> = {
  express_drop_5: { id: 'express_drop_5', label: 'Express Stair (−5)', descentPerUse: 5, staminaCost: 6 },
  express_drop_3: { id: 'express_drop_3', label: 'Express Stair (−3)', descentPerUse: 3, staminaCost: 4 },
  local_drop_2:   { id: 'local_drop_2',   label: 'Local Stair (−2)',   descentPerUse: 2, staminaCost: 2 },
  local_drop_1:   { id: 'local_drop_1',   label: 'Local Stair (−1)',   descentPerUse: 1, staminaCost: 1 },
  broken:         { id: 'broken',         label: 'Collapsed Stair',    descentPerUse: null, staminaCost: 0 },
};

export interface StairwellInstance {
  position: StairwellPosition;
  type: StairwellType;
  /** For `broken`: the floor below which descent is blocked. */
  brokenAt?: number;
  /** OTA-141 stair-repair hook: future Aethercraft-Shape / Reclaimer
   *  salvage missions can flip a broken stair to clear by writing
   *  this field. Skeleton now; effects later. */
  repaired?: boolean;
}

// ---------------------------------------------------------------------------
// Elevator shafts — 2 per floor, center positions. The cars are
// long dead; the shafts themselves are climbable. Unlike stairs
// (predominantly descent), shafts let the player CLIMB BACK UP
// without retracing through floors — but the climb is hazardous
// (stamina cost + DEX check + fall risk on a fumble). Each shaft
// also has its own state: `climbable` means clear top-to-bottom;
// `blocked_at` means a debris jam or fallen car halts traversal
// at a specific floor; `sealed` means the floor-level door is
// welded shut (visible on the grid but inaccessible).
//
// Two shafts means a choice — one might be the cleaner climb but
// pass through hostile floors, the other dirtier but quieter. The
// building generator picks states per shaft per floor stack.
// ---------------------------------------------------------------------------

export type ShaftPosition = 'CENTER_NORTH' | 'CENTER_SOUTH';

export type ShaftState =
  | 'climbable'        // open shaft, can ascend or descend with the climb check
  | 'blocked_at'       // jammed by debris / a fallen car at blockedAtFloor
  | 'sealed';          // floor-level door welded shut; shaft not accessible from here

export interface ShaftInstance {
  position: ShaftPosition;
  state: ShaftState;
  /** For `blocked_at`: the floor where the jam sits. Player can
   *  traverse past this floor only if descending FROM above the
   *  jam stays above and ascending FROM below stays below — the
   *  jam itself is the wall. */
  blockedAtFloor?: number;
  /** When true, the cable car wreckage at the bottom is still
   *  rigged enough to function as a fast-descent anchor — climb
   *  checks succeed more often. Skeleton now; effects later. */
  cableIntact?: boolean;
  /** Same repair hook as stairs — Aethercraft-Shape / Reclaimer
   *  salvage can clear a jam by setting this. Skeleton now. */
  repaired?: boolean;
}

export interface ShaftTypeMeta {
  id: ShaftState;
  label: string;
  /** Player-facing flavor when they `look` at the shaft door. */
  flavor: string;
}

export const SHAFT_STATES: Record<ShaftState, ShaftTypeMeta> = {
  climbable: {
    id: 'climbable',
    label: 'Open Shaft',
    flavor: 'The elevator door hangs open. Below: dark, cabling, the suggestion of a long fall. The shaft is climbable both ways for someone who trusts their grip.',
  },
  blocked_at: {
    id: 'blocked_at',
    label: 'Jammed Shaft',
    flavor: 'The shaft is open here, but somewhere in the dark a car is wedged crosswise — the climb stops there. Fine in one direction; a wall in the other.',
  },
  sealed: {
    id: 'sealed',
    label: 'Sealed Shaft',
    flavor: 'Welded plates over the elevator door. Whoever closed this floor off didn\'t want anyone using the shaft from here.',
  },
};

// ---------------------------------------------------------------------------
// Floor template — archetype + grid + four corner stairwell slots.
// The user's hand-authored maps will arrive as GridCell[][] for one
// archetype each; the building generator stacks 100 floors by
// drawing from the archetype pool and varying stairwell assignments.
// ---------------------------------------------------------------------------

export interface FloorTemplate {
  archetype: FloorArchetype;
  /** Top-down grid. Rows × cols. User-authored. Empty array = stub. */
  grid: GridCell[][];
  /** Four corner stairwells. position must be unique per floor. */
  stairwells: StairwellInstance[];
  /** Two center elevator shafts. position must be unique per floor.
   *  Shafts are vertically continuous structures — the per-floor
   *  instance captures access state at THIS floor (sealed door,
   *  open shaft, jammed at this level). The actual climb across
   *  multiple floors is resolved against the floors above/below. */
  shafts: ShaftInstance[];
  /** Optional display name (e.g. "Floor 47 — North Market"). */
  displayName?: string;
}

// Stub template for each archetype until authored grids land.
// Building generation can still allocate floors against these stubs
// for testing the stack logic; rendering will show a "stub floor"
// placeholder until the real map is dropped in.
export function stubFloorTemplate(archetype: FloorArchetype): FloorTemplate {
  return { archetype, grid: [], stairwells: [], shafts: [] };
}

// ---------------------------------------------------------------------------
// Building state — pinned to the player save when they enter the
// skyscraper for the first time. Tracks current floor, discovered
// floors (for map-fills), stair state (so repaired stairs persist),
// and the per-floor archetype assignment for the run (deterministic
// from a seed so the building reads the same across save/load).
// ---------------------------------------------------------------------------

export interface BuildingState {
  /** Seed used to deterministically lay out floors + stair states. */
  seed: string;
  /** Current floor (1-100). 1 = entry on top, 100 = bottom. */
  currentFloor: number;
  /** Floors whose grid the player has personally walked. */
  discoveredFloors: number[];
  /** Per-floor archetype assignment. floors[i] is archetype for floor i+1. */
  floorArchetypes: FloorArchetype[];
  /** Per-(floor,corner) stairwell state. Key: `${floor}:${position}`. */
  stairwells: Record<string, StairwellInstance>;
  /** Per-(floor,shaft-position) shaft state. Key: `${floor}:${position}`.
   *  A shaft is logically continuous across floors but each floor
   *  pins its own access state — sealed at one level, climbable at
   *  the next, jammed somewhere in between. The traversal resolver
   *  walks the floor-by-floor state to figure out where a climb
   *  ends. */
  shafts: Record<string, ShaftInstance>;
}

export function emptyBuildingState(seed: string): BuildingState {
  return {
    seed,
    currentFloor: 1,
    discoveredFloors: [1],
    floorArchetypes: [],
    stairwells: {},
    shafts: {},
  };
}

// ---------------------------------------------------------------------------
// Entry gate — the skyscraper is locked until the player has
// completed the main quest. ANY of the three Choice endings counts;
// the post-ending homeward beat is the player's path to the
// Outskirts entrance.
// ---------------------------------------------------------------------------

export function canEnterSkyscraper(player: PlayerCharacter | null | undefined): boolean {
  if (!player) return false;
  const mq = ensureMainQuest(player.mainQuest);
  return mq.phase === 'ended';
}

/** Convenience for UI: returns a player-facing refusal line when
 *  `canEnterSkyscraper` is false. The Arbiter delivers this on any
 *  attempt to engage with the entrance before completion. */
export function skyscraperGateRefusal(): string {
  return 'The Arbiter blocks the doorway. "This place opens only to those who have finished the work above. Return to the Cores. Return to the Choice. Then come back."';
}
