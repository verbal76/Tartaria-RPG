/* ⚠⚠⚠ OTA-1853 — THE BOUNDARY SPEAKS, AND THE REPORT PRINTS THE JOIN.
 *
 * Baker #3's 2026-09-19 iPhone SE capture held seven retained memory steps and
 * thirteen room transitions inside the 49-second window that carried them, and
 * the forensic pass could attribute none of it: the event vocabulary had no
 * word for a room, a route, a scene or a roster, and nothing joined the steps
 * it did have to the events that sat inside them.
 *
 * Two repairs, both tested here:
 *   §G  the store observer turns state transitions into annotations — and is
 *       BOUNDED, because an instrument installed to find a holder must not
 *       become one.
 *   §H  the report composes the join itself, at compose time, and prints
 *       evidence rather than a verdict.
 *
 * ⚠ THE RECORDER IS MOCKED, NOT THE DECISION. `annotateMemory` is the only
 * thing replaced — every kind, code and threshold is the real exported one, so
 * a renamed kind or a changed threshold fails these tests rather than sliding
 * past a stubbed copy of itself.
 */

const calls: Array<{ kind: number; code: number }> = [];

jest.mock('../app/diagnostics/nativeMemoryRecorder', () => {
  const actual = jest.requireActual('../app/diagnostics/nativeMemoryRecorder');
  return {
    ...actual,
    annotateMemory: (kind: number, code = 0) => { calls.push({ kind, code }); },
  };
});

import { MEM_KIND, memCodeForId } from '../app/diagnostics/nativeMemoryRecorder';
import {
  onStoreChange, stopSubsystemMemoryMarks,
  markArtworkMount, markArtworkUnmount, markAudioPlayerCreate, markAudioPlayerDispose,
} from '../app/diagnostics/subsystemMemoryMarks';

beforeEach(() => {
  calls.length = 0;
  // ⚠ The observer holds last-seen values between calls by design — that is how
  // it reports a TRANSITION rather than a state. Every test starts from clean.
  stopSubsystemMemoryMarks();
});

/**
 * A store shape with only the fields the observer reads.
 *
 * ⚠ BARE `currentLocationId` ON PURPOSE — ota1484's named class "minimal
 * argument objects for pure predicates … not player state; coords would be
 * dead weight". `onStoreChange` is a pure function that reads the id as an
 * OPAQUE STRING and hashes it; it never resolves a cell, a coordinate or a
 * map frame. Spreading `placedAt` here would import world geometry into a
 * test about string identity and prove nothing about either.
 */
function state(opts: {
  loc?: string; hub?: string | null; screen?: string;
  scene?: { location?: { id: string }; enemies?: unknown[] } | null;
}) {
  return {
    player: { currentLocationId: opts.loc ?? 'tile_a', hubRoomId: opts.hub ?? null },
    currentScreen: opts.screen ?? 'game',
    currentScene: opts.scene === undefined ? null : opts.scene,
  };
}

