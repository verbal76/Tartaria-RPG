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
  rooms: HubRoom[];
}

export const HUB: HubData = staticHubData as HubData;

/** True when the given location id is the hub's macro location. */
export function isHubLocation(locationId: string | null | undefined): boolean {
  return locationId === HUB.hubLocationId;
}

export function findHubRoom(roomId: string | null | undefined): HubRoom | null {
  if (!roomId) return null;
  return HUB.rooms.find((r) => r.id === roomId) ?? null;
}

/** Default entry-room id for the hub — the first room in the rooms[]
 *  list. By convention that's the Gate. */
export function hubEntryRoomId(): string {
  return HUB.rooms[0]?.id ?? '';
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
): { roomId: string; via: 'cardinal' | 'adjacent' | 'fast_travel' } | null {
  const here = findHubRoom(fromRoomId);
  if (!here) return null;
  const text = rawInput.toLowerCase();
  // Cardinal first.
  for (const dir of ['north', 'south', 'east', 'west'] as const) {
    if (new RegExp(`\\b${dir}\\b`).test(text)) {
      const target = here.exits[dir];
      if (target) return { roomId: target, via: 'cardinal' };
    }
  }
  // Adjacent named room (any exit).
  for (const dir of ['north', 'south', 'east', 'west'] as const) {
    const targetId = here.exits[dir];
    if (!targetId) continue;
    const room = findHubRoom(targetId);
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
  for (const room of HUB.rooms) {
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
