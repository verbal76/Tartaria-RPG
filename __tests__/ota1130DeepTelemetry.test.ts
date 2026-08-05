// OTA-1130 — THE NUMBERS THE NATIVE LAYER WAS ALREADY COMPUTING, AND THE
// WORK NOBODY EVER SAW.
//
// OTA-1129 proved prefill dominates by INFERRING it from wall-clock: ambient
// took 14.5s to write 139 characters while investigate_lore wrote 132 in
// 1.1s, so the difference had to be reading, not writing. That inference was
// right — and it was also unnecessary, because llama.cpp returns a `timings`
// object on every completion with the exact split, and the runtime was
// throwing the whole object away.
//
// This OTA keeps five things the log could not previously answer:
//   1. READ vs WRITE, measured (prompt_ms / predicted_ms) — the two numbers
//      that point at completely different fixes: trim the prompt, or cut the
//      token budget.
//   2. PROMPT SIZE in the model's own tokens, so the next thing worth
//      trimming names itself instead of needing a code-reading session.
//   3. ⚠ WASTED WORK — a discarded line costs exactly what a delivered one
//      costs. Narration cancelled because the player acted again, ambient
//      filtered as a near-duplicate, a flourish that arrived after they
//      walked away: all of it recorded as a clean success until now. This is
//      the number that decides whether a job is worth keeping at all.
//   4. STOP REASON — did generation end naturally, or slam into the token cap
//      mid-sentence (paying full price AND getting truncated prose)?
//   5. CACHE REUSE — `tokens_cached`. A persistent zero means every call
//      re-reads its whole prompt from scratch, which would make a stable
//      prompt PREFIX the next 1129-sized win.

jest.setTimeout(20000);

import {
  recordQwenCall,
  noteQwenDiscarded,
  setQwenDiscardSink,
  qwenJobStats,
  qwenTelemetrySummary,
  qwenWasteTotals,
  resetQwenTelemetry,
  type QwenCallRecord,
} from '../app/ai/generation/qwenTelemetry';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

const call = (job: string, over: Partial<QwenCallRecord> = {}): void =>
  recordQwenCall({
    job, totalMs: 1000, waitMs: 0, chars: 100, outcome: 'ok', at: 0, ...over,
  });

describe('OTA-1130 — read vs write, measured', () => {
  beforeEach(() => resetQwenTelemetry());

  it('⚠ the split separates a prompt problem from a token-budget problem', () => {
    // The device-log shape: 16.8s total, almost all of it READING.
    call('ambient', { totalMs: 16822, waitMs: 2255, prefillMs: 14100, decodeMs: 460, promptTokens: 1145, outTokens: 35 });
    call('investigate_lore', { totalMs: 1131, prefillMs: 700, decodeMs: 420, promptTokens: 210, outTokens: 33 });
    const byJob = Object.fromEntries(qwenJobStats().map((j) => [j.job, j]));
    expect(byJob.ambient).toMatchObject({ avgPrefillMs: 14100, avgDecodeMs: 460, avgPromptTokens: 1145 });
    // Same output size, 5x the prompt, 20x the read time — the whole thesis.
    expect(byJob.ambient!.avgOutTokens).toBe(byJob.investigate_lore!.avgOutTokens + 2);
    expect(byJob.ambient!.avgPrefillMs).toBeGreaterThan(byJob.investigate_lore!.avgPrefillMs * 10);
  });

  it('the summary carries the split, the sizes, and the cap flag', () => {
    call('ambient', { totalMs: 16822, prefillMs: 14100, decodeMs: 460, promptTokens: 1145, outTokens: 35, stop: 'limit' });
    const line = qwenTelemetrySummary();
    expect(line).toContain('read14.1s/write0.5s');
    expect(line).toContain('in1145t→out35t');
    expect(line).toContain('cap1');
  });

  it('cache reuse surfaces when llama.cpp reports it, and stays quiet at zero', () => {
    call('narration:travel', { cachedTokens: 812 });
    expect(qwenTelemetrySummary()).toContain('cache812t');
    resetQwenTelemetry();
    call('narration:travel', { cachedTokens: 0 });
    expect(qwenTelemetrySummary()).not.toContain('cache');
  });

  it('a build with no timings still records cleanly — old llama.rn, jest mocks', () => {
    call('flourish', { totalMs: 2087 });
    const j = qwenJobStats()[0]!;
    expect(j.avgPrefillMs).toBe(0);
    expect(qwenTelemetrySummary()).toContain('flourish n1');
    expect(qwenTelemetrySummary()).not.toContain('read');
  });
});

