// KokoroTTSManager — bundled neural TTS via react-native-executorch.
//
// Replaces the post-revert PiperTTSManager stub. ExecuTorch's
// TextToSpeechModule loads Kokoro-82M and exposes:
//   - forward(text)  → Float32Array (full audio waveform)
//   - stream({speed}) → AsyncGenerator<Float32Array> for streaming chunks
//
// Why ExecuTorch + Kokoro instead of sherpa-onnx + Piper:
//   - ExecuTorch uses Meta's PyTorch mobile runtime via XNNPACK (CPU).
//     No ONNX runtime in the picture → no libonnxruntime.so collision
//     with our existing onnxruntime-react-native (used for MiniLM).
//   - Kokoro-82M is the current SOTA for lightweight neural TTS;
//     quality is noticeably better than Piper at similar model size.
//   - Built-in phonemizer (espeak-style) handles OOV / lore words.
//   - Software Mansion maintains the package, so update cadence is solid.
//
// Audio playback: Kokoro emits raw 22.05 kHz mono float32 PCM. We
// convert to 16-bit int PCM, wrap a WAV header around it, base64-
// encode, and feed the data URI to expo-av's Sound.createAsync.
//
// All errors are swallowed → if the model fails to load, the caller
// (TTSManager) falls back to expo-speech transparently.

import { Audio } from 'expo-av';
import { getVoiceSettings } from './voiceSettings';
import { applyLoreLexicon, cleanForSpeech } from './loreLexicon';
import { splitSentences } from './sentenceSplitter';
import { padSilence } from './audioPad';
import { setMusicDuck } from '../audio/AudioManager';
import { runExclusiveNativeMl, ML_PRIORITY_VOICE } from '../ai/nativeMlLock';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const exec = require('react-native-executorch') as {
  TextToSpeechModule: any;
  KOKORO_MEDIUM: any;
  KOKORO_VOICE_AF_HEART: any;
  KOKORO_VOICE_AF_RIVER: any;
  KOKORO_VOICE_AF_SARAH: any;
  KOKORO_VOICE_AM_ADAM: any;
  KOKORO_VOICE_AM_MICHAEL: any;
  KOKORO_VOICE_BF_EMMA: any;
  KOKORO_VOICE_BM_DANIEL: any;
};

const KOKORO_SAMPLE_RATE = 22050;

// arb7 prosody — bundle consecutive sentences in a single speak() call
// up to this many characters before handing them to Kokoro. Kokoro reads
// flat/robotic on tiny strings and pays a fresh inference + playback-join
// gap per chunk; merging gives sentence-to-sentence context and one
// continuous waveform. Well under Kokoro's ~510-token cap (≈ 260 chars is
// ~200 phonemes, leaving generous headroom).
const MERGE_TARGET_CHARS = 200;

// arb8 crossfade — adjacent same-voice chunks whose audio is already
// inferred are concatenated into ONE waveform with a short equal-power
// crossfade at each join, so the queue plays as continuous speech instead
// of separate click/gap-prone clips. CROSSFADE_LOOKAHEAD = how many chunks
// to infer ahead of playback (so a batch can form without blocking);
// CROSSFADE_MAX_BATCH caps one playback buffer's size; CROSSFADE_MS is the
// overlap length. First-audio stays fast because a batch only forms from
// chunks that prefetch already finished during the prior chunk's playback.
const CROSSFADE_LOOKAHEAD = 2;
const CROSSFADE_MAX_BATCH = 4;
const CROSSFADE_MS = 12;
// arb165 — player ask: "put a slight pause after a '.' — Kokoro runs the
// sentences together." Each sentence is now its own chunk (see speak()), and at
// a sentence boundary the batch is joined with SENTENCE_PAUSE_MS of real silence
// instead of the gap-removing crossfade. EDGE_FADE_MS tapers each chunk into and
// out of that silence so the join stays click-free.
const SENTENCE_PAUSE_MS = 160;
const EDGE_FADE_MS = 6;

interface QueuedUtterance {
  id: number;
  text: string;
  /** Resolved Kokoro voice id for this utterance. null = use the
   *  current Arbiter voice (player's kokoroVoice setting). Vendor
   *  lines pass their assigned voice; the pool spins up an instance
   *  for that voice on demand. */
  voiceId: string | null;
  /** Log channel that produced this line, when known. Used by the
   *  spam-collapse rule: when the player rapid-taps a direction the
   *  Arbiter queues 5-10 flavor lines and chain-reads them all. On
   *  push, the queue drops any prior QUEUED (not currently speaking)
   *  utterances on the same channel so only the newest survives —
   *  the line being spoken now finishes naturally, then the most
   *  recent queued line plays. Other channels (world / combat /
   *  reward) are unaffected. */
  channel?: string;
  /** arb5 — the parent speak() call id. A single arbiter line is split
   *  into multiple sentence chunks that all share one lineId, so the
   *  queue cap can drop or keep WHOLE lines instead of truncating one
   *  mid-line. */
  lineId?: number;
  /** arb165 — true when this chunk's text ends on a sentence terminator
   *  (. ! ?). drain() inserts a short silence after such a chunk so the
   *  next sentence doesn't run straight into it. */
  endsSentence?: boolean;
  /** Prefetched samples + the rate they were inferred at. drain()
   *  pre-runs forward() on the NEXT queued utterance while the
   *  current one is still playing, so the next sentence's audio is
   *  ready to play the instant didJustFinish fires. Without this, the
   *  inter-sentence gap was 0.75–1.25s (next chunk's inference time +
   *  expo-av's 500ms status poll). With prefetch + 50ms poll the gap
   *  drops to ~100ms. */
  prefetch?: Promise<Float32Array | null>;
  /** arb8 — samples stamped onto the item when its prefetch resolves, so
   *  drain() can synchronously tell whether a queued chunk is ready to
   *  fold into a crossfade batch (undefined = still inferring). */
  resolvedSamples?: Float32Array | null;
  /** OTA 013 — the voiceId the prefetch was inferred with. Drain
   *  validates this at consumption time: if the player switched
   *  voices between prefetch-start and consume, the prefetched
   *  audio is the wrong voice and gets discarded; we re-run
   *  forward() with the current voice instead. */
  prefetchVoiceId?: string | null;
}

