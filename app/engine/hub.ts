// HANDOFF #15b — hub engine integration. Loads the hand-authored hub
// data from static_hub.json and provides lookups the gameStore wires
// into beginScene / travel handling.
//
// Design:
//   - Player gains a `hubRoomId` field. When set, scene rendering
//     pulls from the hub room (description / exits) instead of the
//     procedural Micro-Micro picker.
//   - On first entry to a hub location, hubRoomId defaults to the
//     hub's entry room id (Gate).
//   - Cardinal travel (`go north`) resolves through hub.rooms[*].exits.
//   - Named travel (`go armory`, `take the workshop`) matches against
//     room shortName / name / id.
//   - "leave outpost" / "exit hub" clears hubRoomId and resumes the
//     procedural world.

import staticHubData from '../data/world/static_hub.json';
import variantsData from '../data/world/hub_faction_variants.json';
import factionsData from '../data/factions/factions.json';
import {
  resolveTable,
  startingAreaForFaction,
  startingAreaAtLocation,
  STARTING_AREA_WORLD_EXIT,
  type StartingAreaRoom,
} from './contentPack';

export interface HubRoom {
  id: string;
  name: string;
  shortName: string;
  description: string;
  exits: {
    north: string | null;
    south: string | null;
    east: string | null;
    west: string | null;
  };
  anchorNpc: string | null;
  tags: string[];
  /** Author-declared searchable / approachable nouns in this room.
   *  Surfaced as Search / Approach modal chips and recognised as
   *  parser targets. Replaces the noun extractor for hub rooms.
   *  Lowercase, no punctuation, singular preferred. */
  interactables?: string[];
}

interface HubData {
  hubId: string;
  hubName: string;
  hubLocationId: string;
  // v2.4.1 (OTA 030) — same room layout reused across all 9 factions.
  // hubLocationIds lists every macro-location where the hub interior
  // should render; factionHubNames maps the player's factionId to the
  // display title shown on the minimap + opening narrative ("Monarch
  // Court" for Mud Monarchs, "Order Cloister" for Forgotten Order,
  // etc.). The room layout itself (rooms[]) is shared.
  hubLocationIds?: string[];
  factionHubNames?: Record<string, string>;
  rooms: HubRoom[];
}

export const HUB: HubData = staticHubData as HubData;

const HUB_LOCATION_SET: ReadonlySet<string> = new Set(
  HUB.hubLocationIds ?? [HUB.hubLocationId],
);

// engine_Dev — uploaded STARTING-AREA interiors. When a re-skin uploads a
// per-faction starting area, its rooms render as the walkable interior for that
// faction's base INSTEAD of the built-in Tartaria hub layout. We map the lighter
// StartingAreaRoom shape onto HubRoom so every hub consumer (rendering, travel,
// search nouns, anchor NPC) works unchanged. The "world" exit sentinel is carried
// through verbatim; resolveHubTravel surfaces it as a leave-the-instance signal.
function mapStartingRoom(r: StartingAreaRoom): HubRoom {
  const ex = r.exits ?? {};
  return {
    id: r.id,
    name: r.name,
    shortName: r.shortName ?? r.name,
    description: r.description,
    exits: {
      north: ex.north ?? null,
      south: ex.south ?? null,
      east: ex.east ?? null,
      west: ex.west ?? null,
    },
    anchorNpc: r.anchorNpc ?? null,
    tags: [],
    interactables: r.interactables,
  };
}

/** The active room set for a faction: the uploaded starting-area rooms when one is
 *  loaded for that faction, else the built-in hub layout. */
function activeRooms(factionId: string | null | undefined): HubRoom[] {
  const area = startingAreaForFaction(factionId);
  if (area && Array.isArray(area.rooms) && area.rooms.length > 0) {
    return area.rooms.map(mapStartingRoom);
  }
  return HUB.rooms;
}

/** True when the given location id is any faction's hub macro location.
 *  v2.4.1 (OTA 030) — was single-location (tartarian_outskirts only);
 *  now any of the 9 faction-start tiles renders the hub interior. */
export function isHubLocation(locationId: string | null | undefined): boolean {
  if (!locationId) return false;
  if (HUB_LOCATION_SET.has(locationId)) return true;
  // engine_Dev — a tile that an uploaded starting area is placed at is also a hub
  // (interior) location, so the player drops into its rooms when standing there.
  return startingAreaAtLocation(locationId) != null;
}

/** Display title for the hub minimap + opening narrative, scoped to
 *  the player's faction. Falls back to "Reclaimers' Outpost" if the
 *  factionId is missing or unmapped (legacy saves predating per-
 *  faction hubs). */
export function hubNameForFaction(factionId: string | null | undefined): string {
  const fallback = HUB.hubName;
  // engine_Dev — an uploaded starting area names the base directly.
  const area = startingAreaForFaction(factionId);
  if (area?.name && area.name.trim()) return area.name.trim();
  if (!factionId) return fallback;
  // engine_Dev — the faction's own `baseName` (from the live Factions table) is
  // the lore-agnostic starter-complex title. A re-skin sets "Drydock 4 Command",
  // "Forward Base", etc.; falls through to the built-in Tartaria per-faction
  // outpost names, then the generic hub name.
  const faction = resolveTable<{ id?: string; baseName?: string }>(
    'factions',
    factionsData as { id?: string; baseName?: string }[],
  ).find((f) => f.id === factionId);
  if (faction?.baseName && faction.baseName.trim()) return faction.baseName.trim();
  const map = HUB.factionHubNames ?? {};
  return map[factionId] ?? fallback;
}

