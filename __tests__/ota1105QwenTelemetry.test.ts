// OTA-1105 — QWEN CALL TELEMETRY: THE MEASUREMENT BEFORE THE CUT.
//
// OTA-1093 deferred the 29-second-generation fix on purpose: "it gets
// per-intent timing first rather than a blind budget cut." This is that
// timing. One choke point at the runtime boundary records every generation —
// all nine consumers — with the split that actually diagnoses a stall:
// lock-WAIT (queued behind Kokoro TTS on the shared native-ML lock) vs
// generation time. A 29s call that is 25s of queue needs a scheduling fix;
// one that is 29s of generating needs a token budget. Without the split the
// two are indistinguishable in a device log.
//
// What this suite guards:
//   · the aggregates are ARITHMETIC, not vibes — counts, averages, maxima,
//     empty/error tallies verified against known inputs;
//   · a throwing sink can NEVER break a generation;
//   · every consumer passes a job label, so the stats can name the culprit
//     (an unlabeled call still records as 'unlabeled' rather than vanishing);
//   · the store surfaces per-call lines + a rollup every tenth call in the
//     debug channel — the device log is the delivery vehicle.

jest.setTimeout(20000);

import {
  recordQwenCall,
  qwenJobStats,
  qwenTelemetrySummary,
  qwenCallCount,
  setQwenTelemetrySink,
  resetQwenTelemetry,
  type QwenCallRecord,
} from '../app/ai/generation/qwenTelemetry';
import { readFileSync } from 'fs';
import { join } from 'path';
// ⚠ OTA-1395 — reads the store AND its slices. Part 4 is splitting gameStore
// into slices, and the literals these pins look for travel with the code. A
// pin like this was never a claim about a FILE; it is a claim about the STORE.
// See __tests__/helpers/storeSource.ts for when NOT to use it.
import { storeSource } from '../test-utils/storeSource';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

const call = (job: string, totalMs: number, waitMs = 0, outcome: QwenCallRecord['outcome'] = 'ok'): void =>
  recordQwenCall({ job, totalMs, waitMs, chars: outcome === 'ok' ? 100 : 0, outcome, at: 0 });

describe('OTA-1105 — the aggregates are arithmetic', () => {
  beforeEach(() => resetQwenTelemetry());

  it('per-job count / avg / max / wait / empty / error come out exact', () => {
    call('flourish', 2000, 100);
    call('flourish', 4000, 300);
    call('ambient', 15000, 12000);
    call('ambient', 29000, 25000);
    call('forge_name', 6000, 0, 'empty');
    call('parse_fallback', 1000, 0, 'error');

    const byJob = Object.fromEntries(qwenJobStats().map((j) => [j.job, j]));
    expect(byJob.flourish).toMatchObject({ count: 2, avgMs: 3000, maxMs: 4000, avgWaitMs: 200 });
    // ⚠ The wait split is the diagnosis: this "29s ambient" is 25s of QUEUE.
    expect(byJob.ambient).toMatchObject({ count: 2, avgMs: 22000, maxMs: 29000, avgWaitMs: 18500, maxWaitMs: 25000 });
    expect(byJob.forge_name).toMatchObject({ count: 1, empty: 1, error: 0 });
    expect(byJob.parse_fallback).toMatchObject({ count: 1, empty: 0, error: 1 });
    expect(qwenCallCount()).toBe(6);
  });

  it('the summary is one compact line a device log can carry', () => {
    call('ambient', 15000, 12000);
    call('ambient', 29000, 25000);
    call('flourish', 2000);
    const line = qwenTelemetrySummary();
    expect(line).toContain('ambient n2 avg22.0s max29.0s wait18.5s');
    expect(line).toContain('flourish n1 avg2.0s max2.0s');
    // Sub-half-second waits are noise, not signal — not printed.
    expect(line).not.toContain('flourish n1 avg2.0s max2.0s wait');
  });

  it('⚠ a throwing sink never breaks a generation', () => {
    setQwenTelemetrySink(() => { throw new Error('broken sink'); });
    expect(() => call('flourish', 1000)).not.toThrow();
    expect(qwenCallCount()).toBe(1);
  });

  it('the sink receives every record, in order', () => {
    const seen: string[] = [];
    setQwenTelemetrySink((r) => seen.push(`${r.job}:${r.totalMs}`));
    call('a', 1);
    call('b', 2);
    expect(seen).toEqual(['a:1', 'b:2']);
  });
});

