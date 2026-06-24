// engine_Dev — BACKGROUND TEARDOWN regression. Repro: a player backgrounded the
// app (heavy foreground app evicted it), got a text message, returned, tapped
// Main Quest → the process died to the home screen. Root cause: nothing listened
// to AppState, so the bundled neural TTS kept a live expo-av Sound + queue and
// the next spoken line on resume played into a disrupted native audio session
// (the OTA-413 SIGSEGV family). startTTSController now stops + clears the voice
// the instant the app leaves the foreground. This test pins that wiring.
//
// NOTE: jest hoists jest.mock() above imports and forbids the factory from
// closing over non-`mock`-prefixed locals — hence the mock* names below.

const mockStopAndClear = jest.fn();
const mockSpeak = jest.fn();
const mockRemoveSub = jest.fn();
// Capture the change handler the controller registers so the test can drive
// foreground/background transitions deterministically.
let mockAppStateHandler: ((s: string) => void) | null = null;

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_evt: string, cb: (s: string) => void) => {
      mockAppStateHandler = cb;
      return { remove: mockRemoveSub };
    },
  },
}));

// Stub the voice manager so we assert on the teardown call, not real audio.
jest.mock('../app/voice/TTSManager', () => ({ speak: mockSpeak, stopAndClear: mockStopAndClear }));

// Minimal store stub — a stable getState/subscribe so the controller binds
// without dragging the real gameStore (AsyncStorage + native chain) in.
jest.mock('../app/state/gameStore', () => ({
  useGameStore: {
    getState: () => ({ gameLog: [], partialArbiterText: null, appendLog: jest.fn() }),
    subscribe: () => () => {},
  },
}));

// Voice settings: TTS on, stable, no observers needed.
jest.mock('../app/voice/voiceSettings', () => ({
  getVoiceSettings: () => ({ ttsEnabled: true, engine: 'bundled', kokoroVoice: 'am_michael' }),
  onVoiceSettingsChange: () => () => {},
}));

// PiperTTSManager state observer — no-op; we never exercise the native engine.
jest.mock('../app/voice/PiperTTSManager', () => ({
  onKokoroStateChange: () => () => {},
  getKokoroErrorHistory: () => [],
}));

describe('engine_Dev — TTS tears down on background', () => {
  beforeEach(() => {
    mockAppStateHandler = null;
    mockStopAndClear.mockClear();
    mockRemoveSub.mockClear();
  });

  function load() {
    return require('../app/voice/TTSController') as typeof import('../app/voice/TTSController');
  }

  it('registers an AppState listener on start', () => {
    const c = load();
    c.startTTSController();
    expect(mockAppStateHandler).toBeInstanceOf(Function);
    c.stopTTSController();
  });

  it('stops + clears the voice when the app leaves the foreground', () => {
    const c = load();
    c.startTTSController();
    mockStopAndClear.mockClear(); // ignore any teardown during bind
    mockAppStateHandler!('background');
    expect(mockStopAndClear).toHaveBeenCalledTimes(1);
    c.stopTTSController();
  });

  it('does NOT re-stop on a background→inactive churn (already not foreground)', () => {
    const c = load();
    c.startTTSController();
    mockAppStateHandler!('background');
    mockStopAndClear.mockClear();
    mockAppStateHandler!('inactive'); // still not active — no second teardown
    expect(mockStopAndClear).not.toHaveBeenCalled();
    c.stopTTSController();
  });

  it('tears down again on the next background after returning to foreground', () => {
    const c = load();
    c.startTTSController();
    mockAppStateHandler!('background');
    mockAppStateHandler!('active');   // resumed
    mockStopAndClear.mockClear();
    mockAppStateHandler!('background'); // backgrounded again → teardown fires again
    expect(mockStopAndClear).toHaveBeenCalledTimes(1);
    c.stopTTSController();
  });

  it('removes the AppState listener on stop', () => {
    const c = load();
    c.startTTSController();
    c.stopTTSController();
    expect(mockRemoveSub).toHaveBeenCalled();
  });
});