// Voice pool. Holds at most POOL_MAX loaded Kokoro instances. The
// Arbiter slot is sticky (never evicted) — the player hears it most.
// The remaining slots cycle through vendor voices on an LRU basis,
// disposed when the player walks away from the vendor or another
// vendor needs the slot. Memory cost: ~80-150 MB per loaded instance;
// POOL_MAX=2 keeps peak around 200 MB on Pixel-class hardware.
interface LoadedVoice {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module: any;
  lastUsedAt: number;
  /** True only for the Arbiter slot; sticky entries don't evict. */
  sticky: boolean;
}
const POOL_MAX = 2;
// arb5/arb15/OTA-634 — most queued spoken lines kept at once (see the cap in
// speak()). Keyed by lineId so whole lines are dropped, never truncated mid-line.
// OTA-634 — this cap was arbiter-ONLY, so world/combat speech accumulated
// uncapped and the voice fell rounds behind a fast player / verbose fight (the
// "said welcome back five rounds late" symptom). Now it caps the TOTAL queued
// lines across ALL channels: keep the newest few, drop the oldest queued line
// (never the currently-speaking one), so the voice stays current.
const MAX_QUEUED_TOTAL_LINES = 3;
const VOICE_POOL: Map<string, LoadedVoice> = new Map();
// In-flight loads keyed by voiceId so concurrent ensureLoaded() calls
// (e.g. beginScene's warm + the vendor's first line both hitting at
// once) share one fromModelName promise instead of double-loading.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LOADING: Map<string, Promise<any | null>> = new Map();

let nextId = 1;
const queue: QueuedUtterance[] = [];
// arb15 — inference serializer. Kokoro's native module isn't reentrant:
// two forward() calls in flight at once reject with a native error object
// (surfaced as "[speak] [object Object]") and the affected chunks get
// skipped — the "skipping sentences" report. The crossfade look-ahead
// prefetch fires inference for upcoming chunks while one is playing, which
// could overlap the next chunk's inference. arb159 — funnel ALL forward() calls
// through the SHARED native-ML lock (runExclusiveNativeMl) so prefetch-ahead
// still happens during playback, never two synths run at once, AND a synth
// never overlaps a Qwen completion (the two together crashed Tensor G5 —
// CONFIRMED: with the lock, a full session ran with zero crashes).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inferSerial(model: any, text: string, rate: number): Promise<Float32Array | null> {
  // arb159 — route Kokoro synthesis through the SHARED native-ML lock so a synth
  // never overlaps a Qwen completion. The lock STAYS (it's what stopped the
  // crash); the arb161 fix is on the Qwen side — a generation cooldown so Qwen
  // doesn't grab this lock on every beat and starve the voice.
  // OTA-634 — voice runs at LOW priority so an interactive LLM narration jumps
  // ahead of queued speech synth (the words land promptly; the voice fills in
  // behind). The lock still guarantees one-at-a-time, so the crash guard holds.
  return runExclusiveNativeMl(() => model.forward(text, rate), ML_PRIORITY_VOICE) as Promise<Float32Array | null>;
}
let currentlySpeaking: QueuedUtterance | null = null;
let currentSound: Audio.Sound | null = null;
// Backwards-compat: TTSController checks isPiperAvailable / getKokoroState
// which both read from setKokoroState. The state machine now tracks the
// ARBITER slot's status specifically — that's the voice the player
// downloads + warms on engine-on, and the "ready" UI signal is gated on
// that one being loaded.
let availabilityCache: boolean | null = null;
let lastDownloadProgress = 0;
const downloadListeners = new Set<(p: number) => void>();

/** Public install/load state machine. The settings UI subscribes to
 *  these so the player can SEE what's happening instead of guessing
 *  whether the bundled voice is downloading, loading, ready, or failed. */
export type KokoroState =
  | { phase: 'idle' }
  | { phase: 'downloading'; fraction: number }
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

let state: KokoroState = { phase: 'idle' };
const stateListeners = new Set<(s: KokoroState) => void>();

export function getKokoroState(): KokoroState {
  return state;
}

export function onKokoroStateChange(fn: (s: KokoroState) => void): () => void {
  stateListeners.add(fn);
  fn(state);
  return () => stateListeners.delete(fn);
}

function setKokoroState(next: KokoroState): void {
  state = next;
  for (const l of stateListeners) {
    try { l(next); } catch { /* ignore */ }
  }
}

// OTA 23-017 — diagnostic capture for the wife's phone (and any
// other tester) seeing "Failed to load model" with no actionable
// info. The state machine's `message` field is truncated to 240
// chars for UI display; the full diagnostic — untruncated error,
// stack, which step failed, free disk at the time, voice id, and
// timestamp — lives here, with a small ring buffer so re-attempts
// don't overwrite the previous failure. AboutScreen reads this
// to populate COPY VOICE INFO so the tester can paste it back.
export interface KokoroErrorRecord {
  /** ISO timestamp at the moment the error was captured. */
  at: string;
  /** Which step failed — narrows the root cause without grepping
   *  the stack. */
  step: 'download' | 'load' | 'warmup' | 'unknown';
  /** Voice id being loaded when it failed. */
  voiceId: string;
  /** Full untruncated error message. */
  message: string;
  /** JS error stack if available. */
  stack: string | null;
  /** Free internal storage at attempt time, in MB. -1 means we
   *  couldn't read it. The Kokoro model is ~100 MB; anything
   *  under that is the most likely root cause. */
  diskFreeMB: number;
}

const KOKORO_ERROR_HISTORY: KokoroErrorRecord[] = [];
const KOKORO_ERROR_HISTORY_MAX = 5;

export function getKokoroErrorHistory(): readonly KokoroErrorRecord[] {
  return KOKORO_ERROR_HISTORY;
}

async function captureFreeDiskMB(): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FS = require('expo-file-system');
    const bytes = await FS.getFreeDiskStorageAsync();
    return typeof bytes === 'number' ? Math.round(bytes / (1024 * 1024)) : -1;
  } catch {
    return -1;
  }
}

