/**
 * OTA-1472 — THE PLAYER ACTING IS ITSELF A PREEMPTION SIGNAL.
 *
 * ⚠⚠⚠ THE MEASUREMENT, from the owner's device log:
 *
 *     ⚠ Worst logic stall: 3150ms          (during a flee)
 *     narration:ambient_fill … 8.2s        (immediately before it)
 *
 * The freeze watch samples every FREEZE_SAMPLE_MS (5000) and reports
 * `now - lastSample - 5000`. A 3150 ms gap therefore means the sampler fired
 * 8150 ms late — within 50 ms of that fill's own 8.2 s runtime. The JS thread
 * was not free for essentially the whole generation, and the flee landed inside
 * it. That arithmetic is asserted below rather than asserted in prose, because
 * it is the entire reason this OTA points at homework rather than at the flee.
 *
 * ⚠⚠ OTA-1123 ALREADY BUILT THE CURE AND WIRED IT TO THE WRONG TRIGGER. Owner,
 * on idle-time generation: *"if done right, it should cost us [no] time
 * correct?"* — and OTA-1123 answered that with an `onPreempt` hook so that *"a
 * homework generation six seconds into a ten-second job"* could not make the
 * next tap wait. But the hook fires only from the ENQUEUE path: it needs some
 * OTHER native-ML call to arrive. A flee needs no model. A move needs no model.
 * A chip tap needs no model. So for every action that is pure logic — which is
 * most of them — the mechanism written to prevent exactly this was never asked.
 *
 * ⚠ THE SPRINT GATE IS THE NEAR MISS, and its own OTA already says why it cannot
 * cover this case: it governs what STARTS, needs three actions inside four
 * seconds to trip, and OTA-1405 records that *"the first generation of a burst
 * is always already running by then"*. Nothing looked at what was ALREADY
 * RUNNING when one deliberate action arrived.
 */
import {
  runExclusiveNativeMl,
  preemptHomeworkForPlayer,
  homeworkCutsForPlayerCount,
  _mlLockState,
  _resetHomeworkCutsForTest,
  ML_PRIORITY_HOMEWORK, ML_PRIORITY_LLM, ML_PRIORITY_COGNITION,
  ML_PRIORITY_VOICE, ML_PRIORITY_TEARDOWN,
} from '../app/ai/nativeMlLock';
import { notePlayerActionForSprint, playerIsSprinting, _resetSprintForTest } from '../app/state/sprint';
import { FREEZE_SAMPLE_MS } from '../app/diagnostics/runtimePressure';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * A job that occupies the lock until released, and records whether it was asked
 * to stop early. Stands in for a llama completion: the real `onPreempt` calls
 * `stopCompletion()`, and the only thing this OTA changes is WHO asks.
 */
function heldJob(priority: number, withHook = true) {
  let release!: () => void;
  const done = new Promise<void>((r) => { release = r; });
  const state = { cut: false, settled: false };
  const p = runExclusiveNativeMl(
    async () => { await done; return 'x'; },
    priority,
    withHook ? () => { state.cut = true; } : undefined,
  ).then(() => { state.settled = true; });
  return { state, release, p };
}

beforeEach(() => {
  _resetSprintForTest();
  _resetHomeworkCutsForTest();
});

