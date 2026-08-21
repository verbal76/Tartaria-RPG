/**
 * OTA-1413 — THE CRASH LEDGER RECORDED A CRASH THAT DID NOT HAPPEN.
 *
 * The owner's golem About screen, twenty minutes after a clean session:
 *
 *   Crash ledger — 1 recorded (newest last)
 *     • 2026-08-21T12:59:53.873Z — PROCESS KILLED — no JS ran
 *         stage ctx-release-done
 *         Process died with no orderly exit while: (no action yet)
 *         last checkpoint: ctx-release-done (+8790ms)
 *
 * Nothing died. He backgrounded the app; the AppState handler cleared the
 * breadcrumb (orderly exit ✓); the Qwen teardown then ran and FINISHED,
 * stamping `ctx-release` and `ctx-release-done` — each of which re-wrote the
 * crumb it had just cleared. Android later reclaimed a ~400MB idle process,
 * which is Android doing its job. The next boot found a crumb and called it a
 * kill.
 *
 * ⚠⚠ AND THE FILE PREDICTED IT, IN WRITING. OTA-1377's own comment:
 *   *"background work that stamps a phase AFTER this point re-arms the crumb, so
 *   an OS reclaim of a long-backgrounded app can still surface as 'died
 *   mid-action' … closing it would mean recording a separate 'exited cleanly'
 *   fact rather than deleting a stale one."*
 * It judged that shape rarer than the one it was fixing. It is not rare: the
 * Qwen teardown stamps two phases after that line on EVERY backgrounding.
 *
 * ⚠ THE CLEAR ALSO ONLY CLEARED HALF. `clearLiveBreadcrumb` removed the disk key
 * and left the `_lastLiveCrumb` module mirror, so the next stamp spread the
 * mirror back out — same `at`, same `what`. That is why his record carries the
 * BOOT timestamp and `(no action yet)` rather than the teardown's own.
 *
 * ⚠⚠ WHY IT MATTERS MORE THAN ONE WRONG LINE: this ledger is the instrument
 * being used to hunt B9, the hard freeze chased across OTA-1276/1353/1354/1356/
 * 1357/1377. An instrument that fires on every app-switch buries the real event.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import {
  stampBreadcrumbPhase,
  stampLiveBreadcrumb,
  clearLiveBreadcrumb,
  readLiveBreadcrumb,
  noteForegrounded,
  _resetBreadcrumbMirrorForTest,
} from '../app/engine/saveSystem';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;

const SAVE = read('app', 'engine', 'saveSystem.ts');
const WATCH = read('app', 'diagnostics', 'runtimePressureWatch.ts');
const BOOT = read('app', 'state', 'slices', 'bootSlice.ts');
const PRESSURE = read('app', 'diagnostics', 'runtimePressure.ts');

beforeEach(async () => {
  _resetBreadcrumbMirrorForTest();
  await clearLiveBreadcrumb();
  _resetBreadcrumbMirrorForTest();
});

describe('OTA-1413 — the owner\'s exact sequence', () => {
  it('⚠⚠ background → Qwen teardown → OS reclaim is NOT a death', async () => {
    // His session, beat for beat.
    stampLiveBreadcrumb({ at: 1_000, what: '(no action yet)' });
    await clearLiveBreadcrumb();          // AppState 'background' — orderly exit
    stampBreadcrumbPhase('ctx-release');  // Qwen teardown, AFTER the clear
    stampBreadcrumbPhase('ctx-release-done');
    // …process reclaimed. Next boot reads what survived:
    const crumb = await readLiveBreadcrumb();
    expect(crumb?.phase).toBe('ctx-release-done');
    expect(crumb?.afterOrderlyExit).toBe(true);
  });

  it('⚠⚠ …and the crumb no longer carries the CLEARED session\'s identity', async () => {
    // Pre-fix, the mirror survived the clear and the teardown stamp spread it
    // back out — which is why his record read `(no action yet)` at the boot
    // timestamp instead of naming the teardown that actually wrote it.
    stampLiveBreadcrumb({ at: 1_000, what: 'action "go west"', room: 'buried_pumps' });
    await clearLiveBreadcrumb();
    stampBreadcrumbPhase('ctx-release-done');
    const crumb = await readLiveBreadcrumb();
    expect(crumb?.what).not.toBe('action "go west"');
    expect(crumb?.room).toBeUndefined();
    expect(crumb?.at).not.toBe(1_000);
  });

  it('⚠⚠ the clear empties BOTH halves — a clear that leaves a mirror is not a clear', () => {
    expect(SAVE).toContain('_lastLiveCrumb = null;\n  noteOrderlyExit();');
    expect(SAVE).toContain('A clear that leaves the thing it');
  });
});

describe('OTA-1413 — and every real death is still a death', () => {
  it('⚠⚠ a crash DURING the background transition still records', async () => {
    // OTA-1357's case: the third B9 freeze died within 1ms of a state change.
    // The handler stamps FIRST and clears on its LAST line, so a death in
    // between never reaches the clear and the latch is still closed.
    stampLiveBreadcrumb({ at: 1_000, what: 'action "go west"' });
    stampBreadcrumbPhase('appstate:active→background');   // handler line 1
    // …died here, before the clear.
    const crumb = await readLiveBreadcrumb();
    expect(crumb?.afterOrderlyExit).toBeUndefined();
    expect(crumb?.what).toBe('action "go west"');
  });

  it('⚠⚠ a crash 1ms into the RETURN to foreground still records', async () => {
    // The same third freeze's other half. `active` releases the latch before any
    // foreground work can stamp, so the very next crumb is a real one again.
    await clearLiveBreadcrumb();
    stampBreadcrumbPhase('ctx-release-done');
    noteForegrounded();
    stampBreadcrumbPhase('appstate:background→active');
    const crumb = await readLiveBreadcrumb();
    expect(crumb?.phase).toBe('appstate:background→active');
    expect(crumb?.afterOrderlyExit).toBeUndefined();
  });

  it('⚠⚠ the label is NOT sticky — this test caught the fix\'s own first draft', () => {
    // The first version spread `afterOrderlyExit` forward out of the previous
    // crumb, so once a background stamp set it, every later stamp inherited it —
    // including the foreground ones. A real freeze after any app-switch would
    // have been filed as a routine reclaim and dropped from the ledger, which is
    // a blind spot on the exact event this instrument exists to catch. It is set
    // from the latch every time, never carried.
    expect(SAVE).toContain('if (_exitedCleanly) next.afterOrderlyExit = true;');
    expect(SAVE).toContain('else delete next.afterOrderlyExit;');
    expect(SAVE).toContain('SET FROM THE LATCH, NEVER INHERITED');
  });

  it('⚠ …and it clears on the NEXT background→foreground cycle too, not just the first', async () => {
    // Two full cycles. A latch that only released once would pass the test above
    // and still go sticky in real use, where the owner switches apps all day.
    for (let i = 0; i < 2; i++) {
      await clearLiveBreadcrumb();
      stampBreadcrumbPhase('ctx-release-done');
      expect((await readLiveBreadcrumb())?.afterOrderlyExit).toBe(true);
      noteForegrounded();
      stampBreadcrumbPhase('rendered');
      expect((await readLiveBreadcrumb())?.afterOrderlyExit).toBeUndefined();
    }
  });

  it('⚠⚠ an ordinary mid-action freeze is untouched', async () => {
    stampLiveBreadcrumb({ at: 1_000, what: 'action "climb"', room: 'spire_ledge' });
    stampBreadcrumbPhase('parsed:climb');
    stampBreadcrumbPhase('engine-done');
    const crumb = await readLiveBreadcrumb();
    expect(crumb?.afterOrderlyExit).toBeUndefined();
    expect(crumb?.phase).toBe('engine-done');
    expect(crumb?.what).toBe('action "climb"');
  });

  it('⚠ a teardown that STARTED and never finished is still evidence', async () => {
    // The label is about the orderly EXIT having happened, not about which phase
    // ran — `ctx-release` with no `-done` after an OS reclaim is still a normal
    // reclaim. What makes a teardown death a crash is dying BEFORE the clear,
    // which the two tests above cover. Stated here so the distinction is not
    // silently re-read as "a -done suffix means safe".
    await clearLiveBreadcrumb();
    stampBreadcrumbPhase('ctx-release');
    const crumb = await readLiveBreadcrumb();
    expect(crumb?.phase).toBe('ctx-release');
    expect(crumb?.afterOrderlyExit).toBe(true);
  });
});

describe('OTA-1413 — the latch is fed from the exit and released at the foreground', () => {
  it('⚠⚠ the clean-exit fact is RECORDED, not inferred from a deletion', () => {
    // OTA-1377's own prescription, followed literally.
    expect(SAVE).toContain('export function noteOrderlyExit(): void { _exitedCleanly = true; }');
    expect(SAVE).toContain('export function noteForegrounded(): void { _exitedCleanly = false; }');
    // The write itself is pinned by the stickiness test above; here the claim is
    // only that the crumb's label is a FUNCTION of the latch and nothing else.
    expect(SAVE).toContain('if (_exitedCleanly) next.afterOrderlyExit = true;');
  });

  it('⚠⚠ the release happens on `active`, BEFORE any foreground work can stamp', () => {
    const i = WATCH.indexOf("if (nextStr === 'active') {");
    const body = WATCH.slice(i, WATCH.indexOf('} else {', i));
    expect(body).toContain('noteForegrounded();');
    // …and it is fed only from the orderly-exit path, never from a bare timer.
    expect(WATCH).toContain("if (nextStr === 'background') void clearLiveBreadcrumb();");
  });

  it('⚠ OTA-1377\'s prediction is left standing, with its answer beside it', () => {
    // Deleting the paragraph that called this shape rare would erase the reason
    // the bug is interesting. The record is the point.
    expect(WATCH).toContain('WHAT THIS DOES NOT FIX, STATED PLAINLY');
    expect(WATCH).toContain('OTA-1413 — CLOSED, AND BY EXACTLY THAT PRESCRIPTION');
  });
});

describe('OTA-1413 — BOTH readers were saying it, so both were fixed', () => {
  it('⚠⚠ the ledger no longer promotes a reclaimed crumb to a fatal crash', () => {
    expect(BOOT).toContain('const reclaimed = !!crumb?.afterOrderlyExit;');
    expect(BOOT).toContain('if (!reclaimed) {');
    expect(BOOT).toContain("kind: 'native-death',");
  });

  it('⚠⚠ …and neither does the About screen, which read the same crumb', () => {
    // The many-doors mistake, avoided: fixing the ledger alone would have left
    // About printing "LAST BOOT DIED MID-ACTION" off the identical field.
    expect(PRESSURE).toContain('if (rpLastBreadcrumb.afterOrderlyExit) {');
    expect(PRESSURE).toContain('Last boot exited cleanly, then the OS reclaimed it — not a crash.');
    expect(PRESSURE).toContain('SECOND DOOR');
  });

  it('⚠ the crumb is still SET and still logged — suppressed, not deleted', () => {
    // OTA-1377 refused to trade a false positive for a blind spot. So does this.
    expect(BOOT).toContain('setLastBootBreadcrumb(crumb);');
    expect(BOOT).toContain('last boot exited cleanly, then the OS reclaimed it');
    expect(PRESSURE).toContain('Kept because the phase is still evidence if a real freeze lands here.');
  });

  it('⚠ the measurement that drove it is written down, not asserted', () => {
    expect(SAVE).toContain('ctx-release');
    expect(SAVE).toContain('the owner\'s ledger has one');
  });
});
