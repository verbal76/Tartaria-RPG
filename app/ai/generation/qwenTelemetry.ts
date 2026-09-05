// OTA-1105 — QWEN CALL TELEMETRY. The measurement the 29-second mystery has
// been waiting on (OTA-1093 deliberately deferred any budget cut "rather than
// a blind budget cut — it gets per-intent timing first").
//
// One choke point instead of nine hand-rolled timers: every generation —
// narration, ambient, flourish, forge naming, fusion describe, parse
// fallback, item synthesis, investigate lore, ask-the-Arbiter — is recorded
// HERE, at the runtime boundary, with the label its call site passes down.
//
// The split that matters: `waitMs` vs `totalMs`. Every completion queues
// behind the shared native-ML lock (arb159 — Qwen and Kokoro TTS crash the
// process if they overlap on Tensor G5), so a "29-second generation" can
// really be four seconds of generating behind twenty-five seconds of queue.
// Cutting n_predict fixes the first and does nothing for the second; without
// this split the two are indistinguishable in the log.
//
// Pure module: no store import, no persistence, session-scoped. The store
// registers a sink at hydrate to surface per-call lines + periodic rollups
// in the debug channel (the device log is the delivery vehicle — same as
// every diagnosis this project has shipped).

/** ⚠ OTA-1119 — 'dormant' is an EMPTY WITH A KNOWN CAUSE, and it exists
 *  because 'empty' was hiding two completely different failures. A model that
 *  genuinely produced nothing is a PROMPT problem; a call that ran against a
 *  detached native context is a LIFECYCLE problem, and the two get investigated
 *  in opposite directions. The device log had one of each and no way to tell
 *  them apart — the second read `empty 8809ms read 0ms/write 0ms in 309t→out
 *  0t`, which is 8.8 seconds of wall time doing literally no native work. */
/** ⚠ OTA-1123 — 'preempted' is HOMEWORK CUT SHORT, and it is a SUCCESS, not a
 *  failure. Idle-time work is interruptible on purpose: the moment the player
 *  acts, llama.cpp is told to stop so their call runs now. A preempted job
 *  losing its tokens is the system working exactly as designed, so it must not
 *  read as an error in the rollup — but it still needs its own mark, because a
 *  session full of them means homework is being scheduled at the wrong moments
 *  and burning battery for nothing. */
export type QwenCallOutcome = 'ok' | 'empty' | 'error' | 'dormant' | 'preempted';

/** OTA-1107 — how generation ended, straight from llama.cpp. `limit` means it
 *  ran into the token cap mid-thought (we are paying full price AND cutting a
 *  sentence off); `eos` means it finished naturally and the cap has headroom. */
export type QwenStopReason = 'eos' | 'limit' | 'word' | 'unknown';

export interface QwenCallRecord {
  /** Which job asked — 'flourish', 'forge_name', 'ambient', a narration intent… */
  job: string;
  /** Entry to return, queue included. */
  totalMs: number;
  /** Time spent waiting on the shared native-ML lock before generating. */
  waitMs: number;
  /** Length of the returned text ('' on error). */
  chars: number;
  outcome: QwenCallOutcome;
  at: number;
  // ── OTA-1107 — the numbers llama.cpp was already computing and we discarded ──
  /** READ time: how long the model spent ingesting the prompt before writing a
   *  token. OTA-1106 inferred this from wall-clock and it carried the whole
   *  diagnosis; now it is measured. */
  prefillMs?: number;
  /** WRITE time: generation proper. */
  decodeMs?: number;
  /** Prompt length in TOKENS (the model's own count, not a chars/4 guess). */
  promptTokens?: number;
  /** Tokens emitted. */
  outTokens?: number;
  /** ⚠ OTA-1108 — NOT reuse. This is llama.cpp's KV cache SIZE after the call,
   *  which is `reused prefix + prompt tokens evaluated + tokens predicted`.
   *  OTA-1107 read it as "tokens reused" and the first device log disproved
   *  that outright: every single row came back as exactly promptTokens +
   *  outTokens (546+31=577, 542+31=573, 309+179=488, 127+22=149 …), which is
   *  the signature of a cache that grew by what this call did and reused
   *  nothing. Reuse is the REMAINDER — see `reusedTokens` on the aggregate. */
  cachedTokens?: number;
  /** Why generation stopped. */
  stop?: QwenStopReason;
  /** Prompt size in characters, measured on our side of the boundary. */
  promptChars?: number;
  /** OTA-1692 — worst JS-timer lateness (ms) sampled WHILE the native call
   *  ran (jsHeartbeat). Seconds here mean the JS thread was starved under the
   *  model; absent when the call never reached the native side. */
  jsLateMs?: number;
  /** OTA-1692 — the thread count this completion asked llama.rn for. */
  threads?: number;
}

