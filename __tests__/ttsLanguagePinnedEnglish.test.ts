// OTA-487 regression — the system-TTS fallback must ALWAYS request English.
// The Speech.speak call used to omit `language`, so when no system voice was
// configured the OS read the English narration with the device's default-locale
// voice — which came out VIETNAMESE on at least one device. We now pin 'en-US'.

const mockSpeak = jest.fn();
jest.mock('expo-speech', () => ({
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: jest.fn(),
  getAvailableVoicesAsync: jest.fn(async () => []),
}));
jest.mock('../app/voice/voiceSettings', () => ({
  // Force the SYSTEM engine + no configured voice id — the exact shape that
  // produced the Vietnamese readout (voiceId null → OS default-locale voice).
  getVoiceSettings: () => ({
    ttsEnabled: true, engine: 'system', rate: 1, pitch: 1, volume: 1,
    voiceId: null, kokoroVoice: 'am_michael', sttEnabled: false, autoSubmit: false,
  }),
  loadVoiceSettings: jest.fn(async () => {}),
  onVoiceSettingsChange: jest.fn(() => () => {}),
}));
jest.mock('../app/voice/loreLexicon', () => ({ cleanForSpeech: (s: string) => s }));
jest.mock('../app/audio/AudioManager', () => ({ setMusicDuck: jest.fn() }));
jest.mock('../app/voice/PiperTTSManager', () => ({
  speak: jest.fn(),
  stopAndClear: jest.fn(),
  isSpeaking: () => false,
  isPiperAvailable: () => false,
  disposePiperEngine: jest.fn(),
  prewarmKokoro: jest.fn(),
  disposeStickyArbiterVoice: jest.fn(),
  getKokoroState: () => ({ phase: 'idle' }),
}));

import { speak } from '../app/voice/TTSManager';

describe('OTA-487 — system TTS is pinned to English', () => {
  beforeEach(() => { jest.useFakeTimers(); mockSpeak.mockClear(); });
  afterEach(() => { jest.useRealTimers(); });

  it('passes language: en-US to Speech.speak on the system path', () => {
    speak('The Arbiter watches you.', 'arbiter');
    jest.runOnlyPendingTimers(); // flush the coalesce timer → drain() → Speech.speak

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const [, opts] = mockSpeak.mock.calls[0] as [string, { language?: string }];
    expect(opts.language).toBe('en-US');
  });
});
