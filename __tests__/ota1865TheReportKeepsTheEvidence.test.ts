/**
 * ⚠⚠⚠ OTA-1865 — THE REPORT MUST NOT ERASE THE EVIDENCE IT WAS SENT TO REPORT.
 *
 * OBSERVATIONAL TELEMETRY, AS OTA-1813/1814/1818/1864 WERE. Nothing here claims
 * a cause for any freeze, claims Freeze 2 is fixed, claims OTA-1863 effective,
 * or claims every freeze is now observable. It holds ONE contract: the touch
 * ring is deep enough to still contain an interaction of the age and event
 * volume that was actually measured on hardware.
 *
 * ⚠⚠ THE MEASUREMENT THIS SUITE IS BUILT ON, from bundle muc6fdza52j7 of
 * 2026-09-22 — the first real-device session carrying OTA-1864's guard ladder:
 *
 *     04:29:20.014  the CrucibleGuardModal is raised      → `pres react-mount`
 *     04:29:22.628  the player answers it (2.614s)        → `pres react-unmount`
 *     04:31:09.863  SEND LOG snapshots the ring           → 109.849s later
 *
 *     the ring at that snapshot: 24 entries, ids #411-#424, spanning 21.403s.
 *     NOT ONE of the guard's seven stages was in it. Six of the 24 survivors
 *     were spent by the act of reporting.
 *
 * ⚠⚠⚠ AND THE COUNT IS NOT AN ESTIMATE WHERE IT MATTERS. The dominant term is
 * 79 repeat dialogue taps, and their cost per tap — `root` + `content controls`
 * and nothing else, because that control carries no instrumented handler — was
 * READ OFF ids #411-#415 in the surviving tail of the very same report. The
 * replay below reproduces the session at that shape: 230 appends, 229 of them
 * after the ladder's first stage.
 *
 * ⚠ THE NEGATIVE CONTROL IS THE RECORDING ITSELF, NOT A MUTILATED SOURCE. The
 * ring is proven to be a strict count-bounded FIFO; therefore the last 24
 * entries of the replay ARE what a 24-deep ring would have held, and §C asks
 * whether the guard is in them. It is not. No production constant is patched,
 * substituted or re-imported to obtain that red.
 */
// ⚠ The house mock — touchPath snapshots its ring to AsyncStorage, and the real
// module needs a native side no jest environment has.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TOUCH_PATH_MAX_ENTRIES,
  TOUCH_PATH_MAX_FIELD,
  TOUCH_PATH_SCHEMA,
  noteRootTouch,
  noteContentTouch,
  notePressIn,
  noteHandlerEnter,
  noteStage,
  peekTouchPath,
  priorTouchPath,
  loadPriorTouchPath,
  touchPathLines,
  flushTouchPath,
  setTouchPathContext,
  _resetTouchPathForTest,
  _touchPathWriteState,
  type TouchPathEntry,
} from '../app/diagnostics/touchPath';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/** ⚠ THE MEASURED FLOOR. Ring appends between the guard ladder's FIRST stage
 *  and the report snapshot, in the real session:
 *      6   the rest of the ladder (root/modal, in, enter, dispatch, done, pres)
 *     18   3 craft submits through the instrumented InputBox, at 6 each
 *      8   an inventory round trip, at 4 each
 *     15   3 Crucible refusals, at 5 each
 *    158   79 repeat dialogue taps, at a MEASURED 2 each
 *     24   the browsing + report tail that actually survived
 *    ---
 *    229
 *  A capacity below this cannot hold that interaction. The conservative floor,
 *  counting only the three certain terms (6 + 158 + 24), is 188. */
const MEASURED_APPENDS_AFTER_THE_LADDER = 229;

/** ⚠ ENOUGH HISTORY, NOT INFINITE HISTORY. The upper bound is part of the
 *  contract: a later hand must not "fix" a future report by making the ring
 *  unbounded in practice. */
const DEPTH_CEILING = 512;