interface JobAggregate {
  count: number;
  totalMs: number;
  maxMs: number;
  waitMs: number;
  maxWaitMs: number;
  empty: number;
  /** OTA-1119 — calls swallowed because the native context was already gone. */
  dormant: number;
  /** OTA-1123 — homework cut short so the player's call could run. */
  preempted: number;
  error: number;
  // OTA-1107
  prefillMs: number;
  decodeMs: number;
  promptTokens: number;
  outTokens: number;
  cachedTokens: number;
  /** OTA-1108 — prefix tokens llama.cpp did NOT have to re-read, derived
   *  honestly as `cachedTokens - promptTokens - outTokens`. */
  reusedTokens: number;
  /** Calls that reported a cache size at all, so a zero can be shown as a
   *  measured zero rather than as "no data". */
  cacheSamples: number;
  /** ⚠ OTA-1127 — MS PER PROMPT TOKEN, BEST AND WORST. The owner: "fix the
   *  tracking information in the log so that we can see more clearly what is
   *  affecting number one."
   *
   *  `reuse` has read 0t in every row of every log, before AND after the
   *  OTA-1121 prefix reorder — which tells us nothing, because a cache that is
   *  working and a `cachedTokens` field that is not reported look identical
   *  through it. The number that CANNOT lie is how long the model took per
   *  prompt token: a cold read on this device measures ~10-13ms/token, and a
   *  read that reuses its prefix comes in far under that.
   *
   *  Averaging destroys the signal — a job whose first call is cold and second
   *  is warm averages to something meaningless — so the BEST and WORST are kept
   *  separately. A job whose best is a fraction of its worst is a job the cache
   *  is helping. A job where the two are equal is one it is not. */
  bestMsPerPromptTok: number;
  worstMsPerPromptTok: number;
  /** Calls that measured a prefill at all (a preempted or dormant call has no
   *  honest per-token number and must not drag the best/worst either way). */
  prefillSamples: number;
  hitLimit: number;
  /** Calls whose text never reached the player (cancelled, filtered, stale). */
  discarded: number;
  /** Milliseconds burned on those calls — the honest waste number. */
  discardedMs: number;
  /** ⚠ OTA-1406 — SEPARATE COUNTS, because prefill and decode are measured on
   *  different records. A preempted call contributes a complete prefill and a
   *  truncated decode; one shared counter could only ever be right for one of
   *  them, and was wrong for both. */
  prefillAvgSamples: number;
  decodeAvgSamples: number;
  /** ⚠ OTA-1405 — calls that reported a split we refused. Surfaced in the
   *  summary so a rollup built on half the session says so out loud. */
  timingsRejected: number;
}

/**
 * ⚠⚠ OTA-1405 — CAN THIS TIMING BE TRUE? One answer, asked by everything that
 * prints or averages a read/write split.
 *
 * llama.rn's `timings.prompt_ms` is native-reported and is NOT reliably
 * per-call: the device logs carry `investigate_lore ok 5353ms read 54112ms`
 * (OTA-1139), `ok 6863ms read 8286ms/write 4020ms` (OTA-1263) and, from the
 * owner's 2026-08-20 capture, `read 49256ms` on a call that finished in 5.4
 * seconds. Prefill and decode both happen INSIDE the call, so their sum cannot
 * exceed the call's own wall-clock. When it does, the native numbers are not a
 * measurement of this call and nothing may be built on them.
 *
 * ⚠ THIS RULE HAS BEEN WRITTEN THREE TIMES AND APPLIED IN THE WRONG PLACES
 * TWICE. OTA-1139 guarded the ms/tok RANGE. OTA-1263 guarded the per-line ms/tok
 * FIGURE and recorded, in its own comment, that it had cost a wrong finding. In
 * between, the raw `read Xms/write Yms` pair kept printing as fact on the very
 * same line, and the AVERAGE kept summing the same rejected samples. Both of
 * those are the numbers a reader reaches for first. So the rule now lives in one
 * exported function and every consumer calls it — because the failure mode here
 * is not "the guard is wrong", it is "the guard is somewhere else".
 */
