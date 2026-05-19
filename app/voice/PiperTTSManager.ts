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
}

let nextId = 1;
const queue: QueuedUtterance[] = [];
let currentlySpeaking: QueuedUtterance | null = null;
let currentSound: Audio.Sound | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tts: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ttsPromise: Promise<any | null> | null = null;
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
    const m = await ensureModel();
    if (!m) return;
    // Warm inference — minimal text so the graph compiles fast. Audio
    // output is discarded; we never call playPcm here. Some
    // executorch backends compile lazily on first forward(), which is
    // what we want to pay now (in the background) rather than on the
    // player's first heard line.
    try {
      const samples: Float32Array = await m.forward('ok.', 1.0);
      // No-op — we only wanted the side effect of compiling the graph.
      void samples;
    } catch { /* ignore warm-up errors; real speak() will surface them */ }
  } catch { /* ignore — state machine already surfaced the error */ }
}

export function isSpeaking(): boolean {
  return currentlySpeaking !== null || queue.length > 0;
}

export function getModelDir(): string {
  // ExecuTorch manages its own model cache; this path is informational.
  return 'executorch-cache://kokoro/';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureModel(): Promise<any | null> {
  if (tts) return tts;
  if (ttsPromise) return ttsPromise;
  if (!exec?.TextToSpeechModule?.fromModelName) return null;
  ttsPromise = (async () => {
    try {
      if (!exec) {
        setKokoroState({ phase: 'error', message: 'react-native-executorch module not present.' });
        return null;
      }
      setKokoroState({ phase: 'downloading', fraction: 0 });
      const m = await exec.TextToSpeechModule.fromModelName(
        { model: exec.KOKORO_MEDIUM, voice: pickVoice() },
        (p: number) => {
          lastDownloadProgress = p;
          setKokoroState({ phase: 'downloading', fraction: p });
          for (const l of downloadListeners) {
            try { l(p); } catch { /* ignore */ }
          }
        },
      );
      setKokoroState({ phase: 'loading' });
      tts = m;
      setKokoroState({ phase: 'ready' });
      return m;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setKokoroState({ phase: 'error', message: msg.slice(0, 240) });
      return null;
    } finally {
      ttsPromise = null;
    }
  })();
  return ttsPromise;
}

export function speak(text: string): number {
  const settings = getVoiceSettings();
  if (!settings.ttsEnabled) return -1;
  // Lexicon respellings (Aetheric, Tartarian, etc.) + symbol cleanup
  // (arrows → "to", "-N" → "negative N"). Pure transform on the
  // engine-bound copy; the visible log keeps the original symbols.
  const prepared = cleanForSpeech(applyLoreLexicon(text)).trim();
  if (!prepared) return -1;
  const id = nextId++;
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
  for (const chunk of chunks) {
    queue.push({ id: nextId++, text: chunk });
  }
  void drain();
  return id;
}

async function drain(): Promise<void> {
  if (currentlySpeaking) return;
  const next = queue.shift();
  if (!next) return;
  currentlySpeaking = next;
  const model = await ensureModel();
  if (!model) {
    currentlySpeaking = null;
    return;
  }
  try {
    const settings = getVoiceSettings();
    const samples: Float32Array = await model.forward(next.text, settings.rate);
    if (!samples || samples.length === 0) {
      currentlySpeaking = null;
      void drain();
      return;
    }
    await playPcm(samples, KOKORO_SAMPLE_RATE);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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
  if (tts && typeof tts.delete === 'function') {
    try { tts.delete(); } catch { /* ignore */ }
  }
  tts = null;
  ttsPromise = null;
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
  const { sound } = await Audio.Sound.createAsync(
    { uri: `data:audio/wav;base64,${wavBase64}` },
    { shouldPlay: true },
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
