/**
 * OTA-1368 — the near-freeze the freeze watch could not see.
 *
 * The owner reported the app "hung a few Ms then came back"; the device report
 * said `Freeze watch: no stalls seen`. Both were true. The watch compares a
 * setTimeout clock against a requestAnimationFrame clock — two JS-side
 * measurements — and the stall was on the native side: the cognitive embedder
 * went 70ms → 12,619ms, prompt reads degraded 2.7 → 18.5ms/token, and four jobs
 * queued 5.6–8.7s behind one another while JS ticked and frames kept coming.
 *
 * Two halves here:
 *   · the REPORT now says so (nativePressure → runtimePressureSummary), and
 *   · the DOOR CHECK stops a generation the consumer has already written off
 *     from starting at all (LlamaGenerateOptions.shouldAbort).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  recordQwenCall, resetQwenTelemetry, nativePressure, noteQwenDiscarded,
  NATIVE_WAIT_WARN_MS,
} from '../app/ai/generation/qwenTelemetry';
import { runtimePressureSummary } from '../app/diagnostics/runtimePressure';

const CALM = {
  memoryWarnings: 0, lastMemoryWarningAt: null, appStateTrail: [],
  lastVerdict: 'ok' as const, worstFrameGapMs: 0, worstJsGapMs: 0, uiStalls: 0,
};

/** One call, shaped like the rows the 4.29.260 log actually printed. */
function call(job: string, opts: {
  waitMs?: number; totalMs?: number; prefillMs?: number; promptTokens?: number;
}) {
  recordQwenCall({
    job,
    totalMs: opts.totalMs ?? 1000,
    waitMs: opts.waitMs ?? 0,
    chars: 120,
    outcome: 'ok',
    at: 1_700_000_000_000,
    prefillMs: opts.prefillMs,
    promptTokens: opts.promptTokens,
    outTokens: 33,
  });
}

describe('OTA-1368 — the native queue is measured and reported', () => {
  beforeEach(() => resetQwenTelemetry());

  it('a calm session reports a calm queue', () => {
    call('narration:travel', { waitMs: 0, totalMs: 900, prefillMs: 400, promptTokens: 700 });
    const p = nativePressure();
    expect(p.slowJobs).toBe(0);
    expect(p.worstWaitMs).toBe(0);
    const out = runtimePressureSummary({ ...CALM, native: p });
    expect(out).toContain('Native queue:');
    expect(out).not.toContain('⚠ Native queue:');
    expect(out).not.toContain('structurally blind');
  });

  it("⚠⚠ the owner's spike: JS clean, queue seconds deep — and the report SAYS so", () => {
    // Straight off the log: the narration that held the lock for 16.2s at
    // 18.5ms/prompt-token, and the fill that sat 8.7s behind it.
    call('narration:scene_intro', { totalMs: 16201, prefillMs: 13402, promptTokens: 726 });
    call('narration:scene_intro_fill', { waitMs: 8721, totalMs: 15585, prefillMs: 4234, promptTokens: 697 });
    call('investigate_lore', { waitMs: 7599, totalMs: 8838, prefillMs: 435, promptTokens: 130 });
    call('flourish', { waitMs: 5623, totalMs: 7507, prefillMs: 1370, promptTokens: 129 });

    const p = nativePressure();
    expect(p.worstWaitMs).toBe(8721);
    expect(p.slowJobs).toBe(3);                       // fill, investigate_lore, flourish
    expect(p.worstMsPerPromptTok).toBeCloseTo(18.5, 1);

    // ⚠ THE POINT OF THE WHOLE OTA: every JS-side number here is clean. The old
    // report had nothing else to say and printed an all-clear over a session
    // the player experienced as a freeze.
    const out = runtimePressureSummary({ ...CALM, native: p });
    expect(out).toContain('Freeze watch: no stalls seen (JS clocks only');
    expect(out).toContain('⚠ Native queue:');
    expect(out).toContain('worst wait 8.7s');
    expect(out).toContain('3 job kinds queued >3s');
    expect(out).toContain('18.5ms/prompt-token');
    expect(out).toContain('structurally blind');
  });

  it('thrown-away generations are counted, because that is the waste', () => {
    call('narration:scene_intro', { totalMs: 16201, prefillMs: 13402, promptTokens: 726 });
    noteQwenDiscarded('cancelled:player-acted-again');
    const p = nativePressure();
    expect(p.wastedCalls).toBe(1);
    expect(p.wastedMs).toBe(16201);
    expect(runtimePressureSummary({ ...CALM, native: p }))
      .toContain('1 generation thrown away (16.2s)');
  });

  it('the warn threshold is a constant, not a magic number', () => {
    expect(NATIVE_WAIT_WARN_MS).toBe(3000);
    call('x', { waitMs: NATIVE_WAIT_WARN_MS - 1 });
    expect(nativePressure().slowJobs).toBe(0);
    resetQwenTelemetry();
    call('x', { waitMs: NATIVE_WAIT_WARN_MS });
    expect(nativePressure().slowJobs).toBe(1);
  });

  it('an older caller with no native block still renders', () => {
    // `native` is optional on purpose — every pre-existing caller and test
    // passes a snapshot without it.
    const out = runtimePressureSummary(CALM);
    expect(out).toContain('Runtime pressure');
    expect(out).not.toContain('Native queue');
  });
});

describe('OTA-1368 — the door check', () => {
  const runtime = readFileSync(
    join(__dirname, '..', 'app', 'ai', 'generation', 'LlamaRuntime.ts'), 'utf8');
  const engine = readFileSync(
    join(__dirname, '..', 'app', 'ai', 'generation', 'QwenGenerativeEngine.ts'), 'utf8');
  const store = readFileSync(
    join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

  it('the abort is asked BEFORE the native call, not after it', () => {
    // The bug was ordering, not absence: the epoch check existed, it just ran
    // last. The predicate must be consulted inside the locked callback, ahead
    // of ctx.completion, so a dead job never enters the model at all.
    const locked = runtime.slice(
      runtime.indexOf('const result = await runExclusiveNativeMl'),
      runtime.indexOf('return ctx.completion'));
    expect(locked).toContain('if (wantsAbort())');
    expect(locked).toContain("text: ''");
    expect(locked).toContain('preempted = true');
  });

  it('a throwing predicate never costs a generation', () => {
    expect(runtime).toContain('try { return opts.shouldAbort?.() === true; } catch { return false; }');
  });

  it('the stop is asked at most once per generation', () => {
    expect(runtime).toContain('if (!stopAsked && wantsAbort())');
  });

  it('the option is plumbed all the way from the caller', () => {
    expect(runtime).toContain('shouldAbort?: () => boolean;');
    expect(engine).toContain('shouldAbort?: () => boolean;');
    expect(engine).toContain('shouldAbort: opts.shouldAbort,');
    expect(store).toContain('() => myEpoch !== arbiterGenerationEpoch');
  });

  it('⚠ narration aborts but is still NOT interruptible — different questions', () => {
    // `interruptible` cuts short work someone still wants, and narration
    // refuses it because a half-written sentence is worse than a late one.
    // `shouldAbort` declines work already known to be discarded, where the
    // alternative is not a whole line but the same discard, later.
    expect(runtime).toContain('interruptible?: boolean;');
    expect(store).not.toContain('interruptible: true');
  });

  it('⚠ a bank fill is EXEMPT — OTA-1258 said late fill text is still free text', () => {
    expect(store).toContain("shouldAbort: opts?.bankOnly === true\n          ? undefined");
  });
});