export function qwenTimingsArePossible(r: {
  prefillMs?: number; decodeMs?: number; totalMs: number;
}): boolean {
  const hasPrefill = typeof r.prefillMs === 'number';
  const hasDecode = typeof r.decodeMs === 'number';
  // Nothing reported is not the same as something impossible — but there is
  // still no usable split, so callers get one honest `false` for both.
  if (!hasPrefill && !hasDecode) return false;
  // ⚠ Negatives are as impossible as overruns and llama.rn has been seen to
  // report them; `>= 0` rather than a truthiness check, so a real zero prefill
  // (a fully-cached prompt) stays a legitimate measurement.
  if (hasPrefill && r.prefillMs! < 0) return false;
  if (hasDecode && r.decodeMs! < 0) return false;
  return (r.prefillMs ?? 0) + (r.decodeMs ?? 0) <= r.totalMs;
}

/**
 * ⚠⚠ OTA-1406 — POSSIBLE IS NOT THE SAME AS MEASURED, and asking one question
 * for both is what let two more classes of garbage into numbers already
 * "guarded".
 *
 * `qwenTimingsArePossible` answers a physics question: could these numbers
 * describe this call at all? It cannot answer whether they describe anything.
 * Two records pass it and mean nothing:
 *
 *   · A DORMANT call. OTA-1119 named this exact record — `empty 8809ms read 0ms/
 *     write 0ms in 309t→out 0t`, 8.8 seconds of wall time against a context that
 *     had already been detached. `0 + 0 <= 8809` is true, so the physics check
 *     waves it through; the zero then drags every average toward zero AND sets
 *     the BEST end of the ms/tok range to 0.0. Measured, one real 11.0 ms/tok
 *     call plus one dormant record printed `ms/tok 0.0-11.0` and halved
 *     `avgPrefillMs` from 3400 to 1700.
 *
 *   · An ERROR call. Same shape, same reason: nothing came back.
 *
 * ⚠⚠ AND PREFILL AND DECODE DO NOT SHARE PHYSICS, which is the variance the
 * single yes/no was hiding. `stopCompletion()` is polled in llama.cpp's DECODE
 * loop — this repo established that twice from two device logs (the intro-fill
 * preempt analysis, and the `item_synthesis preempted 3565ms in 328t→out 0t` row
 * where all 3565ms was prefill). So on a preempted call:
 *
 *   · PREFILL COMPLETED. It runs to the end before a single token is emitted, so
 *     it is a whole, honest measurement — and the ms/tok range was throwing it
 *     away, which is why `prefillSamples` came back 0 for exactly the calls the
 *     HANDOFF was using to reason about prefill cost.
 *   · DECODE WAS CUT SHORT. Averaging it says generation is fast when it was
 *     interrupted — and the same record was being averaged in, unfiltered.
 *
 * One record, two verdicts, and the old code had BOTH backwards: the range
 * refused a prefill that was real, the average accepted a decode that was not.
 */
function nativeSideRan(outcome: QwenCallOutcome): boolean {
  return outcome !== 'dormant' && outcome !== 'error';
}

/** Is this record's PREFILL a real measurement? Preempted calls COUNT — see above.
 *
 *  ⚠⚠ OTA-1407 — AND A ZERO PREFILL AGAINST EVALUATED TOKENS DOES NOT. Found in
 *  the owner's 4.31.5 play log, which the OTA-1406 audit had not seen:
 *
 *    qwen⏱ narration:scene_intro_fill preempted 5681ms read 0ms/write 0ms
 *          in 792t→out 0t 0.0ms/t (0ch)
 *
 *  792 prompt tokens evaluated in zero milliseconds is not a fast read, it is a
 *  read that never happened — OTA-1368's door abort refuses the job after the
 *  lock is won and before the native call, and llama.rn hands back a zeroed
 *  timings block. The physics check passes it (`0 + 0 <= 5681`), `nativeSideRan`
 *  passes it (a preempt is not a dormancy), and it would then have pinned the
 *  BEST end of the ms/tok range to 0.0 — the exact poisoning OTA-1406 had just
 *  removed for dormant calls, arriving through a second door.
 *
 *  ⚠ `promptTokens` is llama.cpp's `tokens_evaluated`, so a genuinely cached
 *  prompt reports ~0 tokens AND ~0 ms and is correctly excluded by the caller's
 *  own `promptTokens > 0` gate rather than by this one. Tokens evaluated with no
 *  time spent is the contradiction; tokens NOT evaluated is just a cache hit. */
