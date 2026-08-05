// OTA-1146 — HOMEWORK YIELDS. The harness the homework slots will run on, and
// the answer to the owner's question about them: *"if done right, it should
// cost us [no] time correct?"*
//
// NOT AUTOMATICALLY — and the difference is the whole engineering problem.
//
// OTA-634 made the native-ML lock priority-aware, and its own note is precise
// about the limit: *"a native call already in flight can't be preempted —
// `running` guards that — so priority only reorders the WAITING set."* That is
// exactly right for voice vs narration, where both are work someone asked for
// and the only question is order. It is NOT enough for homework, which nobody
// asked for: a homework generation six seconds into a ten-second job makes the
// player's next tap wait four seconds, and priority cannot help because the job
// is already running.
//
// So homework gets two things, and they only work together:
//   1. ML_PRIORITY_HOMEWORK, BELOW voice — it never jumps a queue; and
//   2. an onPreempt hook — the moment higher-priority work is enqueued,
//      llama.cpp is told to stop, the promise settles with whatever it had, the
//      lock frees, and the player's call runs.
//
// ⚠ EXCLUSIVITY IS UNTOUCHED. Preemption does not overlap two native ops: it
// asks the running one to FINISH EARLY, and the chain still waits for it to
// settle before pumping. The arb159 crash guarantee is exactly as strong, and
// that is the property this suite guards hardest.
//
// The bank's rest-filler (OTA-1145) is wired as the FIRST homework job, so this
// harness ships with a live consumer rather than as scaffolding waiting for
// one.

import {
  runExclusiveNativeMl,
  ML_PRIORITY_HOMEWORK,
  ML_PRIORITY_VOICE,
  ML_PRIORITY_LLM,
  _mlLockState,
} from '../app/ai/nativeMlLock';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('OTA-1146 — homework is the lowest priority there is', () => {
  it('the tiers are ordered homework < voice < narration', () => {
    expect(ML_PRIORITY_HOMEWORK).toBeLessThan(ML_PRIORITY_VOICE);
    expect(ML_PRIORITY_VOICE).toBeLessThan(ML_PRIORITY_LLM);
  });

  it('⚠ a queued homework job runs LAST, behind voice and narration', async () => {
    const order: string[] = [];
    const gate = new Promise<void>((r) => setTimeout(r, 20));
    // Occupy the lock so the next three all queue.
    const blocker = runExclusiveNativeMl(async () => { await gate; order.push('blocker'); });
    const hw = runExclusiveNativeMl(async () => { order.push('homework'); }, ML_PRIORITY_HOMEWORK);
    const voice = runExclusiveNativeMl(async () => { order.push('voice'); }, ML_PRIORITY_VOICE);
    const llm = runExclusiveNativeMl(async () => { order.push('llm'); }, ML_PRIORITY_LLM);
    await Promise.all([blocker, hw, voice, llm]);
    expect(order).toEqual(['blocker', 'llm', 'voice', 'homework']);
  });
});

