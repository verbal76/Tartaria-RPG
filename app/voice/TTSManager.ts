// TTSManager — speaks game lines through the device's text-to-speech
// engine. On Android that's the installed TTS engine (Google TTS by
// default; quality scales from basic to Google Neural on Pixel-tier
// devices). Singleton + FIFO queue + cancel API mirrors AudioManager.
//
// All errors are swallowed — if the device has no TTS engine the
// availability check at init disables the toggle in settings; once
// disabled nothing here runs.

import * as Speech from 'expo-speech';
import { getVoiceSettings, loadVoiceSettings, onVoiceSettingsChange } from './voiceSettings';
import { cleanForSpeech } from './loreLexicon';
import {
  speak as piperSpeak,
  stopAndClear as piperStopAndClear,
  isSpeaking as piperIsSpeaking,
  isPiperAvailable,
  disposePiperEngine,
  prewarmKokoro,
  disposeStickyArbiterVoice,
} from './PiperTTSManager';

interface QueuedUtterance {
  /** Monotonic id so callers can debounce / dedupe if needed. */
  id: number;
  text: string;
  /** Optional channel hint for the listener if it ever wants to vary
   *  rate / pitch per channel (combat lines could be faster, etc.).
   *  Not used in v1; reserved. */
  channel?: string;
  /** Per-utterance voice override (system-engine only). When set,
   *  the queue will NOT batch this item with adjacent items that
   *  carry a different voiceId — multi-voice conversations need
   *  each speaker on their own Speech.speak call. Null / undefined
   *  falls back to the player's configured voiceId from settings. */
  voiceId?: string | null;
}

let nextId = 1;
const queue: QueuedUtterance[] = [];
let currentlySpeaking: QueuedUtterance | null = null;
let availabilityCache: boolean | null = null;
let voicesCache: Speech.Voice[] | null = null;
/** Timer that holds off the first Speech.speak() call by a short
 *  window so consecutive speak() calls in the same action (world +
 *  arbiter + reward bursts) coalesce into one utterance. Android TTS
 *  inserts a ~0.5-2s init gap between separate utterances; merging
 *  them eliminates the pause the player hears between sections. */
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
// Bumped from 150 → 400ms so streaming Arbiter sentences arriving
// from token-by-token Qwen generation (≈ 200–500ms per sentence)
// have a chance to batch into ONE utterance. Each sentence in its
// own utterance pays Android TTS's ~0.5–2s reinit gap; one merged
// utterance gives a natural sentence-end pause (~0.2s).
const COALESCE_MS = 400;

/** Returns true if expo-speech can run on this device. We try two
 *  probes because `getAvailableVoicesAsync` returns an empty list on
 *  some Android devices that DO have a working TTS engine (Samsung
 *  TTS, some custom ROMs, OEM-skinned Android variants). If the voice
 *  catalog is empty we fall back to a bridge-only probe: calling
 *  isSpeakingAsync (a cheap status query that just hits the native
 *  module). If the bridge responds without throwing, we report TTS as
 *  available — actual speech may still fail per-utterance, but the
 *  player can at least flip the toggle and find out. */
export async function isTTSAvailable(): Promise<boolean> {
  if (availabilityCache !== null) return availabilityCache;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    voicesCache = voices;
    if (voices.length > 0) {
      availabilityCache = true;
      return true;
    }
    // Empty catalog — try the bridge probe.
    await Speech.isSpeakingAsync();
    availabilityCache = true;
  } catch {
    availabilityCache = false;
  }
  return availabilityCache;
}

/** Voice list for the settings picker. Memoised. */
export async function getTTSVoices(): Promise<Speech.Voice[]> {
  if (voicesCache) return voicesCache;
  try {
    voicesCache = await Speech.getAvailableVoicesAsync();
  } catch {
    voicesCache = [];
  }
  return voicesCache;
}

/** True if anything is in the queue or actively being spoken.
 *  Aware of both engines so the InputBox MIC / SILENCE button swap
 *  fires correctly regardless of which engine is active. */
export function isSpeaking(): boolean {
  const settings = getVoiceSettings();
  if (settings.engine === 'bundled') return piperIsSpeaking();
  return currentlySpeaking !== null || queue.length > 0;
}

/** Queue a line to be spoken. Routes to either the system TTS
 *  (expo-speech) or the bundled Piper engine based on
 *  voiceSettings.engine. No-op if TTS is disabled in settings.
 *  Returns the queue id (negative when nothing was queued). */
export function speak(text: string, channel?: string, voiceId?: string | null): number {
  const settings = getVoiceSettings();
  if (!settings.ttsEnabled) return -1;
  // Symbol cleanup before either engine — strips arrows so the player
  // doesn't hear "right arrow", rewrites "-N" as "negative N", etc.
  const trimmed = cleanForSpeech(text).trim();
  if (!trimmed) return -1;
  if (settings.engine === 'bundled') {
    // Kokoro can't switch voice per utterance (the voice is baked
    // Bundled engine now ALSO supports per-vendor voices via the
    // Kokoro voice pool (PiperTTSManager). Each vendor's assigned
    // voiceId triggers a lazy-load of that voice on first use, and
    // beginScene's warm hook keeps the latency invisible. Pool is
    // capped at 2 simultaneous voices (Arbiter sticky + 1 vendor
    // slot, LRU-evicted).
    return piperSpeak(trimmed, voiceId, channel);
  }
  const id = nextId++;
  // OTA 226 — same Arbiter spam-collapse rule as the bundled engine.
  // When a new arbiter line lands, drop other queued arbiter lines so
  // the player isn't lectured for two minutes after rapid-tapping.
  if (channel === 'arbiter' && queue.length > 0) {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i]!.channel === 'arbiter') queue.splice(i, 1);
    }
  }
  queue.push({ id, text: trimmed, channel, voiceId });
  // If something is already being spoken, drain() will merge the
  // queue when it finishes — no timer needed. If the engine is idle,
  // hold off briefly so additional speak() calls landing in the same
  // tick get bundled into one utterance.
  if (currentlySpeaking) return id;
  if (coalesceTimer != null) return id;
  coalesceTimer = setTimeout(() => {
    coalesceTimer = null;
    drain();
  }, COALESCE_MS);
  return id;
}

