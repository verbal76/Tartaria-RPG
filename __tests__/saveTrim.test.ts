import { trimSaveStateToFit } from '../app/engine/saveTrim';
import type { SaveState, VisitedRoom, WorldMemory } from '../app/engine/types';

// OTA-395 — the slot-blob size guard that fixes the real save-loss root cause
// (visitedRooms growing the blob past AsyncStorage's ~2MB readback window).

const bigTable = (n: number) => {
  const t: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) t[`noun${i}`] = { lore: 'x'.repeat(400), category: 'flavor', consumed: false };
  return t as VisitedRoom['roomInvestigationTable'];
};

const room = (lastVisitAt: number, withTable = true, droppedItems = 0): VisitedRoom => ({
  firstVisitAt: lastVisitAt,
  lastVisitAt,
  visitCount: 1,
  enemiesCleared: ['Mud Viper'],
  searchedAmbientNouns: ['kettle'],
  ...(withTable ? { roomInvestigationTable: bigTable(20) } : {}),
  ...(droppedItems > 0
    ? { droppedItems: Array.from({ length: droppedItems }, (_, i) => ({ id: `d${i}`, name: 'Cudgel', kind: 'weapon' as const, quantity: 1, tags: [] })) }
    : {}),
});

const makeState = (rooms: Record<string, VisitedRoom>): SaveState => ({
  version: 1,
  savedAt: 0,
  player: { name: 'V', raceId: 'r', stats: {} } as never,
  worldMemory: { visitedRooms: rooms } as WorldMemory,
  gameLog: [],
  currentScreen: 'exploration' as never,
});

describe('trimSaveStateToFit', () => {
  it('leaves a within-budget save untouched', () => {
    const state = makeState({ a: room(1) });
    const r = trimSaveStateToFit(state, 10_000_000);
    expect(r.trimmed).toBe(false);
    expect(r.state).toBe(state);
  });

  it('strips regenerable investigation tables (oldest first) to fit', () => {
    const rooms: Record<string, VisitedRoom> = {};
    for (let i = 0; i < 30; i++) rooms[`room${i}`] = room(i);
    const state = makeState(rooms);
    const before = JSON.stringify(state).length;
    const r = trimSaveStateToFit(state, Math.floor(before * 0.5));
    expect(r.trimmed).toBe(true);
    expect(r.bytesAfter).toBeLessThanOrEqual(Math.floor(before * 0.5));
    expect(r.tablesStripped).toBeGreaterThan(0);
    // The lightweight memory survives even where the table was stripped.
    const out = (r.state.worldMemory.visitedRooms ?? {});
    expect(Object.values(out).every((rm) => Array.isArray(rm.enemiesCleared))).toBe(true);
  });

  it('drops the oldest rooms but never one holding dropped items', () => {
    const rooms: Record<string, VisitedRoom> = {};
    for (let i = 0; i < 40; i++) rooms[`room${i}`] = room(i, false); // no tables → must drop rooms
    rooms.room0 = room(0, false, 2); // oldest, but holds dropped items
    const state = makeState(rooms);
    const before = JSON.stringify(state).length;
    const r = trimSaveStateToFit(state, Math.floor(before * 0.4));
    expect(r.trimmed).toBe(true);
    expect(r.roomsDropped).toBeGreaterThan(0);
    // The room with dropped items is preserved.
    expect(r.state.worldMemory.visitedRooms?.room0).toBeTruthy();
    expect(r.state.worldMemory.visitedRooms?.room0?.droppedItems?.length).toBe(2);
  });
});
