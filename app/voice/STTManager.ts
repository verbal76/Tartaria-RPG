// STTManager — push-to-talk speech recognition.
//
// Backed by expo-speech-recognition, which is an Expo-native module
// that calls Android's built-in SpeechRecognizer. The previous
// implementation used a STATIC `import { ExpoSpeechRecognitionModule
// } from 'expo-speech-recognition'`, which is fine when the native
// side is installed — but a player running an OLDER APK (one built
// before the swap from @react-native-voice/voice) gets the new JS
// bundle via OTA on top of native code that doesn't have
// expo-speech-recognition. Calling a method on the missing native
// bridge can hard-crash the React Native process (drops to the
// phone's home screen).
//
// Fix: lazy + defensive require. If the module isn't present, every
// public function fails CLOSED with an arbiter-style error message
// — the app never tries to invoke a null native method.

import type { EventSubscription } from 'expo-modules-core';
import { getGameTitle } from '../engine/contentPack';

export interface STTResult {
  /** Recognised transcript so far (best confidence). */
  text: string;
  /** True when this is the final result for the current session,
   *  false for in-progress partial results. */
  isFinal: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecognitionModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AddListener = (eventName: string, listener: (e: any) => void) => EventSubscription;

interface ExpoSpeechRecognition {
  module: RecognitionModule | null;
  addListener: AddListener | null;
  available: boolean;
  loadError: string | null;
}

// Resolve the package lazily. Catching require errors here means an
// older APK (no native module) can still load this JS file without
// blowing up — public functions then return clean errors.
const lib: ExpoSpeechRecognition = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('expo-speech-recognition');
    const m = pkg?.ExpoSpeechRecognitionModule;
    const al = pkg?.addSpeechRecognitionListener;
    // Sanity-check the shape — start / stop / abort must exist as
    // functions before we'll route player input through this module.
    const looksOk = m && typeof m.start === 'function' && typeof m.stop === 'function';
    return {
      module: looksOk ? m : null,
      addListener: looksOk && typeof al === 'function' ? al : null,
      available: !!looksOk,
      loadError: looksOk ? null : 'expo-speech-recognition native module not detected on this device. The APK may pre-date the STT swap — install the latest APK from the Play Store / GitHub release to enable mic input.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      module: null,
      addListener: null,
      available: false,
      loadError: `Failed to load expo-speech-recognition: ${msg}. Install the latest APK to enable mic input.`,
    };
  }
})();

let listening = false;
let onResultCb: ((r: STTResult) => void) | null = null;
let onErrorCb: ((msg: string) => void) | null = null;
let subs: EventSubscription[] = [];

// Optional diagnostics callback. Wired by the game store on init so STT
// events land in the on-disk game log (and the on-screen feed via the
// system channel). Without this the recognizer can fail silently in
// half a dozen ways — no permission, no-speech timeout, network-only
// service, etc. — and the player just sees nothing change.
let onDiag: ((channel: 'system' | 'debug', line: string) => void) | null = null;
export function setSTTDiag(cb: ((channel: 'system' | 'debug', line: string) => void) | null): void {
  onDiag = cb;
}
// OTA 025 — debug-channel STT noise was flooding the on-disk log:
// every voice session emitted ~14 setup lines + one per partial
// transcript (30+ per spoken sentence). A single feedback note
// dictation produced 50-100 entries; the playtester reported a
// 51 KB log two locations from spawn, almost all of it STT chatter.
// Suppress every debug-channel line by default. System-channel
// lines (user-visible mic errors / hints) still flow. Flip this
// switch to true for one session if you need the firehose back.
const VERBOSE_STT_DEBUG = false;
function diag(channel: 'system' | 'debug', line: string): void {
  if (channel === 'debug' && !VERBOSE_STT_DEBUG) return;
  try { onDiag?.(channel, line); } catch { /* ignore */ }
}

