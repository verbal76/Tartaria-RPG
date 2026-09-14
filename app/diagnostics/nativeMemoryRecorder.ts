// ⚠⚠⚠ BUILD 190 — THE JS SIDE OF THE NATIVE MEMORY FLIGHT RECORDER.
//
// THIS IS DIAGNOSTIC INSTRUMENTATION. IT IS NOT A MEMORY REPAIR. Nothing in
// this file or the native module behind it frees, disposes, reloads, evicts,
// schedules, cancels or throttles anything. It reads numbers and writes a
// report section. Delete it and the game behaves identically — we simply go
// back to being blind.
//
// ⚠⚠ THE DIVISION OF LABOUR, because it is the reason this file is testable at
// all. SWIFT MEASURES. TYPESCRIPT INTERPRETS.
//   · The native module owns the Mach reads, the fixed rings, the serial queue,
//     the lifecycle observers and the durable checkpoint. It stores scalars and
//     knows nothing about what any of them mean.
//   · This file owns the event VOCABULARY, the DERIVED SEMANTICS and the REPORT.
//     Every threshold below is a judgement call, and judgement calls belong
//     where they can be read and tested rather than compiled into a binary that
//     ships once a fortnight.
//
// ⚠⚠⚠ WHAT THE EVIDENCE SAYS, and the labels are the point:
//   · HISTORICAL JETSAM PROCESS PRESSURE ............................ PROVEN
//   · LIVE CLASS-H MEMORY CAUSATION ................................ UNKNOWN
// Nothing this file prints may be read as "memory caused the Apple freeze".
// The recorder exists so the next report can answer that question instead of
// re-posing it.
//
// ⚠ IT MUST NEVER BREAK ITS HOST. Every native call is wrapped; every derived
// function tolerates an empty, short or corrupt input; the module resolves to
// `null` on Android, on web, in Expo Go and in jest, and every door below is a
// safe no-op in that state. An instrument installed to investigate a crash must
// not be able to cause one.

import { requireOptionalNativeModule } from 'expo-modules-core';

// ───────────────────────────────────────────────────────────────────────────
// The event vocabulary
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠⚠ ANNOTATIONS CARRY TWO INTEGERS AND NOTHING ELSE. No prompt, no scene text,
 * no player name, no item, no model handle ever crosses this boundary — a
 * diagnostic that captures the content it is measuring becomes both a leak and
 * a privacy problem. `kind` says what happened; `code` is a small bounded
 * discriminator (a phase number, a token bucket, a queue depth), never an id
 * that means anything outside this table.
 *
 * ⚠ Native owns 60000+ (see TMEventKind in MemoryFlightRecorder.swift). This
 * table stays well below that and never collides.
 */
export const MEM_KIND = {
  // ── Correlation. ⚠ FOUR STAGES ONLY, DELIBERATELY.
  // touchPath already records the full eight-stage chain; annotating all of it
  // here would put an event in the ring for every finger movement and evict the
  // rare ones that matter. These four are the load-bearing corners: the touch
  // arrived, JS ran the handler, the operation went out, the operation returned.
  // A footprint step between any adjacent pair localises the cost to one span.
  T0_ROOT_TOUCH: 10,
  T2_HANDLER_ENTER: 12,
  T4_DISPATCH: 14,
  T5_DONE: 15,

  // ── Presentation. `code` carries the phase / fork / hint discriminator.
  PRESENT_CHAPTER: 20,
  PRESENT_FORK: 21,
  PRESENT_HINT: 22,

  // ── Qwen (llama.rn). ⚠⚠ THESE OBSERVE THE EXISTING CONFIGURATION AND DO NOT
  // TOUCH IT. Build 190 changes no n_ctx, no n_gpu_layers, no mlock, no batch
  // or ubatch, no thread count, no model, no quantization, no context lifecycle,
  // no load or release timing, no scheduler ownership, no priority, no
  // cancellation, no teardown, no Metal setting and no prompt. BUILD 190 MUST
  // MEASURE THE EXISTING LLAMA CONFIGURATION — an instrument that changed the
  // thing it measures would produce a reading about itself.
  QWEN_CONTEXT_INIT: 30,
  QWEN_CONTEXT_RELEASED: 31,
  QWEN_GEN_START: 32,
  QWEN_PREFILL_DONE: 33,
  QWEN_GEN_SETTLED: 34,

  // ── Native-ML scheduler. `code` is the queue depth at the moment.
  ML_JOB_START: 40,
  ML_JOB_END: 41,
  ML_QUEUE_DEPTH: 42,

  // ── MiniLM / ONNX.
  MINILM_SESSION_CREATE: 50,
  MINILM_SESSION_DISPOSE: 51,
  MINILM_EMBED: 52,

  // ── Voice.
  VOICE_LOAD: 60,
  VOICE_SPEAK_START: 61,
  VOICE_SPEAK_END: 62,
  VOICE_RELEASE: 63,

  // ── Persistence and report.
  PERSIST_SAVE: 70,
  PERSIST_LOAD: 71,
  REPORT_COMPOSE_START: 72,
  REPORT_COMPOSE_END: 73,

  // ── Hermes. `code` is the JS heap in MB, bucketed, so the native trace can
  // carry a coarse JS figure without the native side ever calling into JS.
  HERMES_HEAP: 80,

  /**
   * ⚠⚠ THE JS RUNTIME SAW THE MEMORY WARNING. This is NOT a duplicate of the
   * native MEMORY_WARNING event — the native module has its own observer, and
   * the two are recorded separately precisely so they can DISAGREE. A native
   * warning with no JS warning beside it means the notification never reached
   * the JS runtime, which is a finding about the runtime rather than about
   * memory, and no single combined event could have told us that.
   * `code` is this warning's ordinal in the session.
   */
  JS_MEMORY_WARNING: 81,
} as const;

