/**
 * ⚠⚠⚠ OTA-1814 — THE REPORT SCREEN JOINS THE TRACE.
 *
 * OBSERVATIONAL ONLY. GAMEPLAY FREEZE REPAIR ATTEMPTED: NO. REPORT FREEZE REPAIR
 * ATTEMPTED: NO. Nothing here fixes or explains either freeze.
 *
 * ⚠⚠ WHAT THE HEALTHY CONTROL TAUGHT US. Robert Schmobert's OTA-1813 trace
 * (bundle mu096euu9i87, 2022 iPhone SE, 8/8 parts) worked: four interactions,
 * zero orphans, and a stamina refusal that matched the store's own line. It also
 * proved the instrument was blind in exactly the place the OTHER freeze lives —
 * AboutScreen had no coverage at all. This suite holds the contract that closes
 * that blind spot and, just as importantly, the contracts 1813 already earned so
 * this pass cannot quietly erode them.
 *
 * THE DISTINCTIONS THIS SUITE EXISTS TO KEEP LEGIBLE:
 *   ROOT SAW TOUCH / NO CONTROL EVER RECEIVED IT   → root, then nothing
 *   CONTROL RECEIVED IT / HANDLER NEVER ENTERED    → root, in, then nothing
 *   HANDLER RAN / THE PIPELINE STOPPED LATER       → …enter, admit, then nothing
 *   RECEIPT ASKED FOR BUT NEVER COMMITTED          → pres requested, no shown
 *   RECEIPT SHOWN BUT NEVER DISMISSED              → pres shown, no dismissed
 */
// ⚠ The house mock — touchPath snapshots its ring to AsyncStorage.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import fs from 'fs';
import path from 'path';
import { blockAt } from '../test-utils/srcBlock';
import {
  TOUCH_PATH_MAX_ENTRIES,
  noteRootTouch,
  notePressIn,
  noteHandlerEnter,
  noteStage,
  currentTouchId,
  peekTouchPath,
  touchPathLines,
  _resetTouchPathForTest,
} from '../app/diagnostics/touchPath';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const ABOUT = read('app', 'screens', 'AboutScreen.tsx');
const COMPOSER = read('app', 'components', 'BugReportModal.tsx');
const CARD = read('app', 'components', 'KeyboardSafeCard.tsx');
const TOUCH_PATH = read('app', 'diagnostics', 'touchPath.ts');
const BRANDED = read('app', 'components', 'BrandedModal.tsx');

beforeEach(() => { _resetTouchPathForTest(); });
afterEach(() => { _resetTouchPathForTest(); });

const stages = (): string[] => peekTouchPath().map((e) => e.st);
const reasons = (): string[] => peekTouchPath().map((e) => e.r ?? '');

// ═══ 1. THE PROVEN GAP IS CLOSED ═════════════════════════════════════════════
describe('OTA-1814 §1 — the report screen is no longer outside the instrument', () => {
  /* ⚠⚠⚠ THE WHOLE REASON THIS OTA EXISTS. Before it, a dead touch on the screen
   * where the 2/2 Build 189 freeze happens left NO trace of any kind. */
  /** ⚠ THE HANDLER'S OWN EXPRESSION, not a brace-walked block. This observer is
   *  a one-liner, and `blockAt` would keep walking into the JSX beneath it —
   *  which on this screen contains other components' `setX(` calls and would
   *  make the no-state pin below pass or fail for reasons that have nothing to
   *  do with the observer. */
  const rootHandler = (src: string): string => {
    const m = /onStartShouldSetResponderCapture=\{[^\n]*\}\}/.exec(src);
    if (m === null) throw new Error('no root observer found');
    return m[0];
  };

  it('AboutScreen has a root observer, and it returns false', () => {
    const handler = rootHandler(ABOUT);
    expect(handler).toContain('noteRootTouch');
    expect(handler).toMatch(/return\s+false\s*;/);
    expect(handler).not.toMatch(/return\s+true\b/);
  });

  it('the root observer reads no state and wakes no store subscriber', () => {
    const handler = rootHandler(ABOUT);
    expect(handler).not.toMatch(/\bset[A-Z]\w*\(/);
    expect(handler).not.toMatch(/useGameStore/);
  });
});