describe('OTA-1130 — wasted work is counted honestly', () => {
  beforeEach(() => resetQwenTelemetry());

  it('⚠ a discarded line costs what a delivered one costs, and now says so', () => {
    call('ambient', { totalMs: 16822 });
    noteQwenDiscarded('ambient:dup-dropped');
    call('ambient', { totalMs: 15000 });
    noteQwenDiscarded('ambient:stale:moved-room');
    call('ambient', { totalMs: 14000 }); // this one landed

    const j = qwenJobStats()[0]!;
    expect(j.discarded).toBe(2);
    expect(j.discardedMs).toBe(31822);
    expect(qwenWasteTotals()).toEqual({ calls: 2, ms: 31822 });
    // …and the rollup ends with the session total, in seconds.
    expect(qwenTelemetrySummary()).toContain('WASTED 2 calls / 31.8s');
  });

  it('a double report cannot inflate the waste — one discard per call', () => {
    call('flourish', { totalMs: 2000 });
    noteQwenDiscarded('flourish:stale-walked-away');
    noteQwenDiscarded('flourish:stale-walked-away');
    expect(qwenWasteTotals()).toEqual({ calls: 1, ms: 2000 });
  });

  it('a discard with no call in flight is a no-op, not a crash', () => {
    expect(() => noteQwenDiscarded('nothing running')).not.toThrow();
    expect(qwenWasteTotals()).toEqual({ calls: 0, ms: 0 });
  });

  it('the discard sink is told what was thrown away and what it cost', () => {
    const seen: string[] = [];
    setQwenDiscardSink((job, reason, ms) => seen.push(`${job}|${reason}|${ms}`));
    call('narration:attack', { totalMs: 9000 });
    noteQwenDiscarded('cancelled:player-acted-again');
    expect(seen).toEqual(['narration:attack|cancelled:player-acted-again|9000']);
  });

  it('a throwing discard sink never breaks a generation', () => {
    setQwenDiscardSink(() => { throw new Error('bad sink'); });
    call('ambient', { totalMs: 100 });
    expect(() => noteQwenDiscarded('whatever')).not.toThrow();
  });
});

describe('OTA-1130 — the four waste sites are wired', () => {
  const store = src('app/state/gameStore.ts');

  it('⚠ narration cancelled mid-flight is reported, not silently swallowed', () => {
    expect(store).toContain("noteQwenDiscarded('cancelled:player-acted-again'); return;");
  });

  it('narration falling back to a template is reported with WHICH reason', () => {
    expect(store).toContain("if (repDup) noteQwenDiscarded('near-duplicate→template');");
    expect(store).toContain("else if (usedFallback) noteQwenDiscarded('empty→template');");
  });

  it('⚠ filtered ambient is reported — the job that most often pays for nothing', () => {
    expect(store).toContain('if (!ambientUsable) noteQwenDiscarded(`ambient:${ambientMark}`);');
  });

  it('a flourish that arrives after the player walks away is reported', () => {
    expect(store).toContain("else noteQwenDiscarded(line ? 'flourish:stale-walked-away' : 'flourish:empty');");
  });

  it('the runtime passes llama.cpp\'s own numbers through, defensively', () => {
    const rt = src('app/ai/generation/LlamaRuntime.ts');
    expect(rt).toContain('prefillMs: typeof t?.prompt_ms === \'number\'');
    expect(rt).toContain('decodeMs: typeof t?.predicted_ms === \'number\'');
    expect(rt).toContain('cachedTokens: r.tokens_cached');
    expect(rt).toContain("stop: r.stopped_eos ? 'eos'");
    expect(rt).toContain('promptChars: prompt.length');
  });

  it('the store logs the split per call and the discards as they happen', () => {
    expect(store).toContain('read ${r.prefillMs ?? \'?\'}ms/write ${r.decodeMs ?? \'?\'}ms');
    expect(store).toContain('setQwenDiscardSink((job, reason, ms) => {');
    expect(store).toContain('qwen⏱ ✂ DISCARDED ${job} after ${ms}ms — ${reason}');
  });
});
