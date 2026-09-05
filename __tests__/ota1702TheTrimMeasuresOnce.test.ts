/**
 * OTA-1702 — THE TRIM MEASURES ONCE.
 *
 * Found under the contrary-walker sweep (step 3 of the Narrative Agency plan):
 * the eighteenth hunt's roads went quiet for twenty minutes at a time with the
 * jest process at 100% CPU. The inspector, attached to the live process, put
 * every stack sample inside `trimSaveStateToFit → size()`: 838 visited rooms,
 * 8ms per whole-blob stringify, one stringify per room per pass, on every
 * persist — because the trimmed copy never reaches memory, the next persist
 * starts from the same 838 rooms. Seven seconds of synchronous JS per action.
 *
 * The owner's device sits at ~46% of the budget today (368KB, 114 rooms), so
 * nothing on the Pixel has run this yet. It would have: the first long save to
 * cross 800K would freeze for seconds on every tap. Per-room sizes now feed a
 * running estimate and the blob is measured once per pass to confirm.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { trimSaveStateToFit, SAFE_BLOB_CHARS } from '../app/engine/saveTrim';
import type { SaveState, VisitedRoom, WorldMemory } from '../app/engine/types';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const room = (lastVisitAt: number, droppedItems = 0): VisitedRoom => ({
  firstVisitAt: lastVisitAt,
  lastVisitAt,
  visitCount: 1,
  enemiesCleared: ['Mud Viper', 'Bog Creeper'],
  searchedAmbientNouns: Array.from({ length: 8 }, (_, i) => `noun ${i} of ${lastVisitAt}`),
  ...(lastVisitAt % 3 === 0 ? { roomInvestigationTable: { kettle: { lore: 'k'.repeat(300), category: 'flavor', consumed: false } } as unknown as VisitedRoom['roomInvestigationTable'] } : {}),
  ...(droppedItems > 0
    ? { droppedItems: Array.from({ length: droppedItems }, (_, i) => ({ id: `d${i}`, name: 'Cudgel', kind: 'weapon' as const, quantity: 1, tags: [] })) }
    : {}),
});

/** A sweep-shaped save: many rooms, a heavy un-trimmable player record. */
function sweepState(nRooms: number, playerChars: number): SaveState {
  const rooms: Record<string, VisitedRoom> = {};
  for (let i = 0; i < nRooms; i++) rooms[`loc_${i}:room:${i},${i % 7}`] = room(1000 + i);
  rooms['loc_keep:room:0,0'] = room(1, 2); // the oldest, and it holds dropped items
  return {
    version: 1,
    savedAt: 0,
    player: { name: 'Sweep', raceId: 'r', stats: {}, hoard: 'x'.repeat(playerChars) } as never,
    worldMemory: { visitedRooms: rooms, memorableEvents: [], chainMemos: [] } as unknown as WorldMemory,
    gameLog: [],
    currentScreen: 'exploration' as never,
    currentScene: { junk: 'z'.repeat(2_000) } as never,
  };
}

/** Count JSON.stringify calls by the size of what they produced. */
function countingStringify<T>(fn: () => T): { out: T; whole: number; small: number } {
  const orig = JSON.stringify;
  let whole = 0;
  let small = 0;
  const spy = ((...args: Parameters<typeof JSON.stringify>) => {
    const s = orig.apply(JSON, args as never) as string;
    if ((s?.length ?? 0) > 100_000) whole += 1; else small += 1;
    return s;
  }) as typeof JSON.stringify;
  JSON.stringify = spy;
  try { return { out: fn(), whole, small }; } finally { JSON.stringify = orig; }
}