// ═══ 2. THE COMPOSER IS A NATIVE MODAL, SO IT NEEDS ITS OWN OBSERVER ═════════
describe('OTA-1814 §2 — M0 on the composer, opt-in and proven necessary', () => {
  /* ⚠⚠ NECESSITY FIRST, exactly as 1813 was required to prove for the gameplay
   * sheets. KeyboardSafeCard renders a native <Modal>, so its content is hosted
   * outside AboutScreen's tree and §1's observer structurally cannot see it. If
   * that ever stops being true the M0 becomes redundant rather than wrong, and
   * this is where that shows up. */
  it('the composer card really is a native <Modal>', () => {
    expect(CARD).toMatch(/^\s*Modal,$/m);
    expect(CARD).toMatch(/<Modal\b/);
  });

  it('the card offers an opt-in root observer that never claims the responder', () => {
    expect(CARD).toContain('onRootTouch?: () => void');
    expect(CARD).toMatch(/onRootTouch\s*\?\s*\(\)\s*=>\s*\{\s*onRootTouch\(\);\s*return false;\s*\}\s*:\s*undefined/);
  });

  /* ⚠⚠ OPT-IN IS LOAD-BEARING. Five modals share this card and only the report
   * composer is on a freeze campaign; the other four must render exactly what
   * they rendered in 1813. Counted, so wiring a fifth by accident fails here. */
  it('exactly one consumer opts in — the bug-report composer', () => {
    const consumers = ['BugReportModal', 'DogOnboardingModal', 'GolemNamingModal',
      'InvitePlaytesterModal', 'FeedbackModal'];
    const optedIn = consumers.filter((c) => /onRootTouch=/.test(read('app', 'components', `${c}.tsx`)));
    expect(optedIn).toEqual(['BugReportModal']);
  });

  it('the composer records `modal`, not `root`', () => {
    expect(COMPOSER).toContain("noteRootTouch('modal')");
  });
});

// ═══ 3. THE REPORT CONTROLS CANNOT PRODUCE A SILENT BARE T0 ══════════════════
describe('OTA-1814 §3 — bare-T0 ambiguity is reduced where the campaigns run', () => {
  /* ⚠⚠ THE AMBIGUITY 1813 LEFT. A `root` with no `in` meant either "an
   * uninstrumented control" or "a dead touch", and on the report path EVERY
   * control was uninstrumented, so the reading was always the useless one. Both
   * doors out of the composer now report. */
  it('SEND and CANCEL both report press-in and handler entry', () => {
    for (const control of ['report:send', 'report:cancel']) {
      expect(COMPOSER).toContain(`notePressIn('${control}'`);
      expect(COMPOSER).toContain(`noteHandlerEnter('${control}')`);
    }
  });

  /* ⚠⚠⚠ A DISABLED SEND IS NOT A REJECTION. `canSend` gates the key with
   * `disabled`, so RN never runs the handler in that state and the guard is
   * unreachable defensive code. Recording it would put a fabricated refusal in
   * the one instrument built to find the truth — the same discipline the cleared
   * climb chip and the consumed gather row already get. */
  it('the unreachable canSend guard is NOT recorded as a refusal', () => {
    const body = blockAt(COMPOSER, 'const handleSend = (): void => {', { mode: 'opener' });
    const guard = body.slice(body.indexOf('if (!canSend)'), body.indexOf('if (isFullLog)'));
    expect(guard).not.toContain("'reject'");
    expect(guard).toMatch(/return;/);
  });
});

// ═══ 4. THE ASYNC SEND RESOLVES, AND SAYS HOW ════════════════════════════════
describe('OTA-1814 §4 — the send hand-off and its resolution are different events', () => {
  const SEND = blockAt(ABOUT, 'onSend={(args) => {', { mode: 'opener' });

  /* ⚠⚠ THE ID IS HELD ACROSS THE AWAIT. `currentTouchId` is age-bounded at
   * 1.5s and this promise can take seconds, so capturing it at dispatch is what
   * keeps one physical tap as ONE interaction from press to receipt. Without it
   * every resolution would mint a fresh id and read as an unrelated event. */
  it('the interaction id is captured at dispatch and held in a ref', () => {
    expect(SEND).toContain('currentTouchId()');
    expect(SEND).toContain('reportTraceId.current = tp');
    expect(ABOUT).toContain('const reportTraceId = useRef<number | null>(null)');
  });

  /* A REF, NOT STATE — telemetry may not cause a render. */
  it('nothing added for telemetry holds React state', () => {
    expect(ABOUT).not.toMatch(/useState[^;]*reportTrace/);
  });

  /* ⚠⚠⚠ THE REJECTIONS ARE THE REPORT'S OWN RETURNED STATUSES, not invented
   * here. `unchanged` is a duplicate, `off` is reporting disabled — real
   * outcomes the composer hands back as data. */
  it('resolution records admit for sent/queued and reject for the real refusals', () => {
    expect(SEND).toMatch(/r\.status === 'sent' \|\| r\.status === 'queued'/);
    expect(SEND).toMatch(/ok \? 'admit' : 'reject'/);
    expect(SEND).toContain('reason: r.status');
  });
});

