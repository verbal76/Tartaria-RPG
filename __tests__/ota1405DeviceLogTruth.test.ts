/**
 * OTA-1405 — FOUR THINGS THE DEVICE LOG WAS SAYING THAT WERE NOT TRUE.
 *
 * The remainder of the owner's 2026-08-20 capture (APK 293 / OTA-1390), after
 * OTA-1402 and OTA-1403 took the contract hand-ins. What connects all four is
 * not a subsystem — it is that in each one the game HAD the right answer and
 * reported the wrong one, or reported the right one somewhere nobody was
 * looking.
 *
 *   1. A tutorial refusal repeated seven times in 2.6 seconds, because the
 *      answer was printed to the feed BEHIND the open picker.
 *   2. `qwen: LOAD FAILED — Qwen failed to initialize` for a load that had been
 *      cancelled, with a reason invented by a `??` default.
 *   3. Thirteen scene intros started and nine of ten thrown away, because the
 *      sprint gate is fed at one door and scenes are begun from five others.
 *   4. `read 49256ms` on a call that finished in 5.4 seconds — the third time
 *      this rule has been written and the first time it has been applied to the
 *      number the reader actually looks at.
 *
 * ⚠⚠ TWO OF THESE ARE REPEATS OF EARLIER FIXES THAT LANDED IN THE WRONG PLACE,
 * and that is the finding worth keeping. #1 is OTA-1402 in a different room —
 * a refusal rendered where the player is not. #4 is OTA-1139 and OTA-1263 for
 * the third time — a guard added beside the number it was written for, twice,
 * while the raw pair on the same line went on printing native garbage as fact.
 * Both failures share a shape: the fix was correct and its BLAST RADIUS was too
 * small. So this suite pins the seams, not the symptoms.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  qwenTimingsArePossible,
  _resetQwenTelemetryForTest,
  recordQwenCall,
  qwenJobStats,
  qwenTelemetrySummary,
} from '../app/ai/generation/qwenTelemetry';
import {
  notePlayerActionForSprint,
  playerIsSprinting,
  _resetSprintForTest,
} from '../app/state/sprint';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const STORE = read('app', 'state', 'gameStore.ts');
const GATHER = read('app', 'components', 'GatherModal.tsx');
const LIFECYCLE = read('app', 'state', 'slices', 'aiLifecycleSlice.ts');
const BOOT = read('app', 'state', 'slices', 'bootSlice.ts');
const NARRATION = read('app', 'ai', 'narration.ts');
const SPRINT = read('app', 'state', 'sprint.ts');

// ───────────────────────── 1 — the refusal nobody could see ─────────────────

describe('OTA-1405 (1) — the tutorial refusal is said where the tap happened', () => {
  it('⚠⚠ the picker renders its OWN refusal, rather than only raising one', () => {
    // The bug in one line: `onBlocked` appends an Arbiter line to the feed, and
    // the feed is underneath this modal's scrim. Seven taps, seven answers, none
    // of them on screen.
    expect(GATHER).toContain('const [refusal, setRefusal] = useState<string | null>(null);');
    expect(GATHER).toContain('refusalStrip');
    // The strip is INSIDE the card, above the scrolling list — OTA-1014 put a
    // refusal above a scroll view once and OTA-1402 paid for it.
    const card = GATHER.indexOf('<Text style={styles.title}');
    const strip = GATHER.indexOf('styles.refusalStrip');
    const list = GATHER.indexOf('rows.length === 0');
    expect(card).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(card);
    expect(strip).toBeLessThan(list);
  });

  it('⚠ it still raises the feed line too — the log must keep the record', () => {
    // A refusal that stops being logged is a stuck player who leaves no trace in
    // the next bug report. Both, not either.
    const i = GATHER.indexOf('const refuse = ()');
    const body = GATHER.slice(i, i + 700);
    expect(body).toContain('onBlocked?.();');
    expect(body).toContain('setRefusal(');
  });

  it('⚠ and it names the thing to tap, not just "no"', () => {
    expect(GATHER).toContain('`Not that one — tap the ${lockedNoun}.`');
  });

  it('⚠⚠ the feed line no longer repeats itself seven times', () => {
    // OTA-1251 met this exact shape ("fourteen refusals in ninety seconds") and
    // rewrote the COPY. The copy was never the problem — a hint that did not land
    // the first time does not land better six more times, and each repeat also
    // queued a spoken line.
    const i = STORE.indexOf('nudgeTutorialBlocked() {');
    expect(i).toBeGreaterThan(-1);
    const body = STORE.slice(i, STORE.indexOf('\n  },', i));
    expect(body).toContain('tutorialNudgeStreak');
    expect(body).toContain('TUTORIAL_NUDGE_QUIET_MS');
    expect(body).toContain('if (!fresh) return;');
  });

  it('⚠ …and the third refusal on one beat names the way out instead', () => {
    // Three misses is a stuck player, not a careless one. SKIP TUTORIAL is the
    // only thing left worth saying.
    const i = STORE.indexOf('nudgeTutorialBlocked() {');
    const body = STORE.slice(i, STORE.indexOf('\n  },', i));
    expect(body).toContain('tutorialNudgeStreak === 3');
    expect(body).toContain('tap SKIP TUTORIAL and I will stop asking');
  });
});

// ───────────────────────── 2 — a cancel is not a failure ────────────────────

describe('OTA-1405 (2) — a cancelled Qwen load stops reporting itself as failed', () => {
  it('⚠⚠ the engine status decides, instead of `isReady()` alone', () => {
    // `runInitialize` leaves status 'idle' and lastError null when dispose()
    // bumps the lifecycle generation mid-load (OTA-1084). `isReady()` is false
    // for BOTH that and a real failure, so asking it alone cannot tell them
    // apart — and the old code did not try.
    expect(LIFECYCLE).toContain("} else if (qwen.getStatus() === 'failed') {");
    expect(LIFECYCLE).toContain('qwen: LOAD CANCELLED');
  });

  it('⚠⚠ no reason is invented when the engine has none to give', () => {
    // The old line was `qwen.getLastError() ?? 'Qwen failed to initialize'`. A
    // default reason is a lie whenever the ABSENCE of a reason is the actual
    // information — and that invented string then read as a diagnosis in the log
    // and in the bug-report header.
    const i = LIFECYCLE.indexOf('async bootQwen()');
    const body = codeOnly(LIFECYCLE.slice(i, LIFECYCLE.indexOf('async shutdownQwen()', i)));
    // The fallback survives ONLY on the branch where the engine really did fail.
    const failBranch = body.indexOf("qwen.getStatus() === 'failed'");
    const cancelBranch = body.indexOf('LOAD CANCELLED');
    expect(failBranch).toBeGreaterThan(-1);
    expect(cancelBranch).toBeGreaterThan(failBranch);
    expect(body.slice(cancelBranch - 400, cancelBranch)).not.toContain('Qwen failed to initialize');
  });

  it('⚠⚠ the store goes back to idle, so About stops lying AND the re-warm works', () => {
    // 'failed' put "✗ AI LOAD FAILED — SEE BELOW" on the About screen for a model
    // that was merely parked. 'idle' is true, and it is also what App.tsx's
    // settled-foreground re-warm needs: bootQwen()'s own guard admits 'idle'.
    const i = LIFECYCLE.indexOf('LOAD CANCELLED');
    const near = LIFECYCLE.slice(i - 600, i);
    expect(near).toContain("set({ qwenStatus: 'idle', qwenFraction: 0, qwenError: null });");
    expect(LIFECYCLE).toContain("if (current !== 'idle' && current !== 'failed') return;");
  });

  it('⚠ a real failure still says LOAD FAILED, with the real reason', () => {
    expect(LIFECYCLE).toContain('qwen: LOAD FAILED — ${why}');
    expect(LIFECYCLE).toContain('qwen: LOAD THREW — ${message}');
  });
});

// ───────────────────────── 3 — the gate could not see the churn ─────────────

describe('OTA-1405 (3) — the sprint detector is fed from every door that begins a scene', () => {
  beforeEach(() => _resetSprintForTest());

  it('⚠⚠ beginScene feeds it, because that is where scene intros are dispatched', () => {
    // The hole: OTA-1358 fed the detector from `submitPlayerAction` — the door for
    // TYPED and chip input. Travelling, entering a building and changing rooms are
    // separate store actions, so a player crossing the map by BUTTON never touched
    // it, and `playerIsSprinting()` stayed false through the whole burst.
    const i = STORE.indexOf('  beginScene(opts?: {');
    expect(i).toBeGreaterThan(-1);
    const body = STORE.slice(i, i + 2200);
    expect(body).toContain('notePlayerActionForSprint();');
    // Before `_beginSceneCore` runs, so the intro it dispatches sees the note.
    expect(body.indexOf('notePlayerActionForSprint();'))
      .toBeLessThan(body.indexOf('get()._beginSceneCore(opts);'));
  });

  it('⚠⚠ one action passing two doors still counts ONCE', () => {
    // A typed action can both submit AND begin a scene. Counting it twice would
    // trip a three-action gate on two real actions and mute the Arbiter for a
    // player who is reading.
    const t = 5_000_000;
    notePlayerActionForSprint(t);        // submitPlayerAction
    notePlayerActionForSprint(t + 3);    // beginScene, same action
    notePlayerActionForSprint(t + 1_000);
    notePlayerActionForSprint(t + 1_003);
    expect(playerIsSprinting(t + 1_100)).toBe(false); // two actions, not four
    notePlayerActionForSprint(t + 2_000);
    expect(playerIsSprinting(t + 2_100)).toBe(true);  // three is three
  });

  it('⚠ …and two genuine taps are never collapsed into one', () => {
    // The coalesce window is far under a human double-tap (~180-250ms measured).
    const t = 6_000_000;
    notePlayerActionForSprint(t);
    notePlayerActionForSprint(t + 180);
    notePlayerActionForSprint(t + 360);
    expect(playerIsSprinting(t + 400)).toBe(true);
  });

  it('⚠ the window and threshold are untouched — only the FEED widened', () => {
    expect(SPRINT).toContain('const SPRINT_WINDOW_MS = 4_000;');
    expect(SPRINT).toContain('const SPRINT_ACTIONS = 3;');
  });

  it('⚠⚠ and the first generation of a burst — which no counter can predict — backs off after', () => {
    // Three actions are needed to trip the gate, so generation #1 is always
    // already inside a native call by then, and OTA-1368 says plainly that a
    // prompt read in flight cannot be interrupted. The discard itself is the only
    // honest evidence, so the next LIVE line waits for a pause.
    expect(NARRATION).toContain('const NARRATION_BURN_BACKOFF_MS = 4_000;');
    expect(NARRATION).toContain('lastLiveNarrationBurnedAt = Date.now();');
    expect(NARRATION).toContain('|| sprinting || burnedRecently)');
    expect(NARRATION).toContain("'burned-recently'");
  });

  it('⚠ fills are exempt from the back-off, on purpose', () => {
    // OTA-1258: a late fill still goes to the bank and is re-vetted when spent,
    // so late text is free text later. Only a line with a reader waiting can be
    // wasted by being late.
    const i = NARRATION.indexOf('const burnedRecently =');
    expect(NARRATION.slice(i, i + 200)).toContain('!opts?.bankOnly');
  });
});

// ───────────────────────── 4 — the numbers that could not be true ───────────

describe('OTA-1405 (4) — an impossible timing is refused everywhere, by one rule', () => {
  beforeEach(() => _resetQwenTelemetryForTest());

  it('⚠⚠ the rows from three different device logs are all refused', () => {
    // Verbatim. OTA-1139's, OTA-1263's, and the owner's 2026-08-20 one.
    expect(qwenTimingsArePossible({ prefillMs: 54_112, totalMs: 5_353 })).toBe(false);
    expect(qwenTimingsArePossible({ prefillMs: 8_286, decodeMs: 4_020, totalMs: 6_863 })).toBe(false);
    expect(qwenTimingsArePossible({ prefillMs: 49_256, decodeMs: 2_771, totalMs: 5_400 })).toBe(false);
  });

  it('⚠⚠ prefill + decode is the test, not prefill alone', () => {
    // The old rule only asked about prefill, so a split that individually fit
    // inside the call but together overran it sailed through.
    expect(qwenTimingsArePossible({ prefillMs: 4_000, decodeMs: 3_000, totalMs: 5_000 })).toBe(false);
    expect(qwenTimingsArePossible({ prefillMs: 3_000, decodeMs: 1_500, totalMs: 5_000 })).toBe(true);
  });

  it('⚠ a real zero prefill is a measurement, not a missing one', () => {
    // A fully-cached prompt legitimately reads 0ms and must stay in the sample.
    expect(qwenTimingsArePossible({ prefillMs: 0, decodeMs: 900, totalMs: 1_000 })).toBe(true);
    // Nothing reported at all is not a measurement.
    expect(qwenTimingsArePossible({ totalMs: 1_000 })).toBe(false);
    // Negatives have been seen from the native side and are as impossible.
    expect(qwenTimingsArePossible({ prefillMs: -5, totalMs: 1_000 })).toBe(false);
  });

  it('⚠⚠ the AVERAGE obeys it — the half OTA-1139 and OTA-1263 both left open', () => {
    // Before: the ms/tok range refused a sample the average swallowed, so one
    // rollup carried two standards of evidence in the same breath.
    recordQwenCall({ job: 'j', totalMs: 5_000, waitMs: 0, chars: 10, outcome: 'ok', at: 0,
      prefillMs: 2_000, decodeMs: 1_000, promptTokens: 100 });
    recordQwenCall({ job: 'j', totalMs: 5_400, waitMs: 0, chars: 10, outcome: 'ok', at: 0,
      prefillMs: 49_256, decodeMs: 2_771, promptTokens: 100 });
    const [j] = qwenJobStats();
    expect(j!.timingSamples).toBe(1);
    expect(j!.timingsRejected).toBe(1);
    // 2000, not (2000 + 49256) / 2 — and not 2000/2 either.
    expect(j!.avgPrefillMs).toBe(2_000);
    expect(j!.avgDecodeMs).toBe(1_000);
  });

  it('⚠⚠ …and it is divided by the samples that survived, not by every call', () => {
    // The second way to get a wrong average out of a right filter: reject four of
    // ten, still divide by ten, and the job reads as faster than it is.
    for (let i = 0; i < 3; i++) {
      recordQwenCall({ job: 'k', totalMs: 9_000, waitMs: 0, chars: 5, outcome: 'ok', at: 0,
        prefillMs: 90_000, promptTokens: 50 });
    }
    recordQwenCall({ job: 'k', totalMs: 4_000, waitMs: 0, chars: 5, outcome: 'ok', at: 0,
      prefillMs: 3_000, decodeMs: 500, promptTokens: 50 });
    const j = qwenJobStats().find((x) => x.job === 'k')!;
    expect(j.count).toBe(4);
    expect(j.timingSamples).toBe(1);
    expect(j.avgPrefillMs).toBe(3_000);
  });

  it('⚠ the rollup SAYS how much it threw away, rather than dropping it silently', () => {
    recordQwenCall({ job: 'm', totalMs: 1_000, waitMs: 0, chars: 5, outcome: 'ok', at: 0,
      prefillMs: 40_000, promptTokens: 10 });
    expect(qwenTelemetrySummary()).toContain('bogus');
  });

  it('⚠⚠ the per-call LINE marks it too — the number the owner actually read', () => {
    // This is the whole point of the OTA. The guard existed twice and neither
    // copy stood in front of `read Xms/write Yms`, which is the first thing a
    // reader's eye lands on.
    expect(BOOT).toContain('const timingsOk = qwenTimingsArePossible(r);');
    expect(BOOT).toContain('NOT-PER-CALL');
    // Marked, not deleted: that llama.rn reports these at all is itself a finding.
    const i = BOOT.indexOf('const timingsOk =');
    const block = BOOT.slice(i, i + 500);
    expect(block).toContain("read ⚠${r.prefillMs ?? '?'}ms");
  });

  it('⚠⚠ the rule is defined ONCE and re-derived nowhere', () => {
    // The actual fix. Three copies of a rule is three chances to fix it in two,
    // which is exactly the history here.
    const tel = read('app', 'ai', 'generation', 'qwenTelemetry.ts');
    expect(tel).toContain('export function qwenTimingsArePossible(');
    const everywhere = codeOnly(tel) + codeOnly(BOOT) + codeOnly(STORE) + codeOnly(NARRATION);
    expect(everywhere.match(/prefillMs\s*<=\s*r?\.?totalMs/g) ?? []).toEqual([]);
  });
});
