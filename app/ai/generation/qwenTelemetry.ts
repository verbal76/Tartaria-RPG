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

export type QwenCallOutcome = 'ok' | 'empty' | 'error';

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
}

interface JobAggregate {
  count: number;
  totalMs: number;
  maxMs: number;
  waitMs: number;
  maxWaitMs: number;
  empty: number;
  error: number;
}

const jobs = new Map<string, JobAggregate>();
let callCount = 0;
let sink: ((r: QwenCallRecord) => void) | null = null;

/** The store registers a sink at hydrate so calls surface in the debug log.
 *  A throwing sink must never break a generation — recording swallows. */
export function setQwenTelemetrySink(fn: ((r: QwenCallRecord) => void) | null): void {
  sink = fn;
}

export function recordQwenCall(r: QwenCallRecord): void {
  callCount += 1;
  const agg = jobs.get(r.job) ?? {
    count: 0, totalMs: 0, maxMs: 0, waitMs: 0, maxWaitMs: 0, empty: 0, error: 0,
  };
  agg.count += 1;
  agg.totalMs += r.totalMs;
  agg.maxMs = Math.max(agg.maxMs, r.totalMs);
  agg.waitMs += r.waitMs;
  agg.maxWaitMs = Math.max(agg.maxWaitMs, r.waitMs);
  if (r.outcome === 'empty') agg.empty += 1;
  if (r.outcome === 'error') agg.error += 1;
  jobs.set(r.job, agg);
  try { sink?.(r); } catch { /* a broken sink must never break a generation */ }
}

export function qwenCallCount(): number {
  return callCount;
}

export interface QwenJobStats {
  job: string;
  count: number;
  avgMs: number;
  maxMs: number;
  avgWaitMs: number;
  maxWaitMs: number;
  empty: number;
  error: number;
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
      error: a.error,
    }))
    .sort((x, y) => y.count - x.count);
}

/** One compact line for the debug log — the rollup a device log can carry.
 *  Seconds to one decimal; wait shown only when it is a real share. */
export function qwenTelemetrySummary(): string {
  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const parts = qwenJobStats().map((j) => {
    const wait = j.avgWaitMs >= 500 ? ` wait${s(j.avgWaitMs)}` : '';
    const bad = (j.empty > 0 ? ` ∅${j.empty}` : '') + (j.error > 0 ? ` err${j.error}` : '');
    return `${j.job} n${j.count} avg${s(j.avgMs)} max${s(j.maxMs)}${wait}${bad}`;
  });
  return parts.length > 0 ? parts.join(' | ') : 'no calls yet';
}

/** Tests only — the module is session-scoped state. */
export function resetQwenTelemetry(): void {
  jobs.clear();
  callCount = 0;
  sink = null;
}
