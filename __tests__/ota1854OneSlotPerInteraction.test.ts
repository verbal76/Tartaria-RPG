/**
 * ⚠⚠⚠ OTA-1854 — ONE NATIVE SLOT PER INTERACTION.
 *
 * THE MEASUREMENT THAT FORCED THIS. OTA-1853's instrument reached Apple
 * hardware and worked: the 2026-09-19 capture printed `Samples (last 512 of
 * 512)` and nine DATED RETAINED footprint steps in the new vocabulary. Eight of
 * those nine steps printed "(no annotated events inside this step)" — because
 * the same report printed `events 1685` against a native ring that holds 64.
 * A ~26× overrun. The join was never broken; it was starved, and the touch
 * trace is what ate it.
 *
 * Build 190 put FOUR corners of every touch into that ring — root, enter,
 * dispatch, done — and the four were never four: `root` fires from the app
 * root's capture on every finger-down INCLUDING a browsing tap that reaches no
 * control, and `dispatch` is written twice by the deferred submit. An ordinary
 * interaction cost four to six of the sixty-four slots, and a scroll cost one
 * for nothing.
 *
 * WHAT THIS SUITE HOLDS:
 *   §A  one completed interaction consumes EXACTLY ONE native slot, it is
 *       T5_DONE, and it carries that interaction's own id as its code
 *   §B  the JS trace is untouched — every stage, every field, same order
 *   §C  many interactions stay at one slot each, including the two shapes that
 *       write `done` twice for one id and the one that dispatches twice
 *   §D  the OTA-1853 subsystem marks still reach the door, and annotation is
 *       not globally switched off
 *   §E  the table and the guard are bounded in source
 *
 * ⚠ THE RECORDER IS MOCKED, NOT THE DECISION — the same discipline as OTA-1853's
 * suites. `annotateMemory` is the only thing replaced; MEM_KIND, memCodeForId
 * and every threshold are the real exported ones, so a renamed kind fails here
 * rather than sliding past a stubbed copy of itself.
 */

// ⚠ The house mock — touchPath snapshots its ring to AsyncStorage, and the real
// module needs a native side no jest environment has.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const calls: Array<{ kind: number; code: number }> = [];

jest.mock('../app/diagnostics/nativeMemoryRecorder', () => {
  const actual = jest.requireActual('../app/diagnostics/nativeMemoryRecorder');
  return {
    ...actual,
    annotateMemory: (kind: number, code = 0) => { calls.push({ kind, code }); },
  };
});

import fs from 'fs';
import path from 'path';
import { MEM_KIND, memCodeForId } from '../app/diagnostics/nativeMemoryRecorder';
import {
  NATIVE_ANNOTATED_MAX,
  noteRootTouch,
  notePressIn,
  noteHandlerEnter,
  noteStage,
  peekTouchPath,
  setTouchPathContext,
  _resetTouchPathForTest,
} from '../app/diagnostics/touchPath';
import {
  onStoreChange, stopSubsystemMemoryMarks,
  markArtworkMount, markArtworkUnmount,
} from '../app/diagnostics/subsystemMemoryMarks';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/** The four kinds this repair governs. Everything else in the ring is another
 *  instrument's and must not be affected by anything here. */
const TOUCH_KINDS: readonly number[] = [
  MEM_KIND.T0_ROOT_TOUCH,
  MEM_KIND.T2_HANDLER_ENTER,
  MEM_KIND.T4_DISPATCH,
  MEM_KIND.T5_DONE,
];

const touchEvents = (): Array<{ kind: number; code: number }> =>
  calls.filter((c) => TOUCH_KINDS.includes(c.kind));

/**
 * ⚠ THE WHOLE ORDINARY INTERACTION, in the order production writes it — the
 * shape shared by the quick keys, travel, gather, climb, search and equip. It
 * is written out rather than abbreviated because the claim under test is about
 * how many slots the WHOLE chain costs, and an abbreviated chain would prove a
 * smaller thing than the one that matters.
 */
function ordinaryInteraction(control: string, reason: string): number {
  noteRootTouch('root');
  notePressIn(control);
  const id = noteHandlerEnter(control);
  noteStage(id, 'admit', { control, reason });
  noteStage(id, 'dispatch', { control, reason });
  noteStage(id, 'done', { control, reason });
  return id;
}

beforeEach(() => {
  calls.length = 0;
  _resetTouchPathForTest();
  stopSubsystemMemoryMarks();
});