export function qwenPrefillIsMeasured(r: {
  prefillMs?: number; decodeMs?: number; totalMs: number;
  promptTokens?: number; outcome: QwenCallOutcome;
}): boolean {
  if (typeof r.prefillMs !== 'number') return false;
  if (!qwenTimingsArePossible(r)) return false;
  if (!nativeSideRan(r.outcome)) return false;
  if (r.prefillMs === 0 && (r.promptTokens ?? 0) > 0) return false;
  return true;
}

/** Is this record's DECODE a real measurement? Preempted calls do NOT count. */
export function qwenDecodeIsMeasured(r: {
  prefillMs?: number; decodeMs?: number; totalMs: number; outcome: QwenCallOutcome;
}): boolean {
  return typeof r.decodeMs === 'number'
    && qwenTimingsArePossible(r)
    && nativeSideRan(r.outcome)
    && r.outcome !== 'preempted';
}

const jobs = new Map<string, JobAggregate>();
let callCount = 0;
let sink: ((r: QwenCallRecord) => void) | null = null;
/** OTA-1107 — the most recent recorded call. Every completion is serialized
 *  behind the shared native-ML lock (arb159), so exactly one generation is in
 *  flight at a time and "the last call" is unambiguous — which is what lets a
 *  consumer report a discard without threading an id back through the runtime. */
// OTA-1138 — `preempted` rides along so a discard filed against this call can
// tell "the model returned nothing" apart from "we told it to stop". The owner's
// log had `item_synthesis preempted 3535ms` followed by `DISCARDED —
// item_synth:empty` — the second line contradicting the first, because the
// discard classifier could not see the outcome the record line had just printed.
let lastCall: { job: string; totalMs: number; preempted: boolean } | null = null;
let discardSink: ((job: string, reason: string, ms: number) => void) | null = null;

function emptyAggregate(): JobAggregate {
  return {
    count: 0, totalMs: 0, maxMs: 0, waitMs: 0, maxWaitMs: 0, empty: 0, dormant: 0, preempted: 0, error: 0,
    prefillMs: 0, decodeMs: 0, promptTokens: 0, outTokens: 0, cachedTokens: 0,
    reusedTokens: 0, cacheSamples: 0,
    bestMsPerPromptTok: Infinity, worstMsPerPromptTok: 0, prefillSamples: 0,
    hitLimit: 0, discarded: 0, discardedMs: 0,
    prefillAvgSamples: 0, decodeAvgSamples: 0, timingsRejected: 0,
  };
}

/** The store registers a sink at hydrate so calls surface in the debug log.
 *  A throwing sink must never break a generation — recording swallows. */
export function setQwenTelemetrySink(fn: ((r: QwenCallRecord) => void) | null): void {
  sink = fn;
}

/** Tests only. Session-scoped module state, so a suite that records calls has to
 *  be able to start from nothing — same seam `sprint.ts` and the flourish bank
 *  already carry. */
export function _resetQwenTelemetryForTest(): void {
  jobs.clear();
  callCount = 0;
  lastCall = null;
}

