// ⚠⚠ OTA-1275 — THE BUG REPORT WAS THE BUG. SIX 425MB MODEL LOADS IN FOUR
// MINUTES, CAUSED BY COPYING THE LOG.
//
// The owner's 4.29.197 device log, while he was copying it to me in parts —
// switch out to the chat app, paste, switch back, tap COPY PART N, switch out:
//
//   13:56:38 ctx OPENED   ≈425MB          (boot)
//   13:56:49 ctx RELEASED                 (backgrounded after 11.0s)
//   13:59:29 ctx OPENED   ≈425MB
//   13:59:36 ctx RELEASED                 (backgrounded after  6.9s)
//   14:00:22 ctx OPENED   ≈425MB
//   14:00:25 ctx RELEASED                 (backgrounded after  2.5s)
//   14:00:28 ctx OPENED   ≈425MB
//   14:00:31 ctx RELEASED                 (backgrounded after  2.3s)
//   14:00:35 ctx OPENED   ≈425MB
//   14:00:38 ctx RELEASED                 (backgrounded after  2.4s)
//   14:00:41 ctx OPENED   ≈425MB
//
// ⚠⚠ arb140 WAS RIGHT AND STILL CAUSED THIS. Its finding — a parked model must
// be brought BACK on foreground, or one transient background benches the
// Arbiter for the whole session — is correct and stays. It simply re-warmed
// INSTANTLY, so every app-switch paid a full teardown + ~425MB rebuild.
//
// ⚠⚠ AND THE SHORT VISITS ARE SHORTER THAN THE LOAD. A 2.3s foreground against
// a "~1-5s context reload" means the next release lands DURING an in-flight
// init — exactly the orphan shape OTA-1177 filed as its leading unmeasured
// suspect (a dispose before `this.context` is assigned frees nothing, and the
// load then hands a ~425MB native context to an object nobody holds). Debouncing
// makes that race unreachable instead of merely unlikely.
//
// THE RULE: the dump on `background` stays IMMEDIATE (that is the jetsam fix —
// holding 425MB in the background is what gets the process killed); only the
// REBUILD waits for a settled foreground.
import { readFileSync } from 'fs';
import { join } from 'path';

const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');

/** The shipped policy, mirrored: given a sequence of app-state transitions with
 *  durations, how many model loads happen? */
function loadsFor(
  visits: { state: 'active' | 'background'; ms: number }[],
  debounceMs: number,
): number {
  let loads = 0;
  let parked = true;          // boot parks it; the first settled foreground loads
  let timerLeft: number | null = null;
  for (const v of visits) {
    if (v.state === 'active') {
      if (parked && timerLeft === null) timerLeft = debounceMs;
      if (timerLeft !== null && v.ms >= timerLeft) {
        loads += 1; parked = false; timerLeft = null;
      } else if (timerLeft !== null) {
        timerLeft -= v.ms;    // partial progress is discarded on leave, below
      }
    } else {
      timerLeft = null;       // cancelled — a visit shorter than the debounce costs nothing
      parked = true;          // background dumps the model (immediate, by design)
    }
  }
  return loads;
}

const DEBOUNCE = (() => {
  const m = /const QWEN_REWARM_DELAY_MS = ([\d_]+);/.exec(APP);
  if (!m) throw new Error('QWEN_REWARM_DELAY_MS not found in App.tsx');
  return Number(m[1]!.replace(/_/g, ''));
})();