// ───────────────────────────────────────────────────────────────────────────
// §A — ONE SLOT, AND IT IS THE ONE THAT PROVES THE WORK FINISHED
// ───────────────────────────────────────────────────────────────────────────

describe('§A one completed interaction, one native slot', () => {
  it('A1 spends EXACTLY ONE native memory-event slot', () => {
    ordinaryInteraction('quick:DODGE', 'callback');
    expect(touchEvents()).toHaveLength(1);
  });

  it('A2 the one slot is T5_DONE — the only corner that proves completion', () => {
    ordinaryInteraction('quick:DODGE', 'callback');
    expect(touchEvents()[0]!.kind).toBe(MEM_KIND.T5_DONE);
  });

  it('A3 it carries that interaction\'s own id, so the JS join still works', () => {
    const id = ordinaryInteraction('travel:NORTH', 'navigation');
    expect(touchEvents()[0]!.code).toBe(id & 0xffff);
    // ⚠ And the id is really the one the JS trace filed the stages under —
    // a code that matched nothing would be a join that silently reads empty.
    const done = peekTouchPath().filter((e) => e.st === 'done');
    expect(done).toHaveLength(1);
    expect(done[0]!.i).toBe(id);
  });

  it('A4 root, in, enter, admit and dispatch reach the ring ZERO times', () => {
    ordinaryInteraction('gather:reeds', 'take');
    for (const kind of [MEM_KIND.T0_ROOT_TOUCH, MEM_KIND.T2_HANDLER_ENTER, MEM_KIND.T4_DISPATCH]) {
      expect(calls.filter((c) => c.kind === kind)).toHaveLength(0);
    }
  });

  it('A5 a BROWSING touch — root with no handler behind it — costs nothing', () => {
    // ⚠⚠ THE SILENT MAJORITY, and the reason `root` could not be the survivor.
    // Every finger-down on the transcript reaches the app root's capture.
    // OTA-1818 MEASURED healthy root-only entries in ordinary play; under Build
    // 190 each of them spent a slot to say nothing.
    for (let k = 0; k < 20; k++) noteRootTouch('root');
    expect(touchEvents()).toHaveLength(0);
  });

  it('A6 an interaction the app REFUSES costs nothing either', () => {
    // A refusal allocated nothing, so it has nothing to attribute. The refusal
    // itself is still in the JS trace, which is where a reader looks for it.
    noteRootTouch('root');
    notePressIn('travel:NORTH');
    const id = noteHandlerEnter('travel:NORTH');
    noteStage(id, 'reject', { control: 'travel:NORTH', reason: 'stamina-spent' });
    expect(touchEvents()).toHaveLength(0);
    expect(peekTouchPath().some((e) => e.st === 'reject' && e.r === 'stamina-spent')).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §B — THE JS TRACE IS UNTOUCHED
// ───────────────────────────────────────────────────────────────────────────

describe('§B the JS touch trace keeps every stage and every field', () => {
  it('B1 all six stages of the interaction are still recorded, in order', () => {
    setTouchPathContext({ screen: 'exploration', presentation: 'none', appState: 'active' });
    ordinaryInteraction('quick:DODGE', 'callback');
    expect(peekTouchPath().map((e) => e.st))
      .toEqual(['root', 'in', 'enter', 'admit', 'dispatch', 'done']);
  });

  it('B2 the stages that LOST their native slot keep every byte in JS', () => {
    setTouchPathContext({ screen: 'exploration', presentation: 'none', appState: 'active' });
    const id = ordinaryInteraction('quick:DODGE', 'callback');
    const byStage = (st: string) => peekTouchPath().find((e) => e.st === st)!;

    // root — arrival, with the context that dates and places it
    expect(byStage('root').i).toBe(id);
    expect(byStage('root').sc).toBe('exploration');
    expect(byStage('root').p).toBe('none');
    expect(byStage('root').a).toBe('active');

    // enter — the control's own name, which the native code never carried
    expect(byStage('enter').c).toBe('quick:DODGE');
    expect(byStage('enter').i).toBe(id);

    // dispatch — the operation KIND, which the native code never carried either
    expect(byStage('dispatch').c).toBe('quick:DODGE');
    expect(byStage('dispatch').r).toBe('callback');
    expect(byStage('dispatch').i).toBe(id);
  });

  it('B3 one physical touch is still ONE id from root through done', () => {
    const id = ordinaryInteraction('gather:reeds', 'take');
    const ids = new Set(peekTouchPath().map((e) => e.i));
    expect(ids).toEqual(new Set([id]));
  });

  it('B4 the orphan finding still survives — it is evidence, not noise', () => {
    const id = noteHandlerEnter('quick:DODGE');
    expect(peekTouchPath().find((e) => e.st === 'enter')!.o).toBe(true);
    noteStage(id, 'done', { control: 'quick:DODGE', reason: 'callback' });
    expect(touchEvents()).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §C — MANY INTERACTIONS, AND THE THREE SHAPES THAT WOULD HAVE BEATEN A
//      SIMPLER GUARD
// ───────────────────────────────────────────────────────────────────────────

describe('§C the budget holds across real interaction shapes', () => {
  it('C1 three interactions spend three slots, one each, with distinct codes', () => {
    const a = ordinaryInteraction('quick:DODGE', 'callback');
    const b = ordinaryInteraction('travel:NORTH', 'navigation');
    const c = ordinaryInteraction('gather:reeds', 'take');
    const ev = touchEvents();
    expect(ev).toHaveLength(3);
    expect(ev.map((e) => e.code)).toEqual([a & 0xffff, b & 0xffff, c & 0xffff]);
    expect(ev.every((e) => e.kind === MEM_KIND.T5_DONE)).toBe(true);
  });

  it('C2 fifty interactions fit inside a ring that holds sixty-four', () => {
    // ⚠⚠ THE WHOLE POINT, STATED AS A NUMBER. Under Build 190 the same fifty
    // taps wrote at least two hundred events and the ring kept the last
    // sixty-four of them — which is how eight dated retained steps came back
    // empty. The claim is NOT that sixty-four is generous; it is that a run of
    // ordinary play no longer evicts the rare annotation the ring exists for.
    for (let k = 0; k < 50; k++) ordinaryInteraction(`quick:K${k}`, 'callback');
    expect(touchEvents()).toHaveLength(50);
    expect(touchEvents().length).toBeLessThanOrEqual(64);
  });

  it('C3 the DEFERRED SUBMIT dispatches twice and still spends one slot', () => {
    // ExplorationScreen arms the delayed submit, then fires it — two `dispatch`
    // stages under one id. This is why `dispatch` could not be the survivor.
    noteRootTouch('root');
    notePressIn('sheet:submit');
    const id = noteHandlerEnter('sheet:submit');
    noteStage(id, 'dispatch', { control: 'sheet:deferred', reason: 'delayed-submit-armed' });
    noteStage(id, 'dispatch', { control: 'sheet:deferred', reason: 'delayed-submit-fired' });
    noteStage(id, 'done', { control: 'sheet:deferred', reason: 'submitted' });
    expect(touchEvents()).toHaveLength(1);
    expect(peekTouchPath().filter((e) => e.st === 'dispatch')).toHaveLength(2);
  });

  it('C4 the REPORT SEND writes `done` twice for one id and still spends one', () => {
    // ⚠⚠ THE SHAPE A SINGLE-SLOT GUARD WOULD HAVE MISSED. BugReportModal writes
    // `done` when the composer hands the send on; AboutScreen writes `done`
    // again for the SAME captured id when the promise settles seconds later —
    // and the player can tap several more times in between.
    noteRootTouch('root');
    notePressIn('report:send');
    const send = noteHandlerEnter('report:send');
    noteStage(send, 'dispatch', { control: 'report:send', reason: 'compose' });
    noteStage(send, 'done', { control: 'report:send', reason: 'handed-off' });
    ordinaryInteraction('quick:A', 'callback');
    ordinaryInteraction('quick:B', 'callback');
    ordinaryInteraction('quick:C', 'callback');
    noteStage(send, 'admit', { control: 'report:send', reason: 'sent' });
    noteStage(send, 'done', { control: 'report:send', reason: 'resolved' });

    expect(touchEvents().filter((e) => e.code === (send & 0xffff))).toHaveLength(1);
    expect(touchEvents()).toHaveLength(4);
    // Both `done` stages are still in the JS trace — nothing was suppressed
    // there, only the second native slot was not spent.
    expect(peekTouchPath().filter((e) => e.i === send && e.st === 'done')).toHaveLength(2);
  });

  it('C5 the guard is a RING, and an evicted id falls back to the old cost', () => {
    // ⚠ An honest statement of the bound. Past NATIVE_ANNOTATED_MAX intervening
    // interactions a re-used id can spend a second slot — which is Build 190's
    // behaviour for that one event, never a WRONG event. The test states the
    // bound rather than pretending the ring is infinite.
    noteRootTouch('root');
    notePressIn('report:send');
    const send = noteHandlerEnter('report:send');
    noteStage(send, 'done', { control: 'report:send', reason: 'handed-off' });
    for (let k = 0; k < NATIVE_ANNOTATED_MAX; k++) ordinaryInteraction(`quick:K${k}`, 'callback');
    noteStage(send, 'done', { control: 'report:send', reason: 'resolved' });
    expect(touchEvents().filter((e) => e.code === (send & 0xffff))).toHaveLength(2);
    expect(touchEvents().every((e) => e.kind === MEM_KIND.T5_DONE)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §D — THE OTA-1853 MARKS ARE UNTOUCHED, AND THE DOOR IS NOT SHUT
// ───────────────────────────────────────────────────────────────────────────

describe('§D nothing else lost its voice', () => {
  const state = (loc: string) => ({
    player: { currentLocationId: loc, hubRoomId: null },
    screen: 'exploration',
    currentScene: null,
  });

  it('D1 the OTA-1853 room marks still reach annotateMemory', () => {
    onStoreChange(state('tile_a') as never);
    onStoreChange(state('tile_b') as never);
    const kinds = calls.map((c) => c.kind);
    expect(kinds).toContain(MEM_KIND.ROOM_ENTER);
    expect(kinds).toContain(MEM_KIND.ROOM_EXIT);
    // ⚠ The observer hashes the COMPOSED place key, not the bare id — its own
    // `placeKey(locationId, hubRoomId)`. Asserting the bare id here would pass
    // only by accident and would pin the wrong contract.
    expect(calls.some((c) => c.kind === MEM_KIND.ROOM_ENTER && c.code === memCodeForId('loc:tile_b')))
      .toBe(true);
  });

  it('D2 the OTA-1853 artwork marks still reach annotateMemory', () => {
    markArtworkMount('race:asgardar');
    markArtworkUnmount('race:asgardar');
    const kinds = calls.map((c) => c.kind);
    expect(kinds).toContain(MEM_KIND.ARTWORK_MOUNT);
    expect(kinds).toContain(MEM_KIND.ARTWORK_UNMOUNT);
  });

  it('D3 annotation is NOT globally disabled — subsystem and touch share a run', () => {
    // ⚠ The failure mode this repair could most plausibly have introduced is
    // "the door got shut", which would look like success on every count above.
    // One run, both voices.
    onStoreChange(state('tile_a') as never);
    onStoreChange(state('tile_b') as never);
    ordinaryInteraction('quick:DODGE', 'callback');
    expect(calls.some((c) => c.kind === MEM_KIND.ROOM_ENTER)).toBe(true);
    expect(calls.some((c) => c.kind === MEM_KIND.T5_DONE)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §E — THE SOURCE SAYS SO
// ───────────────────────────────────────────────────────────────────────────

describe('§E the table and the guard are bounded in source', () => {
  it('E1 exactly one stage is in the native table', () => {
    const src = read('app', 'diagnostics', 'touchPath.ts');
    const table = src.slice(
      src.indexOf('const NATIVE_STAGE_KIND'),
      src.indexOf('export const NATIVE_ANNOTATED_MAX'),
    );
    expect(table).toContain('done: MEM_KIND.T5_DONE');
    for (const gone of ['root:', 'modal:', 'in:', 'enter:', 'admit:', 'reject:', 'dispatch:']) {
      expect(table).not.toContain(gone);
    }
  });

  it('E2 the guard ring is bounded and small', () => {
    expect(NATIVE_ANNOTATED_MAX).toBeGreaterThan(0);
    expect(NATIVE_ANNOTATED_MAX).toBeLessThanOrEqual(16);
    const src = read('app', 'diagnostics', 'touchPath.ts');
    expect(src).toContain('if (nativeAnnotated.length > NATIVE_ANNOTATED_MAX) nativeAnnotated.shift();');
  });

  it('E3 the annotation still happens inside its own try, ahead of the JS append', () => {
    // The touch path is the older instrument and outranks this one; a throw
    // from the memory recorder must never cost a stage.
    const src = read('app', 'diagnostics', 'touchPath.ts');
    const body = src.slice(src.indexOf('function append('), src.indexOf('function schedulePersist('));
    expect(body.indexOf('annotateMemory(')).toBeLessThan(body.indexOf('const e: TouchPathEntry'));
    expect(body.match(/try \{/g) ?? []).toHaveLength(2);
  });
});