const GUARD = 'craft:crucible-guard';
const SPEND = 'guard:spend';

/* ── the replay, in the shapes production actually emits ──────────────────── */

/** OTA-1864's ladder, exactly as CrucibleGuardModal writes it: the React-layer
 *  presentation pair on `#0`, the modal capture, and the answered control's
 *  own in → enter → dispatch → done. Seven entries. */
function guardLadder(): void {
  noteStage(0, 'pres', { control: GUARD, reason: 'react-mount' });
  noteRootTouch('modal');
  notePressIn(SPEND);
  const tp = noteHandlerEnter(SPEND);
  noteStage(tp, 'dispatch', { control: SPEND });
  noteStage(tp, 'done', { control: SPEND });
  noteStage(0, 'pres', { control: GUARD, reason: 'react-unmount' });
}

/** A repeat dialogue tap. TWO entries, and that is measured, not assumed: the
 *  option carries no instrumented handler, so the chain stops at the region. */
function dialogueTap(): void {
  noteRootTouch('root');
  noteContentTouch('controls');
}

/** A typed submit through the instrumented InputBox. Six entries. */
function craftSubmit(): void {
  noteRootTouch('root');
  noteContentTouch('controls');
  notePressIn('input:send');
  const tp = noteHandlerEnter('input:send');
  noteStage(tp, 'dispatch', { control: 'input:send', reason: 'submit' });
  noteStage(tp, 'done', { control: 'input:send', reason: 'submit' });
}

/** A screen control whose handler ran and whose work is someone else's. Four. */
function screenTap(control: string): void {
  noteRootTouch('root');
  noteContentTouch('controls');
  notePressIn(control);
  noteHandlerEnter(control);
}

/** A source-proven refusal — the Crucible answering "costs 25 TC; you have 5".
 *  Five entries. */
function refusal(): void {
  noteRootTouch('root');
  noteContentTouch('controls');
  notePressIn('craft:fire');
  const tp = noteHandlerEnter('craft:fire');
  noteStage(tp, 'reject', { control: 'craft:fire', reason: 'tc' });
}

/** ⚠ THE TAIL THAT ACTUALLY SURVIVED, id for id, from the real bundle: five
 *  root+content taps, four bare roots, the three root/modal pairs of a report
 *  being opened, and the six SEND LOG stages that precede the snapshot. 24. */
function browsingAndReportTail(): void {
  for (let k = 0; k < 5; k++) dialogueTap();          // #411-#415 · 10
  for (let k = 0; k < 4; k++) noteRootTouch('root');  // #416-#419 ·  4
  noteRootTouch('modal');                             // #420      ·  1
  noteRootTouch('root');                              // #421      ·  1
  noteRootTouch('modal');                             // #422      ·  1
  noteRootTouch('root');                              // #423      ·  1
  // #424 — the send itself, up to and including the stage after which
  // buildBasicDeviceSummary() reads the ring. Six.
  noteRootTouch('modal');
  notePressIn('report:send');
  const tp = noteHandlerEnter('report:send');
  noteStage(tp, 'admit', { control: 'report:send', reason: 'described' });
  noteStage(tp, 'dispatch', { control: 'report:send', reason: 'described' });
  noteStage(tp, 'dispatch', { control: 'report:send', reason: 'compose' });
}

/** The whole session between the guard and the snapshot, in order. */
function replayTheSession(): void {
  guardLadder();
  craftSubmit();
  craftSubmit();
  craftSubmit();
  screenTap('inv:open');
  screenTap('inv:back');
  refusal();
  refusal();
  refusal();
  for (let k = 0; k < 79; k++) dialogueTap();
  browsingAndReportTail();
}

const isGuardStage = (e: TouchPathEntry): boolean =>
  e.c === GUARD || e.c === SPEND;

const settleWrites = async (): Promise<void> => {
  for (let k = 0; k < 8; k++) await Promise.resolve();
};