// ═══ 5. REQUESTED IS NOT SHOWN ═══════════════════════════════════════════════
describe('OTA-1814 §5 — the receipt says whether React actually committed it', () => {
  it('`pres` exists as one stage carrying its phase in the reason field', () => {
    expect(TOUCH_PATH).toMatch(/\|\s*'pres'/);
  });

  /* ⚠⚠⚠ THE DISTINCTION THE BUILD 189 FREEZE NEEDS. `requested` is written where
   * the popup state is set; `shown` only after React has committed it. */
  it('requested is written at the state change, shown only after commit', () => {
    const send = blockAt(ABOUT, 'onSend={(args) => {', { mode: 'opener' });
    expect(send).toContain("reason: 'requested'");
    expect(send).not.toContain("reason: 'shown'");
    const effect = blockAt(ABOUT, 'useEffect(() => {\n    const id = reportTraceId.current;', { mode: 'opener' });
    expect(effect).toContain("reason: 'shown'");
    expect(effect).toContain("reason: 'dismissed'");
    expect(effect).toMatch(/\}, \[bugReportPopup\]\)/);
  });

  /* ⚠⚠ THE RECEIPT'S OK TAP IS COVERED WITHOUT TOUCHING THE PINNED ELEMENT,
   * because OTA-1812 made this receipt INLINE — it renders inside AboutScreen's
   * own tree, so §1's root observer sees the tap. Had it stayed a native
   * <Modal>, it would not. That is a real consequence of 1812 and it is why no
   * separate `dismiss-requested` stage was minted: `root` with no `dismissed`
   * already carries the meaning. */
  it('the inline receipt renders in-tree, which is what puts it under the root observer', () => {
    const inline = blockAt(BRANDED, 'if (inline) {', { mode: 'opener' });
    expect(inline).toMatch(/<View style=\{styles\.inlineScrim\}/);
    expect(inline).not.toMatch(/<Modal\b/);
  });

  /* OTA-1812's receipt element is untouched by this OTA — both dismissal doors
   * still clear the popup, in the exact spelling that suite pins. */
  it('OTA-1812`s receipt element is unchanged', () => {
    const opens = [...ABOUT.matchAll(/<BrandedModal\b/g)].map((m) => m.index!);
    const receipt = opens
      .map((s) => ABOUT.slice(s, ABOUT.indexOf('/>', s) + 2))
      .find((el) => el.includes('bugReportPopup?.title'))!;
    expect(receipt).toMatch(/\binline\b/);
    expect([...receipt.matchAll(/setBugReportPopup\(null\)/g)].length).toBe(2);
  });
});