/** Human-readable message for any thrown value. Native rejections are
 *  often plain objects, which String() renders as a useless
 *  "[object Object]"; pull a .message/.code or JSON instead so the
 *  diagnostic actually says what failed. */
function describeErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = err as any;
    if (typeof o.message === 'string' && o.message) return o.code ? `${o.code}: ${o.message}` : o.message;
    try { return JSON.stringify(err); } catch { /* fall through */ }
  }
  return String(err);
}

function recordKokoroError(
  step: KokoroErrorRecord['step'],
  voiceId: string,
  err: unknown,
  diskFreeMB: number,
): void {
  const message = describeErr(err);
  const stack = err instanceof Error && err.stack ? err.stack : null;
  KOKORO_ERROR_HISTORY.unshift({
    at: new Date().toISOString(),
    step,
    voiceId,
    message,
    stack,
    diskFreeMB,
  });
  while (KOKORO_ERROR_HISTORY.length > KOKORO_ERROR_HISTORY_MAX) {
    KOKORO_ERROR_HISTORY.pop();
  }
}

// Voice id → executorch constant lookup. Default AF_HEART (American
// female, natural-sounding default per the Kokoro docs).
const VOICES: Record<string, unknown> = {
  af_heart: exec?.KOKORO_VOICE_AF_HEART,
  af_river: exec?.KOKORO_VOICE_AF_RIVER,
  af_sarah: exec?.KOKORO_VOICE_AF_SARAH,
  am_adam: exec?.KOKORO_VOICE_AM_ADAM,
  am_michael: exec?.KOKORO_VOICE_AM_MICHAEL,
  bf_emma: exec?.KOKORO_VOICE_BF_EMMA,
  bm_daniel: exec?.KOKORO_VOICE_BM_DANIEL,
};

export function listKokoroVoices(): string[] {
  return Object.keys(VOICES);
}

export function onDownloadProgress(fn: (p: number) => void): () => void {
  downloadListeners.add(fn);
  fn(lastDownloadProgress);
  return () => downloadListeners.delete(fn);
}

function pickVoice(): unknown {
  const id = getVoiceSettings().kokoroVoice ?? 'am_michael';
  return VOICES[id] ?? exec.KOKORO_VOICE_AM_MICHAEL;
}

/** True once the model has been loaded into memory at least once. */
export async function isPiperAvailable(): Promise<boolean> {
  // Function name kept for API compatibility with the parked Piper stub
  // — TTSManager imports this. Returns whether Kokoro is loaded + usable.
  if (availabilityCache !== null) return availabilityCache;
  // Just check if the module is importable. Actual model load happens
  // lazily on first speak() so toggling BUNDLED in settings doesn't
  // trigger a ~100MB download until the player commits.
  availabilityCache = typeof exec?.TextToSpeechModule?.fromModelName === 'function';
  return availabilityCache;
}

export function resetPiperAvailability(): void {
  availabilityCache = null;
}

let prewarmStarted = false;

/** Kick off model download + load + a tiny silent warm-up inference
 *  in the background. Idempotent — first call starts the work, later
 *  calls just resolve when the in-flight load finishes. The warm-up
 *  forward() ensures the executorch graph is compiled so the player's
 *  first real speak() doesn't pay the cold-start tax.
 *
 *  Called at app boot from TTSManager when engine='bundled', and
 *  also when the player flips engine to bundled mid-session. Safe
 *  to call when the model is already ready (returns immediately). */
export async function prewarmKokoro(): Promise<void> {
  if (prewarmStarted) return;
  prewarmStarted = true;
  try {
    // Load the Arbiter voice — sticky, drives the public state machine
    // (download progress + ready signal). ensureLoaded does its own
    // warm-up forward() so this single call covers both pieces.
    await ensureLoaded(arbiterVoiceId());
    // If the load failed (network blip, metered-data refusal, etc.)
    // ensureLoaded returns null silently. Reset the latch so a
    // subsequent toggle / retry can fire fresh; otherwise the player
    // is stuck with engine=bundled + no download + no retry path
    // until they hit the UPDATE button.
    if (!VOICE_POOL.has(arbiterVoiceId())) {
      prewarmStarted = false;
    }
  } catch {
    prewarmStarted = false;
    /* state machine surfaced the error */
  }
}

export function isSpeaking(): boolean {
  return currentlySpeaking !== null || queue.length > 0;
}

export function getModelDir(): string {
  // ExecuTorch manages its own model cache; this path is informational.
  return 'executorch-cache://kokoro/';
}

function arbiterVoiceId(): string {
  return getVoiceSettings().kokoroVoice ?? 'am_michael';
}

function voiceRefFor(voiceId: string): unknown {
  return VOICES[voiceId] ?? exec.KOKORO_VOICE_AM_MICHAEL;
}

// Evict the least-recently-used non-sticky voice from the pool when
// at capacity. Sticky (Arbiter) is never selected.
function evictLRU(): void {
  if (VOICE_POOL.size < POOL_MAX) return;
  const candidates = Array.from(VOICE_POOL.entries())
    .filter(([, v]) => !v.sticky)
    .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
  const victim = candidates[0];
  if (!victim) return;
  const [vid, entry] = victim;
  try {
    if (typeof entry.module?.delete === 'function') entry.module.delete();
  } catch { /* ignore */ }
  VOICE_POOL.delete(vid);
}

