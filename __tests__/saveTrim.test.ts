import { trimSaveStateToFit, utf8ByteLength, saveSizeBreakdown } from '../app/engine/saveTrim';
import type { SaveState, VisitedRoom, WorldMemory } from '../app/engine/types';

// OTA-395/396 — the slot-blob size guard that fixes the save-loss root cause.

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

const makeState = (over: Partial<WorldMemory>, currentScene?: unknown): SaveState => ({
  version: 1,
  savedAt: 0,
  player: { name: 'V', raceId: 'r', stats: {} } as never,
  worldMemory: over as WorldMemory,
  gameLog: [],
  currentScreen: 'exploration' as never,
  currentScene,
});

describe('trimSaveStateToFit', () => {
  it('leaves a within-budget save untouched', () => {
    const state = makeState({ visitedRooms: { a: room(1) } });
    const r = trimSaveStateToFit(state, 10_000_000);
    expect(r.trimmed).toBe(false);
    expect(r.state).toBe(state);
  });

  it('strips regenerable investigation tables (oldest first) to fit', () => {
    const rooms: Record<string, VisitedRoom> = {};
    for (let i = 0; i < 30; i++) rooms[`room${i}`] = room(i);
    const state = makeState({ visitedRooms: rooms });
    const before = JSON.stringify(state).length;
    const r = trimSaveStateToFit(state, Math.floor(before * 0.5));
    expect(r.trimmed).toBe(true);
    expect(r.charsAfter).toBeLessThanOrEqual(Math.floor(before * 0.5));
    expect(r.tablesStripped).toBeGreaterThan(0);
    const out = (r.state.worldMemory.visitedRooms ?? {});
    expect(Object.values(out).every((rm) => Array.isArray(rm.enemiesCleared))).toBe(true);
  });

  it('drops the oldest rooms but never one holding dropped items', () => {
    const rooms: Record<string, VisitedRoom> = {};
    for (let i = 0; i < 40; i++) rooms[`room${i}`] = room(i, false);
    rooms.room0 = room(0, false, 2); // oldest, holds dropped items
    const state = makeState({ visitedRooms: rooms });
    const before = JSON.stringify(state).length;
    const r = trimSaveStateToFit(state, Math.floor(before * 0.4));
    expect(r.trimmed).toBe(true);
    expect(r.roomsDropped).toBeGreaterThan(0);
    expect(r.state.worldMemory.visitedRooms?.room0?.droppedItems?.length).toBe(2);
  });

  it('falls through to capping memos and dropping the scene as last resorts', () => {
    const memos = Array.from({ length: 500 }, (_, i) => ({ text: 'm'.repeat(200), ts: i }));
    const scene = { junk: 'z'.repeat(50_000) };
    const state = makeState({ chainMemos: memos, memorableEvents: [] }, scene);
    const before = JSON.stringify(state).length;
    const r = trimSaveStateToFit(state, Math.floor(before * 0.3));
    expect(r.trimmed).toBe(true);
    expect(r.memosCapped).toBe(true);
    expect((r.state.worldMemory.chainMemos ?? []).length).toBeLessThanOrEqual(40);
    expect(r.sceneDropped).toBe(true);
    expect(r.state.currentScene).toBeUndefined();
  });
});

describe('utf8ByteLength + saveSizeBreakdown', () => {
  it('counts multi-byte glyphs as more than one byte', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('—')).toBe(3);
    expect(utf8ByteLength('✦')).toBe(3);
    expect(utf8ByteLength('a—b')).toBe(5);
  });
  it('breakdown names the parts', () => {
    const s = saveSizeBreakdown(makeState({ visitedRooms: { a: room(1) } }));
    expect(s).toMatch(/total=/);
    expect(s).toMatch(/rooms=/);
    expect(s).toMatch(/scene=/);
  });
});