// ═══ 6. THE FULL REPORT SIGNATURE, DRIVEN THROUGH THE REAL INSTRUMENT ════════
describe('OTA-1814 §6 — the expected healthy report shape', () => {
  /** Replays the exact stage order the wired source produces for one send. */
  const drive = (status: 'sent' | 'unchanged'): number => {
    noteRootTouch('modal', 1_000);              // M0 — composer card
    notePressIn('report:send', null, 1_005);    // T1
    const tp = noteHandlerEnter('report:send', 1_010); // T2
    noteStage(tp, 'admit', { control: 'report:send', reason: 'fulllog' });
    noteStage(tp, 'dispatch', { control: 'report:send', reason: 'fulllog' });
    noteStage(tp, 'done', { control: 'report:send', reason: 'handed-off' });
    const held = currentTouchId(1_020)!;
    noteStage(held, 'dispatch', { control: 'report:send', reason: 'compose' });
    const ok = status === 'sent';
    noteStage(held, ok ? 'admit' : 'reject', { control: 'report:send', reason: status });
    noteStage(held, 'done', { control: 'report:send', reason: 'resolved' });
    noteStage(held, 'pres', { control: 'report:receipt', reason: 'requested' });
    noteStage(held, 'pres', { control: 'report:receipt', reason: 'shown' });
    noteStage(held, 'pres', { control: 'report:receipt', reason: 'dismissed' });
    return tp;
  };

  it('a healthy send is ONE interaction id from press to dismissal', () => {
    const tp = drive('sent');
    expect(new Set(peekTouchPath().map((e) => e.i)).size).toBe(1);
    expect(tp).toBe(peekTouchPath()[0]!.i);
    expect(stages()).toEqual([
      'modal', 'in', 'enter', 'admit', 'dispatch', 'done',
      'dispatch', 'admit', 'done', 'pres', 'pres', 'pres',
    ]);
    expect(reasons().slice(-3)).toEqual(['requested', 'shown', 'dismissed']);
    expect(peekTouchPath().some((e) => e.o === true)).toBe(false);
  });

  it('a refused send reads as reject with the composer`s own status word', () => {
    drive('unchanged');
    const rej = peekTouchPath().find((e) => e.st === 'reject');
    expect(rej?.r).toBe('unchanged');
    // ⚠ A refusal still reaches its receipt — the player is always told.
    expect(reasons().slice(-3)).toEqual(['requested', 'shown', 'dismissed']);
  });

  /* ⚠⚠ THE THREE SIGNATURES A FREEZE WOULD LEAVE, each distinguishable. */
  it('a touch that never reaches a control leaves root and nothing else', () => {
    noteRootTouch('root', 2_000);
    expect(stages()).toEqual(['root']);
  });

  it('a control that receives the press but whose handler never runs stops at `in`', () => {
    noteRootTouch('modal', 3_000);
    notePressIn('report:send', null, 3_005);
    expect(stages()).toEqual(['modal', 'in']);
  });

  it('a receipt requested but never committed stops at `requested`', () => {
    noteRootTouch('modal', 4_000);
    const tp = noteHandlerEnter('report:send', 4_005);
    noteStage(tp, 'pres', { control: 'report:receipt', reason: 'requested' });
    expect(reasons()[reasons().length - 1]).toBe('requested');
    expect(reasons()).not.toContain('shown');
  });
});

// ═══ 7. GAMEPLAY CONTRACTS FROM OTA-1813 ARE PRESERVED ═══════════════════════
describe('OTA-1814 §7 — 1813`s shapes still hold', () => {
  it('the direct-control admit shape is unchanged', () => {
    noteRootTouch('root', 5_000);
    notePressIn('quick:rest', null, 5_001);
    const tp = noteHandlerEnter('quick:rest', 5_010);
    noteStage(tp, 'admit', { control: 'quick:rest', reason: 'callback' });
    noteStage(tp, 'dispatch', { control: 'quick:rest', reason: 'callback' });
    noteStage(tp, 'done', { control: 'quick:rest', reason: 'callback' });
    expect(stages()).toEqual(['root', 'in', 'enter', 'admit', 'dispatch', 'done']);
  });

  /* ⚠⚠ THE INTENTIONAL REJECTION, AND IT EMITS NO T4/T5 — the shape Robert's
   * device actually produced, cross-validated there against the store's own
   * stamina refusal one millisecond later. */
  it('an intentional rejection stops dead and never dispatches', () => {
    noteRootTouch('root', 6_000);
    notePressIn('travel:EXIT', null, 6_001);
    const tp = noteHandlerEnter('travel:EXIT', 6_010);
    noteStage(tp, 'reject', { control: 'travel:EXIT', reason: 'stamina-spent' });
    expect(stages()).toEqual(['root', 'in', 'enter', 'reject']);
    expect(stages()).not.toContain('dispatch');
    expect(stages()).not.toContain('done');
  });

  it('the gameplay sheets keep the coverage 1813 gave them', () => {
    for (const m of ['SearchModal', 'GatherModal', 'ClimbModal']) {
      const src = read('app', 'components', `${m}.tsx`);
      expect(`${m}:${src.includes("noteRootTouch('modal')")}`).toBe(`${m}:true`);
      expect(`${m}:${src.includes('notePressIn(')}`).toBe(`${m}:true`);
    }
  });
});