beforeEach(() => {
  _resetTouchPathForTest();
  setTouchPathContext({ screen: 'exploration', presentation: 'none', appState: 'active' });
});

afterEach(() => {
  // Clears the coalesce timer too, so no suite leaves a timer behind.
  _resetTouchPathForTest();
});

/* ══ A — THE NUMBER IS MEASURED, AND IT IS STILL A BOUND ═══════════════════ */

describe('A — the capacity is measured, not chosen', () => {
  it('is deep enough for the interaction that was actually lost', () => {
    expect(TOUCH_PATH_MAX_ENTRIES).toBeGreaterThanOrEqual(MEASURED_APPENDS_AFTER_THE_LADDER);
  });

  it('is still ENOUGH history rather than infinite history', () => {
    expect(TOUCH_PATH_MAX_ENTRIES).toBeLessThanOrEqual(DEPTH_CEILING);
  });

  /* ⚠ NO SOURCE-TEXT PINS HERE, DELIBERATELY. `check:quotedpins` is right: a
   *  pin that quotes a comment fails on a reword and passes on a deletion. The
   *  measurement lives in the constant above and is proven by §B, which drives
   *  the real session and asks whether the ladder survived it. */
  it('the cap is the one the ring actually enforces, not a documented intent', () => {
    for (let k = 0; k < TOUCH_PATH_MAX_ENTRIES + 1; k++) noteRootTouch('root');
    expect(peekTouchPath().length).toBe(TOUCH_PATH_MAX_ENTRIES);
  });

  it('eviction is oldest-first and costs one entry per append past the cap', () => {
    for (let k = 0; k < TOUCH_PATH_MAX_ENTRIES; k++) noteRootTouch('root');
    const before = peekTouchPath()[0]!.s;
    noteRootTouch('root');
    const after = peekTouchPath();
    expect(after.length).toBe(TOUCH_PATH_MAX_ENTRIES);
    expect(after[0]!.s).toBe(before + 1);
  });
});

/* ══ B — THE REAL SESSION, REPLAYED, KEEPS ITS LADDER ══════════════════════ */

describe('B — the OTA-1864 guard ladder survives to the snapshot', () => {
  it('the replay costs exactly what the hardware cost', () => {
    replayTheSession();
    const ring = peekTouchPath();
    expect(ring.length).toBe(MEASURED_APPENDS_AFTER_THE_LADDER + 1);
    // ...and it fits, which is the whole point.
    expect(ring.length).toBeLessThanOrEqual(TOUCH_PATH_MAX_ENTRIES);
  });

  it('all seven ladder stages are present, in the order production writes them', () => {
    replayTheSession();
    const ladder = peekTouchPath().filter(isGuardStage);
    expect(ladder.map((e) => `${e.st}${e.r ? `:${e.r}` : ''}`)).toEqual([
      'pres:react-mount',
      'in',
      'enter',
      'dispatch',
      'done',
      'pres:react-unmount',
    ]);
    // The modal capture rides the ladder too, on the interaction's own id.
    const answered = ladder.find((e) => e.st === 'enter')!;
    expect(peekTouchPath().some((e) => e.st === 'modal' && e.i === answered.i)).toBe(true);
  });

  it('the ladder is 229 appends old at the snapshot — the measured distance', () => {
    replayTheSession();
    const ring = peekTouchPath();
    const first = ring.findIndex(isGuardStage);
    expect(first).toBe(0);
    expect(ring.length - 1 - first).toBe(MEASURED_APPENDS_AFTER_THE_LADDER);
  });

  it('the evidence reaches the READER, not merely the ring', () => {
    replayTheSession();
    const lines = touchPathLines(peekTouchPath()).join('\n');
    expect(lines).toContain(`${GUARD} (react-mount)`);
    expect(lines).toContain(`${GUARD} (react-unmount)`);
    expect(lines).toContain(`in ${SPEND}`);
    expect(lines).toContain(`done ${SPEND}`);
  });
});