/** Ensure a Kokoro instance is loaded for the given voice. Returns
 *  the loaded module, or null on failure. Concurrent calls for the
 *  same voiceId share one in-flight load promise. The Arbiter voice
 *  is loaded as sticky (never evicted); all other voices are
 *  evictable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureLoaded(voiceId: string): Promise<any | null> {
  const existing = VOICE_POOL.get(voiceId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.module;
  }
  const inFlight = LOADING.get(voiceId);
  if (inFlight) return inFlight;
  if (!exec?.TextToSpeechModule?.fromModelName) return null;
  const sticky = voiceId === arbiterVoiceId();
  // Evict BEFORE registering the new in-flight load so two concurrent
  // ensureLoaded calls don't both pass the capacity gate. Audit caught
  // a race where two vendor swaps in the same tick both saw size=1 +
  // LOADING=0, both skipped eviction, both loaded → pool hit 3.
  // Counting the new load in advance closes the window.
  while (VOICE_POOL.size + LOADING.size + 1 > POOL_MAX) {
    const evictableExists = Array.from(VOICE_POOL.values()).some((v) => !v.sticky);
    if (!evictableExists) break; // pool only has sticky entries — accept overflow rather than infinite-loop
    evictLRU();
  }
  const promise = (async () => {
    // OTA 23-017 — track which step we're in so the diagnostic
    // record tells us whether the download finished and the load
    // / warmup is what blew up. That's the single most useful
    // datum for triaging "Failed to load model" reports.
    let step: KokoroErrorRecord['step'] = 'download';
    try {
      // First-time load on the Arbiter voice drives the public state
      // machine (download progress, ready signal). Vendor voices load
      // silently — players don't need a UI for every vendor swap.
      //
      // Time-based gate distinguishes cache hits from real downloads:
      // cache reads fully resolve in <2s; a real 100 MB download takes
      // 30–60s. Initial phase is 'loading' (banner reads "Waking up
      // the Arbiter…"). If the load is still in flight 4s in AND the
      // progress callback is still reporting fraction < 0.99, we
      // escalate to phase 'downloading' so the player sees the real
      // percentage during a genuine first-time fetch. Cache hits never
      // trip the gate and stay on the calmer loading copy throughout.
      if (sticky) setKokoroState({ phase: 'loading' });
      const loadStartedAt = Date.now();
      let downloadEscalated = false;
      const m = await exec.TextToSpeechModule.fromModelName(
        { model: exec.KOKORO_MEDIUM, voice: voiceRefFor(voiceId) },
        (p: number) => {
          if (sticky) {
            lastDownloadProgress = p;
            if (!downloadEscalated) {
              const elapsed = Date.now() - loadStartedAt;
              // 2000ms gate: cache hits report p≈1 well before this (and
              // the p<0.99 guard skips them anyway), so only a genuine
              // first-time download trips it. Lowered from 4000ms so the
              // percentage surfaces nearer the true start of the ramp —
              // at 4s a fast download was already ~37% in, which read as
              // "the bar starts at 37% then jumps to done".
              if (elapsed >= 2000 && p < 0.99) {
                downloadEscalated = true;
              }
            }
            if (downloadEscalated) {
              setKokoroState({ phase: 'downloading', fraction: p });
            }
            for (const l of downloadListeners) {
              try { l(p); } catch { /* ignore */ }
            }
          }
        },
      );
      step = 'load';
      if (sticky) setKokoroState({ phase: 'loading' });
      step = 'warmup';
      // Warm-up forward — compiles the graph so the player's first real line
      // doesn't pay cold-start latency. Output discarded.
      // arb70 — warm up at the CONFIGURED rate, not a hardcoded 1.0, with a
      // realistic-length phrase. Kokoro's native forward(text, speed) pays a
      // cold cost on the first call AT A GIVEN SPEED that TRUNCATES the head of
      // that utterance. The old warm-up ran at 1.0; for two weeks the default
      // rate was also 1.0 so it covered the real line — but once the default
      // was raised to 1.2 (Plasma/Copper Cask) the warm-up no longer warmed
      // the 1.2 path, so the title line (the first real forward at 1.2) came
      // out with its head clipped ("Choose your character" → "aracter").
      // Warming at the real rate + a real-length phrase pays that cost HERE
      // (discarded) so the first user-facing line is clean.
      // Captured here too — the executorch native graph compile is the single
      // most likely OOM site on low-RAM devices.
      const warmRate = getVoiceSettings().rate ?? 1.0;
      try {
        const samples = await inferSerial(m, 'The Arbiter stirs, and takes a breath.', warmRate);
        void samples;
      }
      catch (warmupErr) {
        const diskFreeMB = await captureFreeDiskMB();
        recordKokoroError('warmup', voiceId, warmupErr, diskFreeMB);
        // Treat warm-up failure as terminal — the model is loaded
        // but can't actually run on this device. Re-throw so the
        // outer catch surfaces it.
        throw warmupErr;
      }
      VOICE_POOL.set(voiceId, { module: m, lastUsedAt: Date.now(), sticky });
      if (sticky) setKokoroState({ phase: 'ready' });
      return m;
    } catch (err) {
      const msg = describeErr(err);
      // Avoid double-recording: warmup catch already wrote a
      // detailed record. For everything else, capture here.
      if (step !== 'warmup') {
        const diskFreeMB = await captureFreeDiskMB();
        recordKokoroError(step, voiceId, err, diskFreeMB);
      }
      // Prefix the step so the status line / COPY VOICE INFO says WHERE it
      // failed: '[warmup] undefined is not a function' points at the native
      // generate() call (APK/native mismatch — needs a rebuild), whereas a
      // '[speak]' failure (drain catch) points at the JS post-processing.
      if (sticky) setKokoroState({ phase: 'error', message: `[${step}] ${msg}`.slice(0, 240) });
      return null;
    } finally {
      LOADING.delete(voiceId);
    }
  })();
  LOADING.set(voiceId, promise);
  return promise;
}

/** Pre-load a vendor voice without speaking. Called by beginScene
 *  when a vendor appears so the model graph is compiled by the time
 *  the vendor's first line lands. Idempotent — no-op if already
 *  loaded. */
export async function warmVoice(voiceId: string): Promise<void> {
  await ensureLoaded(voiceId);
}

/** Explicitly evict a vendor voice from the pool. Called when the
 *  player leaves a scene with a vendor / the vendor walks off, so
 *  memory drops to the Arbiter slot only. Sticky (Arbiter) voices
 *  are protected — pass-through no-op. */
export function disposeVoice(voiceId: string): void {
  const entry = VOICE_POOL.get(voiceId);
  if (!entry || entry.sticky) return;
  try {
    if (typeof entry.module?.delete === 'function') entry.module.delete();
  } catch { /* ignore */ }
  VOICE_POOL.delete(voiceId);
}

/** Drop the currently-loaded Arbiter voice (and clear sticky flag).
 *  Called by the voice-settings observer when the player changes
 *  their kokoroVoice setting — without this, the old sticky entry
 *  is unevictable and the pool leaks ~100 MB per swap. The new
 *  voice loads on the next speak() call. */