describe('OTA-1105 — every consumer is labeled', () => {
  it('⚠ the runtime records at the ONE boundary every consumer crosses, with the wait split', () => {
    const rt = src('app/ai/generation/LlamaRuntime.ts');
    expect(rt).toContain("import { recordQwenCall } from './qwenTelemetry';");
    // The wait clock stops when the lock-guarded thunk actually starts.
    expect(rt).toContain('const result = await runExclusiveNativeMl(() => {');
    expect(rt).toContain('telLockAt = Date.now();');
    // Success and error BOTH record; an unlabeled call still shows up.
    // RETARGETED BY OTA-1119: both outcomes now split on whether the native
    // context survived the call, because `empty` was filing a silent model and
    // a detached context under one word. The property this test cares about is
    // unchanged — both paths record — so the assertions just widened to allow
    // the classification. ota1119DormancyWindow owns the split itself.
    // RETARGETED BY OTA-1123 — `outcome:` and the `text.length` test are no
    // longer on the same line (a `preempted` branch was added in front).
    expect(rt).toMatch(/text\.length > 0 \? 'ok'/);
    expect(rt).toMatch(/outcome: [^\n]*'error',[\s\S]{0,200}throw err;/);
    expect((rt.match(/job: opts\.job \?\? 'unlabeled'/g) ?? []).length).toBe(2);
  });

  it('the engine forwards the label on both generate() and stream()', () => {
    const eng = src('app/ai/generation/QwenGenerativeEngine.ts');
    expect((eng.match(/job: opts\.job,/g) ?? []).length).toBe(2);
  });

  it('⚠ all nine call sites name their job', () => {
    const store = storeSource();
    const fusion = src('app/engine/itemFusion.ts');
    // Narration is labeled PER-INTENT — the exact grain OTA-1093 asked for.
    // ⚠ RETARGETED BY OTA-1129, same reflow lesson as the ambient label two
    // lines down: narration now names two jobs too. The live line stays
    // `narration:<intent>`; a pre-generated one is `narration:<intent>_fill`
    // so the bank's cost is priced apart from the wait it exists to remove.
    // Anchored on the two template fragments, neither of which spans a break.
    expect(store).toContain('`narration:${intent}`');
    expect(store).toContain('`narration:${intent}_fill`');
    // RETARGETED BY OTA-1123 — the ambient consumer now names TWO jobs: the
    // live line stays 'ambient', and the bank's rest-filler is 'ambient_fill'
    // so idle work is priced separately from work the player is waiting on.
    // The property this guards is unchanged: the consumer labels itself.
    expect(store).toContain("? 'ambient_fill' : 'ambient'");
    expect(store).toContain("job: 'flourish'");
    expect(store).toContain("job: 'ask_arbiter'");
    expect(store).toContain("job: 'investigate_lore'");
    expect(fusion).toContain("job: 'fusion_forge'");
    expect(fusion).toContain("job: 'forge_name'");
    expect(src('app/engine/llmParser.ts')).toContain("job: 'parse_fallback'");
    // RETARGETED BY OTA-1126 — item synthesis now names TWO jobs: the live
    // 'item_synthesis' and the idle-time 'item_synthesis_hw', so homework
    // cost cannot hide inside the interactive average. Same property guarded.
    expect(src('app/engine/itemSynthesisQwen.ts')).toContain("? 'item_synthesis_hw' : 'item_synthesis'");
  });

  it('the store surfaces calls in the debug log, rollup every tenth', () => {
    const store = storeSource();
    expect(store).toContain('setQwenTelemetrySink((r) => {');
    expect(store).toContain('qwen⏱ ${r.job} ${r.outcome} ${r.totalMs}ms');
    expect(store).toContain('qwenCallCount() % 10 === 0');
    expect(store).toContain('qwen⏱ stats — ${qwenTelemetrySummary()}');
  });
});