/* ══ C — THE NEGATIVE CONTROL: THE OLD DEPTH, ON THE SAME RECORDING ════════ */

describe('C — at the old capacity the same session retained nothing of it', () => {
  const OLD_CAPACITY = 24;

  it('the ring is a strict count-bounded FIFO, so its last N ARE the old ring', () => {
    for (let k = 0; k < TOUCH_PATH_MAX_ENTRIES + 40; k++) noteRootTouch('root');
    const ring = peekTouchPath();
    expect(ring.length).toBe(TOUCH_PATH_MAX_ENTRIES);
    // oldest dropped, newest kept, sequence contiguous
    const seqs = ring.map((e) => e.s);
    expect(seqs[0]).toBe(TOUCH_PATH_MAX_ENTRIES + 40 - TOUCH_PATH_MAX_ENTRIES + 1);
    expect(seqs[seqs.length - 1]).toBe(TOUCH_PATH_MAX_ENTRIES + 40);
    expect(seqs.every((s, i) => i === 0 || s === seqs[i - 1]! + 1)).toBe(true);
  });

  it('a 24-deep window over the real replay contains NO ladder stage', () => {
    replayTheSession();
    const wouldHaveSurvived = peekTouchPath().slice(-OLD_CAPACITY);
    expect(wouldHaveSurvived.length).toBe(OLD_CAPACITY);
    expect(wouldHaveSurvived.filter(isGuardStage)).toEqual([]);
  });

  it('and a quarter of that old window was spent by the act of reporting', () => {
    replayTheSession();
    const ring = peekTouchPath();
    const wouldHaveSurvived = ring.slice(-OLD_CAPACITY);
    // The send's own interaction: its modal capture plus its five named stages.
    const sendId = ring.find((e) => e.c === 'report:send')!.i;
    const reportOwn = wouldHaveSurvived.filter((e) => e.i === sendId);
    expect(reportOwn.map((e) => e.st)).toEqual([
      'modal', 'in', 'enter', 'admit', 'dispatch', 'dispatch',
    ]);
    expect(reportOwn.length / OLD_CAPACITY).toBeGreaterThan(0.2);
    // At the new depth the report's own cost is noise rather than a quarter.
    expect(reportOwn.length / TOUCH_PATH_MAX_ENTRIES).toBeLessThan(0.05);
  });
});

/* ══ D — STILL BOUNDED, AND OLD HISTORY STILL EXPIRES ═════════════════════ */

describe('D — depth is not permanence', () => {
  it('a full capacity of newer events does evict the ladder', () => {
    replayTheSession();
    expect(peekTouchPath().some(isGuardStage)).toBe(true);
    for (let k = 0; k < TOUCH_PATH_MAX_ENTRIES; k++) dialogueTap();
    expect(peekTouchPath().some(isGuardStage)).toBe(false);
  });

  it('the ring never exceeds its cap over a long session', () => {
    let worst = 0;
    for (let k = 0; k < TOUCH_PATH_MAX_ENTRIES * 4; k++) {
      dialogueTap();
      worst = Math.max(worst, peekTouchPath().length);
    }
    expect(worst).toBe(TOUCH_PATH_MAX_ENTRIES);
  });

  it('ordering survives the deeper ring — sequence is contiguous and increasing', () => {
    replayTheSession();
    const seqs = peekTouchPath().map((e) => e.s);
    expect(seqs.every((s, i) => i === 0 || s === seqs[i - 1]! + 1)).toBe(true);
  });
});

/* ══ E — THE PERSISTED COPY CARRIES THE SAME DEPTH, THE SAME WAY ══════════ */

