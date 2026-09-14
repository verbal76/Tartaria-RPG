/**
 * ⚠⚠⚠ OTA-1813 — THE TAP SAYS HOW FAR IT GOT.
 *
 * OBSERVATIONAL TELEMETRY. This suite proves an INSTRUMENT, not a repair, and
 * nothing here claims a cause for either Build 189 freeze. What it holds is the
 * contract that makes the instrument's answer trustworthy when a device finally
 * reproduces the fault:
 *
 *   1. the root observer exists and NEVER claims the responder
 *   2. every native-<Modal> reproduction sheet has its own observer — proven
 *      necessary, because <Modal> content is not in the screen's tree
 *   3. one physical touch is ONE id from root through done
 *   4. a handler with no root touch behind it says `orphan`, honestly
 *   5. `reject` appears only where source proves a real handler refusal
 *   6. every structure is bounded — ring, claim queue, string fields
 *   7. persistence never has two writes in flight and never loops
 *   8. the deferred submit records armed AND fired, so a lost tap is legible
 *   9. the prior boot's trace reaches the report, because the freeze ends in a
 *      force-close and the boot that reports is never the boot that froze
 *
 * ⚠⚠ AND THE THING THIS SUITE IS MOST FOR: §5. An instrument that invents a
 * refusal where the app merely went quiet would answer the question WRONG, in
 * the confident direction. A disabled control that correctly never runs its
 * handler has not refused anything, and the tests below say so by counting.
 */
// ⚠ The house mock — touchPath snapshots its ring to AsyncStorage, and the real
// module needs a native side no jest environment has.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import fs from 'fs';
import path from 'path';
import { blockAt, between } from '../test-utils/srcBlock';
import {
  TOUCH_PATH_MAX_ENTRIES,
  TOUCH_PENDING_MAX,
  TOUCH_CLAIM_MAX_AGE_MS,
  TOUCH_PATH_MAX_FIELD,
  noteRootTouch,
  notePressIn,
  noteHandlerEnter,
  noteStage,
  currentTouchId,
  peekTouchPath,
  touchPathLines,
  resetTouchCorrelation,
  setTouchPathContext,
  _resetTouchPathForTest,
  _touchPathWriteState,
} from '../app/diagnostics/touchPath';
import { resetTapClock, takeTouchLateSuffix } from '../app/diagnostics/tapClock';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const TOUCH_PATH = read('app', 'diagnostics', 'touchPath.ts');
const EXPLORATION = read('app', 'screens', 'ExplorationScreen.tsx');
const INPUT_BOX = read('app', 'components', 'InputBox.tsx');
const SEARCH = read('app', 'components', 'SearchModal.tsx');
const GATHER = read('app', 'components', 'GatherModal.tsx');
const CLIMB = read('app', 'components', 'ClimbModal.tsx');
const ABOUT_SUMMARY = read('app', 'diagnostics', 'aboutSummary.ts');
const APP = read('App.tsx');

const MODALS: ReadonlyArray<readonly [string, string]> = [
  ['SearchModal', SEARCH],
  ['GatherModal', GATHER],
  ['ClimbModal', CLIMB],
];

beforeEach(() => { _resetTouchPathForTest(); resetTapClock(); });
afterEach(() => { _resetTouchPathForTest(); });

const stages = (): string[] => peekTouchPath().map((e) => e.st);
const ids = (): number[] => peekTouchPath().map((e) => e.i);

