// STTManager — wraps @react-native-voice/voice for push-to-talk
// speech input. Used by the InputBox MIC and SILENCE ARBITER
// buttons. All errors are surfaced as plain strings to the caller
// so the InputBox can show an inline message.
//
// Permissions: RECORD_AUDIO is declared via the Voice config plugin
// in app.json. The first startListening() call triggers the
// platform's permission prompt; subsequent calls reuse the grant.

import Voice from '@react-native-voice/voice';

export interface STTResult {
  /** Final recognised transcript (best confidence). */
  text: string;
  /** True when this is the final result for the current session,
   *  false for in-progress partial results. */
  isFinal: boolean;
}

let listening = false;
let onResultCb: ((r: STTResult) => void) | null = null;
let onErrorCb: ((msg: string) => void) | null = null;
let listenerHandlesAttached = false;

/** True if the device has a usable speech-recognition engine. */
export async function isSTTAvailable(): Promise<boolean> {
  try {
    const ok = await Voice.isAvailable();
    // Voice.isAvailable() returns 1 / 0 on some platforms, boolean on others.
    return !!ok;
  } catch {
    return false;
  }
}

export function isListening(): boolean {
  return listening;
}

function attachListenersOnce(): void {
  if (listenerHandlesAttached) return;
  listenerHandlesAttached = true;
  Voice.onSpeechResults = (e) => {
    const text = (e.value && e.value[0]) ?? '';
    if (text && onResultCb) onResultCb({ text, isFinal: true });
  };
  Voice.onSpeechPartialResults = (e) => {
    const text = (e.value && e.value[0]) ?? '';
    if (text && onResultCb) onResultCb({ text, isFinal: false });
  };
  Voice.onSpeechEnd = () => {
    listening = false;
  };
  Voice.onSpeechError = (e) => {
    listening = false;
    const msg = e?.error?.message ?? 'Speech recognition failed.';
    if (onErrorCb) onErrorCb(msg);
  };
}

/** Start a listening session. Pass callbacks for partial + final
 *  results and for errors. Returns a Promise that resolves once the
 *  underlying engine has started (or rejects with a reason). */
export async function startListening(
  onResult: (r: STTResult) => void,
  onError: (msg: string) => void,
  locale = 'en-US',
): Promise<void> {
  attachListenersOnce();
  onResultCb = onResult;
  onErrorCb = onError;
  if (listening) {
    try { await Voice.stop(); } catch { /* ignore */ }
  }
  try {
    await Voice.start(locale);
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
    await Voice.stop();
  } catch {
    // ignore — the listener was likely already torn down
  } finally {
    listening = false;
  }
}

/** Tear down listeners + cancel any in-flight session. Used on
 *  STT-disabled settings toggle. */
export async function shutdownSTT(): Promise<void> {
  try { await Voice.destroy(); } catch { /* ignore */ }
  Voice.removeAllListeners();
  listening = false;
  listenerHandlesAttached = false;
  onResultCb = null;
  onErrorCb = null;
}
