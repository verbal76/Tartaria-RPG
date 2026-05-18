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

interface QueuedUtterance {
  /** Monotonic id so callers can debounce / dedupe if needed. */
  id: number;
  text: string;
  /** Optional channel hint for the listener if it ever wants to vary
   *  rate / pitch per channel (combat lines could be faster, etc.).
   *  Not used in v1; reserved. */
  channel?: string;
}

let nextId = 1;
const queue: QueuedUtterance[] = [];
let currentlySpeaking: QueuedUtterance | null = null;
let availabilityCache: boolean | null = null;
let voicesCache: Speech.Voice[] | null = null;

/** Returns true if expo-speech can run on this device (i.e. there's
 *  at least one installed voice). Result is cached after the first
 *  call so the settings UI can render synchronously after init. */
export async function isTTSAvailable(): Promise<boolean> {
  if (availabilityCache !== null) return availabilityCache;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    voicesCache = voices;
    availabilityCache = voices.length > 0;
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

/** True if anything is in the queue or actively being spoken. */
export function isSpeaking(): boolean {
  return currentlySpeaking !== null || queue.length > 0;
}

/** Queue a line to be spoken. No-op if TTS is disabled in settings.
 *  Returns the queue id (useful for tests + future debug logging). */
export function speak(text: string, channel?: string): number {
  const settings = getVoiceSettings();
  if (!settings.ttsEnabled) return -1;
  const trimmed = text.trim();
  if (!trimmed) return -1;
  const id = nextId++;
  queue.push({ id, text: trimmed, channel });
  drain();
  return id;
}

/** Stop whatever's currently speaking + clear the queue entirely.
 *  Used by the SILENCE ARBITER button and the OFF settings toggle. */
export function stopAndClear(): void {
  queue.length = 0;
  currentlySpeaking = null;
  try { void Speech.stop(); } catch { /* ignore */ }
}

/** Keep the currently-speaking sentence, but drop everything queued
 *  behind it. Used on scene transitions so the player isn't 30
 *  seconds behind the visible scene. */
export function clearQueueKeepCurrent(): void {
  queue.length = 0;
}

/** Re-apply rate / pitch / voice from settings. Called after the
 *  player changes a slider in the Voice card. The currently-speaking
 *  utterance keeps its old settings (expo-speech doesn't let us
 *  modify mid-utterance), but the next item picks up the new values. */
export function applySettings(): void {
  // No-op on its own — settings are read at speak-time. This function
  // exists so the settings observer has a stable hook to call.
}

function drain(): void {
  if (currentlySpeaking) return;
  const next = queue.shift();
  if (!next) return;
  currentlySpeaking = next;
  const settings = getVoiceSettings();
  try {
    Speech.speak(next.text, {
      rate: settings.rate,
      pitch: settings.pitch,
      voice: settings.voiceId ?? undefined,
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
  onVoiceSettingsChange((s) => {
    if (!s.ttsEnabled) {
      // Finish the current sentence, drop everything queued behind it.
      // Per the plan: a hard mid-sentence cut feels worse than a 2s
      // tail. If the player wanted immediate silence they'd hit
      // SILENCE ARBITER which calls stopAndClear directly.
      clearQueueKeepCurrent();
    }
  });
}