describe('OTA-1472 — the arithmetic that points at homework', () => {
  it('⚠⚠⚠ A 3150ms GAP IS AN 8150ms LATE SAMPLE — the fill\'s own runtime', () => {
    // ⚠⚠⚠ THE TWO LOG LINES, VERBATIM AND ADJACENT, from the owner's 4.32.11
    // capture. They are 126ms apart — the watch fired the moment the fill let go:
    //
    //   00:09:10.383  qwen⏱ ambient_fill ok 8184ms read 3923ms/write 1109ms …
    //   00:09:10.509  ⚠ FREEZE WATCH: LOGIC stalled while frames kept coming
    //                 (js 3150ms · frames 748ms)
    //
    // `jsGap = now - lastJsAt - FREEZE_SAMPLE_MS`, so the reported stall is the
    // OVERSHOOT, not the block. Reading 3150 as "something blocked for 3.1s" was
    // the first wrong turn here; the block was 8150ms, and the fill measured
    // 8184ms. Thirty-four milliseconds apart. That is not a correlation, it is
    // the same event counted twice.
    const reportedStall = 3150;
    const actualLateness = reportedStall + FREEZE_SAMPLE_MS;
    expect(actualLateness).toBe(8150);
    const fillRuntimeMs = 8184;                       // from the line above it
    expect(Math.abs(actualLateness - fillRuntimeMs)).toBeLessThan(50);
  });

  it('⚠⚠⚠ AND THE FLEE WAITED THE WHOLE TIME — the cost, in his own log', () => {
    // He tapped flee at 00:09:05.227. The escape check did not resolve until
    // 00:09:10.638 — 5.4 seconds, against ~1.5s for the same flee elsewhere in
    // the same capture (23:56:21.985 → 23:56:23.545). The difference is the
    // fill, and the fill is work nobody asked for.
    const fleeUnderHomeworkMs = 10_638 - 5_227;
    const fleeUnloadedMs = 23_545 - 21_985;
    expect(fleeUnderHomeworkMs).toBeGreaterThan(5_000);
    expect(fleeUnloadedMs).toBeLessThan(2_000);
    expect(fleeUnderHomeworkMs / fleeUnloadedMs).toBeGreaterThan(3);
  });

  it('⚠⚠ and the sampler interval is what that derivation rests on', () => {
    // If FREEZE_SAMPLE_MS ever moves, the number above stops meaning what this
    // OTA says it means, and the reasoning has to be redone rather than assumed.
    expect(FREEZE_SAMPLE_MS).toBe(5_000);
  });
});

describe('OTA-1472 — a player action cuts a running homework job', () => {
  it('⚠⚠⚠ HIS CASE — homework in flight, the player acts, the job is cut', async () => {
    const job = heldJob(ML_PRIORITY_HOMEWORK);
    await tick();
    expect(_mlLockState().running).toBe(true);
    expect(job.state.cut).toBe(false);
    notePlayerActionForSprint();
    expect(job.state.cut).toBe(true);
    job.release();
    await job.p;
  });

  it('⚠⚠⚠ AND NOTHING ELSE HAD TO BE ENQUEUED — that was the whole gap', async () => {
    // The flee needs no model. Before this OTA the queue stayed empty, so the
    // enqueue-side trigger never fired and the job ran its full 8 seconds.
    const job = heldJob(ML_PRIORITY_HOMEWORK);
    await tick();
    expect(_mlLockState().queued).toBe(0);
    expect(preemptHomeworkForPlayer()).toBe(true);
    expect(_mlLockState().queued).toBe(0);   // still nothing queued
    expect(job.state.cut).toBe(true);
    job.release();
    await job.p;
  });

  it('⚠⚠⚠ THE CUT IS COUNTED — an instrument that cannot say it fired is worthless', async () => {
    expect(homeworkCutsForPlayerCount()).toBe(0);
    const job = heldJob(ML_PRIORITY_HOMEWORK);
    await tick();
    notePlayerActionForSprint();
    expect(homeworkCutsForPlayerCount()).toBe(1);
    job.release();
    await job.p;
  });

  it('⚠⚠ it reports FALSE when there was nothing to cut — absent, not unresolved', async () => {
    expect(preemptHomeworkForPlayer()).toBe(false);
    expect(homeworkCutsForPlayerCount()).toBe(0);
  });

  it('⚠⚠ a homework job with NO hook is left alone rather than half-cut', async () => {
    // Nothing to call. The lock must report honestly rather than counting a cut
    // it did not make.
    const job = heldJob(ML_PRIORITY_HOMEWORK, false);
    await tick();
    expect(preemptHomeworkForPlayer()).toBe(false);
    expect(homeworkCutsForPlayerCount()).toBe(0);
    job.release();
    await job.p;
  });

  it('⚠⚠ cutting twice cuts once — the hook is cleared, and the counter agrees', async () => {
    const job = heldJob(ML_PRIORITY_HOMEWORK);
    await tick();
    expect(preemptHomeworkForPlayer()).toBe(true);
    expect(preemptHomeworkForPlayer()).toBe(false);
    expect(homeworkCutsForPlayerCount()).toBe(1);
    job.release();
    await job.p;
  });

  it('⚠⚠⚠ AND THE JOB STILL SETTLES — a cut must never wedge the chain', async () => {
    // arb159's exclusivity guarantee: the chain waits for the running op to
    // SETTLE. A preemption that left it unsettled would deadlock every later
    // native-ML call, which is far worse than the stall being fixed.
    const job = heldJob(ML_PRIORITY_HOMEWORK);
    await tick();
    preemptHomeworkForPlayer();
    job.release();
    await job.p;
    await tick();
    expect(job.state.settled).toBe(true);
    expect(_mlLockState().running).toBe(false);
  });

  it('⚠⚠ a hook that THROWS still frees the lock', async () => {
    let released = false;
    const p = runExclusiveNativeMl(
      async () => { await tick(); released = true; return 1; },
      ML_PRIORITY_HOMEWORK,
      () => { throw new Error('broken hook'); },
    );
    await tick();
    expect(() => preemptHomeworkForPlayer()).not.toThrow();
    await p;
    await tick();
    expect(released).toBe(true);
    expect(_mlLockState().running).toBe(false);
  });
});