export function recordQwenCall(r: QwenCallRecord): void {
  callCount += 1;
  const agg = jobs.get(r.job) ?? emptyAggregate();
  agg.count += 1;
  agg.totalMs += r.totalMs;
  agg.maxMs = Math.max(agg.maxMs, r.totalMs);
  agg.waitMs += r.waitMs;
  agg.maxWaitMs = Math.max(agg.maxWaitMs, r.waitMs);
  if (r.outcome === 'empty') agg.empty += 1;
  if (r.outcome === 'dormant') agg.dormant += 1;
  if (r.outcome === 'preempted') agg.preempted += 1;
  if (r.outcome === 'error') agg.error += 1;
  // ⚠⚠ OTA-1405 — THE AVERAGE OBEYS THE SAME RULE THE RANGE DOES. It did not,
  // and the rollup therefore contradicted itself in the same breath: the ms/tok
  // range below has refused impossible prefills since OTA-1139, while this line
  // summed them straight into `avgPrefillMs`. One rollup, two standards of
  // evidence — and the average is the number a reader trusts first, because it
  // has no visible spread to make them suspicious.
  // ⚠⚠ OTA-1406 — ASKED PER HALF. See `qwenPrefillIsMeasured` for why one
  // question could not answer for both.
  const usedPrefill = qwenPrefillIsMeasured(r);
  const usedDecode = qwenDecodeIsMeasured(r);
  if (usedPrefill) { agg.prefillMs += r.prefillMs ?? 0; agg.prefillAvgSamples += 1; }
  if (usedDecode) { agg.decodeMs += r.decodeMs ?? 0; agg.decodeAvgSamples += 1; }
  // ⚠ COUNTED, NOT QUIETLY DROPPED. A rollup that silently discards samples
  // reads as "this is what the session did"; this one can say how much of the
  // session it is actually speaking for. A record that contributed to NEITHER
  // half is rejected; one that contributed only its prefill (a preempt) is not —
  // that is a partial measurement, correctly used in part.
  if (!usedPrefill && !usedDecode && (r.prefillMs != null || r.decodeMs != null)) {
    agg.timingsRejected += 1;
  }
  agg.promptTokens += r.promptTokens ?? 0;
  agg.outTokens += r.outTokens ?? 0;
  agg.cachedTokens += r.cachedTokens ?? 0;
  // OTA-1108 — the reuse number, derived rather than assumed. llama.cpp
  // reports the cache SIZE after the call; the part it did not have to
  // re-read is whatever that size exceeds this call's own contribution.
  // Floored at zero: a build that reports the field differently must show a
  // conservative zero, never a negative that reads as a saving.
  if (typeof r.cachedTokens === 'number') {
    agg.cacheSamples += 1;
    agg.reusedTokens += Math.max(0, r.cachedTokens - (r.promptTokens ?? 0) - (r.outTokens ?? 0));
  }
  // OTA-1127 — the per-token read cost, kept as a range rather than a mean.
  // Guarded on a real prefill AND a real prompt size: a preempted call or a
  // zero-token prompt has no honest number and must not move the range.
  // ⚠ OTA-1139 (audit) — AND ONLY WHEN THE NUMBER IS POSSIBLE. The device log
  // carried `investigate_lore ok 5353ms read 54112ms` — a 54-second prefill
  // inside a 5-second call. llama.rn's `prompt_ms` is native-reported and
  // evidently not always per-call; a physically impossible sample fed straight
  // into this range would set worst-ms/tok to garbage, and the parked caching
  // investigation is waiting on exactly that number to decide anything.
  // ⚠ OTA-1405 — the inline `r.prefillMs <= r.totalMs` that used to sit here is
  // now `qwenTimingsArePossible`, so the range, the average and the per-call log
  // line all ask ONE function. Three copies of a rule is three chances to fix it
  // in two places, which is exactly what happened: OTA-1139 guarded the range,
  // OTA-1263 guarded the per-line ms/tok figure, and neither guarded the average
  // or the raw `read`/`write` pair printed beside them.
  // ⚠⚠ OTA-1406 — TWO CORRECTIONS, IN OPPOSITE DIRECTIONS. It now REFUSES a
  // dormant/error record (a zero prefill against a detached context was setting
  // the BEST end of this range to 0.0) and it now ACCEPTS a preempted one
  // (prefill completes before decode, so it is a whole measurement; excluding it
  // threw away exactly the samples the HANDOFF reasoned about).
  if (qwenPrefillIsMeasured(r) && (r.promptTokens ?? 0) > 0) {
    const per = (r.prefillMs ?? 0) / (r.promptTokens ?? 1);
    agg.bestMsPerPromptTok = Math.min(agg.bestMsPerPromptTok, per);
    agg.worstMsPerPromptTok = Math.max(agg.worstMsPerPromptTok, per);
    agg.prefillSamples += 1;
  }
  if (r.stop === 'limit') agg.hitLimit += 1;
  jobs.set(r.job, agg);
  lastCall = { job: r.job, totalMs: r.totalMs, preempted: r.outcome === 'preempted' };
  try { sink?.(r); } catch { /* a broken sink must never break a generation */ }
}

export function qwenCallCount(): number {
  return callCount;
}

