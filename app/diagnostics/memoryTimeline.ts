// ⚠⚠⚠ OTA-1809 (BAKER #3A) — THE MEMORY TIMELINE. AN INSTRUMENT, NOT A FIX.
//
// Baker #3 is EXCESSIVE PROCESS MEMORY / iOS JETSAM PRESSURE, and the physical
// evidence behind it is three jetsam reports off a 3 GB iPhone XR naming us at
// ~1.85–1.89 GB with `reason: per-process-limit`. That establishes a serious
// lead and NOTHING about a mechanism. #3A's whole job is to make the phone an
// instrumented laboratory so the NEXT report answers the question instead of
// re-posing it:
//
//   WHEN MEMORY GOES HIGH OR THE OS COMPLAINS, WHAT WAS RESIDENT, WHAT
//   LIFECYCLE STATE WERE WE IN, WHAT NATIVE-ML WORK WAS HAPPENING, AND DID
//   MEMORY COME BACK DOWN AFTERWARDS?
//
// ⚠⚠ WHAT ALREADY EXISTED, because this file deliberately adds no signal that
// was already on the device. runtimePressure/runtimePressureWatch already
// count memory warnings with the engine + voice state beside them, already
// keep an AppState trail, and OTA-1696 already READS Hermes's own counters
// (`readHermesStats`) every five seconds. contextLedger already counts live
// native model contexts and disposes that freed nothing. qwenTelemetry already
// prices every generation with wait / prefill / decode / prompt tokens.
//
// ⚠⚠⚠ AND WHAT NONE OF IT COULD DO: say what memory was doing AT those moments,
// or whether it RECOVERED. The heap number was read every sample and printed
// only on a freeze-stall edge; the memory-warning line — the single most
// valuable marker iOS gives us — carried no memory figure at all; and nothing
// anywhere recorded a point AFTER expensive native work. So a report could say
// "five memory warnings" and could not say whether the session was a large but
// STABLE working set, a spike that RECOVERED, or a ratchet that settled higher
// every cycle. Those three want completely different repairs, and #3B is not
// allowed to guess between them.
//
// ⚠ THIS FILE CHANGES NO BEHAVIOUR. It records. Every mark is taken at a seam
// that already existed and already ran; nothing here disposes, reloads, frees,
// schedules, cancels, or reorders anything. No timer is created here — the one
// periodic caller piggybacks on the five-second freeze sampler that has run
// since OTA-1172, and only when the heap has actually moved.
//
// ⚠⚠ THE METRIC IS NAMED HONESTLY, AND THAT MATTERS MORE THAN THE NUMBER BEING
// BIG. `heapMb` is the HERMES JS HEAP. It is NOT process resident memory. The
// ~400 MB llama context and the voice model are NATIVE allocations that Hermes
// cannot see, and process RSS is not reachable from this runtime without a new
// native dependency (checked against package.json: no device-info, no
// expo-device, and Sentry exposes no live-memory read). So this file reports
// the JS heap as the JS heap, reports the model contexts as a COUNT with an
// explicitly estimated MB beside it, and reports nothing it cannot measure.
// A metric that cannot move is worse than no metric: it reads as evidence.

import { AppState } from 'react-native';
import { readHermesStats } from './runtimePressure';
import { APPROX_CONTEXT_MB, contextLedger } from '../ai/generation/contextLedger';

/** ⚠ FIXED, and small on purpose. This ring must never become the memory
 *  problem it was built to find: 64 records of ~10 scalars is a few kilobytes,
 *  and a timeline longer than that is not read by a human anyway — the last
 *  minute before a death is the evidence, not the whole session. */
export const MEMORY_TIMELINE_MAX = 64;

/** ⚠ Notes are a short TAG, never content. Truncated rather than rejected so a
 *  careless caller costs bytes and not a mark. */
export const MEMORY_MARK_NOTE_MAX = 24;

/** ⚠ The gate on the periodic mark. The freeze sampler runs every 5 s whether
 *  or not anything happened; recording every tick would be the polling daemon
 *  #3A is explicitly not allowed to be. A move of this many MB is what makes a
 *  sample worth a row — a stable session records almost nothing, and a session
 *  that ratchets records exactly the ratchet. */
export const MEMORY_MARK_HEAP_DELTA_MB = 8;

/**
 * One row of the timeline. ⚠ SCALARS ONLY — no prompt, no scene, no player, no
 * model object, no closure, no array. A diagnostic that retains the thing it is
 * measuring is a leak with a nice name on it.
 */