export function disposeStickyArbiterVoice(): void {
  for (const [vid, entry] of VOICE_POOL) {
    if (entry.sticky) {
      try {
        if (typeof entry.module?.delete === 'function') entry.module.delete();
      } catch { /* ignore */ }
      VOICE_POOL.delete(vid);
    }
  }
  // Reset the latch so prewarmKokoro can re-fire for the new voice.
  prewarmStarted = false;
}

export function speak(text: string, voiceId?: string | null, channel?: string): number {
  const settings = getVoiceSettings();
  if (!settings.ttsEnabled) return -1;
  // Lexicon respellings (Aetheric, Tartarian, etc.) + symbol cleanup
  // (arrows → "to", "-N" → "negative N"). Pure transform on the
  // engine-bound copy; the visible log keeps the original symbols.
  const prepared = cleanForSpeech(applyLoreLexicon(text)).trim();
  if (!prepared) return -1;
  const id = nextId++;
  // OTA 226 + arb5 — Arbiter queue cap. Playtester: "if somebody spams
  // a direction the Arbiter fires off a bunch of flavor lines and talks
  // for 5 minutes afterwards." The original rule dropped EVERY queued
  // arbiter chunk on each new line — but that also ate intentional short
  // sequences (a pickup acknowledgement immediately followed by the next
  // beat's prompt), cutting the first line off (later playtester report).
  // Instead, cap the queue at MAX_QUEUED_ARBITER_LINES *whole lines*
  // (oldest dropped first), keyed by lineId so a multi-chunk line is
  // never truncated mid-sentence. currentlySpeaking is never touched;
  // orphaned prefetch promises on dropped chunks GC harmlessly.
  // OTA-634 — global cap across ALL channels (was arbiter-only). Drop the oldest
  // QUEUED lines so the voice can't fall more than MAX_QUEUED_TOTAL_LINES behind.
  // currentlySpeaking is never in `queue`, so it's never cut off; orphaned
  // prefetch promises on dropped chunks GC harmlessly.
  {
    const queuedLineIds: number[] = [];
    for (const q of queue) {
      if (q.lineId != null && !queuedLineIds.includes(q.lineId)) queuedLineIds.push(q.lineId);
    }
    // We're about to add one more line, so drop until there's room for it.
    while (queuedLineIds.length >= MAX_QUEUED_TOTAL_LINES) {
      const dropId = queuedLineIds.shift()!;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]!.lineId === dropId) queue.splice(i, 1);
      }
    }
  }
  // Split into sentence-sized chunks so the first audio plays as
  // soon as one sentence finishes inference — without this, a big
  // intro paragraph would take 10-30 seconds to phonemize + run
  // through Kokoro before ANY sound starts. Subsequent sentences
  // queue behind the first and stream as they're produced.
  const { sentences, remainder } = splitSentences(prepared);
  const rawChunks = sentences.length > 0 ? [...sentences] : [];
  if (remainder.trim()) rawChunks.push(remainder.trim());
  // Fallback: if the text has zero terminators (rare — usually a
  // status line), speak it as one chunk.
  if (rawChunks.length === 0) rawChunks.push(prepared);
  // arb7 prosody — greedily merge short consecutive sentences up to
  // MERGE_TARGET_CHARS so Kokoro reads them as one inflected breath
  // instead of a string of choppy one-clip-per-sentence reads. (Streamed
  // narration is pre-bundled upstream in TTSController; this also catches
  // the many pre-written multi-sentence lines delivered in one speak().)
  // arb165 — ONE sentence per chunk. The old arb7 merge bundled sentences up to
  // MERGE_TARGET_CHARS into a single Kokoro read so they flowed as one breath —
  // but that's exactly what made them "run together", with no pause at the
  // periods. Now we only glue a piece onto the previous chunk when that previous
  // chunk is NOT already a finished sentence (i.e. a stray, terminator-less
  // fragment), so a real sentence boundary is never buried inside a chunk and
  // drain() can drop a pause after it.
  const endsOnTerminator = (s: string) => /[.!?]['")\]]*$/.test(s.trim());
  const chunks: string[] = [];
  for (const piece of rawChunks) {
    const last = chunks.length > 0 ? chunks[chunks.length - 1]! : null;
    if (last !== null && !endsOnTerminator(last)
        && last.length + 1 + piece.length <= MERGE_TARGET_CHARS) {
      chunks[chunks.length - 1] = `${last} ${piece}`;
    } else {
      chunks.push(piece);
    }
  }
  const resolvedVoice = voiceId ?? arbiterVoiceId();
  for (const chunk of chunks) {
    queue.push({
      id: nextId++, text: chunk, voiceId: resolvedVoice, channel, lineId: id,
      endsSentence: endsOnTerminator(chunk),
    });
  }
  void drain();
  return id;
}