// ═══ 8. POST-REPORT SURVIVAL INTO THE NEXT BOOT ══════════════════════════════
describe('OTA-1814 §8 — what happens after the receipt reaches the next report', () => {
  /* ⚠⚠⚠ THE SENT REPORT CANNOT DESCRIBE ITS OWN AFTERMATH, and this OTA does not
   * pretend otherwise: the payload is composed before the receipt exists. The
   * answer is the EXISTING persisted ring, unchanged — every stage appended
   * after the snapshot is written and loaded on the next boot as `prior boot:`. */
  it('every stage append still schedules the existing coalesced write', () => {
    const append = blockAt(TOUCH_PATH, 'function append(partial:', { mode: 'opener' });
    expect(append).toContain('schedulePersist()');
    const sched = blockAt(TOUCH_PATH, 'function schedulePersist(): void {', { mode: 'opener' });
    expect(sched).toMatch(/if\s*\(writing\)\s*\{\s*dirty\s*=\s*true;\s*return;\s*\}/);
  });

  it('the persistence model was NOT redesigned — still one timer, no interval', () => {
    expect(TOUCH_PATH).not.toContain('setInterval');
    expect([...TOUCH_PATH.matchAll(/setTimeout\(/g)].length).toBe(1);
  });

  /* The post-receipt stages are ordinary ring entries, so they serialise and
   * render exactly like any other — which is what makes them survivable. */
  it('post-receipt stages are ordinary bounded ring entries', () => {
    const tp = noteRootTouch('root', 7_000);
    noteStage(tp, 'pres', { control: 'report:receipt', reason: 'dismissed' });
    noteRootTouch('root', 7_100); // the first touch AFTER the receipt closed
    const lines = touchPathLines(peekTouchPath());
    expect(lines.length).toBe(peekTouchPath().length);
    expect(lines.join('\n')).toContain('dismissed');
    for (const l of lines) expect(l.length).toBeLessThan(200);
  });

  it('the ring is still bounded with the report stages in it', () => {
    for (let k = 0; k < TOUCH_PATH_MAX_ENTRIES * 2; k++) {
      noteStage(1, 'pres', { control: 'report:receipt', reason: 'shown' });
    }
    expect(peekTouchPath().length).toBe(TOUCH_PATH_MAX_ENTRIES);
  });
});

// ═══ 9. OBSERVER EFFECT ══════════════════════════════════════════════════════
describe('OTA-1814 §9 — the instrument still changes nothing', () => {
  it('no stage function awaits storage', () => {
    for (const fn of ['export function noteRootTouch', 'export function notePressIn',
      'export function noteHandlerEnter', 'export function noteStage']) {
      const body = blockAt(TOUCH_PATH, fn, { mode: 'opener' });
      expect(body).not.toContain('await');
      expect(body).not.toContain('AsyncStorage');
    }
  });

  /* ⚠ THE FOUR UNINSTRUMENTED CARD CONSUMERS ARE UNTOUCHED AT RUNTIME: with the
   * prop absent the capture handler is `undefined`, which is exactly the tree
   * they rendered in 1813. */
  it('an absent onRootTouch renders no capture handler at all', () => {
    expect(CARD).toMatch(/onRootTouch\s*\?[\s\S]{0,120}:\s*undefined/);
  });

  it('the report path adds no timer and no store read', () => {
    for (const src of [COMPOSER, CARD]) {
      expect(src).not.toContain('setInterval');
      expect(src).not.toContain('useGameStore');
    }
  });
});

// ═══ 10. THE STAMP ═══════════════════════════════════════════════════════════
describe('OTA-1814 §10 — the build says which OTA it is', () => {
  it('OTA_BUILD_ID is at or past 1814', () => {
    const src = read('app', 'buildInfo.ts');
    const m = /^export const OTA_BUILD_ID = '([^']+)'/m.exec(src);
    expect(m).not.toBeNull();
    expect(Number(/-(\d{3,4})-/.exec(m![1]!)?.[1])).toBeGreaterThanOrEqual(1814);
  });

  it('exactly one OTA_BUILD_ID export is active', () => {
    const src = read('app', 'buildInfo.ts');
    expect([...src.matchAll(/^export const OTA_BUILD_ID = '/gm)].length).toBe(1);
  });
});
