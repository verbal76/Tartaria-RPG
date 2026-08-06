// OTA-1142 — THE DORMANCY WINDOW, AND THE WORD THAT HID IT.
//
// The owner's device log, in three consecutive lines:
//
//   [06:06:08] OTA session start
//   [06:06:17] item_synthesis empty 8809ms read 0ms/write 0ms in 309t→out 0t (0ch)
//   [06:06:20] qwen-watchdog: Qwen dormant — reinitializing
//
// 8.8 seconds of wall time with ZERO prefill and ZERO decode. The model did
// not think slowly; it never ran. That call entered a context that had already
// been detached, did no native work, and came back with nothing — and the
// watchdog announced the dormancy three seconds later.
//
// ROOT CAUSE. `isDormant()` is defined as "status === 'ready' but the runtime
// is gone", and `QwenGenerativeEngine.dispose()` was PRODUCING that state on
// purpose for the length of its own teardown:
//
//   · LlamaRuntime.dispose() nulls `this.context` SYNCHRONOUSLY on entry —
//     that is the arb-crash fix, detach before release so no completion can
//     start against a context that is about to be freed;
//   · it then AWAITS `ctx.release()` behind the shared native-ML lock, which
//     means it waits out whatever generation currently holds that lock;
//   · and the engine only set `status = 'idle'` AFTER that await returned.
//
// So from the first line of the teardown until the lock cleared, the engine
// reported ready-over-dead — the watchdog's exact dormancy signature — for
// however long the in-flight generation ran. The owner's log has item
// synthesis holding the lock for 10.4 seconds.
//
// THE FIX IS ORDERING, and it costs nothing: status leaves 'ready' on the
// first line instead of the last. An engine that is shutting down now says
// 'idle', which is true, rather than 'ready', which stopped being true the
// moment the context was detached.
//
// THE SECOND HALF is that `empty` was hiding two different failures. A model
// that genuinely produced nothing is a PROMPT problem; a call that ran against
// a detached context is a LIFECYCLE problem, and the two get investigated in
// opposite directions. The log had one of each under the same word, which cost
// a whole round of guessing. `dormant` is now its own outcome, with its own
// mark in the rollup.
//
// AND ONE UNRELATED OWNER REQUEST rides along: "increase the delay on death
// before it goes to the character collection screen by 5 seconds. they can
// always tap to close if they want."

import fs from 'fs';
import path from 'path';
import { QwenGenerativeEngine } from '../app/ai/generation/QwenGenerativeEngine';
import type { LlamaRuntime } from '../app/ai/generation/LlamaRuntime';
import {
  recordQwenCall, qwenJobStats, qwenTelemetrySummary, resetQwenTelemetry,
} from '../app/ai/generation/qwenTelemetry';

const src = (rel: string): string =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/** A runtime that reproduces the REAL shape of the bug: detach is synchronous,
 *  release is awaited. Nothing here is a stand-in for the timing — the timing
 *  IS the bug, so the fake has to have it. */
function makeSlowTeardownRuntime(): {
  runtime: LlamaRuntime;
  /** Resolves the awaited release, letting dispose() finish. */
  finishRelease: () => void;
  /** Resolves once dispose() has detached and is waiting on the lock. */
  detached: Promise<void>;
} {
  let releaseGate!: () => void;
  const release = new Promise<void>((r) => { releaseGate = r; });
  let announceDetached!: () => void;
  const detached = new Promise<void>((r) => { announceDetached = r; });

  let ready = false;
  const fake: Partial<LlamaRuntime> = {
    isReady() { return ready; },
    getModelPath() { return '/fake/model.gguf'; },
    async initialize() { ready = true; },
    async dispose() {
      ready = false;      // ← the synchronous detach (context = null)
      announceDetached();
      await release;      // ← ctx.release() queued behind the native-ML lock
    },
  };
  return { runtime: fake as unknown as LlamaRuntime, finishRelease: () => releaseGate(), detached };
}

async function makeReadyEngine(runtime: LlamaRuntime): Promise<QwenGenerativeEngine> {
  const engine = new QwenGenerativeEngine();
  await engine.initialize({ modelPath: '/fake/model.gguf', runtime });
  expect(engine.getStatus()).toBe('ready');
  expect(engine.isReady()).toBe(true);
  expect(engine.isDormant()).toBe(false);
  return engine;
}