/** ⚠ OTA-1138 — was the call a discard is about to be filed against CUT SHORT
 *  rather than genuinely empty? An interrupted job returning '' is the
 *  preemption feature working; a model returning '' unprompted is the dormancy
 *  bug OTA-1119 chased for a week. Filing both under one name is exactly how
 *  that hunt got long, so callers without their own epoch (item synthesis)
 *  read this before classifying. Valid until noteQwenDiscarded consumes the
 *  call; false when nothing is in flight. */
export function lastQwenCallPreempted(): boolean {
  return lastCall?.preempted === true;
}

/** OTA-1107 — the store registers this to log discards as they happen. */
export function setQwenDiscardSink(fn: ((job: string, reason: string, ms: number) => void) | null): void {
  discardSink = fn;
}

/** ⚠ OTA-1107 — WASTED WORK. Report that the text from the generation that
 *  just finished never reached the player: the narration was cancelled because
 *  you acted again, an ambient line was filtered as a near-duplicate or a
 *  wrong-shaped opener, a flourish came back after you had walked away.
 *
 *  Until now those recorded as clean successes, so the most expensive job in
 *  the app could be burning fifteen seconds a call on lines nobody read and
 *  the stats would call it healthy. This is the number that decides whether a
 *  job is worth keeping at all — and the only honest way to price the
 *  background work the headroom track is about to add.
 *
 *  Safe when no call is in flight (returns silently), and attributes to the
 *  LAST call because the native-ML lock guarantees generations never overlap. */
export function noteQwenDiscarded(reason: string): void {
  const last = lastCall;
  if (!last) return;
  lastCall = null; // one discard per call — a double report can't inflate waste
  const agg = jobs.get(last.job);
  if (agg) {
    agg.discarded += 1;
    agg.discardedMs += last.totalMs;
  }
  try { discardSink?.(last.job, reason, last.totalMs); } catch { /* never break a generation */ }
}

/** Session totals for the wasted-work line. */
export function qwenWasteTotals(): { calls: number; ms: number } {
  let calls = 0;
  let ms = 0;
  for (const a of jobs.values()) { calls += a.discarded; ms += a.discardedMs; }
  return { calls, ms };
}

/** ⚠ OTA-1368 — HOW BADLY THE NATIVE QUEUE IS BACKED UP, in four numbers.
 *  Every one of these was already being aggregated; nothing new is measured.
 *  What was missing is a CONSUMER — the runtime-pressure block that people
 *  actually read at triage never asked, so a session in which the on-device
 *  model queue was seconds deep still printed "Freeze watch: no stalls seen".
 *  See runtimePressure.ts for why that line is true and useless together. */
export interface NativePressure {
  /** Longest any single call sat waiting on the shared native-ML lock. */
  worstWaitMs: number;
  /** How many jobs have a worst-wait past NATIVE_WAIT_WARN_MS. Depth, roughly:
   *  distinct job kinds that have each been made to wait a long time. */
  slowJobs: number;
  /** Worst prompt-read cost per token seen this session. The honest
   *  contention signal — it climbs when the big cores are busy. */
  worstMsPerPromptTok: number;
  /** Generations that finished and were then thrown away, and their cost. */
  wastedCalls: number;
  wastedMs: number;
}

/** A wait past this is not queueing, it is the player waiting. */
export const NATIVE_WAIT_WARN_MS = 3_000;

export function nativePressure(): NativePressure {
  let worstWaitMs = 0;
  let slowJobs = 0;
  let worstMsPerPromptTok = 0;
  for (const a of jobs.values()) {
    worstWaitMs = Math.max(worstWaitMs, a.maxWaitMs);
    if (a.maxWaitMs >= NATIVE_WAIT_WARN_MS) slowJobs += 1;
    if (a.prefillSamples > 0 && Number.isFinite(a.worstMsPerPromptTok)) {
      worstMsPerPromptTok = Math.max(worstMsPerPromptTok, a.worstMsPerPromptTok);
    }
  }
  const waste = qwenWasteTotals();
  return {
    worstWaitMs: Math.round(worstWaitMs),
    slowJobs,
    worstMsPerPromptTok: Math.round(worstMsPerPromptTok * 10) / 10,
    wastedCalls: waste.calls,
    wastedMs: Math.round(waste.ms),
  };
}