export type MemKind = (typeof MEM_KIND)[keyof typeof MEM_KIND];

/** Reverse table for the report. Built once. */
const KIND_NAMES: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (const [name, code] of Object.entries(MEM_KIND)) out[code as number] = name;
  // Native-owned kinds, named here so the report never prints a bare number.
  out[60000] = 'RECORDER_START';
  out[60001] = 'RECORDER_STOP';
  out[60002] = 'MEMORY_WARNING';
  out[60003] = 'DID_BECOME_ACTIVE';
  out[60004] = 'WILL_RESIGN_ACTIVE';
  out[60005] = 'DID_ENTER_BACKGROUND';
  out[60006] = 'WILL_ENTER_FOREGROUND';
  out[60007] = 'WILL_TERMINATE';
  out[60008] = 'THERMAL_CHANGE';
  out[60009] = 'METRICKIT_PAYLOAD';
  return out;
})();

export function memKindName(kind: number): string {
  return KIND_NAMES[kind] ?? `kind:${kind}`;
}

const PHASE_NAMES = ['unknown', 'active', 'inactive', 'background', 'terminating'];
const THERMAL_NAMES = ['nominal', 'fair', 'serious', 'critical'];

// ───────────────────────────────────────────────────────────────────────────
// Derived-semantics thresholds
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠⚠⚠ EVERY NUMBER IN THIS BLOCK IS A DIAGNOSTIC HYPOTHESIS. THEY ARE NOT
 * ESTABLISHED UNIVERSAL iPHONE DANGER THRESHOLDS, and nothing may cite them as
 * if they were. The per-process limit iOS enforces varies by device RAM, by OS
 * version and by system-wide conditions; the only hard datum we own is three
 * jetsam reports off a 3 GB iPhone XR naming us at ~1.85–1.89 GB with
 * `reason: per-process-limit`, and a 3 GB device tells us nothing certain about
 * a 4 GB or 6 GB one.
 *
 * These exist so a report can say "ELEVATED" instead of printing 1,204,375,040
 * and leaving a human to squint at it. They are a reading aid with a stated
 * provenance, and they are deliberately placed in TypeScript so that revising
 * them costs an OTA and not a native build.
 */
export const MEM_ELEVATED_MB = 900;
export const MEM_HIGH_MB = 1_400;
export const MEM_SEVERE_MB = 1_700;

/** A retained delta above this much, at rest, is worth a human look. */
export const RETAINED_DELTA_CONCERN_MB = 250;

/** Recovery below this fraction of the spike is a poor recovery. */
export const RECOVERY_GOOD_FRACTION = 0.5;

/** A ratchet needs at least this many rising troughs, each at least this big. */
export const RATCHET_MIN_STEPS = 3;
export const RATCHET_STEP_MB = 40;