/** True if the device has a usable speech-recognition engine. */
export async function isSTTAvailable(): Promise<boolean> {
  if (!lib.available || !lib.module) return false;
  try {
    return !!lib.module.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export function isListening(): boolean {
  return listening;
}

function detachListeners(): void {
  for (const s of subs) {
    try { s.remove(); } catch { /* ignore */ }
  }
  subs = [];
}

function attachListeners(): void {
  detachListeners();
  if (!lib.module) return;
  // Call addListener THROUGH the module so `this` binds correctly.
  // The standalone `addSpeechRecognitionListener` export is just a
  // reference to module.addListener — when called free-standing,
  // `this` is undefined and some Expo versions throw silently in
  // that path.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const add = (eventName: string, listener: (e: any) => void) =>
    lib.module.addListener(eventName, listener);
  try {
    // result — partial + final transcripts. Log every result with a
    // tiny prefix so the playtest log shows whether the recognizer is
    // actually capturing words. Empty transcripts get logged too so we
    // can tell "engine fired result event with nothing" apart from
    // "engine never fired."
    subs.push(
      add('result', (e: { isFinal?: boolean; results?: Array<{ transcript?: string }> }) => {
        const text = e.results?.[0]?.transcript ?? '';
        const final = !!e.isFinal;
        diag('debug', `stt: result final=${final} text="${text}"`);
        if (text && onResultCb) onResultCb({ text, isFinal: final });
      }),
    );
    subs.push(
      add('error', (e: { message?: string; error?: string }) => {
        listening = false;
        const code = e?.error || 'unknown';
        const msg = e?.message || code;
        diag('debug', `stt: error code=${code} msg="${msg}"`);
        // Show ONLY actionable errors in the player-visible feed.
        // "no-speech" and "aborted" happen normally (user paused too
        // long, or tapped mic again to cancel) — surfacing those would
        // be noise.
        if (code !== 'no-speech' && code !== 'aborted') {
          const hint =
            code === 'not-allowed' || code === 'service-not-allowed'
              ? ` — open Android Settings → Apps → ${getGameTitle()} → Permissions and enable Microphone.`
              : code === 'network'
                ? ' — the speech engine needs network. Try again with mobile data or wifi on.'
                : code === 'language-not-supported'
                  ? ' — your device does not have offline speech for this language.'
                  : '';
          diag('system', `Mic: ${msg}${hint}`);
        }
        if (onErrorCb) onErrorCb(msg);
      }),
    );
    subs.push(
      add('end', () => {
        listening = false;
        diag('debug', 'stt: end (session closed)');
      }),
    );
    // Lifecycle events — these tell us whether the recognizer ever
    // even opened the mic. If we see start but never speechstart, the
    // mic is hot but no audio is coming in (gain too low, hardware
    // muted, etc.). If we see speechstart but never result, the engine
    // is hearing audio but not turning it into words (locale wrong,
    // recognizer service crashed, etc.).
    subs.push(add('start', () => diag('debug', 'stt: started')));
    subs.push(add('speechstart', () => diag('debug', 'stt: speechstart (audio detected)')));
    subs.push(add('speechend', () => diag('debug', 'stt: speechend')));
    subs.push(add('audiostart', () => diag('debug', 'stt: audiostart')));
    subs.push(add('audioend', () => diag('debug', 'stt: audioend')));
    subs.push(add('nomatch', () => {
      diag('debug', 'stt: nomatch (engine heard you but could not turn it into words)');
      diag('system', 'Mic: heard you but could not transcribe. Try speaking more clearly or check your device locale.');
    }));
  } catch (err) {
    // If addListener itself blows up, swallow it — we still want the
    // start path to surface a clean error rather than crash the app.
    const msg = err instanceof Error ? err.message : String(err);
    if (onErrorCb) onErrorCb(`STT listener wiring failed: ${msg}`);
  }
}

/** Start a listening session. Pass callbacks for partial + final
 *  results and for errors. Resolves once the engine has started
 *  (or surfaces a reason via onError). */
export async function startListening(
  onResult: (r: STTResult) => void,
  onError: (msg: string) => void,
  locale = 'en-US',
): Promise<void> {
  onResultCb = onResult;
  onErrorCb = onError;

  // Fail closed if the native module isn't installed.
  if (!lib.available || !lib.module) {
    diag('system', `Mic: ${lib.loadError ?? 'unavailable'}`);
    onError(lib.loadError ?? 'Mic input is unavailable on this build.');
    return;
  }

  // Availability check — does the device actually have a speech
  // recognition service installed? Some Android builds (especially
  // GMS-less ROMs) ship without one. Log + bail instead of starting
  // into a hung mic.
  try {
    const ok = !!lib.module.isRecognitionAvailable();
    diag('debug', `stt: isRecognitionAvailable=${ok}`);
    if (!ok) {
      diag('system', 'Mic: no speech-recognition service on this device. Install Google app from Play Store.');
      onError('No speech recognition service installed.');
      return;
    }
  } catch (err) {
    diag('debug', `stt: availability check threw ${err instanceof Error ? err.message : String(err)}`);
  }

  attachListeners();

  // Permission gate. Check current state first — if previously denied,
  // requestPermissionsAsync will NOT re-prompt (Android holds the
  // decision until the player flips it manually in Settings).
  try {
    const cur = await lib.module.getPermissionsAsync();
    diag('debug', `stt: getPermissions granted=${cur?.granted} canAskAgain=${cur?.canAskAgain}`);
    if (!cur?.granted) {
      if (cur?.canAskAgain === false) {
        diag('system', `Mic: permission was denied earlier. Open Android Settings → Apps → ${getGameTitle()} → Permissions → Microphone and turn it on.`);
        onError('Mic permission denied. Enable in Settings.');
        return;
      }
      const perm = await lib.module.requestPermissionsAsync();
      diag('debug', `stt: requestPermissions granted=${perm?.granted}`);
      if (!perm?.granted) {
        diag('system', 'Mic: permission denied. Tap mic again to retry, or enable in Settings.');
        onError('Mic permission denied.');
        return;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diag('debug', `stt: permission helper threw ${msg}`);
    // Fall through — let start() raise a clearer error if mic is blocked.
  }

  if (listening) {
    try { lib.module.stop(); } catch { /* ignore */ }
  }
  // continuous=true and addsPunctuation=true are BOTH Android 13+ only.
  // OTA 105 set continuous=true and the native module silently swallowed
  // the start request on a device running Android 12 — log showed
  // `stt: start lang=en-US interim=true continuous=true` followed by
  // dead silence, no `started`, no `error`, no events of any kind.
  // Going back to safe defaults that work everywhere, even at the cost
  // of the recognizer giving up after a brief pause.
  //
  // Log available services + the system default so we can see which
  // recognizer the player's device actually uses. Then pick one
  // explicitly — the module's default behavior assumes
  // com.google.android.googlequicksearchbox (Google Search app), but
  // Pixels and many modern Android builds use com.google.android.as
  // (Android System Intelligence) instead. If start() falls back to
  // the missing default package, it succeeds but binds to nothing
  // and never fires any event (the exact failure mode from playtest
  // log OTA 106).
  let services: string[] | null = null;
  let defaultService: string | null = null;
  try {
    services = typeof lib.module.getSpeechRecognitionServices === 'function'
      ? lib.module.getSpeechRecognitionServices()
      : null;
    diag('debug', `stt: services=${JSON.stringify(services)}`);
  } catch (err) {
    diag('debug', `stt: services lookup threw ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    defaultService = typeof lib.module.getDefaultRecognitionService === 'function'
      ? lib.module.getDefaultRecognitionService()?.packageName ?? null
      : null;
    diag('debug', `stt: defaultService=${defaultService}`);
  } catch (err) {
    diag('debug', `stt: defaultService lookup threw ${err instanceof Error ? err.message : String(err)}`);
  }
  // Preference order: system default → Android System Intelligence
  // (Pixel) → Google Search box (most other Androids) → first
  // available recognition service that isn't a TTS-only package.
  const RECOGNITION_PREFS = [
    defaultService,
    'com.google.android.as',
    'com.google.android.googlequicksearchbox',
  ].filter((s): s is string => !!s);
  // Filter the available services to drop anything that is plainly
  // not a recognizer (TTS engines, third-party apps that registered
  // themselves but don't actually serve RECOGNIZE_SPEECH).
  const recognizers = (services ?? []).filter(
    (s) => !s.includes('.tts') && !s.includes('anthropic') && !s.includes('whisper'),
  );
  const chosenService =
    RECOGNITION_PREFS.find((s) => recognizers.includes(s)) ??
    recognizers[0] ??
    null;
  diag('debug', `stt: chosenService=${chosenService ?? '(module default)'}`);
  diag('debug', `stt: start lang=${locale} interim=true continuous=false`);
  try {
    const startOptions: Record<string, unknown> = {
      lang: locale,
      interimResults: true,
      maxAlternatives: 1,
      continuous: false,
      requiresOnDeviceRecognition: false,
      addsPunctuation: false,
    };
    if (chosenService) startOptions.androidRecognitionServicePackage = chosenService;
    lib.module.start(startOptions);
    listening = true;
  } catch (err) {
    listening = false;
    const msg = err instanceof Error ? err.message : 'Could not start microphone.';
    diag('debug', `stt: start threw ${msg}`);
    diag('system', `Mic: could not start — ${msg}`);
    onError(msg);
    // Do NOT rethrow.
  }
}

/** Stop the current listening session. Safe to call when not
 *  listening (no-op). */
export async function stopListening(): Promise<void> {
  if (!listening) return;
  if (!lib.module) {
    listening = false;
    return;
  }
  try {
    lib.module.stop();
  } catch {
    // ignore — the listener was likely already torn down
  } finally {
    listening = false;
  }
}

/** Tear down listeners + cancel any in-flight session. Used on
 *  STT-disabled settings toggle. */
export async function shutdownSTT(): Promise<void> {
  if (lib.module) {
    try { lib.module.abort(); } catch { /* ignore */ }
  }
  detachListeners();
  listening = false;
  onResultCb = null;
  onErrorCb = null;
}
