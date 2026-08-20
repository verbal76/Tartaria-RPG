// TTSManager — speaks game lines through the device's text-to-speech
// engine. On Android that's the installed TTS engine (Google TTS by
// default; quality scales from basic to Google Neural on Pixel-tier
// devices). Singleton + FIFO queue + cancel API mirrors AudioManager.
//
// All errors are swallowed — if the device has no TTS engine the
// availability check at init disables the toggle in settings; once
// disabled nothing here runs.

import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { getVoiceSettings, loadVoiceSettings, onVoiceSettingsChange } from './voiceSettings';
// Web/desktop Kokoro (ONNX via kokoro-js). On native this resolves to a no-op
// stub (kokoroWeb.ts); on web Metro resolves kokoroWeb.web.ts (the real engine).
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { speakWeb as kokoroSpeakWeb, stopWeb as kokoroStopWeb } from './kokoroWeb';
import { cleanForSpeech } from './loreLexicon';
import { setMusicDuck } from '../audio/AudioManager';
import {
  speak as piperSpeak,
  stopAndClear as piperStopAndClear,
  isSpeaking as piperIsSpeaking,
  isPiperAvailable,
  disposePiperEngine,
  prewarmKokoro,
  disposeStickyArbiterVoice,
  getKokoroState,
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
// arb68 diagnostic — last few TTS routing decisions, surfaced in COPY VOICE
// INFO so we can see which ENGINE actually voiced a given line (the title
// "Choose your character" clip is upstream of playback, so knowing the route
// — bundled Kokoro vs system expo-speech — pins down where the head is lost).
interface TtsRouteRecord { route: string; phase: string; textHead: string; at: number }
const ttsRouteLog: TtsRouteRecord[] = [];
function recordTtsRoute(route: string, phase: string, text: string): void {
  ttsRouteLog.unshift({ route, phase, textHead: text.slice(0, 40), at: Date.now() });
  if (ttsRouteLog.length > 6) ttsRouteLog.length = 6;
}
export function getTtsRouteLog(): readonly TtsRouteRecord[] {
  return ttsRouteLog;
}
// OTA-487 — ALWAYS pin the system-TTS language to English. The Arbiter's
// narration is English (the bundled voice is en_US-amy), but the system-engine
// fallback path (Speech.speak) never set a `language`, so when no system voice
// was configured (voiceId defaults to null) the OS read the English text with the
// device's DEFAULT-locale voice. On a device whose default TTS locale was
// Vietnamese, the narration came out in a Vietnamese voice (player report: "why
// did it speak Vietnamese to my daughter?"). Forcing 'en-US' makes the engine
// select an English voice/locale regardless of the device default. STT already
// pins en-US the same way (STTManager).
const TTS_LANGUAGE = 'en-US';

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

// arb5 — most queued Arbiter lines kept at once (see the cap in speak()).
// 3 leaves room for a short ack → prompt → follow-up sequence while
// still collapsing rapid-tap spam down to a few lines. drain() merges
// adjacent same-voice items, so these read as one natural utterance.
const MAX_QUEUED_ARBITER = 3;

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
export function speak(text: string, channel?: string, voiceId?: string | null, opts?: { front?: boolean }): number {
  const settings = getVoiceSettings();
  if (!settings.ttsEnabled) return -1;
  // Symbol cleanup before either engine — strips arrows so the player
  // doesn't hear "right arrow", rewrites "-N" as "negative N", etc.
  const trimmed = cleanForSpeech(text).trim();
  if (!trimmed) return -1;
  if (settings.engine === 'bundled') {
    // arb54 — DON'T go silent when the bundled voice failed to install.
    // If the Kokoro/Piper model is in an error state (e.g. the download
    // was aborted), fall through to the system engine below so the
    // Arbiter still narrates with the device voice. While it's still
    // downloading/loading/ready we use the bundled path as normal.
    // OTA-464 — REVERTED the OTA-463 voice auto-disable. The breadcrumb-survives
    // detection can't tell a real Kokoro SIGSEGV from a benign app termination
    // (OTA reload mid-utterance, OS backgrounding, user swipe-away), so a threshold
    // of 1 false-tripped on reload churn and dropped a perfectly healthy Kokoro to
    // the system voice. The bundled neural voice is now ALWAYS used (unless its
    // model genuinely failed to install — the original error-state fallthrough).
    if (getKokoroState().phase !== 'error') {
      // arb68 diagnostic — record which engine actually voiced this line so
      // COPY VOICE INFO can confirm the route. The title-line clip behaves
      // identically across Kokoro-playback OTAs, which only makes sense if the
      // loss is upstream of playback; this tells us bundled-vs-system per line.
      recordTtsRoute('bundled-kokoro', getKokoroState().phase, trimmed);
      // Kokoro can't switch voice per utterance (the voice is baked
      // Bundled engine now ALSO supports per-vendor voices via the
      // Kokoro voice pool (PiperTTSManager). Each vendor's assigned
      // voiceId triggers a lazy-load of that voice on first use, and
      // beginScene's warm hook keeps the latency invisible. Pool is
      // capped at 2 simultaneous voices (Arbiter sticky + 1 vendor
      // slot, LRU-evicted).
      if (Platform.OS === 'web') {
        // Web/desktop: native executorch Kokoro is stubbed, so route to the ONNX
        // (kokoro-js) engine instead. Fire-and-forget — it queues internally and
        // downloads the model on first use.
        kokoroSpeakWeb(trimmed, voiceId);
        return nextId++;
      }
      return piperSpeak(trimmed, voiceId, channel, opts);
    }
    // else: bundled install failed — fall through to the system queue.
    recordTtsRoute('system-fallback(kokoro-error)', getKokoroState().phase, trimmed);
  } else {
    recordTtsRoute('system-expo-speech', getKokoroState().phase, trimmed);
  }
  const id = nextId++;
  // OTA-635 — front: an urgent line (the welcome-back greeting) clears the queued
  // backlog so it's heard immediately. currentlySpeaking isn't in `queue`, so the
  // line in progress finishes its chunk (no jarring mid-word cut), then this plays.
  if (opts?.front) queue.length = 0;
  // OTA 226 + arb5 — Arbiter queue cap. Rapid-tapping a direction can
  // fire many flavor lines; without a bound the player gets lectured
  // for minutes. The original rule dropped EVERY queued arbiter line on
  // each new one, which also ate intentional short sequences — a pickup
  // acknowledgement immediately followed by the next beat's prompt — so
  // the first line was cut off (playtester report). Instead of nuking
  // the queue, cap it: keep at most MAX_QUEUED_ARBITER queued arbiter
  // lines (oldest dropped first). Short sequences survive; genuine spam
  // stays bounded. currentlySpeaking is never touched.
  if (channel === 'arbiter') {
    let arbCount = queue.reduce((n, q) => (q.channel === 'arbiter' ? n + 1 : n), 0);
    // We're about to push one more, so drop until there's room for it.
    while (arbCount >= MAX_QUEUED_ARBITER) {
      const idx = queue.findIndex((q) => q.channel === 'arbiter');
      if (idx === -1) break;
      queue.splice(idx, 1);
      arbCount--;
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
  void setMusicDuck(false);
  if (coalesceTimer != null) { clearTimeout(coalesceTimer); coalesceTimer = null; }
  try { void Speech.stop(); } catch { /* ignore */ }
  if (Platform.OS === 'web') { try { kokoroStopWeb(); } catch { /* ignore */ } }
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
  if (queue.length === 0) {
    // Nothing left to speak — restore music to full volume.
    void setMusicDuck(false);
    return;
  }
  // A line is about to play — duck the music under the voice.
  void setMusicDuck(true);
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
      // OTA-487 — force English so the system engine never falls back to the
      // device's default locale (which read the narration in Vietnamese on at
      // least one device). The narration is always English.
      language: TTS_LANGUAGE,
      rate: settings.rate,
      pitch: settings.pitch,
      // OTA-285 — master TTS volume. expo-speech honors `volume` on
      // iOS (0..1). Android's system TTS ignores it and uses the
      // device's media stream volume instead — settings UI surfaces
      // that with a one-liner note so Android testers know to use
      // hardware volume keys for system-engine playback.
      volume: settings.volume,
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