export function findHubRoom(
  roomId: string | null | undefined,
  factionId?: string | null,
): HubRoom | null {
  if (!roomId) return null;
  return activeRooms(factionId).find((r) => r.id === roomId) ?? null;
}

// v2.4.1 (OTA 031) — per-faction room name + description overrides.
// hub_faction_variants.json holds the 8 non-Reclaimer factions' room
// re-skins (same exits, same anchorNpc, same interactables — only
// the player-facing strings change). Fall back to the base room
// when the faction has no override for that room id.
interface FactionRoomOverride {
  name?: string;
  shortName?: string;
  description?: string;
}
interface FactionVariantsFile {
  factions: Record<string, Record<string, FactionRoomOverride>>;
}
const VARIANTS = variantsData as FactionVariantsFile;

export function hubRoomFor(
  roomId: string | null | undefined,
  factionId: string | null | undefined,
): HubRoom | null {
  // engine_Dev — an uploaded starting area is ground truth: its rooms already
  // carry the author's strings, so the built-in faction-variant re-skin below
  // doesn't apply.
  if (startingAreaForFaction(factionId)) return findHubRoom(roomId, factionId);
  const base = findHubRoom(roomId);
  if (!base || !factionId) return base;
  const factionRooms = VARIANTS.factions?.[factionId];
  if (!factionRooms) return base;
  const override = factionRooms[base.id];
  if (!override) return base;
  // Merge: the override wins for the player-facing strings; every
  // other field (exits, anchorNpc, tags, interactables) stays at
  // the base.
  return {
    ...base,
    name: override.name ?? base.name,
    shortName: override.shortName ?? base.shortName,
    description: override.description ?? base.description,
  };
}

/** Default entry-room id for the hub — the first room in the rooms[]
 *  list. By convention that's the Gate. */
export function hubEntryRoomId(factionId?: string | null): string {
  return activeRooms(factionId)[0]?.id ?? '';
}

/** Resolve a player input against the current hub room's exits. Returns
 *  the target room id, or null if no exit matches. Supports:
 *    - Cardinal direction in the input ('go north')
 *    - shortName / name / id of an adjacent room ('go armory')
 *    - shortName / name / id of ANY hub room ('go to the workshop') —
 *      jumps directly to that room. Useful for fast-travel within the
 *      hub once the player has visited a room.
 */
export function resolveHubTravel(
  fromRoomId: string,
  rawInput: string,
  visitedRoomIds: ReadonlySet<string>,
  factionId?: string | null,
): { roomId: string; via: 'cardinal' | 'adjacent' | 'fast_travel' | 'world' } | null {
  const rooms = activeRooms(factionId);
  const here = findHubRoom(fromRoomId, factionId);
  if (!here) return null;
  const text = rawInput.toLowerCase();
  // Cardinal first. engine_Dev — a "world" exit value means leave the instance;
  // surface it as a dedicated signal the caller turns into a leave.
  for (const dir of ['north', 'south', 'east', 'west'] as const) {
    if (new RegExp(`\\b${dir}\\b`).test(text)) {
      const target = here.exits[dir];
      if (target === STARTING_AREA_WORLD_EXIT) return { roomId: STARTING_AREA_WORLD_EXIT, via: 'world' };
      if (target) return { roomId: target, via: 'cardinal' };
    }
  }
  // Adjacent named room (any exit).
  for (const dir of ['north', 'south', 'east', 'west'] as const) {
    const targetId = here.exits[dir];
    if (!targetId || targetId === STARTING_AREA_WORLD_EXIT) continue;
    const room = findHubRoom(targetId, factionId);
    if (!room) continue;
    if (
      text.includes(room.shortName.toLowerCase()) ||
      text.includes(room.name.toLowerCase()) ||
      text.includes(room.id.toLowerCase())
    ) {
      return { roomId: targetId, via: 'adjacent' };
    }
  }
  // Fast-travel — any room the player has already visited.
  for (const room of rooms) {
    if (room.id === fromRoomId) continue;
    if (!visitedRoomIds.has(room.id)) continue;
    if (
      text.includes(room.shortName.toLowerCase()) ||
      text.includes(room.name.toLowerCase()) ||
      text.includes(room.id.toLowerCase())
    ) {
      return { roomId: room.id, via: 'fast_travel' };
    }
  }
  return null;
}

/** True when the input is asking to leave the hub entirely. */
export function isLeaveHubCommand(rawInput: string): boolean {
  return /\b(leave|exit)\s+(the\s+)?(outpost|hub|camp|reclaimers'?)\b/i.test(rawInput) ||
         /\bleave\s+the\s+gate\b/i.test(rawInput) ||
         /\b(head|go|walk|travel)\s+(out|outside|into the wild)\b/i.test(rawInput);
}