/**
 * ⚠ `os_proc_available_memory()` IS NOT THE EXACT JETSAM THRESHOLD. It is the
 * OS's own advisory answer to "how much more may this process take", it moves
 * with system-wide conditions, and treating it as a fixed cliff would convert a
 * moving number into a fake constant. This is a reading aid only.
 */
export const AVAILABLE_LOW_MB = 120;

const MB = 1024 * 1024;
const toMb = (bytes: number): number => Math.round((Number(bytes) || 0) / MB);

// ───────────────────────────────────────────────────────────────────────────
// Native module access
// ───────────────────────────────────────────────────────────────────────────

interface NativeSample {
  seq: number; t: number; footprint: number; resident: number; residentPeak: number;
  available: number; mallocInUse: number; mallocAllocated: number; mallocBlocks: number;
  phase: number; thermal: number; flags: number;
}
interface NativeEvent {
  seq: number; t: number; footprint: number; sampleSeq: number;
  kind: number; code: number; phase: number;
}
interface NativeModuleShape {
  start(): boolean;
  stop(): boolean;
  annotate(kind: number, code: number): void;
  heartbeat(): void;
  beginBurst(ms: number): void;
  setBuildTag(tag: string): void;
  snapshot(): Promise<Record<string, unknown>>;
  health(): Promise<Record<string, unknown>>;
  freeze(): Promise<{ sampleSeq: number; eventSeq: number }>;
  drain(sampleUpTo: number, eventUpTo: number): Promise<{
    samples: NativeSample[]; events: NativeEvent[];
    health: Record<string, unknown>; startWallMs: number;
    capacity: { samples: number; events: number };
  }>;
  previousLife(): Promise<Record<string, unknown> | null>;
  metricKit(): Promise<Record<string, unknown>>;
  startMetricKit(): boolean;
}

/**
 * ⚠ Resolved ONCE and cached, including the `null` answer. `requireOptional…`
 * is the door that does not throw when the module is absent — which is the
 * normal case on Android, on web, in Expo Go and in every jest run — so the
 * absence of a native recorder is an ordinary state this whole file is written
 * to survive, not an error path.
 */
let cached: NativeModuleShape | null | undefined;
function mod(): NativeModuleShape | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireOptionalNativeModule<NativeModuleShape>('TartariaMemory') ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Whether a native recorder is present on this runtime. */
export function nativeMemoryAvailable(): boolean {
  return mod() != null;
}

/** Tests only — lets a suite install a fake or clear the memo. */
export function _setNativeMemoryModuleForTest(m: NativeModuleShape | null | undefined): void {
  cached = m;
}

// ───────────────────────────────────────────────────────────────────────────
// Control
// ───────────────────────────────────────────────────────────────────────────

export function startNativeMemoryRecorder(buildTag?: string): boolean {
  const m = mod();
  if (!m) return false;
  try {
    if (buildTag) m.setBuildTag(String(buildTag).slice(0, 64));
    m.start();
    m.startMetricKit();
    return true;
  } catch { return false; }
}

export function stopNativeMemoryRecorder(): boolean {
  const m = mod();
  if (!m) return false;
  try { m.stop(); return true; } catch { return false; }
}

/**
 * ⚠⚠ THE ANNOTATION DOOR. Called from game seams that exist for the game — a
 * generation settling, a scene presenting, a save landing — so it has exactly
 * one obligation: COST THE CALLER ALMOST NOTHING AND NEVER THROW. The native
 * side reads a clock and hands off to its own queue; no Mach API is touched on
 * the calling thread, which for most of these callers is the JS thread.
 */
export function annotateMemory(kind: number, code = 0): void {
  const m = mod();
  if (!m) return;
  try {
    // ⚠ Bounded at the door. `code` is a 16-bit discriminator on the native
    // side; clamping here means a careless caller costs a wrong small number
    // rather than a wrapped one that reads as a different fact.
    m.annotate(kind | 0, Math.max(0, Math.min(65535, code | 0)));
  } catch { /* an instrument never breaks its host */ }
}

/** JS is alive. Native flags its own samples STALE when this stops arriving. */
export function memoryHeartbeat(): void {
  const m = mod();
  if (!m) return;
  try { m.heartbeat(); } catch { /* never breaks its host */ }
}