async function drain(): Promise<void> {
  if (currentlySpeaking) return;
  const next = queue.shift();
  if (!next) {
    // Nothing left to speak — restore music to full volume.
    void setMusicDuck(false);
    return;
  }
  currentlySpeaking = next;
  // A line is about to play — duck the music under the Arbiter's voice.
  void setMusicDuck(true);
  const targetVoice = next.voiceId ?? arbiterVoiceId();
  const model = await ensureLoaded(targetVoice);
  if (!model) {
    currentlySpeaking = null;
    void drain();
    return;
  }
  // OTA-413 — voice crash breadcrumb. Flush a marker (naming the voice) before the
  // native synth + playback, so a SIGSEGV mid-utterance is detected AND named on the
  // next boot (the diagnostic's "Voice (TTS) guard" line), instead of being
  // indistinguishable from a Qwen crash. Cleared in the finally whether the
  // utterance succeeds or a JS error is caught (both mean the process survived).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ml = require('../diagnostics/mlHealth') as typeof import('../diagnostics/mlHealth');
  await ml.markTTSStart(`kokoro:${targetVoice}`);
  try {
    const settings = getVoiceSettings();
    // Use the prefetched samples if drain's previous iteration already
    // kicked off inference for this chunk AND the prefetched voice
    // still matches what we're about to play with. OTA 013 — if the
    // player switched the Arbiter voice between prefetch-start and
    // consume, the prefetched audio is the wrong voice; discard and
    // re-infer with the current model.
    const prefetchStillValid = !!next.prefetch
      && (next.prefetchVoiceId === undefined || next.prefetchVoiceId === targetVoice);
    const firstSamples: Float32Array = asFloat32(
      prefetchStillValid ? await next.prefetch! : await inferSerial(model, next.text, settings.rate),
    );
    if (!firstSamples || firstSamples.length === 0) {
      currentlySpeaking = null;
      void drain();
      return;
    }
    // arb8 — assemble a crossfade batch: this chunk plus any following
    // same-voice chunks whose audio is ALREADY inferred (prefetch
    // resolved). We never block on inference here, so first-audio stays
    // fast; the batch only grows once prefetch has run ahead during the
    // previous chunk's playback.
    const batch: Float32Array[] = [firstSamples];
    // arb165 — parallel to `batch`: did each member end on a sentence
    // terminator? Drives the silence-gap-vs-crossfade choice in joinBatch.
    const batchEndsSentence: boolean[] = [!!next.endsSentence];
    while (batch.length < CROSSFADE_MAX_BATCH) {
      const peek = queue[0];
      if (!peek) break;
      // Only crossfade chunks of the SAME line. Merging across separate
      // lines made discrete beats (e.g. tutorial acks) run together and
      // feel laggy; intra-line bundling keeps long narration smooth while
      // distinct lines stay responsive. (Prefetch still pipelines across
      // lines below, so the inter-line gap stays small.)
      if (peek.lineId !== next.lineId) break;
      const peekVoice = peek.voiceId ?? arbiterVoiceId();
      if (peekVoice !== targetVoice) break;                 // stop at a voice change
      if (peek.resolvedSamples === undefined) break;        // not inferred yet → don't block
      if (peek.prefetchVoiceId !== undefined && peek.prefetchVoiceId !== targetVoice) break; // stale voice
      queue.shift();
      if (peek.resolvedSamples && peek.resolvedSamples.length) {
        batch.push(peek.resolvedSamples);
        batchEndsSentence.push(!!peek.endsSentence);
      }
    }
    // Prime inference for the next few chunks (same voice only) so future
    // drains can keep forming batches. Switching voices mid-queue would
    // force a model swap and defeat the win, so prefetch stops there.
    primePrefetch(model, targetVoice, settings.rate);

    let combined: Float32Array;
    if (batch.length === 1) {
      // Single chunk — unchanged path; playPcm trims + fades it.
      combined = firstSamples;
    } else {
      // Trim each member's pad-silence first, then join: a short silence after
      // any member that ends a sentence (arb165), an equal-power crossfade
      // otherwise. Never let post-processing break playback — fall back to the
      // first chunk.
      try {
        const trimmedBufs = batch.map((b) => trimSilenceLeadTrail(b, KOKORO_SAMPLE_RATE));
        combined = joinBatch(trimmedBufs, batchEndsSentence, KOKORO_SAMPLE_RATE);
      } catch {
        combined = firstSamples;
      }
    }
    await playPcm(combined, KOKORO_SAMPLE_RATE);
  } catch (err) {
    const msg = describeErr(err);
    // OTA 23-017 — runtime-speak failure (model loaded, ready,
    // but a specific utterance blew up). Record so the diagnostic
    // captures it instead of just showing the truncated UI msg.
    const diskFreeMB = await captureFreeDiskMB();
    recordKokoroError('unknown', currentlySpeaking?.voiceId ?? 'unknown', err, diskFreeMB);
    setKokoroState({ phase: 'error', message: `[speak] ${msg}`.slice(0, 240) });
  } finally {
    // OTA-413 — the process survived this utterance (success or JS-caught error),
    // so clear the voice crash breadcrumb; only a native SIGSEGV leaves it behind.
    void ml.markTTSDone();
    currentlySpeaking = null;
    void drain();
  }
}

export async function stopAndClear(): Promise<void> {
  queue.length = 0;
  currentlySpeaking = null;
  void setMusicDuck(false);
  if (currentSound) {
    try { await currentSound.stopAsync(); } catch { /* ignore */ }
    try { await currentSound.unloadAsync(); } catch { /* ignore */ }
    currentSound = null;
  }
}

export async function disposePiperEngine(): Promise<void> {
  await stopAndClear();
  // Drop every loaded voice in the pool — Arbiter + any vendor still
  // resident. The next prewarm() call will re-load the Arbiter slot.
  for (const [, entry] of VOICE_POOL) {
    try {
      if (typeof entry.module?.delete === 'function') entry.module.delete();
    } catch { /* ignore */ }
  }
  VOICE_POOL.clear();
  LOADING.clear();
  prewarmStarted = false;
}

/** Force a model refresh: dispose the loaded engine, wipe the
 *  adapter's executorch cache, and reset state to idle. The next
 *  speak() call will trigger a fresh download — which fetches the
 *  current model URLs (so if Software Mansion ships a newer
 *  kokoro-medium build the player picks it up).
 *
 *  Called by the UPDATE button on the Voice settings tab. */
export async function refreshPiperEngine(): Promise<void> {
  await disposePiperEngine();
  try {
    // Adapter writes downloads to this directory; clearing it forces
    // the next fetch to re-pull from the source URL.
    const FileSystem = require('expo-file-system');
    const dir = (FileSystem.documentDirectory ?? '') + 'tartaria-executorch/';
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  } catch {
    /* swallow — UPDATE is best-effort */
  }
  availabilityCache = null;
  lastDownloadProgress = 0;
  setKokoroState({ phase: 'idle' });
}

// ── PCM → WAV → expo-av playback ────────────────────────────────────

/** Wrap a Float32Array PCM buffer in a WAV header and play it via
 *  expo-av Sound. Returns once playback finishes (so the queue drains
 *  in order). */
