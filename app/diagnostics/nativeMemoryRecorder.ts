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
  // ── Correlation. ⚠⚠ ONE STAGE IS EMITTED TODAY — T5_DONE. OTA-1854.
  // Build 190 emitted four corners, reasoning that four events per tap was a
  // trace a human could read. Hardware disagreed: OTA-1853's first capture
  // printed `events 1685` against a 64-slot ring, and eight of nine dated
  // retained footprint steps carried no annotation at all. `done` is the corner
  // that stayed, because it is the only one that proves the work COMPLETED and
  // the only one whose timestamp sits where retention becomes measurable. See
  // NATIVE_STAGE_KIND in diagnostics/touchPath.ts, which is the authority.
  //
  // ⚠ ALL FOUR NUMBERS STAY IN THIS TABLE, and that is not an oversight. The
  // decode vocabulary must still read a capture taken from a Build 190 device;
  // deleting a kind would turn its events into `kind:10` in an old report.
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

  /* ══════════════════════════════════════════════════════════════════════
   * ⚠⚠⚠ THE THREE BLIND SUBSYSTEMS (OTA-1853).
   *
   * The 2026-09-19 iPhone SE capture put all seven ratchet steps inside a
   * 49-second window containing THIRTEEN room transitions and SEVEN
   * `roster=new` events. The table above had a kind for Qwen, for MiniLM, for
   * voice, for touches, for persistence — and none at all for rooms, artwork
   * or rosters. The instrument was blind to precisely the candidates the
   * window was full of, which is why forensics returned "holder not proven".
   *
   * ⚠ NATIVE NEEDS NO REBUILD FOR THESE. `annotate(kind:code:)` takes an
   * opaque UInt16 and never interprets it; the name table lives here. New
   * kinds ship by OTA. Native owns 60000+; this block stays far below it.
   *
   * ⚠ `code` REMAINS A BOUNDED DISCRIMINATOR, never an identity. Room and
   * asset ids go through `memCodeForId`, a pure 16-bit FNV-1a with no map and
   * no growth — it is a CHECKSUM for cross-referencing against the game log's
   * own `scene: loc=… hub=…` line, not a name. Collisions are possible by
   * construction (65,536 buckets) and are harmless: the log carries the name,
   * the code only has to agree with itself within one life.
   * ══════════════════════════════════════════════════════════════════════ */

  // ── Room / navigation. `code` is memCodeForId(roomId) except where noted.
  ROOM_ENTER: 90,
  ROOM_EXIT: 91,
  ROUTE_MOUNT: 92,
  ROUTE_UNMOUNT: 93,
  ROOM_INSTANCE_CREATE: 94,
  ROOM_INSTANCE_DISPOSE: 95,
  /** `code` is the count itself — retained room/scene instances right now. */
  ROOM_RETAINED_COUNT: 96,

  // ── Artwork. `code` is memCodeForId(assetId) except ARTWORK_MOUNTED_COUNT.
  ARTWORK_MOUNT: 100,
  ARTWORK_UNMOUNT: 101,
  ARTWORK_LOAD: 102,
  ARTWORK_CACHE_HIT: 103,
  ARTWORK_CACHE_MISS: 104,
  ARTWORK_REPLACE: 105,
  /** `code` is the count of significant assets mounted right now. */
  ARTWORK_MOUNTED_COUNT: 106,

  // ── Roster / scene. `code` is a COUNT, not an id — the thing under test is
  // how many were made, not which ones.
  ROSTER_CREATE: 110,
  ROSTER_DISPOSE: 111,
  ENTITY_CREATE_BATCH: 112,
  ENTITY_DISPOSE_BATCH: 113,
  SCENE_CREATE: 114,
  SCENE_DISPOSE: 115,
  /** `code` is the currently retained entity count. */
  ENTITY_RETAINED_COUNT: 116,

  // ── Audio. `code` is the active player count after the transition, so a
  // create/dispose pair that never balances is visible as a rising number
  // without needing to diff two separate events.
  AUDIO_PLAYER_CREATE: 120,
  AUDIO_PLAY_START: 121,
  AUDIO_PLAY_END: 122,
  AUDIO_PLAYER_DISPOSE: 123,
  SPEECH_QUEUE_ADD: 124,
  SPEECH_QUEUE_DRAIN: 125,
} as const;