/**
 * Raise the native cadence to 100 ms for a short window.
 * ⚠ OVERLAPPING BURSTS EXTEND ONE SHARED DEADLINE — they do not stack and they
 * cannot hold the fast cadence open indefinitely by arriving back to back.
 */
export function beginMemoryBurst(ms = 3_000): void {
  const m = mod();
  if (!m) return;
  try { m.beginBurst(Math.max(0, ms | 0)); } catch { /* never breaks its host */ }
}

// ───────────────────────────────────────────────────────────────────────────
// Derived semantics — pure, and therefore the testable heart of Build 190
// ───────────────────────────────────────────────────────────────────────────

export interface MemoryFacts {
  /** Number of samples the facts were derived from. */
  n: number;
  /** ⚠ THE SETTLED EARLY READING, not the first one. See below. */
  baselineMb: number;
  peakMb: number;
  lastMb: number;
  /** Highest footprint seen in this window. */
  highWaterMb: number;
  /** last − baseline. Positive means the session is carrying more than it started with. */
  retainedDeltaMb: number;
  /** How much of the spike above baseline came back. 1 = fully recovered. */
  recoveryFraction: number;
  /** Rising troughs — the shape that says "every cycle settles higher". */
  ratchetSteps: number;
  ratchetMb: number;
  /** Lowest `available` the OS reported in the window, in MB. */
  minAvailableMb: number;
  /** Samples whose Hermes figure was stale because JS had gone quiet. */
  jsStaleSamples: number;
  /** A one-word reading of the peak. See the threshold caveat above. */
  band: 'normal' | 'elevated' | 'high' | 'severe' | 'unknown';
  /** A one-word reading of the shape. */
  shape: 'flat' | 'spike-recovered' | 'spike-retained' | 'ratchet' | 'unknown';
}

const EMPTY_FACTS: MemoryFacts = {
  n: 0, baselineMb: 0, peakMb: 0, lastMb: 0, highWaterMb: 0,
  retainedDeltaMb: 0, recoveryFraction: 1, ratchetSteps: 0, ratchetMb: 0,
  minAvailableMb: 0, jsStaleSamples: 0, band: 'unknown', shape: 'unknown',
};

/**
 * ⚠⚠ THE INTERPRETATION, AND THE THREE SHAPES IT EXISTS TO TELL APART.
 * A report that says "peak 1.4 GB" is nearly useless on its own, because three
 * completely different situations produce it and they want three different
 * repairs:
 *   · a large but STABLE working set — expensive, and fine
 *   · a SPIKE THAT RECOVERED — the allocation is real but transient
 *   · a RATCHET — every cycle settles higher and the process is walking to its
 *     own death
 * Nothing on the device could distinguish those before Build 190. This function
 * is the part that does, and it is pure so it can be tested against traces we
 * construct rather than traces we have to wait for a phone to produce.
 */
