// STTManager — push-to-talk speech recognition.
//
// Backed by expo-speech-recognition, which is an Expo-native module
// that calls Android's built-in SpeechRecognizer (the same service
// Google Assistant uses for dictation). No bundled model — the OS
// already ships one.
//
// We previously wrapped @react-native-voice/voice, but that package
// is a classic NativeModule that does not register under the New
// Architecture (newArchEnabled: true in app.json), so its JS handle
// came back null at runtime and Voice.start() threw "Cannot read
// property 'startSpeech' of null". expo-speech-recognition is a
// TurboModule and works under New Arch.
//
// Permissions: RECORD_AUDIO is declared via the package's Expo config
// plugin in app.json. The first startListening() call triggers the
// platform's permission prompt; subsequent calls reuse the grant.

import {
  ExpoSpeechRecognitionModule,
  addSpeechRecognitionListener,
} from 'expo-speech-recognition';
import type { EventSubscription } from 'expo-modules-core';

export interface STTResult {
  /** Recognised transcript so far (best confidence). */
  text: string;
  /** True when this is the final result for the current session,
   *  false for in-progress partial results. */
  isFinal: boolean;
}

let listening = false;
let onResultCb: ((r: STTResult) => void) | null = null;
let onErrorCb: ((msg: string) => void) | null = null;
let subs: EventSubscription[] = [];

/** True if the device has a usable speech-recognition engine. */
export async function isSTTAvailable(): Promise<boolean> {
  try {
    // Synchronous probe — returns false if no Android RecognitionService
    // is installed (extremely rare; Google's service is on every device
    // that has Play Services).
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
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
  subs.push(
    addSpeechRecognitionListener('result', (e) => {
      // Pick the highest-confidence alternative; isFinal differentiates
      // streaming partials from the closing transcript.
      const text = e.results?.[0]?.transcript ?? '';
      if (text && onResultCb) onResultCb({ text, isFinal: e.isFinal });
    }),
  );
  subs.push(
    addSpeechRecognitionListener('error', (e) => {
      listening = false;
      const msg = e?.message || e?.error || 'Speech recognition failed.';
      if (onErrorCb) onErrorCb(msg);
    }),
  );
  subs.push(
    addSpeechRecognitionListener('end', () => {
      listening = false;
    }),
  );
}

/** Start a listening session. Pass callbacks for partial + final
 *  results and for errors. Resolves once the engine has started
 *  (or rejects with a reason). */
export async function startListening(
  onResult: (r: STTResult) => void,
  onError: (msg: string) => void,
  locale = 'en-US',
): Promise<void> {
  onResultCb = onResult;
  onErrorCb = onError;
  attachListeners();

  // Request mic + speech-recognition permissions on first use. The
  // settings toggle also requests RECORD_AUDIO via PermissionsAndroid,
  // but going through the package's own helper covers iOS too and is
  // a no-op when already granted.
  try {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      onError('Microphone permission denied. Enable it in Settings → Apps.');
      return;
    }
  } catch {
    // Some Android builds don't expose the helper; fall through and
    // let start() raise a clearer error if mic is actually blocked.
  }

  if (listening) {
    try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
  }
  try {
    ExpoSpeechRecognitionModule.start({
      lang: locale,
      interimResults: true,
      maxAlternatives: 1,
      continuous: false,
      // Prefer on-device when supported so the player isn't reliant on
      // a network round-trip. Falls back automatically on devices that
      // don't have an installed locale model.
      requiresOnDeviceRecognition: false,
      addsPunctuation: true,
    });
    listening = true;
  } catch (err) {
    listening = false;
    const msg = err instanceof Error ? err.message : 'Could not start microphone.';
    onError(msg);
    throw err;
  }
}

/** Stop the current listening session. Safe to call when not
 *  listening (no-op). */
export async function stopListening(): Promise<void> {
  if (!listening) return;
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    // ignore — the listener was likely already torn down
  } finally {
    listening = false;
  }
}

/** Tear down listeners + cancel any in-flight session. Used on
 *  STT-disabled settings toggle. */
export async function shutdownSTT(): Promise<void> {
  try { ExpoSpeechRecognitionModule.abort(); } catch { /* ignore */ }
  detachListeners();
  listening = false;
  onResultCb = null;
  onErrorCb = null;
}