describe('OTA-1472 — and it cuts ONLY the lane nobody asked for', () => {
  // ⚠ THE GUARD IS A FLOOR, NOT A NAME. Everything at or above ML_PRIORITY_LLM
  // is work somebody asked for: the player's own narration, cognition still
  // resolving their action, a voice line, a teardown. Cutting any of those to
  // make the player's action land would be cutting the thing the action is FOR.
  const protectedLanes: [string, number][] = [
    ['LLM narration', ML_PRIORITY_LLM],
    ['cognition', ML_PRIORITY_COGNITION],
    ['voice', ML_PRIORITY_VOICE],
    ['teardown', ML_PRIORITY_TEARDOWN],
  ];

  for (const [name, priority] of protectedLanes) {
    it(`⚠⚠⚠ ${name} IS NEVER CUT BY A PLAYER ACTION`, async () => {
      const job = heldJob(priority);
      await tick();
      expect({ name, cut: preemptHomeworkForPlayer() }).toEqual({ name, cut: false });
      notePlayerActionForSprint();
      expect({ name, hookFired: job.state.cut }).toEqual({ name, hookFired: false });
      expect(homeworkCutsForPlayerCount()).toBe(0);
      job.release();
      await job.p;
    });
  }

  it('⚠⚠⚠ THE LADDER IS INTACT — homework is still the only lane below LLM', () => {
    // The floor is only correct while homework is the sole thing beneath it. If
    // a new low-priority lane is ever added, this fails and the guard gets
    // reconsidered instead of silently widening.
    expect(ML_PRIORITY_HOMEWORK).toBeLessThan(ML_PRIORITY_LLM);
    for (const [, p] of protectedLanes) expect(p).toBeGreaterThanOrEqual(ML_PRIORITY_LLM);
  });

  it('⚠⚠ item synthesis keeps its own hook — this OTA did not take it away', () => {
    // OTA-1134 gave `interruptible` the same hook at LLM priority, deliberately
    // independent of homework. That hook is still fired by the ENQUEUE path (a
    // real call arriving), which is right for work the player did ask for — and
    // this OTA's floor means a bare player action does NOT cut it.
    const rt = codeOnly(read('app', 'ai', 'generation', 'LlamaRuntime.ts'));
    expect(rt).toContain('(opts.homework || opts.interruptible)');
    expect(rt).toContain('opts.homework ? ML_PRIORITY_HOMEWORK : ML_PRIORITY_LLM');
  });
});