export function deriveMemoryFacts(samples: readonly NativeSample[]): MemoryFacts {
  try {
    const rows = (samples ?? []).filter(
      (s) => s && Number.isFinite(s.footprint) && s.footprint > 0
    );
    if (rows.length === 0) return { ...EMPTY_FACTS };

    const mb = rows.map((s) => toMb(s.footprint));

    // ⚠ BASELINE IS THE MEDIAN OF THE FIRST EIGHT SETTLED SAMPLES, not the
    // first sample. The opening samples of a process are taken mid-boot while
    // the bundle is still evaluating and models are still loading; calling the
    // first one "baseline" would make every healthy session look like a
    // catastrophic ratchet away from a number that never really existed. A
    // median over a short window also refuses to be dragged by one outlier.
    const head = mb.slice(0, Math.min(8, mb.length)).slice().sort((a, b) => a - b);
    const baselineMb = head[Math.floor(head.length / 2)] ?? mb[0] ?? 0;

    const peakMb = Math.max(...mb);
    const lastMb = mb[mb.length - 1] ?? 0;
    const highWaterMb = Math.max(
      peakMb,
      ...rows.map((s) => toMb(s.residentPeak)).filter((v) => Number.isFinite(v))
    );
    const retainedDeltaMb = lastMb - baselineMb;

    // Of everything the session climbed above baseline, how much came back?
    const climb = Math.max(0, peakMb - baselineMb);
    const recoveryFraction = climb === 0
      ? 1
      : Math.max(0, Math.min(1, (peakMb - lastMb) / climb));

    // ⚠⚠ THE RATCHET TEST WALKS TROUGHS, NOT PEAKS, and that is the whole
    // subtlety. Peaks rise whenever the app does something big, which is normal
    // and says nothing. It is the FLOOR between those spikes — what the process
    // refuses to give back once the work is over — that distinguishes "busy"
    // from "leaking". A trough that is materially higher than the previous
    // trough is one step of a ratchet.
    let ratchetSteps = 0;
    let ratchetMb = 0;
    const troughs = localMinima(mb);
    for (let i = 1; i < troughs.length; i += 1) {
      const step = troughs[i]! - troughs[i - 1]!;
      if (step >= RATCHET_STEP_MB) {
        ratchetSteps += 1;
        ratchetMb += step;
      }
    }

    const avails = rows.map((s) => toMb(s.available)).filter((v) => v > 0);
    const minAvailableMb = avails.length ? Math.min(...avails) : 0;

    const jsStaleSamples = rows.filter((s) => (Number(s.flags) & 2) !== 0).length;

    const band: MemoryFacts['band'] =
      peakMb >= MEM_SEVERE_MB ? 'severe'
        : peakMb >= MEM_HIGH_MB ? 'high'
          : peakMb >= MEM_ELEVATED_MB ? 'elevated'
            : 'normal';

    const shape: MemoryFacts['shape'] =
      ratchetSteps >= RATCHET_MIN_STEPS ? 'ratchet'
        : climb < RATCHET_STEP_MB ? 'flat'
          : recoveryFraction >= RECOVERY_GOOD_FRACTION ? 'spike-recovered'
            : 'spike-retained';

    return {
      n: rows.length, baselineMb, peakMb, lastMb, highWaterMb, retainedDeltaMb,
      recoveryFraction, ratchetSteps, ratchetMb, minAvailableMb, jsStaleSamples,
      band, shape,
    };
  } catch {
    return { ...EMPTY_FACTS };
  }
}

/**
 * Local minima of a series, plus its endpoints where they are minima.
 * ⚠ Smoothed with a 3-wide window first: a raw 1 Hz footprint series is noisy
 * at the megabyte level, and counting every jitter as a trough would report a
 * ratchet on a perfectly flat session.
 */
function localMinima(series: readonly number[]): number[] {
  if (series.length < 5) return [];
  const smooth: number[] = [];
  for (let i = 0; i < series.length; i += 1) {
    const a = series[Math.max(0, i - 1)]!;
    const b = series[i]!;
    const c = series[Math.min(series.length - 1, i + 1)]!;
    smooth.push((a + b + c) / 3);
  }
  const out: number[] = [];
  for (let i = 1; i < smooth.length - 1; i += 1) {
    if (smooth[i]! <= smooth[i - 1]! && smooth[i]! < smooth[i + 1]!) {
      out.push(Math.round(smooth[i]!));
    }
  }
  return out;
}

/**
 * ⚠⚠⚠ THE PROCESS-MINUS-HERMES GAP. NEVER CALL THIS "NATIVE HEAP".
 *
 * It is one subtraction: the process's phys_footprint minus whatever Hermes
 * says its JS heap is. What lands in that gap is every native allocation the JS
 * engine cannot see — the llama context, the voice model, ONNX arenas, image
 * decode buffers, the RN runtime itself, framework text and every dirty page
 * this process is charged for. It is NOT a heap, nobody can call `free` on it,
 * and labelling it as one would send the next investigation hunting for an
 * allocator to shrink that does not exist.
 *
 * It is still the single most useful derived number in the report, because a
 * gap that grows while the JS heap stays flat is the exact signature of the
 * blind spot Build 190 was built to see into.
 */
export function processMinusHermesGapMb(footprintBytes: number, hermesHeapMb: number | null): number | null {
  if (!Number.isFinite(footprintBytes) || footprintBytes <= 0) return null;
  if (hermesHeapMb == null || !Number.isFinite(hermesHeapMb)) return null;
  return Math.max(0, toMb(footprintBytes) - Math.round(hermesHeapMb));
}

// ───────────────────────────────────────────────────────────────────────────
// Report
// ───────────────────────────────────────────────────────────────────────────

