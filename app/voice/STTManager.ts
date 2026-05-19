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
  if (!lib.addListener) return;
  try {
    subs.push(
      lib.addListener('result', (e: { isFinal?: boolean; results?: Array<{ transcript?: string }> }) => {
        const text = e.results?.[0]?.transcript ?? '';
        if (text && onResultCb) onResultCb({ text, isFinal: !!e.isFinal });
      }),
    );
    subs.push(
      lib.addListener('error', (e: { message?: string; error?: string }) => {
        listening = false;
        const msg = e?.message || e?.error || 'Speech recognition failed.';
        if (onErrorCb) onErrorCb(msg);
      }),
    );
    subs.push(
      lib.addListener('end', () => {
        listening = false;
      }),
    );
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

  // Fail closed if the native module isn't installed. Previously a
  // call to a missing native method could hard-crash the app on
  // older APKs running new JS — now the player gets a clean message
  // and the input row stays alive.
  if (!lib.available || !lib.module) {
    onError(lib.loadError ?? 'Mic input is unavailable on this build.');
    return;
  }

  attachListeners();

  // Request mic + speech-recognition permissions on first use.
  try {
    const perm = await lib.module.requestPermissionsAsync();
    if (!perm?.granted) {
      onError('Microphone permission denied. Enable it in Settings → Apps.');
      return;
    }
  } catch (err) {
    // Some Android builds don't expose the helper; fall through and
    // let start() raise a clearer error if mic is actually blocked.
    const msg = err instanceof Error ? err.message : String(err);
    // Non-fatal — try start anyway.
    void msg;
  }

  if (listening) {
    try { lib.module.stop(); } catch { /* ignore */ }
  }
  try {
    lib.module.start({
      lang: locale,
      interimResults: true,
      maxAlternatives: 1,
      continuous: false,
      requiresOnDeviceRecognition: false,
      addsPunctuation: true,
    });
    listening = true;
  } catch (err) {
    listening = false;
    const msg = err instanceof Error ? err.message : 'Could not start microphone.';
    onError(msg);
    // Do NOT rethrow — the InputBox handler swallows, but throwing
    // can still propagate to the React render scheduler on some
    // Android setups and crash the bridge.
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