describe('OTA-1702 — the trim measures once', () => {
  it('⚠⚠ 838 rooms over budget: a handful of whole-blob measures, not one per room', () => {
    // The sweep's shape: the un-trimmable player record is most of the budget,
    // so stripping tables is not enough and pass 2 has to drop rooms.
    const state = sweepState(838, 600_000);
    const before = JSON.stringify(state).length;
    expect(before).toBeGreaterThan(SAFE_BLOB_CHARS);
    const { out: r, whole } = countingStringify(() => trimSaveStateToFit(state));
    expect(r.trimmed).toBe(true);
    expect(r.charsAfter).toBeLessThanOrEqual(SAFE_BLOB_CHARS);
    expect(JSON.stringify(r.state).length).toBe(r.charsAfter);
    // charsBefore + one confirm per pass entered + the result's own measure.
    expect(whole).toBeLessThanOrEqual(8);
    expect(r.roomsDropped).toBeGreaterThan(0);
  });

  it('drops the oldest rooms first, never one holding dropped items, and stops as soon as it fits', () => {
    const state = sweepState(400, 700_000);
    const r = trimSaveStateToFit(state);
    const kept = r.state.worldMemory.visitedRooms!;
    expect(kept['loc_keep:room:0,0']?.droppedItems?.length).toBe(2);
    // Everything dropped is older than everything kept (the keep-room aside).
    const keptTimes = Object.entries(kept).filter(([k]) => k !== 'loc_keep:room:0,0').map(([, v]) => v.lastVisitAt);
    const droppedTimes = Object.entries(state.worldMemory.visitedRooms!).filter(([k]) => !kept[k]).map(([, v]) => v.lastVisitAt);
    expect(Math.max(...droppedTimes)).toBeLessThan(Math.min(...keptTimes));
    // And it did not over-trim: putting the newest dropped room back would not fit.
    const newestDropped = Object.entries(state.worldMemory.visitedRooms!).filter(([k]) => !kept[k]).sort((a, b) => b[1].lastVisitAt - a[1].lastVisitAt)[0]!;
    const restored = { ...r.state, worldMemory: { ...r.state.worldMemory, visitedRooms: { ...kept, [newestDropped[0]]: newestDropped[1] } } };
    expect(JSON.stringify(restored).length).toBeGreaterThan(SAFE_BLOB_CHARS);
  });

  it('the estimate never lets an over-budget blob through: charsAfter is a real measure', () => {
    // Small budgets exercise the pass boundaries where the running estimate
    // hands back to the real measure.
    for (const budget of [900_000, 850_000, 700_000, 500_000]) {
      const state = sweepState(300, 450_000);
      const r = trimSaveStateToFit(state, budget);
      if (r.trimmed) {
        expect(JSON.stringify(r.state).length).toBe(r.charsAfter);
        // Fits, or every shed passed and the blob is as small as the passes can make it.
        if (r.charsAfter > budget) expect(r.sceneDropped).toBe(true);
      }
    }
  });

  it('a within-budget save is untouched and measured exactly once', () => {
    const state = sweepState(50, 10_000);
    const { out: r, whole, small } = countingStringify(() => trimSaveStateToFit(state));
    expect(r.trimmed).toBe(false);
    expect(r.state).toBe(state);
    expect(whole + small).toBe(1);
  });

  it('the persist path still trims through this function, and the passes keep their order', () => {
    expect(src('app', 'state', 'slices', 'persistSlice.ts').includes('const trim = trimSaveStateToFit(pruned.state);')).toBe(true);
    const t = src('app', 'engine', 'saveTrim.ts');
    expect(t.includes('const measure = (): number => { est = size(); return est; };')).toBe(true);
    expect(t.indexOf('// Pass 1')).toBeLessThan(t.indexOf('// Pass 2'));
    expect(t.indexOf('// Pass 2')).toBeLessThan(t.indexOf('// Pass 3'));
    expect(t.indexOf('// Pass 3')).toBeLessThan(t.indexOf('// Pass 4'));
    // No pass measures the whole blob per room any more.
    expect(/for \(const k of oldestFirst\) \{\s*\n\s*if \(size\(\) <= maxChars\)/.test(t)).toBe(false);
  });
});
