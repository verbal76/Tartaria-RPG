// PiperTTSManager — bundled neural TTS via sherpa-onnx + Piper voice.
//
// Mirrors TTSManager's speak() / stopAndClear() / isSpeaking() surface
// so the TTSController can swap between the system TTS (expo-speech)
// and the bundled Piper engine without knowing which is active. Pick
// happens in TTSManager based on voiceSettings.engine.
//
// Why sherpa-onnx instead of raw onnxruntime-react-native + Piper:
//   - espeak-ng phonemization is baked into the native engine — no
//     fragile JS phonemizer or OOV handling for lore words.
//   - Built-in PCM playback (startPcmPlayer / writePcmChunk) means
//     we don't have to wrap output in WAV headers + feed expo-av.
//   - Streaming API emits PCM chunks as the model generates them,
//     so playback starts before the full sentence finishes.
//
// Lifecycle:
//   1. ensurePiperReady() lazy-loads the model on first use (idempotent).
//      Model files are downloaded on first install (see PiperDownloader)
//      then cached in FileSystem.documentDirectory.
//   2. speak(text) enqueues; the queue drains one sentence at a time.
//   3. stopAndClear() cancels the in-flight generation + drops queue.
//
// All errors are swallowed — Piper failing falls back to the system TTS
// (caller's responsibility); never crashes the game.

// react-native-sherpa-onnx exposes the streaming TTS API through its
// './tts' subpath. We import the runtime symbols via that subpath and
// the types separately because TypeScript moduleResolution doesn't
// pick up the package's exports map for type-only imports without
// the equivalent ts-package-json-exports config. Using `any` for the
// engine + chunk types keeps tsc happy without a deeper tsconfig
// shuffle; the actual JS at runtime is the real sherpa-onnx object.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sherpaOnnxTts = require('react-native-sherpa-onnx/tts') as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createStreamingTTS: (opts: any) => Promise<any>;
};
const { createStreamingTTS } = sherpaOnnxTts;

import { getVoiceSettings } from './voiceSettings';
import * as FileSystem from 'expo-file-system';

interface QueuedUtterance {
  id: number;
  text: string;
}

let nextId = 1;
const queue: QueuedUtterance[] = [];
let currentlySpeaking: QueuedUtterance | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let enginePromise: Promise<any | null> | null = null;
let modelSampleRate = 22050; // Piper standard; overridden after init
let availabilityCache: boolean | null = null;

// Where the model files live after first-launch download. Same pattern as
// the MiniLM model: download to documentDirectory once, reuse forever.
const MODEL_DIR = FileSystem.documentDirectory + 'tartaria-piper/';

/** True if the bundled Piper engine is loaded and ready to speak.
 *  Caches the result so the settings UI can render synchronously after
 *  the first call. */
export async function isPiperAvailable(): Promise<boolean> {
  if (availabilityCache !== null) return availabilityCache;
  try {
    const info = await FileSystem.getInfoAsync(MODEL_DIR);
    availabilityCache = info.exists;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

/** True if anything is in the queue or actively being spoken. */
export function isSpeaking(): boolean {
  return currentlySpeaking !== null || queue.length > 0;
}

/** Reset the availability cache. Call after a successful download so
 *  the settings card re-checks. */
export function resetPiperAvailability(): void {
  availabilityCache = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureEngine(): Promise<any | null> {
  if (engine) return engine;
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const ok = await isPiperAvailable();
    if (!ok) return null;
    try {
      const e = await createStreamingTTS({
        modelPath: { type: 'file', path: MODEL_DIR },
        modelType: 'vits',
      });
      modelSampleRate = await e.getSampleRate();
      await e.startPcmPlayer(modelSampleRate, 1);
      engine = e;
      return e;
    } catch {
      return null;
    } finally {
      enginePromise = null;
    }
  })();
  return enginePromise;
}

/** Queue a line for the bundled engine. Returns the queue id; -1 when
 *  bundled TTS is disabled or unavailable so the caller can fall back
 *  to the system TTS. */
export function speak(text: string): number {
  const settings = getVoiceSettings();
  if (!settings.ttsEnabled) return -1;
  // Engine === 'piper' is the bundled path; 'system' goes through
  // TTSManager directly. Caller checks the engine before routing here.
  const trimmed = text.trim();
  if (!trimmed) return -1;
  const id = nextId++;
  queue.push({ id, text: trimmed });
  void drain();
  return id;
}

async function drain(): Promise<void> {
  if (currentlySpeaking) return;
  const next = queue.shift();
  if (!next) return;
  currentlySpeaking = next;
  const eng = await ensureEngine();
  if (!eng) {
    // Engine not ready — drop the utterance silently. The system TTS
    // path will pick up future log lines if the engine recovers.
    currentlySpeaking = null;
    return;
  }
  try {
    const settings = getVoiceSettings();
    await eng.generateSpeechStream(
      next.text,
      { speed: settings.rate },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChunk: (chunk: { samples: number[]; sampleRate: number }) => {
          // Sherpa's built-in PCM player handles playback. We just feed
          // the samples as they come off the model.
          void eng.writePcmChunk(chunk.samples);
        },
        onEnd: () => {
          currentlySpeaking = null;
          void drain();
        },
        onError: () => {
          currentlySpeaking = null;
          void drain();
        },
      },
    );
  } catch {
    currentlySpeaking = null;
    void drain();
  }
}

/** Cancel anything in flight and clear the queue. Used by SILENCE
 *  ARBITER + the engine-switch path. */
export async function stopAndClear(): Promise<void> {
  queue.length = 0;
  currentlySpeaking = null;
  if (!engine) return;
  try {
    await engine.cancelSpeechStream();
  } catch {
    /* ignore */
  }
}

/** Tear down the engine entirely. Used when the player toggles
 *  bundled TTS off or selects a different voice. */
export async function disposePiperEngine(): Promise<void> {
  await stopAndClear();
  if (!engine) return;
  try {
    await engine.stopPcmPlayer();
    await engine.destroy();
  } catch {
    /* ignore */
  } finally {
    engine = null;
    enginePromise = null;
    modelSampleRate = 22050;
  }
}

/** Local path where the Piper model files (model.onnx + tokens.txt +
 *  espeak-ng-data/) are expected. Exposed so the downloader knows
 *  where to write. */
export function getModelDir(): string {
  return MODEL_DIR;
}
