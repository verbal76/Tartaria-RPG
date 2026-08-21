/**
 * OTA-1406 — FULL AUDIT OF THE TIMING GUARD.
 *
 * The owner, after OTA-1405: *"do a full audit on the timing guard. I want a full
 * breakdown and I want to find every variance in every tweak and I want it
 * fixed."*
 *
 * The guard's history is four fixes to one rule, three of which landed beside the
 * number they were written for rather than at the rule:
 *
 *   OTA-1139  guarded the ms/tok RANGE.
 *   OTA-1263  guarded the per-line ms/tok FIGURE, and recorded in its own comment
 *             that the unguarded number had already cost it a wrong finding.
 *   OTA-1405  guarded the raw `read/write` PAIR and the AVERAGE, and centralised
 *             the rule into `qwenTimingsArePossible`.
 *   OTA-1406  audited every consumer and found the centralised rule was still
 *             answering the wrong question in three places.
 *
 * ⚠⚠ THE FINDING THAT MATTERS: **POSSIBLE IS NOT MEASURED.** OTA-1405's rule
 * asks a physics question — could these numbers describe this call? Two kinds of
 * record pass it and describe nothing (a dormant call's 0/0 against a detached
 * context, and an errored call), and one kind of record needs two DIFFERENT
 * answers (a preempted call has a complete prefill and a truncated decode).
 *
 * All three were measured, not reasoned about. The probes are in the tests below.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  qwenTimingsArePossible,
  qwenPrefillIsMeasured,
  qwenDecodeIsMeasured,
  recordQwenCall,
  qwenJobStats,
  qwenTelemetrySummary,
  nativePressure,
  _resetQwenTelemetryForTest,
  type QwenCallRecord,
} from '../app/ai/generation/qwenTelemetry';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const TEL = read('app', 'ai', 'generation', 'qwenTelemetry.ts');
const BOOT = read('app', 'state', 'slices', 'bootSlice.ts');
const HANDOFF = read('HANDOFF.md');

const call = (over: Partial<QwenCallRecord> = {}): void =>
  recordQwenCall({ job: 'j', totalMs: 1000, waitMs: 0, chars: 10, outcome: 'ok', at: 0, ...over });

beforeEach(() => _resetQwenTelemetryForTest());

// ── VARIANCE 1 ──────────────────────────────────────────────────────────────

describe('OTA-1406 V1 — a DORMANT call was poisoning the range and the averages', () => {
  it('⚠⚠ the exact OTA-1119 record passes the physics check', () => {
    // This is why the centralised rule was not enough. `0 + 0 <= 8809` is true.
    // The record is real — 8.8 seconds of wall time against a context that had
    // already been detached — and its zeros are not a measurement of anything.
    expect(qwenTimingsArePossible({ prefillMs: 0, decodeMs: 0, totalMs: 8809 })).toBe(true);
    expect(qwenPrefillIsMeasured({ prefillMs: 0, decodeMs: 0, totalMs: 8809, outcome: 'dormant' })).toBe(false);
    expect(qwenDecodeIsMeasured({ prefillMs: 0, decodeMs: 0, totalMs: 8809, outcome: 'dormant' })).toBe(false);
  });

  it('⚠⚠ MEASURED: one dormant record used to halve the average and zero the range', () => {
    // One real cold read at 11.0 ms/tok, plus the dormant record. Before this
    // OTA: `ms/tok 0.0-11.0`, avgPrefill 1700 (of a real 3400), avgDecode 75
    // (of a real 150). The 0.0 low is the part that did damage — HANDOFF read
    // exactly that shape as evidence of prompt-prefix reuse.
    call({ totalMs: 3600, outcome: 'ok', prefillMs: 3400, decodeMs: 150, promptTokens: 309, outTokens: 20 });
    call({ totalMs: 8809, outcome: 'dormant', prefillMs: 0, decodeMs: 0, promptTokens: 309, outTokens: 0 });
    const j = qwenJobStats()[0]!;
    expect(j.avgPrefillMs).toBe(3400);
    expect(j.avgDecodeMs).toBe(150);
    expect(j.prefillSamples).toBe(1);
    expect(j.bestMsPerPromptTok).toBeCloseTo(11.0, 1);
    expect(j.worstMsPerPromptTok).toBeCloseTo(11.0, 1);
    // The dormant call is still VISIBLE — 💀 is OTA-1119's mark and the whole
    // point of splitting 'dormant' out of 'empty'. It just stops being averaged.
    expect(qwenTelemetrySummary()).toContain('💀1');
  });

  it('⚠ an ERRORED call is refused for the same reason — nothing came back', () => {
    expect(qwenPrefillIsMeasured({ prefillMs: 0, totalMs: 500, outcome: 'error' })).toBe(false);
    call({ totalMs: 500, outcome: 'error', prefillMs: 0, decodeMs: 0, promptTokens: 100 });
    expect(qwenJobStats()[0]!.prefillSamples).toBe(0);
  });

  it('⚠⚠ …but a fully-cached prompt reads ~0ms on ~0 EVALUATED tokens, and is not one', () => {
    // ⚠ OTA-1407 CORRECTED THIS TEST. It used to assert that a 0ms prefill on 200
    // prompt tokens was a legitimate measurement of a warm cache. It is not:
    // `promptTokens` is llama.cpp's `tokens_evaluated`, so a cached prompt reports
    // ~0 tokens AND ~0 ms. Tokens evaluated with no time spent is a contradiction,
    // and the owner's 4.31.5 log carried one — `preempted 5681ms read 0ms/write
    // 0ms in 792t→out 0t 0.0ms/t`, a door-abort that never reached prefill.
    // The old assertion would have let that pin the range's best end to 0.0.
    call({ totalMs: 900, outcome: 'ok', prefillMs: 0, decodeMs: 800, promptTokens: 200 });
    expect(qwenJobStats()[0]!.prefillSamples).toBe(0);
    _resetQwenTelemetryForTest();
    // A real cache hit: nothing evaluated, nothing spent. Excluded by the
    // caller's own promptTokens gate, and not counted as unusable either.
    call({ totalMs: 900, outcome: 'ok', prefillMs: 0, decodeMs: 800, promptTokens: 0 });
    expect(qwenJobStats()[0]!.prefillSamples).toBe(0);
  });

  it('⚠⚠ OTA-1407 — the door-abort row from the owner\'s 4.31.5 log, verbatim', () => {
    call({ job: 'narration:scene_intro_fill', totalMs: 5681, outcome: 'preempted',
      prefillMs: 0, decodeMs: 0, promptTokens: 792, outTokens: 0, chars: 0 });
    const j = qwenJobStats()[0]!;
    expect(j.prefillSamples).toBe(0);       // no 0.0 low
    expect(j.prefillAvgSamples).toBe(0);    // and no zero dragging the average
    expect(j.timingsRejected).toBe(1);      // counted, out loud
    expect(qwenTelemetrySummary()).not.toContain('ms/tok');
  });
});

// ── VARIANCE 2 ──────────────────────────────────────────────────────────────

describe('OTA-1406 V2 — a PREEMPTED call needed two answers, not one', () => {
  it('⚠⚠ prefill COUNTS: stopCompletion is polled in the decode loop', () => {
    // Established twice in this repo from two device logs — the intro-fill
    // preempt analysis, and `item_synthesis preempted 3565ms in 328t→out 0t`
    // where every millisecond was prefill. Prefill runs to completion before a
    // token is emitted, so it is a whole measurement.
    const r = { prefillMs: 3520, decodeMs: 40, totalMs: 3565, outcome: 'preempted' as const };
    expect(qwenPrefillIsMeasured(r)).toBe(true);
    expect(qwenDecodeIsMeasured(r)).toBe(false);
  });

  it('⚠⚠ MEASURED: the range used to refuse the very samples HANDOFF reasoned about', () => {
    // Before this OTA `prefillSamples` came back 0 for this record, so the
    // rollup printed no ms/tok at all — while the per-call line printed one, and
    // the HANDOFF quoted ~11 ms/tok computed by hand from it. Three numbers,
    // three different rules, one record.
    call({ totalMs: 3565, outcome: 'preempted', prefillMs: 3520, decodeMs: 40, promptTokens: 328, outTokens: 0 });
    const j = qwenJobStats()[0]!;
    expect(j.prefillSamples).toBe(1);
    expect(j.bestMsPerPromptTok).toBeCloseTo(10.7, 1);
    expect(j.avgPrefillMs).toBe(3520);
  });

  it('⚠⚠ …and its truncated decode is NOT averaged as if generation were fast', () => {
    const j = (() => {
      call({ totalMs: 3565, outcome: 'preempted', prefillMs: 3520, decodeMs: 40, promptTokens: 328 });
      return qwenJobStats()[0]!;
    })();
    expect(j.decodeAvgSamples).toBe(0);
    expect(j.avgDecodeMs).toBe(0);
  });

  it('⚠⚠ and the rollup omits the write half rather than printing a 0.0s lie', () => {
    // The old combined string printed `read3.5s/write0.0s` for a job whose every
    // call was cut short. A zero there reads as "generation was instant"; the
    // truth is "generation never finished".
    call({ totalMs: 3565, outcome: 'preempted', prefillMs: 3520, decodeMs: 40, promptTokens: 328 });
    const line = qwenTelemetrySummary();
    expect(line).toContain('read3.5s');
    expect(line).not.toContain('write0.0s');
  });
});

// ── VARIANCE 3 ──────────────────────────────────────────────────────────────

describe('OTA-1406 V3 — the two halves are counted separately, because they are measured separately', () => {
  it('⚠⚠ one shared counter could only ever be right for one of them', () => {
    // A real call and a preempted one: prefill has two honest samples, decode
    // has one. A single `timingSamples` divided both sums by the same number and
    // was therefore wrong for whichever half it was not counting.
    call({ totalMs: 2000, outcome: 'ok', prefillMs: 1000, decodeMs: 500, promptTokens: 100 });
    call({ totalMs: 3000, outcome: 'preempted', prefillMs: 2000, decodeMs: 10, promptTokens: 100 });
    const j = qwenJobStats()[0]!;
    expect(j.prefillAvgSamples).toBe(2);
    expect(j.decodeAvgSamples).toBe(1);
    expect(j.avgPrefillMs).toBe(1500); // (1000 + 2000) / 2
    expect(j.avgDecodeMs).toBe(500);   // 500 / 1 — the truncated 10 is not in it
  });

  it('⚠ a record that contributed to NEITHER half is counted as unusable', () => {
    call({ totalMs: 1000, outcome: 'dormant', prefillMs: 0, decodeMs: 0, promptTokens: 50 });
    expect(qwenJobStats()[0]!.timingsRejected).toBe(1);
    expect(qwenTelemetrySummary()).toContain('unusable');
  });

  it('⚠ a preempt is NOT counted as unusable — it is a partial measurement, used in part', () => {
    call({ totalMs: 3000, outcome: 'preempted', prefillMs: 2000, decodeMs: 10, promptTokens: 100 });
    expect(qwenJobStats()[0]!.timingsRejected).toBe(0);
  });
});

// ── the physics rule itself, unchanged and still load-bearing ───────────────

describe('OTA-1406 — the physics rule still refuses what it always refused', () => {
  it('⚠⚠ all three device-log rows that started this, from three different OTAs', () => {
    expect(qwenTimingsArePossible({ prefillMs: 54_112, totalMs: 5_353 })).toBe(false);
    expect(qwenTimingsArePossible({ prefillMs: 8_286, decodeMs: 4_020, totalMs: 6_863 })).toBe(false);
    expect(qwenTimingsArePossible({ prefillMs: 49_256, decodeMs: 2_771, totalMs: 5_400 })).toBe(false);
  });

  it('⚠ an impossible split is still marked on the per-call line, not hidden', () => {
    expect(BOOT).toContain('NOT-PER-CALL');
  });
});

// ── every consumer, enumerated ──────────────────────────────────────────────

describe('OTA-1406 — EVERY consumer of a native timing asks a shared predicate', () => {
  it('⚠⚠ the rule is defined once and re-derived nowhere', () => {
    // The whole point of the audit. Any inline re-derivation is how this got
    // fixed in two places out of three, twice.
    const everywhere = codeOnly(TEL) + codeOnly(BOOT);
    expect(everywhere.match(/prefillMs\s*<=\s*r?\.?totalMs/g) ?? []).toEqual([]);
    expect(everywhere).not.toContain("outcome !== 'preempted' &&");
    expect(TEL).toContain('export function qwenTimingsArePossible(');
    expect(TEL).toContain('export function qwenPrefillIsMeasured(');
    expect(TEL).toContain('export function qwenDecodeIsMeasured(');
  });

  it('⚠⚠ the five consumers, named, each asking the right one', () => {
    // 1. the running average, per half
    expect(TEL).toContain('const usedPrefill = qwenPrefillIsMeasured(r);');
    expect(TEL).toContain('const usedDecode = qwenDecodeIsMeasured(r);');
    // 2. the ms/tok range
    expect(TEL).toContain('if (qwenPrefillIsMeasured(r) && (r.promptTokens ?? 0) > 0) {');
    // 3. the per-call ms/t figure — the SAME predicate as the range
    expect(BOOT).toContain('const prefillIsPossible = qwenPrefillIsMeasured(r) && (r.promptTokens ?? 0) > 0;');
    // 4. the raw printed pair — physics only, marked rather than dropped
    expect(BOOT).toContain('const timingsOk = qwenTimingsArePossible(r);');
    // 5. the averages divide by their OWN sample counts
    expect(TEL).toContain('a.prefillAvgSamples > 0 ? Math.round(a.prefillMs / a.prefillAvgSamples) : 0');
    expect(TEL).toContain('a.decodeAvgSamples > 0 ? Math.round(a.decodeMs / a.decodeAvgSamples) : 0');
  });

  it('⚠ the session-wide pressure number rides the guarded range, not a raw field', () => {
    // `nativePressure().worstMsPerPromptTok` feeds the freeze-watch line that
    // people actually read at triage. It was already correct — it gates on
    // `prefillSamples` — and this pins it so it stays that way.
    expect(TEL).toContain('if (a.prefillSamples > 0 && Number.isFinite(a.worstMsPerPromptTok)) {');
    call({ totalMs: 1000, outcome: 'dormant', prefillMs: 0, decodeMs: 0, promptTokens: 50 });
    expect(nativePressure().worstMsPerPromptTok).toBe(0);
  });

  it('⚠ no OTHER file reads a raw timing field, so this audit covers the surface', () => {
    // If a fourth consumer ever appears somewhere else, this fails and the next
    // person reads the header instead of re-deriving the rule for a fourth time.
    const app = read('app', 'state', 'gameStore.ts')
      + read('app', 'diagnostics', 'runtimePressure.ts')
      + read('app', 'diagnostics', 'runtimePressureWatch.ts')
      + read('app', 'ai', 'generation', 'LlamaRuntime.ts');
    expect(codeOnly(app)).not.toContain('avgPrefillMs');
    expect(codeOnly(app)).not.toContain('bestMsPerPromptTok');
  });
});

// ── the paperwork the numbers ended up in ───────────────────────────────────

describe('OTA-1406 — a withdrawn finding is withdrawn everywhere it appears', () => {
  it('⚠⚠ the 64.7 ms/t claim no longer stands as STILL OPEN', () => {
    // It was retracted in full by OTA-1263 and left standing as an open punchlist
    // item ~1,250 lines later in the SAME document, for another thirteen OTAs.
    // A reader arriving at the punchlist would have gone and chased it.
    const i = HANDOFF.indexOf('64.7 ms/prompt-token vs');
    expect(i).toBeGreaterThan(-1);
    const before = HANDOFF.slice(Math.max(0, i - 400), i);
    expect(before).toContain('WITHDRAWN');
    // And nothing anywhere still calls it open.
    expect(HANDOFF).not.toContain('**STILL OPEN:** `investigate_lore` at **64.7');
  });

  it('⚠⚠ the "0.0 lows = prefix reuse" reading is corrected, not deleted', () => {
    // That reading was probably the dormant artifact V1 found. The correction
    // says so and says which half of the original entry still stands — deleting
    // it would hide that the metric was misread for thirteen OTAs.
    expect(HANDOFF).toContain('THE "0.0 LOWS" WERE PROBABLY NOT PREFIX REUSE');
    expect(HANDOFF).toContain('should be re-measured on a post-OTA-1406 log');
  });
});