export interface QwenJobStats {
  job: string;
  count: number;
  avgMs: number;
  maxMs: number;
  avgWaitMs: number;
  maxWaitMs: number;
  empty: number;
  /** OTA-1119 — swallowed by a dead context, not by a silent model. */
  dormant: number;
  /** OTA-1123 — yielded to the player. A success, not a failure. */
  preempted: number;
  error: number;
  // OTA-1107
  avgPrefillMs: number;
  avgDecodeMs: number;
  avgPromptTokens: number;
  avgOutTokens: number;
  cachedTokens: number;
  /** ⚠⚠ OTA-1259 (N4) — ALWAYS ZERO, AND NOT BECAUSE THE CACHE IS COLD. Kept as
   *  a tombstone so nobody re-derives it: llama.rn reports `tokens_cached` as
   *  `llama->n_past` (android/src/main/jni.cpp:748), which after a completion is
   *  prompt tokens + generated tokens WHETHER OR NOT a prefix was reused — reuse
   *  changes what must be computed, not what ends up in the cache. Subtracting
   *  those two therefore yields ~0 by construction. **OTA-1108 read that zero as
   *  "a stable prompt prefix is still on the table"; the premise was wrong.**
   *  Prefix reuse is already ON (`common_part` in rn-llama.cpp) and our prompts
   *  already share 53–85% of their text with the previous one. Read
   *  `bestMsPerPromptTok` / `worstMsPerPromptTok` instead — that is the signal. */
  reusedTokens: number;
  cacheSamples: number;
  /** OTA-1127 — ms per prompt token, best and worst. The honest cache signal. */
  bestMsPerPromptTok: number;
  worstMsPerPromptTok: number;
  prefillSamples: number;
  hitLimit: number;
  discarded: number;
  discardedMs: number;
  /** ⚠ OTA-1406 — how many calls each half of the read/write average actually
   *  speaks for. They differ: a preempted call has a real prefill and a
   *  truncated decode. `timingsRejected` counts records that contributed to
   *  neither. */
  prefillAvgSamples: number;
  decodeAvgSamples: number;
  timingsRejected: number;
}

/** Per-job aggregates, busiest first. */
export function qwenJobStats(): QwenJobStats[] {
  return [...jobs.entries()]
    .map(([job, a]) => ({
      job,
      count: a.count,
      avgMs: Math.round(a.totalMs / a.count),
      maxMs: a.maxMs,
      avgWaitMs: Math.round(a.waitMs / a.count),
      maxWaitMs: a.maxWaitMs,
      empty: a.empty,
      dormant: a.dormant,
      preempted: a.preempted,
      error: a.error,
      // ⚠⚠ OTA-1405 — DIVIDED BY THE SAMPLES THAT SURVIVED, NOT BY EVERY CALL.
      // Dividing an accepted-only sum by the full count is the second way to
      // get a wrong average out of a right filter: reject four of ten samples,
      // still divide by ten, and every job with rejected timings reads as
      // faster than it is. Zero samples yields 0, which `split` then omits
      // entirely rather than printing `read0.0s` as if it were measured.
      avgPrefillMs: a.prefillAvgSamples > 0 ? Math.round(a.prefillMs / a.prefillAvgSamples) : 0,
      avgDecodeMs: a.decodeAvgSamples > 0 ? Math.round(a.decodeMs / a.decodeAvgSamples) : 0,
      avgPromptTokens: Math.round(a.promptTokens / a.count),
      avgOutTokens: Math.round(a.outTokens / a.count),
      cachedTokens: a.cachedTokens,
      reusedTokens: a.reusedTokens,
      cacheSamples: a.cacheSamples,
      bestMsPerPromptTok: a.prefillSamples > 0 ? a.bestMsPerPromptTok : 0,
      worstMsPerPromptTok: a.worstMsPerPromptTok,
      prefillSamples: a.prefillSamples,
      hitLimit: a.hitLimit,
      discarded: a.discarded,
      discardedMs: a.discardedMs,
      prefillAvgSamples: a.prefillAvgSamples,
      decodeAvgSamples: a.decodeAvgSamples,
      timingsRejected: a.timingsRejected,
    }))
    .sort((x, y) => y.count - x.count);
}

/** One compact line for the debug log — the rollup a device log can carry.
 *  Seconds to one decimal; wait shown only when it is a real share. */
