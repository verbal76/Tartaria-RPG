// Voice settings — persisted via AsyncStorage so TTS / STT preferences
// survive across sessions. Mirrors audioSettings.ts; both managers and
// the settings UI read/write through this single source of truth.
//
// Default: TTS ON, engine BUNDLED. Playtest feedback (verbatim): "we
// pretty much made the kokoro voice mandatory for the arbiter ... I
// don't want them to have to find the voice options later." Fresh
// installs now boot with the Arbiter voice already enabled; the
// Kokoro download (~100 MB) starts in the background at app launch
// so it's ready by the time the player enters the world. STT stays
// OFF by default (it needs explicit consent for mic access).
//
// Existing installs keep whatever the player previously saved —
// loadVoiceSettings reads the stored row and only falls back to
// DEFAULTS for keys the player has never touched.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tartaria.voice.settings.v1';

export interface VoiceSettings {
  /** Master toggle for the Arbiter reading lines aloud. Default OFF. */
  ttsEnabled: boolean;
  /** Master toggle for the mic / silence-arbiter buttons + push-to-talk
   *  speech input. Default OFF. */
  sttEnabled: boolean;
  /** Which engine voices the game. 'system' = device TTS via
   *  expo-speech (default). 'bundled' = Kokoro neural voice via
   *  react-native-executorch (~100 MB one-time download on first
   *  use, then fully offline). */
  engine: 'system' | 'bundled';
  /** Playback rate for TTS. 1.0 = normal. expo-speech accepts 0.1–2.0
   *  on Android; we clamp the UI slider 0.5–1.5 for sanity. Used by
   *  both engines. */
  rate: number;
  /** Pitch for TTS. 1.0 = normal. Clamped 0.5–2.0. System engine
   *  only — Piper voices have fixed pitch per voice. */
  pitch: number;
  /** Selected voice identifier from expo-speech.getAvailableVoicesAsync.
   *  null = let the OS pick the default voice for the device locale.
   *  Used when engine = 'system'. */
  voiceId: string | null;
  /** Selected Kokoro voice (af_heart / af_river / af_sarah / am_adam /
   *  am_michael / bf_emma / bm_daniel). Used when engine = 'bundled'.
   *  Defaults to am_michael — American male, even-toned narrator. */
  kokoroVoice: string;
  /** When true, a recognised STT transcript immediately fires
   *  submitPlayerAction. When false, the transcript lands in the text
   *  box and the player taps Act to submit (lets them correct
   *  misrecognition before committing). */
  autoSubmit: boolean;
  /** OTA-285 — master TTS playback volume, 0.0..1.0. Applied per
   *  utterance:
   *    - System engine: passed to Speech.speak's `volume` option
   *      (iOS honors it; Android system TTS uses device media volume,
   *      so the slider has no effect there — note in the UI).
   *    - Bundled (Kokoro): applied via expo-av's
   *      Audio.Sound.createAsync({ volume }) on both platforms.
   *  Default 1.0 — same as pre-OTA-285 behavior so existing installs
   *  hear no change unless they touch the slider. */
  volume: number;
}

const DEFAULTS: VoiceSettings = {
  ttsEnabled: true,
  sttEnabled: false,
  engine: 'bundled',
  rate: 1.0,
  pitch: 1.0,
  voiceId: null,
  kokoroVoice: 'am_michael',
  autoSubmit: false,
  volume: 1.0,
};

let cache: VoiceSettings | null = null;
const listeners = new Set<(s: VoiceSettings) => void>();

export async function loadVoiceSettings(): Promise<VoiceSettings> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
      cache = {
        ttsEnabled: typeof parsed.ttsEnabled === 'boolean' ? parsed.ttsEnabled : DEFAULTS.ttsEnabled,
        sttEnabled: typeof parsed.sttEnabled === 'boolean' ? parsed.sttEnabled : DEFAULTS.sttEnabled,
        engine: parsed.engine === 'bundled' ? 'bundled' : DEFAULTS.engine,
        rate: typeof parsed.rate === 'number' ? clampRate(parsed.rate) : DEFAULTS.rate,
        pitch: typeof parsed.pitch === 'number' ? clampPitch(parsed.pitch) : DEFAULTS.pitch,
        voiceId: typeof parsed.voiceId === 'string' ? parsed.voiceId : DEFAULTS.voiceId,
        kokoroVoice: typeof parsed.kokoroVoice === 'string' ? parsed.kokoroVoice : DEFAULTS.kokoroVoice,
        autoSubmit: typeof parsed.autoSubmit === 'boolean' ? parsed.autoSubmit : DEFAULTS.autoSubmit,
        volume: typeof parsed.volume === 'number' ? clamp01(parsed.volume) : DEFAULTS.volume,
      };
    } else {
      cache = { ...DEFAULTS };
    }
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function getVoiceSettings(): VoiceSettings {
  return cache ?? { ...DEFAULTS };
}

export async function setVoiceSettings(patch: Partial<VoiceSettings>): Promise<VoiceSettings> {
  const current = cache ?? (await loadVoiceSettings());
  const next: VoiceSettings = {
    ttsEnabled: patch.ttsEnabled !== undefined ? patch.ttsEnabled : current.ttsEnabled,
    sttEnabled: patch.sttEnabled !== undefined ? patch.sttEnabled : current.sttEnabled,
    engine: patch.engine !== undefined ? patch.engine : current.engine,
    rate: patch.rate !== undefined ? clampRate(patch.rate) : current.rate,
    pitch: patch.pitch !== undefined ? clampPitch(patch.pitch) : current.pitch,
    voiceId: patch.voiceId !== undefined ? patch.voiceId : current.voiceId,
    kokoroVoice: patch.kokoroVoice !== undefined ? patch.kokoroVoice : current.kokoroVoice,
    autoSubmit: patch.autoSubmit !== undefined ? patch.autoSubmit : current.autoSubmit,
    volume: patch.volume !== undefined ? clamp01(patch.volume) : current.volume,
  };
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore persistence errors — settings still apply in-memory
  }
  for (const l of listeners) {
    try { l(next); } catch { /* ignore */ }
  }
  return next;
}

export function onVoiceSettingsChange(fn: (s: VoiceSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function clampRate(v: number): number {
  if (!Number.isFinite(v)) return DEFAULTS.rate;
  return Math.max(0.5, Math.min(1.5, v));
}

function clampPitch(v: number): number {
  if (!Number.isFinite(v)) return DEFAULTS.pitch;
  return Math.max(0.5, Math.min(2.0, v));
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return DEFAULTS.volume;
  return Math.max(0, Math.min(1, v));
}