export interface MemoryMark {
  /** Wall clock at the mark. */
  at: number;
  /** Short event tag, e.g. 'watch-start', 'mem-warning', 'gen-settled'. */
  event: string;
  /** ⚠ HERMES JS HEAP in MB — not process RSS. `null` when Hermes does not
   *  answer (web, an older engine, a test harness). NEVER a fabricated 0. */
  heapMb: number | null;
  /** Cumulative Hermes GC milliseconds, or null with heapMb. */
  gcMs: number | null;
  /** Cumulative Hermes GC count, or null with heapMb. */
  gcN: number | null;
  /** Live native llama contexts (contextLedger). A COUNT — this one is exact. */
  ctxLive: number;
  /** ⚠ ESTIMATE: ctxLive × APPROX_CONTEXT_MB. Labelled everywhere it prints. */
  ctxMb: number;
  /** AppState at the mark ('active' / 'inactive' / 'background' / 'unknown'). */
  app: string;
  /** Native-ML lane running at the mark, or 'idle'. */
  lane: string;
  /** Native-ML job kind running at the mark, when one is. */
  kind: string | null;
  /** Native-ML queue depth at the mark. */
  q: number;
  /** Memory warnings seen this session at the mark. */
  warns: number;
  /** Optional short tag — a job name, a transition, a token count. Bounded. */
  note?: string;
}

const ring: MemoryMark[] = [];

/** ⚠ Set by the runtime-pressure watch, which owns the warning counter. A
 *  getter rather than a value: the count changes while the app runs, and this
 *  module must not import the watch (the watch imports this one). */
let warnCount: () => number = () => 0;
export function setMemoryWarnCounter(fn: () => number): void { warnCount = fn; }

/** The heap of the last mark actually recorded, so the periodic caller can ask
 *  "has it moved enough to be worth a row?" without keeping its own copy. */
let lastMarkedHeapMb: number | null = null;

/** ⚠ TYPE-CHECKED, not merely `String()`-ed, and that is not defensive padding:
 *  in a harness where `AppState.currentState` is not a plain string, `String()`
 *  happily produces a row whose `app` field is the SOURCE TEXT OF A FUNCTION —
 *  measured, in this suite's own first run. A diagnostic that prints something
 *  unreadable where it means "I could not tell" is the same failure mode as one
 *  that prints a fabricated zero. */
function readAppState(): string {
  try {
    const s = AppState.currentState;
    return typeof s === 'string' && s.length > 0 ? s : 'unknown';
  } catch { return 'unknown'; }
}

/** ⚠ Lazily required, inside its own try, exactly as runtimePressureWatch reads
 *  the voice module: the native-ML lock imports the runtime, the runtime is a
 *  leaf, and a static import here would put a diagnostic in the middle of that
 *  chain. An instrument must never be the reason a module graph changes shape. */
function readNative(): { lane: string; kind: string | null; q: number } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lock = require('../ai/nativeMlLock') as typeof import('../ai/nativeMlLock');
    // ⚠ `nativeQueuePressure`, not `nativeMlSnapshot`: the snapshot knows the
    // LANE (llm / voice / homework) and the queue pressure knows the JOB
    // ('ambient_fill', 'parse_fallback'). "A 300 MB spike while `homework` ran"
    // and "a spike while `item_synthesis_hw` ran" are different facts, and only
    // the second one names a suspect.
    const p = lock.nativeQueuePressure();
    return {
      lane: String(p.runningLane ?? 'idle'),
      kind: p.runningKind == null ? null : String(p.runningKind),
      q: Number(p.depth) || 0,
    };
  } catch {
    return { lane: 'unknown', kind: null, q: 0 };
  }
}

/**
 * ⚠ THE ONE DOOR. Records the strongest available memory signal plus enough
 * state to reconstruct what the app was doing. Every read is individually
 * guarded: this function must not be able to throw into the lifecycle seam it
 * is standing in, because every one of those seams is load-bearing and none of
 * them exists for us.
 */