describe('OTA-1142 — ⚠ dispose() never reports ready-over-dead', () => {
  it('the engine is NOT dormant at any point during a slow teardown', async () => {
    // This is the whole bug in one assertion. Before the fix, isDormant() was
    // true for the entire span between the detach and the release — which is
    // as long as whatever generation held the native-ML lock, 10.4s in the
    // owner's log.
    const { runtime, finishRelease, detached } = makeSlowTeardownRuntime();
    const engine = await makeReadyEngine(runtime);

    const teardown = engine.dispose();
    await detached; // the context is now gone; release has not landed yet

    expect(engine.isDormant()).toBe(false);
    expect(engine.getStatus()).toBe('idle');
    expect(engine.isReady()).toBe(false);

    finishRelease();
    await teardown;

    expect(engine.isDormant()).toBe(false);
    expect(engine.getStatus()).toBe('idle');
  });

  it('status leaves ready BEFORE the awaited teardown, not after', () => {
    // Ordering is the fix, so ordering is what the test has to pin. Read
    // positionally rather than by string presence: both lines existed before,
    // in the wrong order.
    const eng = src('app/ai/generation/QwenGenerativeEngine.ts');
    const body = eng.slice(eng.indexOf('async dispose(): Promise<void> {'));
    const statusAt = body.indexOf("this.status = 'idle';");
    const awaitAt = body.indexOf('await this.runtime.dispose();');
    expect(statusAt).toBeGreaterThan(-1);
    expect(awaitAt).toBeGreaterThan(-1);
    expect(statusAt).toBeLessThan(awaitAt);
  });

  it('⚠ the lifecycle-generation bump still comes first of all', () => {
    // OTA-1107's staleness guard depends on the bump landing before anything
    // else in dispose(); a load in flight has to see the new generation. The
    // status write is allowed to move ahead of the await, not ahead of this.
    const eng = src('app/ai/generation/QwenGenerativeEngine.ts');
    const body = eng.slice(eng.indexOf('async dispose(): Promise<void> {'));
    expect(body.indexOf('this.lifecycleGen += 1;'))
      .toBeLessThan(body.indexOf("this.status = 'idle';"));
  });

  it('a disposed engine still re-initializes cleanly afterwards', () => {
    // Setting status early must not leave the engine in a state initialize()
    // short-circuits on. 'idle' is exactly the state it wants to see.
    const eng = src('app/ai/generation/QwenGenerativeEngine.ts');
    expect(eng).toContain("if (this.status === 'ready' || this.status === 'loading' || this.status === 'downloading')");
  });

  it('the reason is recorded where the next reader will move the line back', () => {
    const eng = src('app/ai/generation/QwenGenerativeEngine.ts');
    expect(eng).toContain('STATUS LEAVES');
    expect(eng).toContain('SYNCHRONOUSLY');
  });
});

describe("OTA-1142 — 'dormant' is an empty with a known cause", () => {
  beforeEach(() => resetQwenTelemetry());

  it('the telemetry counts it separately from an empty and an error', () => {
    const rec = (outcome: 'ok' | 'empty' | 'error' | 'dormant'): void =>
      recordQwenCall({ job: 'item_synthesis', totalMs: 8809, waitMs: 0, chars: 0, outcome, at: 0 });
    rec('ok'); rec('empty'); rec('dormant'); rec('dormant'); rec('error');

    const j = qwenJobStats()[0]!;
    expect(j).toMatchObject({ count: 5, empty: 1, dormant: 2, error: 1 });
  });

  it('⚠ the rollup marks it distinctly — ∅ is a silent model, 💀 is no model', () => {
    recordQwenCall({ job: 'item_synthesis', totalMs: 8809, waitMs: 0, chars: 0, outcome: 'dormant', at: 0 });
    recordQwenCall({ job: 'item_synthesis', totalMs: 1000, waitMs: 0, chars: 0, outcome: 'empty', at: 0 });
    const line = qwenTelemetrySummary();
    expect(line).toContain('💀1');
    expect(line).toContain('∅1');
  });

  it('a job with neither prints neither', () => {
    recordQwenCall({ job: 'flourish', totalMs: 1000, waitMs: 0, chars: 40, outcome: 'ok', at: 0 });
    const line = qwenTelemetrySummary();
    expect(line).not.toContain('💀');
    expect(line).not.toContain('∅');
  });

  it('⚠ the runtime classifies on BOTH paths — the empty one and the throw', () => {
    // `this.context` is checked after the await, when we know what came back:
    // it is null only if dispose() ran underneath this call.
    // RETARGETED BY OTA-1146 — the success expression gained a `preempted`
    // branch and now wraps across lines, so this matches single-line fragments
    // rather than the whole expression. An assertion that spans a line break
    // fails on reflow instead of on meaning.
    const rt = src('app/ai/generation/LlamaRuntime.ts');
    expect(rt).toContain("(this.context === null ? 'dormant' : 'empty'),");
    expect(rt).toContain("outcome: this.context === null ? 'dormant' : 'error',");
  });

  it('a live context still reports the ordinary outcomes', () => {
    // The split must not reclassify healthy calls: with a context in place the
    // words are exactly the ones every prior OTA's log used.
    const rt = src('app/ai/generation/LlamaRuntime.ts');
    expect(rt).toMatch(/text\.length > 0 \? 'ok'/);
    expect(rt).toMatch(/'dormant' : 'empty'/);
    expect(rt).toMatch(/'dormant' : 'error'/);
  });
});

describe('OTA-1142 — the death screen holds five seconds longer', () => {
  const view = src('app/components/DeathOverlay.tsx');

  it('the dwell is 16s, up from 11s', () => {
    expect(view).toContain('const DWELL_MS = 16000;');
    expect(view).toContain('setTimeout(() => dismiss(), DWELL_MS)');
  });

  it('⚠ tap-to-leave survives — a longer hold is only safe because of it', () => {
    // The owner's own condition: "they can always tap to close if they want."
    // A 16-second hold with no escape would be a worse screen, not a longer one.
    expect(view).toContain('const TAP_ARMS_AT_MS = TEXT_DELAY_MS + TEXT_IN_MS;');
    expect(view).toContain('onPress');
  });

  it('the tap still arms only once the words are legible', () => {
    // Unchanged by this OTA and worth pinning: a player mid-tap when they died
    // must not skip their own ending.
    expect(view).toContain('TAP_ARMS_AT_MS');
  });
});
