import type { SaveState, VisitedRoom, WorldMemory } from './types';

// OTA-395 — slot-blob size guard (the real save-loss root cause).
//
// AsyncStorage on Android reads a value back through a ~2 MB SQLite cursor
// window; a slot blob larger than that comes back TRUNCATED, so saveSlot's
// verify step (`staged !== payload`) fails and the save silently never lands
// ("staged save did not verify (truncated or storage full)"). OTA-373 capped
// the game log, but the real unbounded grower is `worldMemory.visitedRooms`:
// every room the player enters is recorded, and each carries a heavy
// `roomInvestigationTable` (generated lore text for every ambient noun) plus
// other per-room state. Over a long run that map alone blows past 2 MB.
//
// This trims the SAVED blob only (in-memory/session state is untouched), and
// ONLY when it's over budget — so normal saves are byte-for-byte unchanged.
// When over, it sheds the cheapest-to-lose data first:
//   1. strip `roomInvestigationTable` (REGENERABLE — re-seeds on re-entry) from
//      the OLDEST rooms first, keeping all lightweight memory (cleared enemies,
//      searched nouns, dropped items) intact;
//   2. if still over, drop the OLDEST visited rooms outright (they re-roll fresh
//      on re-entry) — never dropping a room that holds player-dropped items.

/** Headroom under the ~2 MB AsyncStorage readback window. */
export const SAFE_BLOB_BYTES = 1_400_000;

export interface TrimResult {
  state: SaveState;
  trimmed: boolean;
  bytesBefore: number;
  bytesAfter: number;
  tablesStripped: number;
  roomsDropped: number;
}

export function trimSaveStateToFit(state: SaveState, maxBytes = SAFE_BLOB_BYTES): TrimResult {
  const bytesBefore = JSON.stringify(state).length;
  if (bytesBefore <= maxBytes) {
    return { state, trimmed: false, bytesBefore, bytesAfter: bytesBefore, tablesStripped: 0, roomsDropped: 0 };
  }

  const wm: WorldMemory = state.worldMemory ?? ({} as WorldMemory);
  const rooms = wm.visitedRooms ?? {};
  const keys = Object.keys(rooms);

  // Size each room once (avoids O(n) full re-serializes while pruning), and the
  // base blob with visitedRooms emptied out.
  const baseBytes = JSON.stringify({ ...state, worldMemory: { ...wm, visitedRooms: {} } }).length;
  const roomBytes: Record<string, number> = {};
  const tableBytes: Record<string, number> = {};
  let total = baseBytes;
  for (const k of keys) {
    const r = rooms[k]!;
    const rb = JSON.stringify(r).length + k.length + 4; // +"key": overhead
    roomBytes[k] = rb;
    tableBytes[k] = r.roomInvestigationTable ? JSON.stringify(r.roomInvestigationTable).length : 0;
    total += rb;
  }

  // Oldest first by last-visit (fall back to first-visit, then 0).
  const oldestFirst = keys.slice().sort(
    (a, b) => (rooms[a]?.lastVisitAt ?? rooms[a]?.firstVisitAt ?? 0)
      - (rooms[b]?.lastVisitAt ?? rooms[b]?.firstVisitAt ?? 0),
  );

  const nextRooms: Record<string, VisitedRoom> = { ...rooms };
  let tablesStripped = 0;
  let roomsDropped = 0;

  // Pass 1 — strip regenerable investigation tables, oldest first.
  for (const k of oldestFirst) {
    if (total <= maxBytes) break;
    if (tableBytes[k]! > 0 && nextRooms[k]?.roomInvestigationTable) {
      const { roomInvestigationTable: _drop, ...rest } = nextRooms[k]!;
      nextRooms[k] = rest;
      total -= tableBytes[k]!;
      roomBytes[k]! -= tableBytes[k]!;
      tablesStripped++;
    }
  }

  // Pass 2 — drop the oldest rooms outright (keep any holding dropped items).
  for (const k of oldestFirst) {
    if (total <= maxBytes) break;
    const r = nextRooms[k];
    if (!r) continue;
    if ((r.droppedItems?.length ?? 0) > 0) continue;
    delete nextRooms[k];
    total -= roomBytes[k]!;
    roomsDropped++;
  }

  const nextState: SaveState = { ...state, worldMemory: { ...wm, visitedRooms: nextRooms } };
  return {
    state: nextState,
    trimmed: true,
    bytesBefore,
    bytesAfter: JSON.stringify(nextState).length,
    tablesStripped,
    roomsDropped,
  };
}