export interface MemoryFlightReport {
  available: boolean;
  facts: MemoryFacts;
  samples: NativeSample[];
  events: NativeEvent[];
  health: Record<string, unknown>;
  previousLife: Record<string, unknown> | null;
  metricKit: Record<string, unknown> | null;
}

/**
 * ⚠⚠ FREEZE FIRST, THEN COMPOSE. Report composition allocates strings and runs
 * on a thread that can be preempted, so a reader walking a live ring can see
 * rows shift underneath it and emit a trace that never happened. `freeze`
 * returns the sequence marks as of now and `drain` reads strictly below them.
 *
 * ⚠ THE RECORDER IS NOT PAUSED. Composing a report must never be able to blind
 * the instrument producing it — everything the recorder writes while this runs
 * is simply not in this report, and is in the next one.
 */
export async function readMemoryFlight(): Promise<MemoryFlightReport> {
  const empty: MemoryFlightReport = {
    available: false, facts: { ...EMPTY_FACTS }, samples: [], events: [],
    health: {}, previousLife: null, metricKit: null,
  };
  const m = mod();
  if (!m) return empty;
  try {
    annotateMemory(MEM_KIND.REPORT_COMPOSE_START, 0);
    const marks = await m.freeze();
    const drained = await m.drain(marks.sampleSeq, marks.eventSeq);
    const previousLife = await m.previousLife().catch(() => null);
    const metricKit = await m.metricKit().catch(() => null);
    annotateMemory(MEM_KIND.REPORT_COMPOSE_END, 0);
    return {
      available: true,
      facts: deriveMemoryFacts(drained.samples ?? []),
      samples: drained.samples ?? [],
      events: drained.events ?? [],
      health: drained.health ?? {},
      previousLife: previousLife ?? null,
      metricKit: metricKit ?? null,
    };
  } catch {
    return empty;
  }
}

/** ⚠ How many sample rows the text report prints. The ring holds 512; printing
 *  all of them would bury the reader and bloat the bug report, and the evidence
 *  is the tail. Bounded by construction either way. */
export const REPORT_SAMPLE_ROWS = 48;
export const REPORT_EVENT_ROWS = 32;

// ───────────────────────────────────────────────────────────────────────────
// The primed cache
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠⚠ WHY THERE IS A CACHE AT ALL, AND WHY IT IS NOT LAZINESS.
 * `aboutSummary` — the bug-report header every one of these instruments feeds —
 * is SYNCHRONOUS, and has been since long before Build 190. Reading the native
 * recorder is asynchronous by design: `freeze` and `drain` take the recorder's
 * own queue, and forcing that onto the JS thread synchronously would make the
 * report composition itself a JS stall, in the one build whose whole purpose is
 * to observe JS stalls.
 *
 * So the read is primed off the existing five-second pressure tick and the
 * report prints the most recent primed snapshot WITH ITS AGE beside it. A
 * reader is never shown a stale figure that looks live.
 */
let primed: MemoryFlightReport | null = null;
let primedAtMs = 0;

/** Read the recorder and cache the result. Never throws, never blocks a caller. */
export async function primeMemoryFlight(): Promise<boolean> {
  try {
    const r = await readMemoryFlight();
    if (!r.available) return false;
    primed = r;
    primedAtMs = Date.now();
    return true;
  } catch { return false; }
}

export function cachedMemoryFlight(): { report: MemoryFlightReport | null; ageMs: number } {
  return { report: primed, ageMs: primed ? Date.now() - primedAtMs : 0 };
}

/** Tests only. */
export function _resetMemoryFlightCache(): void { primed = null; primedAtMs = 0; }

/**
 * The synchronous block `aboutSummary` prints.
 * ⚠ It distinguishes THREE states that a naive implementation would collapse
 * into one blank section, and the distinction is the whole point: no native
 * recorder on this runtime, a recorder that exists but has not been read yet,
 * and a real reading. Only the third is evidence.
 */