async function playPcm(samples: Float32Array, sampleRate: number): Promise<void> {
  // Smooth the head + tail of the waveform to eliminate the audible
  // click between sentences. Kokoro's PCM output starts / ends at
  // non-zero amplitude on most utterances; cutting playback on
  // didJustFinish then immediately starting the next utterance
  // produces a sharp transient at the join. Originally 10ms ramp,
  // but playtest reported the first / last word of each sentence
  // getting clipped — 10ms (~220 samples) is long enough to touch
  // real phoneme content. Dropped to 3ms (~66 samples at 22.05 kHz),
  // which is well under any single phoneme and still kills the
  // click.
  // arb7 prosody — strip the 30-150ms of near-silence Kokoro pads onto
  // the head + tail of each utterance before fading. Concatenated in the
  // queue these dead spans stack into the stuttering inter-sentence gap;
  // trimming them (with a guard pad so soft attacks survive) tightens the
  // join so consecutive chunks read as continuous speech.
  // Normalize first (native bridges sometimes return a non-Float32Array),
  // then trim + fade — but never let post-processing throw and silence the
  // voice: on any failure, play the raw samples.
  const src = asFloat32(samples);
  let buf = src;
  try {
    buf = trimSilenceLeadTrail(src, sampleRate);
    applyFadeEnvelope(buf, sampleRate, 3);
  } catch {
    buf = src;
  }
  // arb68 — light silent lead/tail guard so trimSilenceLeadTrail's strip + the
  // didJustFinish/unload timing don't shave a soft attack/decay. Kept SHORT so
  // it doesn't reintroduce the inter-line latency arb7/arb8 tightened. (The
  // earlier 1300ms "first-utterance" lead was removed: the title-line clip is
  // upstream of playback — the buffer itself arrives truncated — so padding the
  // playback buffer never addressed it. Fixed at the source instead.)
  try { buf = padSilence(buf, sampleRate, 90, 70); } catch { /* play unpadded */ }
  const wavBase64 = encodeWav(buf, sampleRate);
  // progressUpdateIntervalMillis defaults to 500ms in expo-av, which
  // means didJustFinish fires up to half a second AFTER the audio
  // actually ends — that latency is the bulk of the inter-sentence
  // gap players described as too long. Drop to 50ms so the queue
  // advances within one frame of playback finishing.
  // OTA-285 — apply master TTS volume from voiceSettings. Read fresh
  // per playback so a slider change between utterances takes effect
  // on the next sentence (no need to rebuild the queue). Clamp 0..1
  // defensively even though setVoiceSettings clamps on write.
  const ttsVolume = Math.max(0, Math.min(1, getVoiceSettings().volume ?? 1));
  const { sound } = await Audio.Sound.createAsync(
    { uri: `data:audio/wav;base64,${wavBase64}` },
    { shouldPlay: true, progressUpdateIntervalMillis: 25, volume: ttsVolume },
  );
  currentSound = sound;
  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        try { void sound.unloadAsync(); } catch { /* ignore */ }
        if (currentSound === sound) currentSound = null;
        resolve();
      }
    });
  });
}

/** Normalize whatever the native `generate()` bridge returns into a real
 *  Float32Array. Some bridges hand back an array-like or ArrayBuffer that
 *  lacks the TypedArray methods (.subarray/.set) the trim + crossfade
 *  post-processing relies on; calling them would throw "undefined is not a
 *  function" and drop the whole bundled voice to system TTS. Never throws;
 *  returns an empty buffer on anything unusable. */
function asFloat32(x: unknown): Float32Array {
  if (x instanceof Float32Array) return x;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = x as any;
  try {
    if (v instanceof ArrayBuffer) return new Float32Array(v);
    if (v && v.buffer instanceof ArrayBuffer && typeof v.byteOffset === 'number' && typeof v.length === 'number') {
      return new Float32Array(v.buffer, v.byteOffset, v.length);
    }
    if (v && typeof v.length === 'number') return Float32Array.from(v as ArrayLike<number>);
  } catch { /* fall through to empty */ }
  return new Float32Array(0);
}

/** Trim leading/trailing near-silence from a Kokoro waveform. Scans in
 *  from each end to the first sample above an amplitude threshold, then
 *  keeps a small guard pad so a soft consonant attack/decay is never
 *  clipped, and caps how much can be removed per end so a genuinely
 *  quiet line can't be gutted. Returns a subarray VIEW (no copy); never
 *  returns empty — if the whole buffer is below threshold it's left as-is. */
function trimSilenceLeadTrail(samples: Float32Array, sampleRate: number): Float32Array {
  const n = samples.length;
  if (n === 0) return samples;
  const THRESHOLD = 0.01;                       // |amp| counted as "sound"
  const guard = Math.floor(sampleRate * 0.008); // keep ~8ms padding each end
  const maxTrim = Math.floor(sampleRate * 0.2); // never cut > 200ms per end
  let first = 0;
  while (first < n && Math.abs(samples[first]!) < THRESHOLD) first++;
  let last = n - 1;
  while (last > first && Math.abs(samples[last]!) < THRESHOLD) last--;
  if (first >= last) return samples;            // all-silence / lone spike
  const start = Math.min(Math.max(0, first - guard), maxTrim);
  const end = Math.max(Math.min(n - 1, last + guard), n - 1 - maxTrim);
  if (start <= 0 && end >= n - 1) return samples;
  return samples.subarray(start, end + 1);
}

/** arb8 — start inference for up to CROSSFADE_LOOKAHEAD chunks ahead of
 *  playback (same voice only), stamping each item's resolvedSamples when
 *  its forward() settles so drain() can fold ready chunks into a crossfade
 *  batch without blocking. Idempotent: skips items already prefetching. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function primePrefetch(model: any, voice: string, rate: number): void {
  let ahead = 0;
  for (const item of queue) {
    if (ahead >= CROSSFADE_LOOKAHEAD) break;
    const v = item.voiceId ?? arbiterVoiceId();
    if (v !== voice) break;                 // stop at a voice change
    if (!item.prefetch) {
      // OTA 013 — stamp the voice we inferred with so the consume side
      // can discard stale audio after a mid-stream voice switch.
      item.prefetchVoiceId = voice;
      item.prefetch = inferSerial(model, item.text, rate)
        .then((s: unknown) => { const f = asFloat32(s); item.resolvedSamples = f; return f; })
        .catch(() => { item.resolvedSamples = null; return null; });
    }
    ahead++;
  }
}

/** arb8 — concatenate PCM buffers into one waveform, overlapping each join
 *  by CROSSFADE_MS with an equal-power (constant-power) crossfade so the
 *  transition is smooth and click-free without a mid-fade amplitude dip.
 *  Inputs should already be silence-trimmed so the overlap is over real
 *  audio. Returns a fresh buffer. */