describe('OTA-1275 — app-switching stops costing 425MB a trip', () => {
  it('⚠⚠ THE OWNER\'S ACTUAL SESSION: 6 loads before, 2 after — the 4 switches go away', () => {
    // Transcribed from the device log above, in order.
    const session: { state: 'active' | 'background'; ms: number }[] = [
      { state: 'active', ms: 11_023 },
      { state: 'background', ms: 159_998 },
      { state: 'active', ms: 6_899 },
      { state: 'background', ms: 45_425 },
      { state: 'active', ms: 2_575 },
      { state: 'background', ms: 3_746 },
      { state: 'active', ms: 2_313 },
      { state: 'background', ms: 3_671 },
      { state: 'active', ms: 2_370 },
      { state: 'background', ms: 3_352 },
      { state: 'active', ms: 30_000 },   // he stopped switching and read the screen
    ];
    // The shipped behaviour before this OTA: reload on EVERY foreground.
    expect(loadsFor(session, 0)).toBe(6);
    // After: 2 — and BOTH are legitimate. ⚠ My first draft asserted 1 and the
    // mirror corrected me: the opening 11.0s foreground is a settled session in
    // its own right (he was playing), and so is the 30s at the end. What the
    // debounce removes is the FOUR app-switch loads in the middle, which is the
    // entire complaint. Writing down the number I expected and the number that
    // is true, because the gap was mine.
    expect(loadsFor(session, DEBOUNCE)).toBe(2);
  });

  it('⚠⚠ the four rapid switches cost NOTHING — that is the whole fix', () => {
    const churn: { state: 'active' | 'background'; ms: number }[] = [];
    for (let i = 0; i < 4; i++) {
      churn.push({ state: 'active', ms: 2_500 });
      churn.push({ state: 'background', ms: 3_500 });
    }
    expect(loadsFor(churn, 0)).toBe(4);          // before
    expect(loadsFor(churn, DEBOUNCE)).toBe(0);   // after
  });

  it('⚠⚠ ...but a real return to play STILL re-warms — arb140\'s finding survives', () => {
    // arb140: one transient background must not bench the Arbiter for the rest
    // of the session. A player who comes back and actually plays gets the model.
    expect(loadsFor([
      { state: 'active', ms: 5_000 },
      { state: 'background', ms: 60_000 },
      { state: 'active', ms: 120_000 },
    ], DEBOUNCE)).toBe(1);
  });

  it('⚠ the debounce clears the measured churn but not a play session', () => {
    // Every foreground visit from his switching run, and the settled one.
    for (const shortMs of [2_313, 2_370, 2_575, 6_899]) {
      expect({ ms: shortMs, loads: loadsFor([{ state: 'active', ms: shortMs }], DEBOUNCE) })
        .toEqual({ ms: shortMs, loads: 0 });
    }
    expect(loadsFor([{ state: 'active', ms: 30_000 }], DEBOUNCE)).toBe(1);
  });
});

describe('OTA-1275 — the source keeps the asymmetry', () => {
  it('⚠⚠ the DUMP is still immediate — the jetsam fix is untouched', () => {
    // Holding ~425MB while backgrounded is what gets the process killed
    // (OTA-1177's jetsam reports). Only the rebuild is allowed to wait.
    const i = APP.indexOf("if (status === 'background') {");
    expect(i).toBeGreaterThan(-1);
    const block = APP.slice(i, i + 300);
    expect(block).toContain('void shutdownQwen();');
    expect(block).not.toContain('setTimeout');
  });

  it('⚠⚠ the RE-WARM is behind the timer, and leaving CANCELS it', () => {
    expect(APP).toContain('qwenRewarmTimer.current = setTimeout(');
    expect(APP).toContain('}, QWEN_REWARM_DELAY_MS);');
    // The cancel runs on background AND inactive — a visit shorter than the
    // debounce must never start a load it is about to abandon.
    const i = APP.indexOf("if (status === 'background' || status === 'inactive') {");
    expect(i).toBeGreaterThan(-1);
    const leaving = APP.slice(i, APP.indexOf("if (status === 'background') {", i));
    expect(leaving).toContain('clearTimeout(qwenRewarmTimer.current)');
  });

  it('⚠ the timer is torn down with the listener — no stray load after unmount', () => {
    const i = APP.indexOf("const sub = AppState.addEventListener('change', onChange);");
    expect(i).toBeGreaterThan(-1);
    const teardown = APP.slice(i, i + 400);
    expect(teardown).toContain('sub.remove();');
    expect(teardown).toContain('clearTimeout(qwenRewarmTimer.current)');
  });

  it('⚠ both transitions are logged, so the NEXT device log grades this', () => {
    // The ctx OPENED/RELEASED lines are what exposed the thrash; these name the
    // decision that produced them.
    expect(APP).toContain("'qwen: re-warm cancelled (left the foreground first)'");
    expect(APP).toContain('qwen: re-warming after ${QWEN_REWARM_DELAY_MS}ms settled foreground');
  });
});