export function memoryFlightBlock(): string {
  try {
    if (!nativeMemoryAvailable()) {
      return 'Native memory flight recorder (Build 190)\n'
        + '  NOT AVAILABLE on this runtime (Android, web, Expo Go, or a JS-only build).\n'
        + '  ⚠ This is an absence of the instrument, NOT a clean bill of health.';
    }
    const { report, ageMs } = cachedMemoryFlight();
    if (!report) {
      return 'Native memory flight recorder (Build 190)\n'
        + '  Present but not yet read this session — no snapshot has been primed.\n'
        + '  ⚠ NOT a reading of zero.';
    }
    const age = `  (snapshot taken ${Math.round(ageMs / 1000)}s before this report)`;
    return `${memoryFlightSummary(report)}\n${age}`;
  } catch {
    return 'Native memory flight recorder (Build 190)\n  (unavailable this session)';
  }
}

/**
 * The bug-report block. ⚠ BOUNDED BY CONSTRUCTION — the rings are capped, the
 * printed tails are capped, and no input a caller supplies can make this longer.
 */
export function memoryFlightSummary(report: MemoryFlightReport): string {
  const out: string[] = ['Native memory flight recorder (Build 190)'];
  try {
    if (!report || !report.available) {
      // ⚠ Say which of the two it is. "No native recorder on this runtime" and
      // "the recorder ran and saw nothing" are completely different facts, and
      // a blank section that could mean either is the failure mode this whole
      // module was written to avoid.
      out.push('  NOT AVAILABLE on this runtime (Android, web, Expo Go, or a JS-only build).');
      out.push('  ⚠ This is an absence of the instrument, NOT a clean bill of health.');
      return out.join('\n');
    }

    const f = report.facts;
    out.push('  ⚠ footprint = task_vm_info.phys_footprint (the number Jetsam judges).');
    out.push('    NOT a heap. available = os_proc_available_memory(), an OS advisory —');
    out.push('    NOT the exact Jetsam threshold. Bands below are diagnostic hypotheses,');
    out.push('    not established universal iPhone danger thresholds.');

    if (f.n === 0) {
      out.push('  No samples recorded — the recorder was present but had taken no reading.');
    } else {
      out.push(
        `  Footprint: baseline ${f.baselineMb}MB · peak ${f.peakMb}MB · last ${f.lastMb}MB`
        + ` · high water ${f.highWaterMb}MB  [${f.band.toUpperCase()}]`
      );
      out.push(
        `  Shape: ${f.shape.toUpperCase()} — retained ${f.retainedDeltaMb >= 0 ? '+' : ''}`
        + `${f.retainedDeltaMb}MB vs baseline · recovery ${Math.round(f.recoveryFraction * 100)}%`
        + (f.ratchetSteps > 0 ? ` · ratchet ${f.ratchetSteps} step(s) +${f.ratchetMb}MB` : '')
      );
      if (f.minAvailableMb > 0) {
        out.push(
          `  OS said available: min ${f.minAvailableMb}MB`
          + (f.minAvailableMb <= AVAILABLE_LOW_MB ? '  ⚠ LOW (advisory, not a cliff)' : '')
        );
      }
      if (f.jsStaleSamples > 0) {
        out.push(
          `  ⚠ ${f.jsStaleSamples} sample(s) taken while JS had gone quiet —`
          + ' native kept sampling through a JS stall. That run IS the stall, seen from outside.'
        );
      }
    }

    out.push(`  ${healthLine(report.health)}`);

    const pl = report.previousLife;
    if (pl && typeof pl === 'object') {
      out.push('  ⚠⚠ PREVIOUS LIFE — the last checkpoint written by a process that did not');
      out.push('     come back. This is the only trace a Jetsam kill can ever leave us.');
      out.push(`     ${previousLifeLine(pl)}`);
    } else {
      out.push('  Previous life: none on record (first install, or both slots invalid).');
    }

    const mk = report.metricKit;
    if (mk && typeof mk === 'object') {
      out.push(`  MetricKit: ${metricKitLine(mk)}`);
    }

    const events = report.events.slice(-REPORT_EVENT_ROWS);
    if (events.length > 0) {
      out.push(`  Events (last ${events.length}):`);
      for (const e of events) {
        out.push(
          `    ${fmtT(e.t)} ${memKindName(e.kind)}${e.code ? `/${e.code}` : ''}`
          + ` — ${toMb(e.footprint)}MB · ${phaseName(e.phase)}`
        );
      }
    }

    const samples = report.samples.slice(-REPORT_SAMPLE_ROWS);
    if (samples.length > 0) {
      out.push(`  Samples (last ${samples.length} of ${report.samples.length}):`);
      for (const s of samples) {
        const flags = flagNames(s.flags);
        out.push(
          `    ${fmtT(s.t)} ${toMb(s.footprint)}MB rss ${toMb(s.resident)}MB`
          + (s.available > 0 ? ` avail ${toMb(s.available)}MB` : '')
          + ((s.flags & 1) !== 0 ? ` malloc ${toMb(s.mallocInUse)}MB/${s.mallocBlocks}blk` : '')
          + ` · ${phaseName(s.phase)} · ${thermalName(s.thermal)}`
          + (flags ? ` · ${flags}` : '')
        );
      }
    }
  } catch {
    out.push('  (report composition failed — the recorder itself is unaffected)');
  }
  return out.join('\n');
}