export function noteMemoryMark(event: string, note?: string): void {
  try {
    const h = readHermesStats();
    const heapMb = h ? Math.round(h.heapBytes / 1048576) : null;
    const led = (() => { try { return contextLedger(); } catch { return null; } })();
    const nat = readNative();
    const mark: MemoryMark = {
      at: Date.now(),
      event: String(event).slice(0, MEMORY_MARK_NOTE_MAX),
      heapMb,
      gcMs: h ? Math.round(h.gcMs) : null,
      gcN: h ? h.gcCount : null,
      ctxLive: led ? led.live : 0,
      ctxMb: led ? led.live * APPROX_CONTEXT_MB : 0,
      app: readAppState(),
      lane: nat.lane,
      kind: nat.kind,
      q: nat.q,
      warns: (() => { try { return warnCount(); } catch { return 0; } })(),
      ...(note ? { note: String(note).slice(0, MEMORY_MARK_NOTE_MAX) } : {}),
    };
    ring.push(mark);
    // ⚠ Deterministic eviction, oldest first, every push. `splice` rather than
    // a modulus index so the array IS the timeline in order — the reader of a
    // bug report should not have to unwrap a circular buffer by hand.
    while (ring.length > MEMORY_TIMELINE_MAX) ring.splice(0, 1);
    if (heapMb != null) lastMarkedHeapMb = heapMb;
  } catch { /* an instrument never breaks its host */ }
}

/**
 * ⚠ THE PERIODIC ONE, AND IT IS A GATE RATHER THAN A SAMPLER. Called from the
 * freeze watch's existing five-second tick; records a row only when the heap
 * has moved by MEMORY_MARK_HEAP_DELTA_MB or more since the last recorded mark.
 * Returns whether it recorded, so the caller can be tested on the gate itself.
 */
export function noteMemoryMarkIfMoved(event = 'heap-move'): boolean {
  try {
    const h = readHermesStats();
    if (!h) return false;
    const mb = Math.round(h.heapBytes / 1048576);
    if (lastMarkedHeapMb != null && Math.abs(mb - lastMarkedHeapMb) < MEMORY_MARK_HEAP_DELTA_MB) {
      return false;
    }
    noteMemoryMark(event);
    return true;
  } catch { return false; }
}

/** The timeline as recorded, oldest first. */
export function memoryTimeline(): readonly MemoryMark[] { return ring; }

/** Tests only. ⚠ Not called from app code — a ring anything can clear is a ring
 *  that reads empty exactly when it mattered. */
export function _resetMemoryTimeline(): void {
  ring.length = 0;
  lastMarkedHeapMb = null;
}

/** `+12.3s` — relative to the first row, because a reader comparing rows cares
 *  about the gaps and an ISO stamp on every line buries them. */
function rel(at: number, t0: number): string {
  const s = (at - t0) / 1000;
  return `${s >= 0 ? '+' : ''}${s.toFixed(1)}s`;
}

/**
 * The bug-report block. ⚠ Bounded by construction: the ring is capped, so this
 * is capped. Reads flat when nothing moved, which is itself the answer to "was
 * memory the problem this session".
 */
export function memoryTimelineSummary(rows: readonly MemoryMark[] = ring): string {
  const out: string[] = ['Memory timeline'];
  if (rows.length === 0) {
    out.push('  (no marks this session)');
    return out.join('\n');
  }
  const heaps = rows.map((r) => r.heapMb).filter((m): m is number => m != null);
  out.push(`  ⚠ heap = HERMES JS HEAP, not process memory. ctx ≈ count × ${APPROX_CONTEXT_MB}MB est.`);
  if (heaps.length === 0) {
    out.push('  Heap: UNAVAILABLE on this runtime (Hermes did not answer) — rows still carry lifecycle state.');
  } else {
    const first = heaps[0]!;
    const last = heaps[heaps.length - 1]!;
    out.push(`  Heap: first ${first}MB · peak ${Math.max(...heaps)}MB · last ${last}MB `
      + `· net ${last - first >= 0 ? '+' : ''}${last - first}MB over ${rows.length} mark${rows.length === 1 ? '' : 's'}`);
  }
  const t0 = rows[0]!.at;
  for (const r of rows) {
    const heap = r.heapMb == null ? 'heap ?' : `heap ${r.heapMb}MB`;
    const gc = r.gcMs == null ? '' : ` gc ${r.gcMs}ms/${r.gcN}`;
    const ctx = `ctx ${r.ctxLive}${r.ctxLive > 0 ? ` ≈${r.ctxMb}MB est` : ''}`;
    const native = r.lane === 'idle' ? 'idle' : `${r.kind ?? r.lane} running`;
    out.push(`  ${rel(r.at, t0).padStart(8)} ${r.event}${r.note ? ` [${r.note}]` : ''}`
      + ` — ${heap}${gc} · ${ctx} · app=${r.app} · native ${native} q${r.q} · warns ${r.warns}`);
  }
  return out.join('\n');
}