/** Stop whatever's currently speaking + clear the queue entirely.
 *  Used by the SILENCE ARBITER button and the OFF settings toggle.
 *  Stops BOTH engines so the player can flip toggles without leaving
 *  audio bleeding in the background. */
export function stopAndClear(): void {
  queue.length = 0;
  currentlySpeaking = null;
  if (coalesceTimer != null) { clearTimeout(coalesceTimer); coalesceTimer = null; }
  try { void Speech.stop(); } catch { /* ignore */ }
  // Unhandled-rejection-safe — piperStopAndClear awaits expo-av
  // teardown which can reject on Android when a sound is mid-load
  // or already-unloaded. Without this .catch the rejection
  // propagates into the React Native bridge and (on some Android
  // builds) crashes the process to the home screen when the
  // SILENCE ARBITER button is tapped.
  void piperStopAndClear().catch(() => { /* ignore */ });
}

/** Keep the currently-speaking sentence, but drop everything queued
 *  behind it. Used on scene transitions so the player isn't 30
 *  seconds behind the visible scene. */
export function clearQueueKeepCurrent(): void {
  queue.length = 0;
  if (coalesceTimer != null) { clearTimeout(coalesceTimer); coalesceTimer = null; }
}

/** Re-apply rate / pitch / voice from settings. Called after the
 *  player changes a slider in the Voice card. The currently-speaking
 *  utterance keeps its old settings (expo-speech doesn't let us
 *  modify mid-utterance), but the next item picks up the new values. */
export function applySettings(): void {
  // No-op on its own — settings are read at speak-time. This function
  // exists so the settings observer has a stable hook to call.
}

/** Ensure each merged segment ends in terminal punctuation so the
 *  TTS engine reads a natural pause between them. Most narration
 *  lines already end with ./!/?; we only append a period for the
 *  rare line that doesn't (e.g. a status line or a stat readout). */
function withTerminator(text: string): string {
  const t = text.trim();
  if (/[.!?…:;]$/.test(t)) return t;
  return t + '.';
}

function drain(): void {
  if (currentlySpeaking) return;
  if (queue.length === 0) return;
  // Merge ADJACENT same-voice items into a single utterance so
  // Android TTS's per-utterance reinit gap doesn't break up
  // consecutive lines from the same speaker. Voice-change forces
  // a batch break — different speakers each get their own
  // Speech.speak call. The next drain (fired from onDone) picks up
  // the next voice in line, preserving conversation order.
  const head = queue[0]!;
  const headVoice = head.voiceId ?? null;
  const batch: QueuedUtterance[] = [];
  while (queue.length > 0) {
    const peek = queue[0]!;
    const peekVoice = peek.voiceId ?? null;
    if (peekVoice !== headVoice) break;
    batch.push(queue.shift()!);
  }
  const next: QueuedUtterance = {
    id: batch[0]!.id,
    text: batch.map((it) => withTerminator(it.text)).join(' '),
    channel: batch[0]!.channel,
    voiceId: headVoice,
  };
  currentlySpeaking = next;
  const settings = getVoiceSettings();
  // Per-utterance voice override beats the configured default,
  // so vendor lines render in their assigned voice while the
  // Arbiter's lines (no voiceId override) use the player's
  // setting.
  const utteranceVoice = next.voiceId ?? settings.voiceId ?? undefined;
  try {
    Speech.speak(next.text, {
      rate: settings.rate,
      pitch: settings.pitch,
      voice: utteranceVoice,
      onDone: () => {
        currentlySpeaking = null;
        drain();
      },
      onStopped: () => {
        currentlySpeaking = null;
        // Don't auto-drain on stop — caller wanted silence.
      },
      onError: () => {
        currentlySpeaking = null;
        drain();
      },
    });
  } catch {
    currentlySpeaking = null;
    drain();
  }
}

/** Wire up the settings observer so an ON → OFF flip immediately
 *  silences the queue. Called once at app boot. */
export async function initTTSManager(): Promise<void> {
  await loadVoiceSettings();
  await isTTSAvailable(); // primes the availability + voice cache
  // Preload Kokoro in the background if the player has bundled TTS
  // enabled. The download (~100 MB on first install) and graph-
  // compile happen while the player is on the title screen or
  // making a character, so the first narration line doesn't wait
  // on cold-start.
  const initial = getVoiceSettings();
  if (initial.ttsEnabled && initial.engine === 'bundled') {
    void prewarmKokoro();
  }
  let lastKokoroVoice = getVoiceSettings().kokoroVoice;
  onVoiceSettingsChange((s) => {
    if (!s.ttsEnabled) {
      clearQueueKeepCurrent();
      return;
    }
    // Player changed kokoroVoice mid-session — evict the old sticky
    // Arbiter voice so it doesn't leak memory. Without this, every
    // voice swap added ~100 MB to the pool and only disposePiperEngine
    // could clear it. Audit caught this as a CRITICAL finding.
    if (s.kokoroVoice !== lastKokoroVoice) {
      try { disposeStickyArbiterVoice(); } catch { /* ignore */ }
      lastKokoroVoice = s.kokoroVoice;
    }
    if (s.engine === 'bundled') {
      void prewarmKokoro();
    }
  });
}