describe('OTA-1146 — ⚠ homework in flight is cut short, not waited out', () => {
  it('the running job is asked to stop the moment real work arrives', async () => {
    let cut = false;
    let released!: () => void;
    const holding = new Promise<void>((r) => { released = r; });
    // A homework job that runs until it is told to stop.
    const hw = runExclusiveNativeMl(
      async () => { await holding; return 'partial'; },
      ML_PRIORITY_HOMEWORK,
      () => { cut = true; released(); },
    );
    await tick();
    expect(cut).toBe(false); // nothing else wants the model yet
    // The player acts.
    const player = runExclusiveNativeMl(async () => 'narration', ML_PRIORITY_LLM);
    expect(cut).toBe(true);  // ...and the hook fired SYNCHRONOUSLY on enqueue
    await expect(hw).resolves.toBe('partial');
    await expect(player).resolves.toBe('narration');
  });

  it('⚠ preemption fires on ENQUEUE, not on pump — the wait has already started', async () => {
    // Firing at pump time would be useless: by then the running op has
    // finished and the player has already waited out the whole thing.
    let cutAt = -1;
    let released!: () => void;
    const holding = new Promise<void>((r) => { released = r; });
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 1);
    const hw = runExclusiveNativeMl(
      async () => { await holding; },
      ML_PRIORITY_HOMEWORK,
      () => { cutAt = ticks; released(); },
    );
    await new Promise((r) => setTimeout(r, 10));
    void runExclusiveNativeMl(async () => 'x', ML_PRIORITY_LLM);
    clearInterval(timer);
    await hw;
    // Cut while the homework job was still the running op.
    expect(cutAt).toBeGreaterThanOrEqual(0);
  });

  it('equal or lower priority does NOT preempt — only work that outranks it', async () => {
    let cut = false;
    let released!: () => void;
    const holding = new Promise<void>((r) => { released = r; });
    const hw = runExclusiveNativeMl(
      async () => { await holding; },
      ML_PRIORITY_HOMEWORK,
      () => { cut = true; released(); },
    );
    await tick();
    void runExclusiveNativeMl(async () => 'other homework', ML_PRIORITY_HOMEWORK);
    expect(cut).toBe(false);
    released();
    await hw;
  });

  it('⚠ ordinary work is NEVER preempted — finishing it IS the point', async () => {
    // Narration and voice supply no hook, so there is nothing to fire. This is
    // the guard against someone "generalising" preemption to all priorities.
    let released!: () => void;
    const holding = new Promise<void>((r) => { released = r; });
    const running = runExclusiveNativeMl(async () => { await holding; return 'finished'; }, ML_PRIORITY_VOICE);
    await tick();
    const jumper = runExclusiveNativeMl(async () => 'jumper', ML_PRIORITY_LLM);
    await tick();
    // Still running: nothing cut it short.
    expect(_mlLockState().running).toBe(true);
    released();
    await expect(running).resolves.toBe('finished');
    await expect(jumper).resolves.toBe('jumper');
  });

  it('⚠ EXCLUSIVITY HOLDS — preemption never overlaps two native ops', async () => {
    // This is the arb159 crash guarantee and it outranks every latency concern
    // in this file. A preempted op still has to SETTLE before the next runs.
    let concurrent = 0;
    let maxConcurrent = 0;
    let released!: () => void;
    const holding = new Promise<void>((r) => { released = r; });
    const hw = runExclusiveNativeMl(
      async () => {
        concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
        await holding;
        // Deliberately linger AFTER the stop signal, the way a native call
        // does — llama.cpp does not return the instant it is told to stop.
        await new Promise((r) => setTimeout(r, 5));
        concurrent--;
      },
      ML_PRIORITY_HOMEWORK,
      () => { released(); },
    );
    await tick();
    const player = runExclusiveNativeMl(async () => {
      concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
      await tick();
      concurrent--;
    }, ML_PRIORITY_LLM);
    await Promise.all([hw, player]);
    expect(maxConcurrent).toBe(1);
  });

  it('a throwing preempt hook cannot wedge the chain', async () => {
    let released!: () => void;
    const holding = new Promise<void>((r) => { released = r; });
    const hw = runExclusiveNativeMl(
      async () => { await holding; },
      ML_PRIORITY_HOMEWORK,
      () => { released(); throw new Error('broken hook'); },
    );
    const player = runExclusiveNativeMl(async () => 'still runs', ML_PRIORITY_LLM);
    await hw;
    await expect(player).resolves.toBe('still runs');
  });

  it('the hook fires at most once per job', async () => {
    let calls = 0;
    let released!: () => void;
    const holding = new Promise<void>((r) => { released = r; });
    const hw = runExclusiveNativeMl(
      async () => { await holding; },
      ML_PRIORITY_HOMEWORK,
      () => { calls++; released(); },
    );
    await tick();
    void runExclusiveNativeMl(async () => 'a', ML_PRIORITY_LLM);
    void runExclusiveNativeMl(async () => 'b', ML_PRIORITY_LLM);
    await hw;
    expect(calls).toBe(1);
  });
});

describe('OTA-1146 — the wiring, and the first homework job', () => {
  const rt = src('app/ai/generation/LlamaRuntime.ts');

  it('the runtime routes homework to the low tier with a stop hook', () => {
    expect(rt).toContain('opts.homework ? ML_PRIORITY_HOMEWORK : ML_PRIORITY_LLM,');
    expect(rt).toContain('stopCompletion?.()');
  });

  it('⚠ only homework supplies a hook — ordinary calls pass undefined', () => {
    expect(rt).toContain('opts.homework\n        ? () => {');
    expect(rt).toContain('        : undefined,');
  });

  it('⚠ a preempted call is reported as such, not as an error or an ok', () => {
    // Partial text from a job we cut short must not average into latency as a
    // success, and an empty one is not the model failing — it is the model
    // being told to stop.
    expect(rt).toContain("outcome: preempted ? 'preempted'");
    const tel = src('app/ai/generation/qwenTelemetry.ts');
    expect(tel).toContain("| 'preempted'");
    expect(tel).toContain('preempted: number;');
  });

  it('⚠ the preempted mark is NOT filed with the failures', () => {
    // Yielding to the player is the feature working. It gets its own mark so a
    // session full of them still shows up (homework scheduled at bad moments
    // burns battery for nothing) without reading as a fault.
    const tel = src('app/ai/generation/qwenTelemetry.ts');
    expect(tel).toContain('const yielded = j.preempted > 0');
    expect(tel).toContain('${bad}${yielded}');
    // It is composed OUTSIDE `bad`, which is where ∅ / 💀 / err live.
    const bad = tel.slice(tel.indexOf('const bad = ('), tel.indexOf('const split ='));
    expect(bad).not.toContain('preempted');
  });

  it('⚠ THE HARNESS SHIPS WITH A LIVE CONSUMER, not as scaffolding', () => {
    // A priority tier and a flag with no caller would be exactly the dead code
    // OTA-1140/1141 spent two OTAs deleting. The bank's rest-filler is idle
    // work nobody asked for, so it IS homework.
    const store = src('app/state/gameStore.ts');
    expect(store).toContain("job: opts?.bankOnly ? 'ambient_fill' : 'ambient', homework: !!opts?.bankOnly },");
  });

  it('⚠ the LIVE ambient path is not homework — the player is owed that line', () => {
    // The distinction is the whole safety property: a line the player is
    // waiting on must never be interruptible.
    const store = src('app/state/gameStore.ts');
    expect(store).toContain('homework: !!opts?.bankOnly');
    expect(store).not.toContain('homework: true }');
  });
});