/**
 * ⚠ A CHECKSUM, NOT A NAME. 16-bit FNV-1a over a diagnostic id, used as the
 * `code` of a room or asset annotation. Pure, allocation-free, no lookup table
 * and no runtime growth — the bounded-telemetry rule forbids a map that learns
 * new keys for the lifetime of a session.
 *
 * ⚠ COLLISIONS ARE EXPECTED AND HARMLESS. 65,536 buckets over a catalogue of
 * rooms and assets will collide; the code exists to be cross-referenced against
 * the game log's own named `scene:` / artwork lines within ONE life, never to
 * identify anything on its own. Two rooms sharing a bucket is a reading
 * ambiguity the log resolves, not a lost datum.
 */
export function memCodeForId(id: string): number {
  let h = 0x811c9dc5;
  const str = String(id ?? '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i) & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return (h ^ (h >>> 16)) & 0xffff;
}

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

/* ⚠⚠⚠ OTA-1853 — NATIVE REMAINDER. WHAT THIS OTA PROVABLY CANNOT REACH.
 *
 * Everything above is JavaScript and ships over the air. These three are in the
 * Swift binary (Build 208) and need a native build. They are written down here,
 * with what was checked, so the next capture's limits are known BEFORE it is
 * taken rather than discovered while reading it.
 *
 *  1. PHASE READS `unknown` ON EVERY SAMPLE. The JS side was traced end to end
 *     and every link holds: PHASE_NAMES matches the native constants in order,
 *     the drain serialises `"phase": tmInt(s.phase)`, the observers demonstrably
 *     fire (six native memory warnings were counted in the same capture), and
 *     `phaseName` renders what it is handed. So this is NOT a JS decode bug and
 *     no amount of OTA can fix it — the field arrives as 0. It is a native
 *     defect in how `s.phase` is populated at sample time.
 *     ⚠ CONSEQUENCE FOR THE RATCHET: a step cannot currently be told apart from
 *     a step that happened while the app was in the background. The steps in
 *     the SE capture are known foreground only because the JS log placed the
 *     player in rooms throughout — that is inference from another source, not
 *     evidence from this field.
 *
 *  2. NO SUBSYSTEM IDENTITY ON AN ALLOCATION. `malloc_zone_statistics` gives
 *     size and block COUNT for the default zone (98.3% of the SE footprint,
 *     4.42–4.45M live blocks) and nothing about who asked for them. Attributing
 *     a step to a subsystem therefore rests on events recorded NEAR it in time —
 *     which is what the joined table prints, and why it prints co-location
 *     rather than a holder. Real attribution needs a native malloc zone per
 *     subsystem, or `malloc_logger`/VM-region sampling. Neither is OTA-able.
 *
 *  3. task_vm_info IS READ FOR phys_footprint ONLY. The same struct carries
 *     `internal`, `compressed`, `external` and the region counts that would
 *     separate "the process is holding decoded images" from "the process is
 *     holding compressed pages it can give back". Widening that read is a
 *     native change and is explicitly out of scope for this pass.
 *
 * ⚠ NONE OF THE THREE BLOCKS THIS OTA. The leading candidates — rooms, artwork,
 * rosters, audio — are all discriminated by the event vocabulary now shipping;
 * the native work buys precision on top, not the first answer. */

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

/* ═══════════════════════════════════════════════════════════════════════════
 * ⚠⚠⚠ THE ANALYSIS BASELINE, AND THE COLD START THAT PROVED THE OLD ONE WRONG.
 *
 * The baseline used to be the median of the first EIGHT samples, chosen (see
 * `deriveMemoryFacts`) so one mid-boot outlier could not drag it. The comment
 * there already named the hazard — "calling the first one baseline would make
 * every healthy session look like a catastrophic ratchet away from a number
 * that never really existed" — and §3.7 was written to cover it.
 *
 * ⚠ MEASURED ON THE 2026-09-20 iPHONE SE CAPTURE (OTA-1854, the first boot
 * after an OTA apply). The first eight footprints were
 *
 *     29 · 39 · 50 · 68 · 29 · 216 · 790 · 904 MB    → median 68MB
 *
 * and the report printed `baseline 68MB … retained +1198MB · recovery 26%`.
 * Reconstructed against a comparable gameplay floor the residual was about
 * +100MB. The headline overstated it by an order of magnitude.
 *
 * TWO THINGS WERE WRONG, AND THEY ARE INDEPENDENT:
 *
 *  1. MEDIAN-OF-EIGHT ASSUMES THE PROCESS SETTLES WITHIN EIGHT SAMPLES. On that
 *     capture ALL EIGHT were pre-hydration or mid-boot — the first five were
 *     taken before the JS bundle had been evaluated (81k malloc blocks against
 *     1.98M a moment later). A median cannot rescue a window in which every
 *     member is wrong; §3.7's synthetic ramp settled by its fourth sample,
 *     which is why it passed while hardware did not.
 *
 *  2. THE SAMPLE STREAM IS NOT ONE CONTINUOUS OBSERVATION. The recorder samples
 *     in bursts and its `t` restarts at each one. That capture held THREE
 *     epochs — 5 samples, then 46, then 426 — with unobserved gaps between them
 *     across which the footprint moved by hundreds of megabytes. Subtracting
 *     the last sample of the third epoch from the first of the first is not a
 *     measurement of retention; it spans time nobody watched.
 *
 * SO A BASELINE MUST BE (a) INSIDE THE EPOCH THAT ENDS THE STREAM, the only one
 * contiguous with `last`, and (b) TAKEN WHILE THE PROCESS WAS NOT STILL MOVING.
 * Neither rule names a megabyte figure, and neither was chosen because it
 * reproduces this one capture's floor.
 *
 * ⚠ AND WHEN NEITHER HOLDS, THE ANSWER IS "UNAVAILABLE". A recorder that
 * invents a baseline it cannot establish is worse than one that admits it,
 * because the invented number is the one that gets quoted.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Samples a baseline is read from. Unchanged from the original — see §3.8. */
export const BASELINE_WINDOW = 8;

/**
 * A baseline window is STABLE when its robust spread (p75 − p25) is within
 * this. ⚠ DERIVED FROM A MEASUREMENT ALREADY IN THIS FILE, not invented: the
 * OTA-1853 note below records raw peak-to-peak footprint jitter of 61MB and
 * 29MB inside two windows that each held ONE stable floor. 64 sits just above
 * the worse of those, so a genuinely settled window is never rejected while a
 * process still climbing through hundreds of megabytes always is.
 *
 * ⚠ ROBUST, NOT max−min, and that is load-bearing. §3.8 pins that a single
 * outlier may not move the baseline; a max−min test would be defeated by
 * exactly the outlier the median was chosen to absorb.
 */
export const BASELINE_STABLE_SPREAD_MB = 64;

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
  /**
   * ⚠ THE EARLIEST VALID SAMPLE IN THE WHOLE STREAM — evidence, NEVER a
   * baseline. On a cold start this is the process before the JS bundle was
   * evaluated, and nothing about gameplay may be measured from it.
   */
  processStartMb: number;
  /** Contiguous observation epochs found in the stream. >1 means the recorder
   *  stopped and restarted, and time passed that nobody sampled. */
  epochs: number;
  /** Index (into the filtered rows) where the analysis window begins. */
  analysisFromIndex: number;
  /**
   * ⚠ FALSE when no settled window could be found inside the final epoch. When
   * this is false `baselineMb`, `retainedDeltaMb` and `recoveryFraction` are
   * not claims about anything and the report says so instead of printing them.
   */
  baselineKnown: boolean;
  /** ⚠ THE SETTLED EARLY READING OF THE FINAL EPOCH, not the first sample. */
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
  n: 0, processStartMb: 0, epochs: 0, analysisFromIndex: -1, baselineKnown: false,
  baselineMb: 0, peakMb: 0, lastMb: 0, highWaterMb: 0,
  retainedDeltaMb: 0, recoveryFraction: 1, ratchetSteps: 0, ratchetMb: 0,
  minAvailableMb: 0, jsStaleSamples: 0, band: 'unknown', shape: 'unknown',
};