describe('OTA-1472 — hooked to the ONE canonical player-acted feed', () => {
  it('⚠⚠⚠ IT LIVES IN notePlayerActionForSprint, not at a call site', () => {
    // ⚠ THE POINT. OTA-1405 widened this function to be the single "the player
    // did something" signal precisely because `submitPlayerAction` alone missed
    // the button paths. Wiring the cut to a call site instead would repeat, on
    // the fix, the exact mistake the fix exists to correct.
    const sprint = codeOnly(read('app', 'state', 'sprint.ts'));
    expect(sprint).toContain('preemptHomeworkForPlayer()');
    const fn = sprint.slice(sprint.indexOf('export function notePlayerActionForSprint'));
    expect(fn.slice(0, fn.indexOf('}'))).toContain('preemptHomeworkForPlayer()');
  });

  it('⚠⚠⚠ AND BEFORE THE COALESCE RETURN — the first door cuts', () => {
    // A coalesced door is still the player acting. Waiting for the door that
    // happens to survive coalescing would delay the cut for nothing.
    const sprint = codeOnly(read('app', 'state', 'sprint.ts'));
    const fn = sprint.slice(sprint.indexOf('export function notePlayerActionForSprint'));
    expect(fn.indexOf('preemptHomeworkForPlayer()')).toBeLessThan(fn.indexOf('SPRINT_COALESCE_MS'));
  });

  it('⚠⚠⚠ A COALESCED SECOND DOOR STILL LEAVES THE JOB CUT', async () => {
    const job = heldJob(ML_PRIORITY_HOMEWORK);
    await tick();
    const now = Date.now();
    notePlayerActionForSprint(now);
    notePlayerActionForSprint(now + 10);   // inside SPRINT_COALESCE_MS
    expect(job.state.cut).toBe(true);
    job.release();
    await job.p;
  });

  it('⚠⚠⚠ AND THE SPRINT NUMBERS ARE UNTOUCHED — this OTA added, it did not retune', () => {
    // ota1358 owns the window and the threshold. A preemption fix that quietly
    // moved them would be two changes wearing one name.
    const now = Date.now();
    notePlayerActionForSprint(now);
    expect(playerIsSprinting(now)).toBe(false);
    notePlayerActionForSprint(now + 200);
    expect(playerIsSprinting(now + 200)).toBe(false);
    notePlayerActionForSprint(now + 400);
    expect(playerIsSprinting(now + 400)).toBe(true);      // three inside four seconds
    expect(playerIsSprinting(now + 5_000)).toBe(false);   // and the window still expires
  });

  it('⚠⚠ the coalesce window still collapses one action\'s several doors', () => {
    const now = Date.now();
    notePlayerActionForSprint(now);
    notePlayerActionForSprint(now + 10);
    notePlayerActionForSprint(now + 20);
    expect(playerIsSprinting(now + 20)).toBe(false);      // one action, not three
  });

  it('⚠⚠ the dependency cannot cycle — nativeMlLock imports nothing', () => {
    // sprint.ts (app/state) now reaches into app/ai. That is only safe because
    // the lock is a pure leaf; asserted rather than remembered.
    const lock = read('app', 'ai', 'nativeMlLock.ts');
    expect(lock.match(/^import\s/gm)).toBeNull();
  });
});

describe('OTA-1472 — what the fill loses, and why that is the right trade', () => {
  it('⚠⚠⚠ THE BANK ONLY FILLS AFTER A REST, so a cut costs a genuine idle window only', () => {
    // `fillMusingBank` has exactly one caller and it sits in the rest handler —
    // "the player has explicitly chosen to pass time". If they act instead, they
    // were not idling, which is precisely when homework should stand down.
    const store = codeOnly(read('app', 'state', 'gameStore.ts'));
    expect((store.match(/fillMusingBank\(get, set\)/g) ?? []).length).toBe(1);
    const i = store.indexOf('void fillMusingBank(get, set);');
    expect(i).toBeGreaterThan(-1);
    expect(store.slice(Math.max(0, i - 900), i)).toMatch(/You rest for \$\{hours\} hours/);
  });

  it('⚠⚠ and a preempted fill KEEPS its text — OTA-1258, undisturbed', () => {
    // Which is why cutting is cheap: partial fill text still reaches the bank
    // and is re-vetted at spend time. A cut throws away the tail of one line,
    // not the line.
    const narr = codeOnly(read('app', 'ai', 'narration.ts'));
    expect(narr).toContain('shouldAbort: opts?.bankOnly === true');
    expect(narr).toContain('homework: opts?.bankOnly === true');
  });

  it('⚠⚠ a cut generation is already priced in the telemetry as preempted', () => {
    // So the next device log can say how often this fires from the generation
    // side, while `homeworkCutsForPlayerCount` says it from the trigger side.
    // Two independent readings of one event is how they can be checked against
    // each other rather than believed.
    const rt = codeOnly(read('app', 'ai', 'generation', 'LlamaRuntime.ts'));
    expect(rt).toContain("outcome: preempted ? 'preempted'");
  });
});