describe('E — persistence keeps its shape and gains the depth', () => {
  it('the stored body holds the whole retained ring, ladder included', async () => {
    replayTheSession();
    // ⚠ THE ORDER IS THE STATE MACHINE'S, NOT A CONVENIENCE. A burst leaves the
    // leading snapshot in flight and everything after it merely `dirty`; the
    // stored copy only catches up once that write settles and the lifecycle
    // seam (or the coalesce) asks for the next one. Unchanged by this OTA.
    await settleWrites();
    flushTouchPath();
    await settleWrites();
    const raw = await AsyncStorage.getItem('@tartaria/touchPath');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { v: number; e: TouchPathEntry[] };
    expect(parsed.v).toBe(TOUCH_PATH_SCHEMA);
    expect(parsed.e.length).toBe(MEASURED_APPENDS_AFTER_THE_LADDER + 1);
    expect(parsed.e.some((e) => e.c === GUARD)).toBe(true);
  });

  it('still one write in flight, ever — the deeper body changes no timing rule', async () => {
    replayTheSession();
    const mid = _touchPathWriteState();
    expect(typeof mid.writing).toBe('boolean');
    // A burst can leave at most one write outstanding and at most one coalesce.
    expect([true, false]).toContain(mid.writing);
    await settleWrites();
    flushTouchPath();
    await settleWrites();
    const after = _touchPathWriteState();
    expect(after.writing).toBe(false);
  });

  it('the PRIOR boot — the force-close case — reaches the report at full depth', async () => {
    replayTheSession();
    await settleWrites();
    flushTouchPath();
    await settleWrites();
    // A force-close and a cold relaunch: the ring is gone, the file is not.
    _resetTouchPathForTest();
    expect(priorTouchPath()).toBeNull();
    const prior = await loadPriorTouchPath();
    expect(prior).not.toBeNull();
    expect(prior!.length).toBe(MEASURED_APPENDS_AFTER_THE_LADDER + 1);
    expect(prior!.some(isGuardStage)).toBe(true);
    expect(touchPathLines(prior!).join('\n')).toContain(`${GUARD} (react-mount)`);
  });
});

/* ══ F — INSTRUMENTATION ONLY ═════════════════════════════════════════════ */

describe('F — nothing but the instrument moved', () => {
  it('the touch path still reads no store and claims no responder', () => {
    const src = read('app', 'diagnostics', 'touchPath.ts');
    expect(src).not.toContain('gameStore');
    expect(src).not.toContain('setResponder');
  });

  it('a deeper ring is still a ring of BOUNDED entries, not just bounded count', () => {
    // Depth multiplies whatever one entry costs, so the per-field bound is part
    // of this OTA's cost claim: 256 × a clipped field, never 256 × free text.
    noteStage(1, 'in', { control: 'x'.repeat(200), reason: 'y'.repeat(200) });
    const e = peekTouchPath()[0]!;
    expect(e.c!.length).toBe(TOUCH_PATH_MAX_FIELD);
    expect(e.r!.length).toBe(TOUCH_PATH_MAX_FIELD);
  });

  it('the module still imports exactly the three things it always did', () => {
    // The repair is ONE constant. It must not have pulled in a behaviour-bearing
    // dependency — presentation handoff, crafting, the store — along the way.
    const src = read('app', 'diagnostics', 'touchPath.ts');
    const imports = [...src.matchAll(/^import .*? from '(.+?)';$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual([
      './nativeMemoryRecorder',
      './tapClock',
      '@react-native-async-storage/async-storage',
    ].sort());
  });

  /* ⚠ OTA-1866 — THE STAMP PIN THAT WAS HERE IS GONE, AND ITS REMOVAL IS THE
     CORRECTION OF A MISTAKE MADE IN THIS SUITE'S OWN FIRST DRAFT. It asserted
     `OTA_BUILD_ID === '2026-09-22-1865-...'`, which is true of exactly one
     commit and false of every commit after it — so it went red on the next
     OTA for no defect at all, which is the definition of a pin that reports
     noise. The repository already has an authority for this: `check:otastamp`
     ties the live stamp to the highest-numbered suite in `__tests__`, and it
     is a gate rather than a test, so it cannot rot. What THIS suite is for is
     retention depth, and §A asserts that against the measured floor. */
});