/**
 * ⚠⚠ THE STREAM IS A LIST OF EPOCHS, NOT ONE OBSERVATION, and this is the only
 * place that says so. The native recorder restarts its own `t` whenever it
 * begins sampling again, so a `t` that goes BACKWARDS is the recorder telling
 * us it stopped watching and started over. Whatever the process did in that
 * gap is unmeasured, and a subtraction across it is not a measurement.
 *
 * Returns the start index of each epoch. A stream with a monotonic clock — the
 * ordinary case, and every synthetic trace the suite builds — yields `[0]`.
 */
export function sampleEpochStarts(samples: readonly { t: number }[]): number[] {
  const rows = samples ?? [];
  if (rows.length === 0) return [];
  const starts = [0];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = Number(rows[i - 1]?.t);
    const cur = Number(rows[i]?.t);
    if (Number.isFinite(prev) && Number.isFinite(cur) && cur < prev) starts.push(i);
  }
  return starts;
}

/**
 * The median of the first window inside `mb` (searching forward from `from`)
 * whose ROBUST spread is within `BASELINE_STABLE_SPREAD_MB`, or `null` when the
 * series never settles. See the long note beside BASELINE_STABLE_SPREAD_MB.
 */
function settledBaseline(mb: readonly number[], from: number): { mb: number; at: number } | null {
  const n = mb.length;
  if (n - from <= 0) return null;
  // A window shorter than BASELINE_WINDOW cannot be judged for stability, so a
  // short epoch keeps the original median-of-what-there-is rather than being
  // declared unavailable — that behaviour predates this repair and nothing
  // observed argues against it.
  if (n - from < BASELINE_WINDOW) {
    const tail = mb.slice(from).slice().sort((a, b) => a - b);
    const med = tail[Math.floor(tail.length / 2)];
    return med == null ? null : { mb: med, at: from };
  }
  for (let start = from; start + BASELINE_WINDOW <= n; start += 1) {
    const win = mb.slice(start, start + BASELINE_WINDOW).slice().sort((a, b) => a - b);
    const lo = win[Math.floor(win.length * 0.25)]!;
    const hi = win[Math.floor(win.length * 0.75)]!;
    if (hi - lo <= BASELINE_STABLE_SPREAD_MB) {
      return { mb: win[Math.floor(win.length / 2)]!, at: start };
    }
  }
  return null;
}

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

    /* ⚠⚠⚠ THE EARLIEST SAMPLE IS KEPT AS EVIDENCE AND IS NOT THE BASELINE.
     * On the OTA-1854 cold start this is 29MB — a process that had not yet
     * evaluated its JS bundle. It answers "what was the earliest process
     * footprint", which is a real and separate question from "how much stayed
     * elevated", and confusing the two is the defect this block repairs. */
    const processStartMb = mb[0] ?? 0;

    /* ⚠⚠ THE ANALYSIS WINDOW IS THE FINAL EPOCH. Only the epoch that ends the
     * stream is contiguous with `last`; anything earlier is separated from it
     * by time the recorder did not watch. See sampleEpochStarts. */
    const epochStarts = sampleEpochStarts(rows);
    const from = epochStarts[epochStarts.length - 1] ?? 0;
    const win = mb.slice(from);

    const settled = settledBaseline(mb, from);
    const baselineKnown = settled !== null;
    const baselineMb = settled?.mb ?? 0;

    const peakMb = Math.max(...win);
    const lastMb = mb[mb.length - 1] ?? 0;
    // ⚠ HIGH WATER STAYS WHOLE-STREAM. It is the kernel's own never-decreasing
    // residentPeak: "the most this process ever held" is true of the process,
    // not of a window, and narrowing it would hide a real maximum.
    const highWaterMb = Math.max(
      peakMb,
      ...mb,
      ...rows.map((s) => toMb(s.residentPeak)).filter((v) => Number.isFinite(v))
    );
    // ⚠ NOT A NUMBER WHEN THERE IS NO BASELINE. Zero would read as "nothing was
    // retained", which is a claim, and the whole point here is to stop making
    // claims the data cannot support.
    const retainedDeltaMb = baselineKnown ? lastMb - baselineMb : 0;

    // Of everything the session climbed above baseline, how much came back?
    const climb = baselineKnown ? Math.max(0, peakMb - baselineMb) : 0;
    const recoveryFraction = !baselineKnown || climb === 0
      ? 1
      : Math.max(0, Math.min(1, (peakMb - lastMb) / climb));

    // ⚠⚠ THE RATCHET TEST WALKS TROUGHS, NOT PEAKS, and that is the whole
    // subtlety. Peaks rise whenever the app does something big, which is normal
    // and says nothing. It is the FLOOR between those spikes — what the process
    // refuses to give back once the work is over — that distinguishes "busy"
    // from "leaking". A trough that is materially higher than the previous
    // trough is one step of a ratchet.
    /* ⚠⚠ AND IT WALKS THE ANALYSIS WINDOW, NOT THE WHOLE STREAM. A trough in
     * one epoch and a trough in the next are separated by unobserved time, so
     * the "rise" between them is not a rise the recorder saw.
     *
     * ⚠⚠⚠ WHAT THIS SUM IS, AND WHAT IT IS NOT. It adds every UPWARD trough
     * movement and never subtracts a downward one, so it is the total distance
     * the floor travelled UP — an upper bound on retention, not retention. A
     * floor that climbs 400MB and gives it all back still totals +400 here,
     * and the OTA-1854 capture printed `ratchet 6 step(s) +1816MB` for a
     * session whose floor ended ~100MB above where it started. `retainedDelta`
     * is the number that answers "how much stayed"; this one answers "how much
     * churn was there". The report must never let them be read as the same. */
    let ratchetSteps = 0;
    let ratchetMb = 0;
    const troughs = localMinima(win);
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

    /* ⚠ A RATCHET IS STILL CALLABLE WITHOUT A BASELINE — it is read from rising
     * troughs, which need no reference point. The other three shapes ALL rest
     * on `climb`, which rests on the baseline, so without one they would say
     * "flat" about a session nobody measured. That is the false-comfort failure
     * this file exists to refuse, so they collapse to UNKNOWN instead. */
    const shape: MemoryFacts['shape'] =
      ratchetSteps >= RATCHET_MIN_STEPS ? 'ratchet'
        : !baselineKnown ? 'unknown'
          : climb < RATCHET_STEP_MB ? 'flat'
            : recoveryFraction >= RECOVERY_GOOD_FRACTION ? 'spike-recovered'
              : 'spike-retained';

    return {
      n: rows.length, processStartMb, epochs: epochStarts.length,
      analysisFromIndex: from, baselineKnown,
      baselineMb, peakMb, lastMb, highWaterMb, retainedDeltaMb,
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

/**
 * ⚠⚠⚠ THE WHOLE RING, AND THE READING THAT COST US A CAPTURE.
 *
 * These were 48 and 32, on the reasoning that "the evidence is the tail". The
 * 2026-09-19 iPhone SE capture proved that reasoning wrong in the only way that
 * matters: the recorder took 504 samples with `evicted 0` — every one survived
 * on the device — and the composer printed the last 48. The seven ratchet steps
 * that carried the process from a 951MB baseline to a 1903MB peak ALL happened
 * before the printed window opened, so the bundle could say how much was
 * retained and never when, or after what. The forensic pass returned OUTCOME C
 * — holder not proven — for want of data the device had already captured and
 * this line had already thrown away.
 *
 * ⚠ THE RING IS THE BOUND, NOT THIS NUMBER. `TM_SAMPLE_CAPACITY = 512` and
 * `TM_EVENT_CAPACITY = 64` are fixed, preallocated native arrays; emitting all
 * of them is bounded by construction exactly as emitting 48 was. This is a
 * bigger report, not an unbounded one — size is measured in the suite.
 *
 * ⚠ MEASURED, NOT ASSUMED — the price of the bigger block, in characters of
 * composed text, from the real composer over a 504-sample series:
 *
 *     48 rows (the old cutoff)          4,789
 *    504 rows, no events               46,474
 *    504 rows + 64 events + the join   49,729   (610 lines, ~91 chars/row)
 *
 * The block rides `buildBasicDeviceSummary`, which is appended BESIDE the log
 * body rather than inside it, so `trimLogForReport`'s 200,000-character
 * full-log cap does not touch it. The transport chunks everything into
 * 7,500-raw-character parts (`INLINE_CHUNK_CHARS`), and a 405,000-character
 * send is already proven on hardware — so ~50 KB is roughly seven more parts
 * on a path that has carried eight times this much. No cap is approached.
 *
 * The full window outranks shorter text. A reader can skim rows they do not
 * need; nobody can recover rows that were never emitted.
 */
export const REPORT_SAMPLE_ROWS = 512;
export const REPORT_EVENT_ROWS = 64;

/* ═══════════════════════════════════════════════════════════════════════════
 * ⚠⚠⚠ REPORT-TIME RATCHET DETECTION (OTA-1853) — AND WHY THE THRESHOLDS ARE
 * MEASUREMENTS RATHER THAN ROUND NUMBERS.
 *
 * The native recorder already reports "ratchet 7 step(s) +972MB" as an
 * aggregate; what it cannot do is say WHEN. This finds the steps in the emitted
 * series so each one can be joined to the events around it. It runs at report
 * composition over data already captured — it changes no runtime behaviour, no
 * cadence, and nothing native.
 *
 * ⚠ RAW FOOTPRINT IS FAR TOO NOISY TO THRESHOLD DIRECTLY. Measured on the
 * 2026-09-19 iPhone SE series, within one stable floor:
 *     window A (+48.6…+59.6s, 48 samples): raw peak-to-peak 61 MB
 *     window B (+100.2…+120.3s, 48 samples): raw peak-to-peak 29 MB
 * A 40–50 MB rule applied to raw samples would fire on that jitter alone.
 *
 * ⚠ SO THE FLOOR IS A TRAILING MINIMUM, AND THAT IS WHAT MADE IT TRACTABLE.
 * Over the same two windows, the largest RISE in a trailing-min floor was:
 *     W=5  →  21 MB          W=8  →  11 MB          W=10 →  10–11 MB
 * against zero real ratchet steps in either window. W=10 costs ten samples of
 * latency and buys a false-rise ceiling of 11 MB.
 *
 * Hence, every constant below traceable to that measurement:
 *   FLOOR_WINDOW    10   trailing-min width; false-rise ceiling 11 MB
 *   JITTER_MB       12   one above the worst observed false rise
 *   RISE_MB         48   4× the jitter ceiling, and well under the 139 MB mean
 *                        real step (the reported +972 MB over 7 steps)
 *   STABLE_SAMPLES   8   observed transient spikes recover within 1–2 samples,
 *                        so eight rejects them with margin
 *
 * ⚠ THESE ARE DIAGNOSTIC HYPOTHESES FROM ONE DEVICE'S SERIES, not universal
 * constants, and nothing may cite them as thresholds for anything else.
 * ═══════════════════════════════════════════════════════════════════════════ */
export const RATCHET_FLOOR_WINDOW = 10;
export const RATCHET_JITTER_MB = 12;
export const RATCHET_RISE_MB = 48;
export const RATCHET_STABLE_SAMPLES = 8;

export interface RatchetStep {
  step: number;
  beforeFloorMb: number;
  peakMb: number;
  newFloorMb: number;
  retainedDeltaMb: number;
  recoveryPct: number;
  firstRisingIndex: number;
  peakIndex: number;
  settledIndex: number;
  firstRisingSeq: number;
  settledSeq: number;
  tStartMs: number;
  tSettledMs: number;
  jsStale: boolean;
}

/**
 * Find sustained retained-memory steps in an emitted sample series.
 *
 * ⚠ PURE AND DETERMINISTIC. No clock, no native call, no allocation beyond the
 * result — the suite drives it with synthetic series and gets the same answer
 * every time. A transient spike that recovers is NOT a step, and that rejection
 * is tested directly rather than assumed.
 */
export function detectRatchetSteps(samples: readonly NativeSample[]): RatchetStep[] {
  const n = samples?.length ?? 0;
  if (n < RATCHET_FLOOR_WINDOW + RATCHET_STABLE_SAMPLES + 1) return [];
  const mb = (bytes: number): number => Math.round((Number(bytes) || 0) / MB);
  const fp: number[] = [];
  for (let i = 0; i < n; i++) fp.push(mb(samples[i]!.footprint));

  const floorAt = (i: number): number => {
    let lo = fp[i]!;
    for (let k = Math.max(0, i - RATCHET_FLOOR_WINDOW + 1); k <= i; k++) {
      if (fp[k]! < lo) lo = fp[k]!;
    }
    return lo;
  };

  const steps: RatchetStep[] = [];
  let baseFloor = floorAt(RATCHET_FLOOR_WINDOW - 1);
  let i = RATCHET_FLOOR_WINDOW;
  while (i < n) {
    if (fp[i]! - baseFloor < RATCHET_RISE_MB) {
      const f = floorAt(i);
      if (f < baseFloor) baseFloor = f;
      i += 1;
      continue;
    }
    // A candidate rise. Walk to the peak, then require the floor to HOLD.
    const firstRising = i;
    let peak = fp[i]!, peakIdx = i;
    let j = i;
    while (j < n && j < firstRising + RATCHET_STABLE_SAMPLES * 4) {
      if (fp[j]! > peak) { peak = fp[j]!; peakIdx = j; }
      j += 1;
    }
    /* ⚠ THE SETTLE FLOOR IS MEASURED FROM THE RISE, NOT BACKWARDS THROUGH IT.
     * `floorAt` looks back RATCHET_FLOOR_WINDOW (10) samples, and the settle
     * point is only RATCHET_STABLE_SAMPLES (8) past the rise, so floorAt(settleAt)
     * still straddles two PRE-rise samples and returns the OLD floor. That
     * rejected the first genuine candidate and re-found the same step nine
     * samples later: measured on the D6 series the step was dated at index 49
     * when it began at 40. At the device's cadence that is ~2.25 s of
     * misattribution — and the event join in `eventsForStep` reads exactly that
     * window, so a late start date attributes the step to whatever happened
     * after the cause. The floor that proves retention is the minimum of the
     * samples from the rise onward, and nothing before it. */
    const settleAt = firstRising + RATCHET_STABLE_SAMPLES;
    /* Not enough series left to prove the rise was RETAINED rather than a spike
     * caught at the edge of the ring. Leave it open rather than claim it. */
    if (settleAt > n - 1) break;
    let held = fp[firstRising]!;
    for (let k = firstRising; k <= settleAt; k++) { if (fp[k]! < held) held = fp[k]!; }
    if (held - baseFloor >= RATCHET_RISE_MB - RATCHET_JITTER_MB) {
      let stale = false;
      for (let k = firstRising; k <= settleAt; k++) {
        if (((Number(samples[k]!.flags) || 0) & 2) !== 0) stale = true;
      }
      const gross = peak - baseFloor;
      steps.push({
        step: steps.length + 1,
        beforeFloorMb: baseFloor,
        peakMb: peak,
        newFloorMb: held,
        retainedDeltaMb: held - baseFloor,
        recoveryPct: gross > 0 ? Math.round(((peak - held) / gross) * 100) : 0,
        firstRisingIndex: firstRising,
        peakIndex: peakIdx,
        settledIndex: settleAt,
        firstRisingSeq: Number(samples[firstRising]!.seq) || 0,
        settledSeq: Number(samples[settleAt]!.seq) || 0,
        tStartMs: Number(samples[firstRising]!.t) || 0,
        tSettledMs: Number(samples[settleAt]!.t) || 0,
        jsStale: stale,
      });
      baseFloor = held;
      i = settleAt + 1;
    } else {
      // Transient — it went up and came back. Not a new floor.
      i = settleAt + 1;
      const f = floorAt(Math.min(n - 1, i));
      if (f < baseFloor) baseFloor = f;
    }
  }
  return steps;
}

/**
 * ⚠ THE JOIN, AND IT USES THE KEY THAT ALREADY EXISTS. Every NativeEvent
 * carries `sampleSeq` — the sample current when it was recorded — so an event
 * is attributed to a step by sequence comparison alone. No second correlation
 * mechanism, no timestamp matching, no duplicated sequence state.
 */
export function eventsForStep(
  step: RatchetStep,
  events: readonly NativeEvent[],
  lead = 4,
): NativeEvent[] {
  const out: NativeEvent[] = [];
  for (const e of events ?? []) {
    const s = Number(e.sampleSeq) || 0;
    if (s >= step.firstRisingSeq - lead && s <= step.settledSeq) out.push(e);
  }
  return out;
}

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
      /* ⚠⚠ TWO DIFFERENT QUESTIONS, PRINTED APART ON PURPOSE.
       * "What was the earliest process footprint" is answered by the first
       * sample. "How much stayed elevated" may only be answered against a
       * settled reading inside the epoch that ends the stream. The OTA-1854
       * capture is what happens when one line tries to answer both: it opened
       * at 29MB before the JS bundle existed and the report subtracted that
       * from a gameplay figure 200 seconds and two unobserved gaps later. */
      out.push(`  Process start: ${f.processStartMb}MB (earliest sample — EVIDENCE, not a baseline)`);
      if (f.epochs > 1) {
        out.push(
          `  ⚠ ${f.epochs} observation epochs — the recorder stopped and restarted.`
        );
        out.push(
          '    Time passed between them that nothing sampled, so only the LAST'
        );
        out.push(
          `    epoch (from sample #${f.analysisFromIndex + 1}) is compared against the end.`
        );
      }
      out.push(
        `  Footprint: ${f.baselineKnown ? `analysis baseline ${f.baselineMb}MB · ` : ''}`
        + `peak ${f.peakMb}MB · last ${f.lastMb}MB`
        + ` · high water ${f.highWaterMb}MB  [${f.band.toUpperCase()}]`
      );
      if (!f.baselineKnown) {
        /* ⚠ NO NUMBER IS BETTER THAN A WRONG ONE. Nothing in the analysis
         * window ever held still long enough to read a baseline from, so
         * "retained" and "recovery" have no second operand. Printing them
         * anyway is how +1198MB got quoted. */
        out.push('  ⚠ ANALYSIS BASELINE UNAVAILABLE — the process never settled inside the');
        out.push('    final observation epoch, so retained memory and recovery cannot be');
        out.push('    calculated. This is a limit of the observation, NOT a clean reading.');
      }
      out.push(
        `  Shape: ${f.shape.toUpperCase()}`
        + (f.baselineKnown
          ? ` — retained ${f.retainedDeltaMb >= 0 ? '+' : ''}${f.retainedDeltaMb}MB`
            + ` vs analysis baseline · recovery ${Math.round(f.recoveryFraction * 100)}%`
          : '')
        // ⚠ THE LABEL IS THE REPAIR. This sums upward floor movements and never
        // subtracts a downward one, so it is how far the floor TRAVELLED up,
        // not how much is still held. Printed beside "retained" under the old
        // wording it read as a second, larger retention figure.
        + (f.ratchetSteps > 0
          ? ` · floor rose ${f.ratchetSteps} time(s), +${f.ratchetMb}MB travelled`
            + ' (churn, NOT memory still held)'
          : '')
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

    /* ⚠⚠⚠ OTA-1853 — THE SECTION BAKER #3 NEEDED AND DID NOT HAVE.
     *
     * The forensic pass had the samples and the events in the same report and
     * still returned OUTCOME C, because reading a step out of 504 raw rows and
     * then hand-matching events to it is not something anyone does on a phone
     * at 20:02 local. This does that join once, at compose time, and prints it
     * FIRST — before the raw rows — so the first thing the next capture shows
     * is every retained step with the subsystem events that were live inside it.
     *
     * ⚠ IT PRINTS EVIDENCE, NOT A VERDICT. The events listed under a step were
     * RECORDED INSIDE IT. That is co-location in time and nothing more. The
     * words "holder", "cause" and "leak" do not appear here by design: the
     * ruling is the owner's, from this table plus the raw rows below it. */
    try {
      /* ⚠⚠ THE STEP DETECTOR GETS THE ANALYSIS WINDOW, NOT THE WHOLE STREAM.
       * The recorder's `t` restarts at every epoch, so a detector walking
       * across a boundary compares a sample from one clock with a sample from
       * another and prints intervals that run backwards — the OTA-1854 capture
       * showed `STEP 4: +46.1s → +0.8s`. Confining it to one epoch makes
       * tStartMs <= tSettledMs true by construction. */
      // ⚠ Recomputed from `report.samples` rather than reusing
      // `facts.analysisFromIndex`, which indexes the FILTERED rows. One dropped
      // zero-footprint sample would slide the window by one and nothing would
      // say so. The event join below keys on native seq, not on array position,
      // so slicing the samples cannot disturb it.
      const epochs = sampleEpochStarts(report.samples);
      const from = epochs[epochs.length - 1] ?? 0;
      const steps = detectRatchetSteps(report.samples.slice(from));
      out.push(`  Retained steps: ${steps.length === 0 ? 'none detected'
        : `${steps.length} (floor window ${RATCHET_FLOOR_WINDOW}, rise ≥${RATCHET_RISE_MB}MB held ${RATCHET_STABLE_SAMPLES} samples)`}`);
      for (const st of steps) {
        out.push(
          `    STEP ${st.step}: ${fmtT(st.tStartMs)} → ${fmtT(st.tSettledMs)}`
          + ` · floor ${st.beforeFloorMb} → ${st.newFloorMb}MB (+${st.retainedDeltaMb} retained)`
          + ` · peak ${st.peakMb}MB · recovered ${st.recoveryPct}%`
          + (st.jsStale ? '  ⚠ JS STALE inside this step' : '')
        );
        const inside = eventsForStep(st, report.events);
        if (inside.length === 0) {
          out.push('      (no annotated events inside this step — the subsystem that'
            + ' allocated it does not report, or was not instrumented)');
          continue;
        }
        // ⚠ Counted by kind, not listed one by one: thirteen room transitions
        // inside one step must read as "13 ROOM_ENTER", not thirteen lines that
        // push the next step off the screen.
        const tally = new Map<number, number>();
        for (const e of inside) tally.set(e.kind, (tally.get(e.kind) ?? 0) + 1);
        const parts: string[] = [];
        for (const [kind, n] of tally) parts.push(`${memKindName(kind)}×${n}`);
        out.push(`      inside: ${parts.join(' · ')}`);
        // The first few in full, with their codes — a code identifies WHICH
        // room, artwork or track, and without it the tally names only a family.
        for (const e of inside.slice(0, 6)) {
          out.push(`      ${fmtT(e.t)} ${memKindName(e.kind)}${e.code ? `/${e.code}` : ''}`
            + ` — ${toMb(e.footprint)}MB`);
        }
        if (inside.length > 6) out.push(`      … ${inside.length - 6} more inside this step`);
      }
    } catch {
      out.push('  (step join failed — the raw rows below are unaffected)');
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
