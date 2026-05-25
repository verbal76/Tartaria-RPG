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
  /** Prefetched samples + the rate they were inferred at. drain()
   *  pre-runs forward() on the NEXT queued utterance while the
   *  current one is still playing, so the next sentence's audio is
   *  ready to play the instant didJustFinish fires. Without this, the
   *  inter-sentence gap was 0.75–1.25s (next chunk's inference time +
   *  expo-av's 500ms status poll). With prefetch + 50ms poll the gap
   *  drops to ~100ms. */
  prefetch?: Promise<Float32Array | null>;
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
const VOICE_POOL: Map<string, LoadedVoice> = new Map();
// In-flight loads keyed by voiceId so concurrent ensureLoaded() calls
// (e.g. beginScene's warm + the vendor's first line both hitting at
// once) share one fromModelName promise instead of double-loading.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LOADING: Map<string, Promise<any | null>> = new Map();

let nextId = 1;
const queue: QueuedUtterance[] = [];
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

function recordKokoroError(
  step: KokoroErrorRecord['step'],
  voiceId: string,
  err: unknown,
  diskFreeMB: number,
): void {
  const message = err instanceof Error ? err.message : String(err);
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
              if (elapsed >= 4000 && p < 0.99) {
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
      // Warm-up forward — compiles the graph so the player's first
      // real line doesn't pay cold-start latency. Output discarded.
      // Captured here too — the executorch native graph compile is
      // the single most likely OOM site on low-RAM devices.
      try { const samples: Float32Array = await m.forward('ok.', 1.0); void samples; }
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
      const msg = err instanceof Error ? err.message : String(err);
      // Avoid double-recording: warmup catch already wrote a
      // detailed record. For everything else, capture here.
      if (step !== 'warmup') {
        const diskFreeMB = await captureFreeDiskMB();
        recordKokoroError(step, voiceId, err, diskFreeMB);
      }
      if (sticky) setKokoroState({ phase: 'error', message: msg.slice(0, 240) });
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
  // OTA 226 — Arbiter spam collapse. Playtester: "if somebody spams
  // a direction the Arbiter fires off a bunch of flavor lines and
  // talks for 5 minutes afterwards. Finish the one he's reading,
  // skip the ones in between, jump to the latest." Implementation:
  // when a new arbiter utterance lands, drop every other queued
  // arbiter chunk (the currently-speaking one keeps playing — we
  // only touch `queue`, not `currentlySpeaking`). World / combat /
  // reward channels are untouched so action results still chain.
  if (channel === 'arbiter' && queue.length > 0) {
    const before = queue.length;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i]!.channel === 'arbiter') queue.splice(i, 1);
    }
    const dropped = before - queue.length;
    if (dropped > 0) {
      // Cancel any prefetch promises attached to the dropped lines
      // by simply letting them resolve into the ether — drain() only
      // consumes prefetch from items it actually shifts off the
      // queue, so orphaned promises GC harmlessly.
    }
  }
  // Split into sentence-sized chunks so the first audio plays as
  // soon as one sentence finishes inference — without this, a big
  // intro paragraph would take 10-30 seconds to phonemize + run
  // through Kokoro before ANY sound starts. Subsequent sentences
  // queue behind the first and stream as they're produced.
  const { sentences, remainder } = splitSentences(prepared);
  const chunks = sentences.length > 0 ? [...sentences] : [];
  if (remainder.trim()) chunks.push(remainder.trim());
  // Fallback: if the text has zero terminators (rare — usually a
  // status line), speak it as one chunk.
  if (chunks.length === 0) chunks.push(prepared);
  const resolvedVoice = voiceId ?? arbiterVoiceId();
  for (const chunk of chunks) {
    queue.push({ id: nextId++, text: chunk, voiceId: resolvedVoice, channel });
  }
  void drain();
  return id;
}

async function drain(): Promise<void> {
  if (currentlySpeaking) return;
  const next = queue.shift();
  if (!next) return;
  currentlySpeaking = next;
  const targetVoice = next.voiceId ?? arbiterVoiceId();
  const model = await ensureLoaded(targetVoice);
  if (!model) {
    currentlySpeaking = null;
    void drain();
    return;
  }
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
    const samples: Float32Array | null = prefetchStillValid
      ? await next.prefetch!
      : await model.forward(next.text, settings.rate);
    if (!samples || samples.length === 0) {
      currentlySpeaking = null;
      void drain();
      return;
    }
    // Kick off inference for the NEXT queued chunk in parallel with
    // this chunk's playback. Only prefetch when the next chunk uses
    // the same loaded voice — switching voices mid-queue would force
    // a model swap and defeat the win. If forward() rejects, the
    // catch on the next iteration handles it.
    const upcoming = queue[0];
    if (upcoming && !upcoming.prefetch) {
      const upcomingVoice = upcoming.voiceId ?? arbiterVoiceId();
      if (upcomingVoice === targetVoice) {
        // OTA 013 — stamp the voice we inferred with. Drain's
        // consume-side check uses prefetchVoiceId to detect a
        // mid-stream voice switch and discard stale audio.
        upcoming.prefetchVoiceId = targetVoice;
        upcoming.prefetch = model
          .forward(upcoming.text, settings.rate)
          .catch(() => null);
      }
    }
    await playPcm(samples, KOKORO_SAMPLE_RATE);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // OTA 23-017 — runtime-speak failure (model loaded, ready,
    // but a specific utterance blew up). Record so the diagnostic
    // captures it instead of just showing the truncated UI msg.
    const diskFreeMB = await captureFreeDiskMB();
    recordKokoroError('unknown', currentlySpeaking?.voiceId ?? 'unknown', err, diskFreeMB);
    setKokoroState({ phase: 'error', message: msg.slice(0, 240) });
  } finally {
    currentlySpeaking = null;
    void drain();
  }
}

export async function stopAndClear(): Promise<void> {
  queue.length = 0;
  currentlySpeaking = null;
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
  applyFadeEnvelope(samples, sampleRate, 3);
  const wavBase64 = encodeWav(samples, sampleRate);
  // progressUpdateIntervalMillis defaults to 500ms in expo-av, which
  // means didJustFinish fires up to half a second AFTER the audio
  // actually ends — that latency is the bulk of the inter-sentence
  // gap players described as too long. Drop to 50ms so the queue
  // advances within one frame of playback finishing.
  const { sound } = await Audio.Sound.createAsync(
    { uri: `data:audio/wav;base64,${wavBase64}` },
    { shouldPlay: true, progressUpdateIntervalMillis: 50 },
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