// ═══ 1. THE ROOT OBSERVER NEVER CLAIMS THE RESPONDER ═════════════════════════
describe('OTA-1813 §1 — T0 observes and takes nothing', () => {
  /* ⚠⚠⚠ THE LOAD-BEARING ASSERTION OF THE WHOLE OTA. Capture-phase responder
   * negotiation asks every view on the way down whether it wants the gesture.
   * Answering TRUE here would steal every touch in Exploration from the control
   * the player actually pressed — an instrument that breaks the thing it
   * measures, and the single worst outcome this change could have. The `false`
   * is the safety property, so it is pinned inside the handler's own block. */
  /* ⚠⚠⚠ OTA-1818 — THE WINDOW IS THE HANDLER, NOT THE SUBTREE UNDER IT. These two
   * assertions used to take their text from `blockAt(..., 'opener')`, which walks
   * braces from the prop's own `{` until they balance — and in JSX that is the
   * whole ELEMENT, children included. MEASURED on this file: the root observer's
   * window ran 3,052 characters and the controls host's ran 29,714, swallowing an
   * unrelated `.filter((n) => { … return true; })` noun predicate 290 lines below.
   * The claim was never wrong; the window was, and it only ever passed because the
   * first subtree happened to contain no `return true`.
   *
   * ⚠⚠ THIS IS STRICTER, NOT LOOSER. `CAPTURE_HANDLER` matches the arrow body and
   * nothing else, and `[^{}]*` additionally PINS that a capture handler stays a
   * flat one-liner — a nested block in one would now fail to match at all rather
   * than quietly widening the window again. */
  const CAPTURE_HANDLER = /onStartShouldSetResponderCapture=\{\(\) => \{([^{}]*)\}\}/g;

  it('the Exploration root capture handler returns false', () => {
    const m = new RegExp(CAPTURE_HANDLER.source).exec(EXPLORATION);
    expect(m).not.toBeNull();
    const handler = m![1]!;
    expect(handler).toContain('noteRootTouch');
    expect(handler).toMatch(/return\s+false\s*;/);
    expect(handler).not.toMatch(/return\s+true\b/);
  });

  it('no capture handler anywhere in this OTA returns true', () => {
    for (const [name, src] of [['ExplorationScreen', EXPLORATION] as const, ...MODALS]) {
      // ⚠ Every opener must ALSO match the precise handler shape — an opener that
      // no longer closes as a flat `{() => { … }}` is itself a failure, not a skip.
      const openers = [...src.matchAll(/onStartShouldSetResponderCapture=\{\(\) => \{/g)];
      const handlers = [...src.matchAll(new RegExp(CAPTURE_HANDLER.source, 'g'))];
      expect(openers.length).toBeGreaterThan(0);
      expect(`${name}: ${handlers.length}`).toBe(`${name}: ${openers.length}`);
      for (const m of handlers) {
        const body = m[1]!;
        expect(`${name}: ${body}`).toMatch(/return\s+false\s*;/);
        expect(`${name}: ${body}`).not.toMatch(/return\s+true\b/);
      }
    }
  });

  /* ⚠ THE OTHER HALF OF "OBSERVES AND TAKES NOTHING": the observer must not be
   * able to reach React state or the store from the touch path. A setState here
   * would re-render the screen on every finger-down — a cost added to the exact
   * path under investigation. */
  it('the root handler touches no state and wakes no store subscriber', () => {
    const handler = blockAt(
      EXPLORATION,
      'onStartShouldSetResponderCapture={() => {',
      { mode: 'opener' },
    );
    expect(handler).not.toMatch(/\bset[A-Z]\w*\(/);
    expect(handler).not.toMatch(/useGameStore/);
  });
});

// ═══ 2. THE MODAL ROOTS — PROVEN NECESSARY, NOT ASSUMED ══════════════════════
describe('OTA-1813 §2 — MODAL_TOUCH on the reproduction sheets', () => {
  /* ⚠⚠ THE CONDITION THE OTA WAS TOLD TO PROVE BEFORE ACTING ON IT. All three
   * sheets are presented by a native <Modal>, whose content is hosted OUTSIDE
   * the Exploration tree — so the T0 observer cannot see a touch that lands on
   * them. If this ever stops being true the observers become redundant rather
   * than wrong, and this test is where that shows up. */
  it('all three reproduction sheets are native <Modal> presentations', () => {
    for (const [name, src] of MODALS) {
      const rnImport = between(src, "import {", "} from 'react-native';");
      expect(`${name} imports Modal: ${/\bModal\b/.test(rnImport)}`)
        .toBe(`${name} imports Modal: true`);
      expect(`${name} presents one: ${/<Modal\b/.test(src)}`)
        .toBe(`${name} presents one: true`);
    }
  });

  it('each one carries its own observer, recording `modal` not `root`', () => {
    for (const [name, src] of MODALS) {
      const handler = blockAt(src, 'onStartShouldSetResponderCapture={() => {', {
        mode: 'opener',
      });
      expect(`${name}: ${handler}`).toContain("noteRootTouch('modal')");
    }
  });

  /* One observer per sheet. Two would double-count a single finger and make the
   * id stream read as multi-touch that never happened. */
  it('exactly one observer per sheet', () => {
    for (const [name, src] of MODALS) {
      const n = [...src.matchAll(/onStartShouldSetResponderCapture=/g)].length;
      expect(`${name}=${n}`).toBe(`${name}=1`);
    }
  });
});

// ═══ 3. ONE TOUCH IS ONE ID ══════════════════════════════════════════════════
describe('OTA-1813 §3 — the chain correlates', () => {
  it('root → press-in → handler → dispatch → done share one id', () => {
    const root = noteRootTouch('root', 1_000);
    const t1 = notePressIn('quick:DODGE', null, 1_010);
    const t2 = noteHandlerEnter('quick:DODGE', 1_020);
    noteStage(t2, 'admit', { control: 'quick:DODGE', reason: 'callback' });
    noteStage(t2, 'dispatch', { control: 'quick:DODGE', reason: 'callback' });
    noteStage(t2, 'done', { control: 'quick:DODGE', reason: 'callback' });

    expect(t1).toBe(root);
    expect(t2).toBe(root);
    expect(new Set(ids()).size).toBe(1);
    expect(stages()).toEqual(['root', 'in', 'enter', 'admit', 'dispatch', 'done']);
    expect(peekTouchPath().some((e) => e.o === true)).toBe(false);
  });

  /* ⚠⚠ NEWEST-FIRST, CLAIMED ONCE. Two fingers in flight must not collapse onto
   * one id — that collapse is exactly what tapClock's single slot would have
   * done, and why this file keeps its own queue. */
  it('two touches in flight stay two interactions', () => {
    noteRootTouch('root', 1_000);
    noteRootTouch('root', 1_005);
    const a = notePressIn('quick:A', null, 1_010);
    const b = notePressIn('quick:B', null, 1_015);
    expect(a).not.toBe(b);
  });

  /* ⚠ A STALE TOUCH IS NEVER INHERITED. A handler that finally runs after a long
   * stall must not adopt the identity of a touch from before it — that would
   * manufacture a "the tap was handled" where the truth is "a much older tap
   * was". The age bound is the guard, so the bound itself is exercised. */
  it('a touch older than the claim window cannot be claimed', () => {
    noteRootTouch('root', 1_000);
    const late = noteHandlerEnter('quick:LATE', 1_000 + TOUCH_CLAIM_MAX_AGE_MS + 1);
    const entry = peekTouchPath().find((e) => e.i === late && e.st === 'enter');
    expect(entry?.o).toBe(true);
  });

  it('the sequence number strictly increases so ordering survives a clock tie', () => {
    noteRootTouch('root', 1_000);
    notePressIn('quick:A', null, 1_000);
    noteHandlerEnter('quick:A', 1_000);
    const seqs = peekTouchPath().map((e) => e.s);
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y));
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});

// ═══ 4. AN ORPHAN IS SAID OUT LOUD ═══════════════════════════════════════════
describe('OTA-1813 §4 — a handler with no touch behind it says so', () => {
  /* ⚠⚠ THIS IS A FINDING, NOT A FAILURE. A handler running with no root touch
   * means the observer never saw the finger — which, on a screen the player
   * swears they tapped, is itself the answer. It must never be silently papered
   * over with a fresh id that looks like a normal interaction. */
  it('a bare handler enter is marked orphan', () => {
    const id = noteHandlerEnter('quick:GHOST', 2_000);
    const entry = peekTouchPath().find((e) => e.i === id);
    expect(entry?.st).toBe('enter');
    expect(entry?.o).toBe(true);
  });

  it('a press-in with no root touch is marked orphan too', () => {
    const id = notePressIn('quick:GHOST', null, 2_000);
    expect(peekTouchPath().find((e) => e.i === id)?.o).toBe(true);
  });

  it('after a background reset, outstanding touches are no longer claimable', () => {
    noteRootTouch('root', 3_000);
    resetTouchCorrelation();
    const id = noteHandlerEnter('quick:AFTER', 3_010);
    expect(peekTouchPath().find((e) => e.i === id && e.st === 'enter')?.o).toBe(true);
    // ⚠ THE RING IS KEPT. The correlation is cleared; the evidence is not.
    expect(peekTouchPath().some((e) => e.st === 'root')).toBe(true);
  });
});

// ═══ 5. A REJECTION IS A REAL REFUSAL, NEVER AN ABSENCE ══════════════════════
describe('OTA-1813 §5 — `reject` is only written where source proves one', () => {
  /* ⚠⚠⚠ THE ASSERTION THE INSTRUMENT'S CREDIBILITY RESTS ON. Every `reject` in
   * this OTA must sit in a branch that RETURNS without reaching a verb. Counted
   * per file against the branches that qualify, so adding a decorative rejection
   * anywhere fails here. */
  const REJECTS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
    ['InputBox', INPUT_BOX, ['tutorial-blocked', 'stamina-spent']],
    ['GatherModal', GATHER, ['tutorial-locked']],
    ['SearchModal', SEARCH, ['empty-text']],
  ];

  it('every reject reason in the OTA is one of the proven refusals', () => {
    for (const [name, src, reasons] of REJECTS) {
      // ⚠ Not `[^}]*` — a control id is a template literal (`quick:${label}`)
      // whose own closing brace would end the window early and make this pin
      // find nothing while reporting success.
      const found = [...src.matchAll(/'reject',[\s\S]{0,160}?reason:\s*'([^']+)'/g)]
        .map((m) => m[1]!);
      expect(`${name} records at least one refusal`)
        .toBe(found.length > 0 ? `${name} records at least one refusal` : `${name} records none`);
      const stray = found.filter((r) => !reasons.includes(r));
      expect(`${name} strays: ${stray.join(',')}`).toBe(`${name} strays: `);
    }
  });

  /* ⚠⚠ THE ONE THAT CAUGHT A REAL MISTAKE IN THE MAKING. `outOfRange` on a
   * travel button VIBRATES AND THEN PROCEEDS — the press is dispatched. Calling
   * that a rejection would put a refusal in the record for a tap the game
   * actually honoured, and the freeze question would then be answered from a
   * lie. It is deliberately not recorded, and this is the pin that keeps it
   * that way. */
  it('out-of-range travel is NOT recorded as a rejection — it dispatches', () => {
    const outOfRange = between(INPUT_BOX, 'if (outOfRange) {', 'onPress();');
    expect(outOfRange).not.toContain("'reject'");
    expect(outOfRange).toContain("'admit'");
  });

  /* ⚠ A DISABLED CONTROL IS AN ABSENCE, NOT A REFUSAL. ClimbModal's cleared
   * chips and GatherModal's consumed rows are `disabled`: RN runs neither
   * onPressIn nor onPress for them, so the honest record is a MODAL_TOUCH with
   * no `in` after it. Nothing in those files may invent a rejection for that. */
  it('the disabled paths record nothing at all', () => {
    const climbRow = between(CLIMB, 'disabled={isCleared}', 'accessibilityRole="button"');
    expect(climbRow).not.toContain("'reject'");
    const gatherRow = between(GATHER, 'disabled={consumed}', 'accessibilityRole="button"');
    expect(gatherRow).toContain("reason: 'tutorial-locked'"); // the real lock, which does run
    expect([...gatherRow.matchAll(/'reject'/g)].length).toBe(1);
  });

  it('a recorded rejection is still a complete interaction in the trace', () => {
    noteRootTouch('root', 4_000);
    notePressIn('quick:DODGE', null, 4_005);
    const id = noteHandlerEnter('quick:DODGE', 4_010);
    noteStage(id, 'reject', { control: 'quick:DODGE', reason: 'tutorial-blocked' });
    expect(stages()).toEqual(['root', 'in', 'enter', 'reject']);
    expect(new Set(ids()).size).toBe(1);
  });
});

// ═══ 6. BOUNDED BY CONSTRUCTION ══════════════════════════════════════════════
describe('OTA-1813 §6 — nothing here can grow with session length', () => {
  it('the ring stops at its cap and keeps the NEWEST stages', () => {
    const total = TOUCH_PATH_MAX_ENTRIES * 3;
    for (let k = 0; k < total; k++) noteRootTouch('root', 5_000 + k);
    expect(peekTouchPath().length).toBe(TOUCH_PATH_MAX_ENTRIES);
    // ⚠ THE OLDEST GO, NOT THE NEWEST. The per-boot sequence number is the only
    // field that can say which — `t` is a wall clock stamped at append time and
    // a whole burst can share one millisecond.
    const seqs = peekTouchPath().map((e) => e.s);
    expect(seqs[seqs.length - 1]).toBe(total);
    expect(seqs[0]).toBe(total - TOUCH_PATH_MAX_ENTRIES + 1);
  });

  it('the claim queue stops at its cap, dropping the OLDEST finger', () => {
    const minted: number[] = [];
    for (let k = 0; k <= TOUCH_PENDING_MAX; k++) minted.push(noteRootTouch('root', 6_000 + k));
    // The oldest was evicted, so it can no longer be claimed by anyone.
    const claimed: number[] = [];
    for (let k = 0; k <= TOUCH_PENDING_MAX; k++) {
      claimed.push(notePressIn(`c${k}`, null, 6_010));
    }
    expect(claimed).not.toContain(minted[0]!);
  });

  /* ⚠ BOUNDED FIELDS ARE A PRIVACY PROPERTY AS MUCH AS A SIZE ONE. An unbounded
   * control id could carry player text into a diagnostic that must never hold
   * any; clipping makes that structurally impossible. */
  it('string fields are clipped, never unbounded', () => {
    const id = noteRootTouch('root', 7_000);
    noteStage(id, 'admit', { control: 'x'.repeat(500), reason: 'y'.repeat(500) });
    const e = peekTouchPath().find((x) => x.st === 'admit')!;
    expect(e.c!.length).toBe(TOUCH_PATH_MAX_FIELD);
    expect(e.r!.length).toBe(TOUCH_PATH_MAX_FIELD);
  });

  it('report lines are one per stage and carry no free text', () => {
    setTouchPathContext({ screen: 'exploration', presentation: 'G' });
    const id = noteRootTouch('modal', 8_000);
    noteStage(id, 'admit', { control: 'gather:rope', reason: 'take' });
    const lines = touchPathLines(peekTouchPath());
    expect(lines.length).toBe(peekTouchPath().length);
    for (const l of lines) expect(l.length).toBeLessThan(200);
    expect(lines.join('\n')).toContain('gather:rope');
  });
});

// ═══ 7. THE WRITE NEVER PILES UP ═════════════════════════════════════════════
describe('OTA-1813 §7 — one write in flight, ever', () => {
  it('a burst of stages leaves at most one write outstanding', () => {
    for (let k = 0; k < 40; k++) noteRootTouch('root', 9_000 + k);
    const st = _touchPathWriteState();
    expect(st.writing || st.dirty).toBe(true);
    // ⚠ The invariant is structural: `schedulePersist` starts a write ONLY when
    // none is in flight, and otherwise just marks the ring dirty.
    const sched = blockAt(TOUCH_PATH, 'function schedulePersist(): void {', { mode: 'opener' });
    expect(sched).toMatch(/if\s*\(writing\)\s*\{\s*dirty\s*=\s*true;\s*return;\s*\}/);
  });

  it('there is no recurring timer and no retry loop', () => {
    expect(TOUCH_PATH).not.toContain('setInterval');
    // Exactly one setTimeout: the single coalesced trailing snapshot.
    expect([...TOUCH_PATH.matchAll(/setTimeout\(/g)].length).toBe(1);
  });

  /* ⚠⚠ AND IT IS NEVER AWAITED ON THE TOUCH PATH. A synchronous await of
   * AsyncStorage inside a press handler would add real latency to the exact
   * interaction under investigation — the instrument becoming the fault. */
  it('no stage function awaits storage', () => {
    for (const fn of ['export function noteRootTouch', 'export function notePressIn',
      'export function noteHandlerEnter', 'export function noteStage']) {
      const body = blockAt(TOUCH_PATH, fn, { mode: 'opener' });
      expect(body).not.toContain('await');
      expect(body).not.toContain('AsyncStorage');
    }
  });

  it('every storage failure is swallowed', () => {
    const w = blockAt(TOUCH_PATH, 'function writeNow(): Promise<void> {', { mode: 'opener' });
    expect(w).toContain('.catch(');
  });
});

// ═══ 8. ARMED WITHOUT FIRED IS THE DISCRIMINATOR ═════════════════════════════
describe('OTA-1813 §8 — the deferred submit says both halves', () => {
  const HELPER = blockAt(
    EXPLORATION,
    'const submitAfterSheetSettles = (text: string, after?: () => void): void => {',
    { mode: 'opener' },
  );

  it('the helper records armed before scheduling and fired when it runs', () => {
    expect(HELPER).toContain("reason: 'delayed-submit-armed'");
    expect(HELPER).toContain("reason: 'delayed-submit-fired'");
    // armed carries the delay, so a reader knows how long a missing `fired` is
    // missing BY without consulting the source.
    expect(HELPER).toContain('delayMs: SHEET_SETTLE_MS');
  });

  /* ⚠⚠⚠ OTA-1497'S DEFERRAL IS UNTOUCHED, BYTE FOR BYTE. That statement is the
   * fix for a different iOS wedge and its exact spelling is pinned by that
   * OTA's own suite. This instrument composes `after` BEFORE the timeout is
   * scheduled rather than editing the statement — pinned here too, so a future
   * edit cannot quietly move the instrument into the pinned line. */
  it('the pinned deferral statement is unchanged', () => {
    expect(HELPER).toContain('setTimeout(() => { submit(text); after?.(); }, SHEET_SETTLE_MS);');
  });

  /* ⚠⚠ AND IT BORROWS THE HANDLER'S ID. Calling noteHandlerEnter here would find
   * the root touch already claimed by T1 and report a FABRICATED orphan on
   * every single deferred submit — an instrument lying in the one place it is
   * read. `currentTouchId` returns null instead, and null records nothing. */
  it('it never mints a second interaction for the same finger', () => {
    expect(HELPER).toContain('currentTouchId()');
    // ⚠ Comments stripped: the block DOCUMENTS why noteHandlerEnter is wrong
    // here, and a naive scan would read its own warning as the violation.
    const code = HELPER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('noteHandlerEnter');
    expect(code).toMatch(/if\s*\(tp\s*!==\s*null\)/);
  });

  it('currentTouchId borrows a fresh handler and refuses a stale one', () => {
    noteRootTouch('root', 10_000);
    notePressIn('climb:wall', null, 10_005);
    const id = noteHandlerEnter('climb:wall', 10_010);
    expect(currentTouchId(10_020)).toBe(id);
    expect(currentTouchId(10_010 + TOUCH_CLAIM_MAX_AGE_MS + 1)).toBeNull();
  });

  it('with no handler in flight at all it borrows nothing', () => {
    expect(currentTouchId(11_000)).toBeNull();
  });
});

// ═══ 9. THE EVIDENCE OUTLIVES THE FORCE-CLOSE ════════════════════════════════
describe('OTA-1813 §9 — the prior boot reaches the report', () => {
  it('the boot effect hydrates the previous trace', () => {
    expect(APP).toContain('loadPriorTouchPath()');
    expect(APP).toContain("from './app/diagnostics/touchPath'");
  });

  it('the report header prints the prior boot AND this one', () => {
    const block = blockAt(ABOUT_SUMMARY, 'function touchPathBlock(): string {', { mode: 'opener' });
    expect(block).toContain('priorTouchPath()');
    expect(block).toContain('peekTouchPath()');
    expect(block).toContain('touchPathLines');
    expect(ABOUT_SUMMARY).toContain('touchPathBlock(),');
  });

  /* ⚠ "NOT LOADED" AND "NOTHING HAPPENED" ARE DIFFERENT FINDINGS, and a report
   * that conflates them would send a reader looking in the wrong place. */
  it('a null prior trace is printed as a null, not as an empty one', () => {
    const block = blockAt(ABOUT_SUMMARY, 'function touchPathBlock(): string {', { mode: 'opener' });
    expect(block).toContain('(no trace loaded)');
    expect(block).toContain('(trace present, no stages)');
  });

  it('the block can never throw into the report it decorates', () => {
    const block = blockAt(ABOUT_SUMMARY, 'function touchPathBlock(): string {', { mode: 'opener' });
    expect(block).toContain('catch');
  });
});

// ═══ 10. tapClock IS UNTOUCHED ═══════════════════════════════════════════════
describe('OTA-1813 §10 — the existing instrument is not disturbed', () => {
  /* ⚠⚠ touchPath borrows `touchLateMs` to COMPUTE a number and nothing else. If
   * it ever reached for `noteTouchDown` or `takeTouchLateSuffix`, it would be
   * consuming tapClock's single slot — and the `⏱+Nms` suffix on the `ui: tap`
   * line, which is the pinned freeze signal, would start coming up empty. */
  it('touchPath imports only the pure calculation from tapClock', () => {
    const imp = /import \{([^}]*)\} from '\.\/tapClock';/.exec(TOUCH_PATH);
    expect(imp).not.toBeNull();
    expect(imp![1]!.split(',').map((s) => s.trim()).filter(Boolean)).toEqual(['touchLateMs']);
  });

  it('a press-in recorded by touchPath does not consume tapClock`s slot', () => {
    // tapClock is fed the way production feeds it, then touchPath observes the
    // same event. The suffix must still be there for logUiTap afterwards.
    const e = { nativeEvent: { timestamp: Date.now() } };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tc = require('../app/diagnostics/tapClock') as typeof import('../app/diagnostics/tapClock');
    tc.noteTouchDown(e);
    notePressIn('quick:DODGE', e);
    expect(takeTouchLateSuffix()).not.toBe('');
  });

  /* ⚠ AND logUiTap KEEPS ITS PINNED POSITION. Its call sites are the freeze
   * signal in every log this project has; the instrument goes AFTER it, never
   * in front of it. */
  it('logUiTap still runs before any OTA-1813 stage in the ledgered handlers', () => {
    for (const anchor of ['logUiTap(label);']) {
      let from = 0;
      let seen = 0;
      for (;;) {
        const i = INPUT_BOX.indexOf(anchor, from);
        if (i < 0) break;
        seen += 1;
        const before = INPUT_BOX.slice(Math.max(0, i - 600), i);
        expect(before).not.toContain('noteHandlerEnter');
        from = i + anchor.length;
      }
      expect(seen).toBeGreaterThan(0);
    }
  });
});

// ═══ 11. THE STAMP ═══════════════════════════════════════════════════════════
describe('OTA-1813 §11 — the build says which OTA it is', () => {
  it('OTA_BUILD_ID is at or past 1813', () => {
    const src = read('app', 'buildInfo.ts');
    const m = /^export const OTA_BUILD_ID = '([^']+)'/m.exec(src);
    expect(m).not.toBeNull();
    expect(Number(/-(\d{3,4})-/.exec(m![1]!)?.[1])).toBeGreaterThanOrEqual(1813);
  });

  /* ⚠⚠ EXACTLY ONE STAMP IS LIVE. The demotion discipline in this file is
   * carried by comments, and a comment is documentation — so the claim worth
   * testing is the CODE one underneath it: a careless demotion that leaves the
   * old export active alongside the new one gives the bundle two stamps and the
   * device the wrong answer about what it is running. That is the failure this
   * counts, and it is the one a reader of a bug report is hurt by. */
  it('exactly one OTA_BUILD_ID export is active', () => {
    const src = read('app', 'buildInfo.ts');
    const active = [...src.matchAll(/^export const OTA_BUILD_ID = '/gm)];
    expect(active.length).toBe(1);
  });
});