function concatWithCrossfade(buffers: Float32Array[], sampleRate: number): Float32Array {
  if (buffers.length === 1) return buffers[0]!;
  const xfadeMax = Math.max(1, Math.floor((sampleRate * CROSSFADE_MS) / 1000));
  // Per-join overlap is capped by the shorter of the two neighbours.
  const overlaps: number[] = [];
  let total = buffers[0]!.length;
  for (let i = 1; i < buffers.length; i++) {
    const ov = Math.min(xfadeMax, buffers[i - 1]!.length, buffers[i]!.length);
    overlaps.push(ov);
    total += buffers[i]!.length - ov;
  }
  const out = new Float32Array(total);
  out.set(buffers[0]!, 0);
  let pos = buffers[0]!.length;
  for (let i = 1; i < buffers.length; i++) {
    const buf = buffers[i]!;
    const ov = overlaps[i - 1]!;
    const start = pos - ov;
    for (let j = 0; j < ov; j++) {
      const t = (j + 1) / (ov + 1);                 // 0..1 across the overlap
      const gPrev = Math.cos((t * Math.PI) / 2);     // equal-power fade-out
      const gNext = Math.sin((t * Math.PI) / 2);     // equal-power fade-in
      out[start + j] = out[start + j]! * gPrev + buf[j]! * gNext;
    }
    out.set(buf.subarray(ov), pos);
    pos += buf.length - ov;
  }
  return out;
}

/** arb165 — join a same-line batch with a SLIGHT silence after every sentence
 *  (Kokoro otherwise runs sentences together), crossfading only the rare
 *  non-terminal join (a stray fragment). `endsSentence[i]` = did member i end
 *  on a terminator. Members are copied before edge-fading so cached/prefetched
 *  sample buffers are never mutated. */
function joinBatch(
  buffers: Float32Array[],
  endsSentence: boolean[],
  sampleRate: number,
): Float32Array {
  if (buffers.length === 1) return buffers[0]!;
  const gapLen = Math.max(0, Math.floor((sampleRate * SENTENCE_PAUSE_MS) / 1000));
  const xfadeMax = Math.max(1, Math.floor((sampleRate * CROSSFADE_MS) / 1000));
  const fadeLen = Math.max(1, Math.floor((sampleRate * EDGE_FADE_MS) / 1000));
  const segs = buffers.map((b) => b.slice());
  // Per-join plan: gap (after a sentence) or crossfade overlap.
  const gapJoin: boolean[] = [];
  const overlaps: number[] = [];
  let total = segs[0]!.length;
  for (let i = 1; i < segs.length; i++) {
    const gap = !!endsSentence[i - 1];
    gapJoin.push(gap);
    if (gap) {
      overlaps.push(0);
      total += gapLen + segs[i]!.length;
    } else {
      const ov = Math.min(xfadeMax, segs[i - 1]!.length, segs[i]!.length);
      overlaps.push(ov);
      total += segs[i]!.length - ov;
    }
  }
  // Taper each side of a gap so the silence join is click-free.
  for (let i = 0; i < segs.length; i++) {
    if (i < segs.length - 1 && gapJoin[i]) fadeEdge(segs[i]!, fadeLen, false);     // tail → silence
    if (i > 0 && gapJoin[i - 1]) fadeEdge(segs[i]!, fadeLen, true);                // silence → head
  }
  const out = new Float32Array(total);
  out.set(segs[0]!, 0);
  let pos = segs[0]!.length;
  for (let i = 1; i < segs.length; i++) {
    if (gapJoin[i - 1]) {
      pos += gapLen;                                  // leave zeros = the pause
      out.set(segs[i]!, pos);
      pos += segs[i]!.length;
    } else {
      const ov = overlaps[i - 1]!;
      const start = pos - ov;
      for (let j = 0; j < ov; j++) {
        const t = (j + 1) / (ov + 1);
        out[start + j] = out[start + j]! * Math.cos((t * Math.PI) / 2) + segs[i]![j]! * Math.sin((t * Math.PI) / 2);
      }
      out.set(segs[i]!.subarray(ov), pos);
      pos += segs[i]!.length - ov;
    }
  }
  return out;
}

/** Linear fade on one end of a buffer (head=true → fade-in, else fade-out).
 *  Mutates in place; used on the per-batch copies in joinBatch. */
function fadeEdge(samples: Float32Array, fadeLen: number, head: boolean): void {
  const n = Math.min(fadeLen, samples.length);
  for (let i = 0; i < n; i++) {
    const g = (i + 1) / (n + 1);
    if (head) samples[i] = samples[i]! * g;
    else samples[samples.length - 1 - i] = samples[samples.length - 1 - i]! * g;
  }
}

/** Apply a linear fade-in to the first `fadeMs` and fade-out to the
 *  last `fadeMs` of the buffer. Mutates the array in place. */
function applyFadeEnvelope(samples: Float32Array, sampleRate: number, fadeMs: number): void {
  const fadeSamples = Math.min(
    Math.floor((sampleRate * fadeMs) / 1000),
    Math.floor(samples.length / 2),
  );
  if (fadeSamples <= 1) return;
  for (let i = 0; i < fadeSamples; i++) {
    const g = i / fadeSamples;
    samples[i] = samples[i]! * g;
    samples[samples.length - 1 - i] = samples[samples.length - 1 - i]! * g;
  }
}

/** Convert Float32Array PCM samples [-1, 1] to a 16-bit mono WAV file,
 *  then return the file as a base64 string. */
function encodeWav(samples: Float32Array, sampleRate: number): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeString(view, 8, 'WAVE');

  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLen, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]!;
    if (s > 1) s = 1; else if (s < -1) s = -1;
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return bytesToBase64(new Uint8Array(buf));
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Base64 encoder that handles the large ArrayBuffer we get from
 *  Kokoro without exceeding String.fromCharCode's argument-list limit. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  // global.btoa is available in Hermes.
  return globalThis.btoa(parts.join(''));
}