const kinds = () => calls.map((c) => c.kind);
const of = (kind: number) => calls.filter((c) => c.kind === kind);

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1853 §G — the store observer names the boundary', () => {
  test('G1 the first state seen reports an ENTER with no dangling EXIT', () => {
    onStoreChange(state({ loc: 'outpost_gate' }));
    expect(of(MEM_KIND.ROOM_ENTER)).toHaveLength(1);
    expect(of(MEM_KIND.ROOM_EXIT)).toHaveLength(0);
    expect(of(MEM_KIND.ROOM_ENTER)[0]!.code).toBe(memCodeForId('loc:outpost_gate'));
  });

  /* ⚠ THE THIRTEEN CROSSINGS. The hub room, not the tile, is the boundary the
   * capture crossed thirteen times in 49 seconds; keying on the tile id alone
   * would have reported ONE transition and hidden the pattern underneath it. */
  test('G2 hub rooms inside one tile are thirteen distinct boundaries', () => {
    const rooms = ['gate', 'chapel', 'messhall', 'central', 'vault', 'workshop', 'lab',
      'annex', 'stair', 'pumps', 'yard', 'well', 'keep'];
    for (const r of rooms) onStoreChange(state({ loc: 'outpost', hub: r }));
    expect(of(MEM_KIND.ROOM_ENTER)).toHaveLength(13);
    expect(new Set(of(MEM_KIND.ROOM_ENTER).map((c) => c.code)).size).toBe(13);
  });

  test('G3 the EXIT names the room being LEFT, not the one being entered', () => {
    onStoreChange(state({ loc: 'outpost', hub: 'gate' }));
    calls.length = 0;
    onStoreChange(state({ loc: 'outpost', hub: 'chapel' }));
    expect(of(MEM_KIND.ROOM_EXIT)[0]!.code).toBe(memCodeForId('hub:gate'));
    expect(of(MEM_KIND.ROOM_ENTER)[0]!.code).toBe(memCodeForId('hub:chapel'));
  });

  /* ⚠ AN INSTRUMENT THAT FIRES ON EVERY STORE WRITE IS THE HOLDER. The store
   * publishes on every log line, every HP change, every tick. Only CHANGES may
   * reach the ring — 64 slots, and a chatty instrument evicts the rare event
   * that mattered, which is exactly how the last capture lost its evidence. */
  test('G4 an unchanged state emits nothing, a hundred times over', () => {
    onStoreChange(state({ loc: 'outpost', hub: 'gate' }));
    calls.length = 0;
    for (let i = 0; i < 100; i++) onStoreChange(state({ loc: 'outpost', hub: 'gate' }));
    expect(calls).toHaveLength(0);
  });

  test('G5 the screen boundary is reported separately from the room', () => {
    onStoreChange(state({ loc: 'outpost', screen: 'game' }));
    calls.length = 0;
    onStoreChange(state({ loc: 'outpost', screen: 'character' }));
    expect(kinds()).toContain(MEM_KIND.ROUTE_MOUNT);
    expect(kinds()).toContain(MEM_KIND.ROUTE_UNMOUNT);
    expect(kinds()).not.toContain(MEM_KIND.ROOM_ENTER);
  });

  /* ⚠ IDENTITY, NOT EQUALITY. A scene re-created with the same contents is a
   * new allocation, and whether the old one was let go is the open question. */
  test('G6 a scene rebuilt with identical contents is a new scene', () => {
    onStoreChange(state({ scene: { enemies: [] } }));
    calls.length = 0;
    onStoreChange(state({ scene: { enemies: [] } }));
    expect(kinds()).toContain(MEM_KIND.SCENE_CREATE);
    expect(kinds()).toContain(MEM_KIND.SCENE_DISPOSE);
  });

  /* ⚠ THE SEVEN `roster=new` EVENTS the capture logged and could not price. */
  test('G7 a roster reports its own size and the running entity total', () => {
    const scene = { enemies: [1, 2, 3] };
    onStoreChange(state({ scene }));
    expect(of(MEM_KIND.ROSTER_CREATE)[0]!.code).toBe(3);
    expect(of(MEM_KIND.ENTITY_RETAINED_COUNT)[0]!.code).toBe(3);
    onStoreChange(state({ scene: { enemies: [1, 2] } }));
    expect(of(MEM_KIND.ROSTER_DISPOSE)[0]!.code).toBe(3);
    expect(of(MEM_KIND.ENTITY_RETAINED_COUNT)[1]!.code).toBe(5);
  });

  test('G8 an empty roster reports the create but adds no entities', () => {
    onStoreChange(state({ scene: { enemies: [] } }));
    expect(of(MEM_KIND.ROSTER_CREATE)[0]!.code).toBe(0);
    expect(of(MEM_KIND.ENTITY_RETAINED_COUNT)).toHaveLength(0);
  });

  /* ⚠ BOUNDEDNESS, MEASURED. Five hundred crossings must not produce five
   * hundred bookkeeping events on top of the crossings themselves. */
  test('G9 the running room total is reported every eighth crossing, not every one', () => {
    for (let i = 0; i < 80; i++) onStoreChange(state({ loc: 'outpost', hub: `room_${i}` }));
    expect(of(MEM_KIND.ROOM_ENTER)).toHaveLength(80);
    expect(of(MEM_KIND.ROOM_RETAINED_COUNT)).toHaveLength(10);
  });

  test('G10 every code the observer emits fits the native 16-bit field', () => {
    for (let i = 0; i < 300; i++) {
      onStoreChange(state({ loc: `tile_${i}`, hub: `room_${i}`, screen: `s${i}`,
        scene: { enemies: new Array(i % 9).fill(0) } }));
    }
    for (const c of calls) {
      expect(Number.isInteger(c.code)).toBe(true);
      expect(c.code).toBeGreaterThanOrEqual(0);
      expect(c.code).toBeLessThanOrEqual(0xffff);
    }
  });

  /* ⚠ AN INSTRUMENT NEVER BREAKS ITS HOST. Every one of these shapes is
   * reachable — a pre-hydrate store has no player, and a torn-down one has no
   * scene. None of them may throw into the caller's render or action path.
   *
   * ⚠ BARE `currentLocationId: 7` ON PURPOSE — ota1484's named class "minimal
   * argument objects for pure predicates". A NUMBER where an id belongs is the
   * subject of this case: the observer must coerce it and carry on rather than
   * throw. `placedAt` could not express it, because the whole point is that the
   * value is malformed. */
  test('G11 malformed, empty and absent state are all safe', () => {
    for (const s of [undefined, null, {}, { player: null }, { player: {} },
      { currentScene: {} }, { currentScene: { enemies: null } },
      { player: { currentLocationId: 7 }, currentScreen: 9 }]) {
      expect(() => onStoreChange(s)).not.toThrow();
    }
  });

  test('G12 stop() forgets the last-seen values so a later start is clean', () => {
    onStoreChange(state({ loc: 'outpost', hub: 'gate' }));
    stopSubsystemMemoryMarks();
    calls.length = 0;
    onStoreChange(state({ loc: 'outpost', hub: 'gate' }));
    // ⚠ An ENTER with no EXIT: the instrument is not claiming to have seen a
    // transition it was switched off for.
    expect(of(MEM_KIND.ROOM_ENTER)).toHaveLength(1);
    expect(of(MEM_KIND.ROOM_EXIT)).toHaveLength(0);
  });

  test('G13 the seam marks carry the right kinds and bounded codes', () => {
    markArtworkMount('art_relic_vault', 3);
    markArtworkUnmount('art_relic_vault', 2);
    markAudioPlayerCreate('track_outpost');
    markAudioPlayerDispose('track_outpost');
    expect(kinds()).toEqual([
      MEM_KIND.ARTWORK_MOUNT, MEM_KIND.ARTWORK_MOUNTED_COUNT,
      MEM_KIND.ARTWORK_UNMOUNT, MEM_KIND.ARTWORK_MOUNTED_COUNT,
      MEM_KIND.AUDIO_PLAYER_CREATE, MEM_KIND.AUDIO_PLAYER_DISPOSE,
    ]);
    expect(of(MEM_KIND.ARTWORK_MOUNT)[0]!.code).toBe(memCodeForId('art_relic_vault'));
    expect(of(MEM_KIND.AUDIO_PLAYER_CREATE)[0]!.code).toBe(memCodeForId('track_outpost'));
  });
});