function fmtT(ms: number): string {
  const s = (Number(ms) || 0) / 1000;
  return `+${s.toFixed(1)}s`.padStart(9);
}
function phaseName(p: number): string { return PHASE_NAMES[p] ?? `phase:${p}`; }
function thermalName(t: number): string { return THERMAL_NAMES[t] ?? 'thermal:?'; }

function flagNames(flags: number): string {
  const f = Number(flags) || 0;
  const names: string[] = [];
  if ((f & 2) !== 0) names.push('JS-STALE');
  if ((f & 4) !== 0) names.push('MACH-FAILED');
  if ((f & 8) !== 0) names.push('burst');
  return names.join(' ');
}

/**
 * ⚠⚠ THE SAMPLER'S OWN VITAL SIGNS, and they are not padding. A recorder that
 * quietly stopped recording produces a FLAT TRACE, and a flat trace reads as
 * "memory was fine" when it actually means "I stopped looking". These counters
 * are the only thing that can tell those two apart.
 */
function healthLine(h: Record<string, unknown>): string {
  const n = (k: string): number => Number(h?.[k] ?? 0) || 0;
  const parts = [
    `samples ${n('samplesTaken')}`,
    `evicted ${n('samplesDropped')}`,
    `events ${n('eventsRecorded')}`,
    `warnings ${n('memoryWarnings')}`,
    `bursts ${n('burstsStarted')}+${n('burstsExtended')}ext`,
    `cadence ${n('cadenceMs')}ms`,
  ];
  if (n('machFailures') > 0) parts.push(`⚠ mach failures ${n('machFailures')}`);
  if (n('checkpointFailures') > 0) parts.push(`⚠ checkpoint failures ${n('checkpointFailures')}`);
  if (h?.started === false) parts.push('⚠ NOT RUNNING');
  return `Sampler: ${parts.join(' · ')}`;
}

function previousLifeLine(pl: Record<string, unknown>): string {
  const n = (k: string): number => Number(pl?.[k] ?? 0) || 0;
  const reason = memKindName(n('reason'));
  const tag = typeof pl.buildTag === 'string' && pl.buildTag ? pl.buildTag : 'unstamped';
  return `${reason} at ${toMb(n('footprint'))}MB (high water ${toMb(n('observedHighWater'))}MB,`
    + ` baseline ${toMb(n('baseline'))}MB) after ${Math.round(n('uptimeMs') / 1000)}s`
    + ` · ${n('memoryWarnings')} warning(s) · ${phaseName(n('phase'))} · build ${tag}`;
}

function metricKitLine(mk: Record<string, unknown>): string {
  const payloads = Array.isArray(mk.payloads) ? mk.payloads : [];
  if (payloads.length === 0) {
    // ⚠ MetricKit delivers roughly once a day. Empty means undelivered.
    return 'no payload delivered yet (iOS delivers ~daily) — undelivered, NOT healthy';
  }
  const last = payloads[payloads.length - 1] as Record<string, unknown>;
  const n = (k: string): number => Number(last?.[k] ?? 0) || 0;
  const limitExits = n('fgMemoryResourceLimitExits') + n('bgMemoryResourceLimitExits');
  return `${payloads.length} payload(s) · peak ${toMb(n('peakMemoryBytes'))}MB`
    + ` · memory-limit exits ${limitExits}`
    + (limitExits > 0 ? '  ⚠⚠ iOS ITSELF REPORTS KILLING US FOR MEMORY' : '');
}