export function qwenTelemetrySummary(): string {
  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const parts = qwenJobStats().map((j) => {
    const wait = j.avgWaitMs >= 500 ? ` wait${s(j.avgWaitMs)}` : '';
    // OTA-1119 — a swallowed call gets its own mark. ∅ still means "the model
    // said nothing"; 💀 means "there was no model to say it".
    const bad = (j.empty > 0 ? ` ∅${j.empty}` : '')
      + (j.dormant > 0 ? ` 💀${j.dormant}` : '')
      + (j.error > 0 ? ` err${j.error}` : '');
    // OTA-1107 — read/write split + prompt size. This is the shape that made
    // OTA-1106 obvious; now it rides every rollup instead of needing a
    // code-reading session to reconstruct.
    // ⚠ OTA-1405 — and it says how many samples it threw out. A rollup that
    // silently drops half its evidence still reads as "this is what the session
    // did"; `⚠2unusable` is the difference between an average and a claim.
    // ⚠⚠ OTA-1406 — THE TWO HALVES PRINT INDEPENDENTLY, because they are now
    // measured on different sets of calls. A job whose every call was preempted
    // has a real prefill average and NO honest decode average, and the old
    // combined string printed `read3.5s/write0.0s` for it — a zero that reads as
    // "generation was instant" when the truth is "generation never finished".
    const readPart = j.prefillAvgSamples > 0 ? `read${s(j.avgPrefillMs)}` : '';
    const writePart = j.decodeAvgSamples > 0 ? `write${s(j.avgDecodeMs)}` : '';
    const split = readPart || writePart
      ? ` ${[readPart, writePart].filter(Boolean).join('/')}`
      : '';
    // ⚠ OTA-1406 — "unusable", not "bogus": this now covers two different
    // causes — a split that is physically impossible, and one that is possible
    // but measures nothing (a dormant call's 0/0 against a detached context).
    // Calling the second one bogus would be its own small lie.
    const rejected = j.timingsRejected > 0 ? ` ⚠${j.timingsRejected}unusable` : '';
    const sizes = j.avgPromptTokens > 0 ? ` in${j.avgPromptTokens}t→out${j.avgOutTokens}t` : '';
    // ⚠⚠ OTA-1259 (N4) — `reuse` IS NO LONGER PRINTED. It was derived as
    // `cachedTokens - promptTokens - outTokens`, and llama.rn reports
    // `tokens_cached` as `n_past` — the sequence position after the call, i.e.
    // prompt + generated, reuse or no reuse (jni.cpp:748). The subtraction is ~0
    // BY CONSTRUCTION, so the number could never move and every log that showed
    // `reuse 0t` was reporting arithmetic, not a cache miss. See `reusedTokens`.
    // ⚠ OTA-1127's per-token RANGE is the real signal and now stands alone:
    // best/worst rather than an average, so a warm call and a cold one stay
    // visible as two different things instead of averaging into one number that
    // describes neither.
    const cached = '';
    const perTok = j.prefillSamples > 0
      ? ` ms/tok ${j.bestMsPerPromptTok.toFixed(1)}-${j.worstMsPerPromptTok.toFixed(1)}`
      : '';
    const capped = j.hitLimit > 0 ? ` cap${j.hitLimit}` : '';
    // OTA-1123 — its own mark, deliberately NOT inside `bad`: yielding to the
    // player is the feature. ⏸ reads as "paused for you", not as a fault.
    const yielded = j.preempted > 0 ? ` ⏸${j.preempted}` : '';
    const waste = j.discarded > 0 ? ` ✂${j.discarded}/${s(j.discardedMs)}` : '';
    return `${j.job} n${j.count} avg${s(j.avgMs)} max${s(j.maxMs)}${split}${rejected}${sizes}${cached}${perTok}${capped}${wait}${bad}${yielded}${waste}`;
  });
  if (parts.length === 0) return 'no calls yet';
  const w = qwenWasteTotals();
  const tail = w.calls > 0 ? ` || WASTED ${w.calls} calls / ${(w.ms / 1000).toFixed(1)}s` : '';
  return parts.join(' | ') + tail;
}

/** Tests only — the module is session-scoped state. */
export function resetQwenTelemetry(): void {
  jobs.clear();
  callCount = 0;
  sink = null;
  discardSink = null;
  lastCall = null;
}
