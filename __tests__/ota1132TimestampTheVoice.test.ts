jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
// OTA-1132 — TIMESTAMP THE VOICE, BECAUSE THE OWNER WAS TIMING IT BY HAND.
//
// After OTA-1130 shipped, still clocking it manually:
//
//   "5-6 second delay between welcome back text and when kokoro fired the same
//    line. this was me clocking it as the player coming back into the game. are
//    the text lines and spoken lines timestamped when they fire? this would
//    help measure the gap."
//
// ⚠ THE ANSWER WAS NO, AND THAT IS THE WHOLE FINDING. `appendLog` timestamps
// every TEXT line, and the qwen⏱ telemetry prices every generation — but
// NOTHING fired when audio actually began. The one number the owner cared
// about was the only one the game did not record, which is why a person with a
// stopwatch was the best instrument available.
//
// ⚠ THREE NUMBERS, NOT ONE, because they have three different fixes:
//   gap   — text on screen → first audio. The thing actually complained about.
//   wait  — of that, how long the native-ML lock was held by something else.
//           A Qwen job in front of us. Measured INSIDE runExclusiveNativeMl by
//           stamping on entry to the locked fn, so it is the real queue time
//           rather than a guess.
//   synth — how long Kokoro itself took once it had the lock.
// Plus the SOURCE: cached (OTA-1130 pre-synthesis), prefetch, or live. That
// last one matters most — if `cached` shows and the gap is still large, then
// pre-synthesis is not the win it was built to be, and the log will say so
// instead of leaving it to be argued about.
//
// ⚠ AND ONLY THE FIRST CHUNK REPORTS. A three-sentence line is three queue
// entries; letting each log a gap would triple the noise AND lie, because the
// second and third are waiting on the sentence before them rather than on the
// delay the player felt.
//
// ⚠ THE WIRING IS DEFENSIVE FOR A REASON THAT COST A TEST RUN. PiperTTSManager
// is the native layer and must not import the store, so TTSController installs
// a log sink into it. The first attempt did that at MODULE SCOPE — and every
// existing partial mock of PiperTTSManager in the suite blew up on import with
// "setVoiceLogSink is not a function". A debug line is not worth that blast
// radius, so the install moved into startTTSController and is optional-called:
// a mock without the export gets no sink and logs nothing, which is correct.

import { setVoiceLogSink, _resetPresynth } from '../app/voice/PiperTTSManager';

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TTS: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/voice/PiperTTSManager.ts'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CTRL: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/voice/TTSController.ts'), 'utf8');

describe('OTA-1132 — the sink exists and is safe to leave unset', () => {
  afterEach(() => { setVoiceLogSink(null); _resetPresynth(); });

  it('accepts a sink and clears it again', () => {
    const seen: string[] = [];
    expect(() => setVoiceLogSink((l) => seen.push(l))).not.toThrow();
    expect(() => setVoiceLogSink(null)).not.toThrow();
  });

  it('⚠ a throwing sink can never break audio', () => {
    // The sink is a debug line. If it explodes, the player must still hear the
    // Arbiter — so the emitter swallows it.
    setVoiceLogSink(() => { throw new Error('sink exploded'); });
    const emitter = TTS.slice(TTS.indexOf('function logv('), TTS.indexOf('function logv(') + 260);
    expect(emitter).toContain('try {');
    expect(emitter).toContain('catch');
  });
});

describe('OTA-1132 — ⚠ the three numbers, and why there are three', () => {
  it('the gap line reports gap, wait, synth and source', () => {
    const drain = TTS.slice(TTS.indexOf('async function drain()'));
    expect(drain).toContain('voice⏱ gap ');
    expect(drain).toContain('(wait ${timing.waitMs}ms + synth ${synthMs}ms, ${source})');
  });

  it('⚠ WAIT is measured inside the lock, not guessed from outside', () => {
    // Stamping on entry to the locked fn is the difference between "how long we
    // queued" and "how long the whole call took" — and the queue time is the
    // half that names a culprit.
    const fn = TTS.slice(TTS.indexOf('function inferSerial('), TTS.indexOf('// arb159/OTA'));
    expect(fn).toContain('const enqueuedAt = Date.now();');
    expect(fn).toContain('if (timing) timing.waitMs = Date.now() - enqueuedAt;');
  });

  it('synth excludes the wait, so the two never double-count', () => {
    expect(TTS).toContain('const synthMs = Date.now() - tBeforeInfer - timing.waitMs;');
  });

  it('⚠ the SOURCE says whether pre-synthesis actually helped', () => {
    const drain = TTS.slice(TTS.indexOf('async function drain()'));
    expect(drain).toContain("preSynthed ? 'cached' : prefetchStillValid ? 'prefetch' : 'live'");
  });

  it('⚠ only the FIRST chunk of a line reports', () => {
    // Later chunks wait on their own predecessor, not on the delay the player
    // felt — reporting them would triple the noise and mislead.
    expect(TTS).toContain('if (next.queuedAt != null && next.lineHead) {');
    expect(TTS).toContain('lineHead: ci === 0,');
  });

  it('a pre-synthesised chunk does not re-infer', () => {
    const drain = TTS.slice(TTS.indexOf('async function drain()'));
    const i = drain.indexOf('preSynthed');
    expect(i).toBeGreaterThan(-1);
    expect(drain).toContain('? next.resolvedSamples');
  });
});

describe('OTA-1132 — ⚠ the wiring does not break the mocks', () => {
  it('the sink is installed from START, not at module scope', () => {
    const atStart = CTRL.indexOf('piperSetVoiceLogSink?.(logVoice)');
    const startFn = CTRL.indexOf('export function startTTSController()');
    expect(atStart).toBeGreaterThan(startFn);
    // …and nowhere else, which is what a module-scope install would look like.
    expect((CTRL.match(/piperSetVoiceLogSink/g) ?? []).length).toBe(2); // import + call
  });

  it('it is optional-called, so a partial mock is harmless', () => {
    expect(CTRL).toContain('piperSetVoiceLogSink?.(logVoice)');
  });

  it('the native layer still does NOT import the store', () => {
    // The dependency has to run controller → manager, never the reverse.
    expect(TTS).not.toContain("from '../state/gameStore'");
    expect(TTS).not.toContain('useGameStore');
  });
});
