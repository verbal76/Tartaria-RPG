// Voice settings persistence + clamp + observer regression.
// Mirrors the audio-settings test pattern; uses an AsyncStorage mock.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => {
        store[k] = v;
        return Promise.resolve();
      }),
      removeItem: jest.fn((k: string) => {
        delete store[k];
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        Object.keys(store).forEach((k) => delete store[k]);
        return Promise.resolve();
      }),
      __store: store,
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

// Re-import the module fresh between tests so the in-memory cache resets.
function freshImport() {
  jest.resetModules();
  // Re-apply the AsyncStorage mock for the freshly required module.
  jest.doMock('@react-native-async-storage/async-storage', () => {
    const store: Record<string, string> = {};
    return {
      __esModule: true,
      default: {
        getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
        setItem: jest.fn((k: string, v: string) => {
          store[k] = v;
          return Promise.resolve();
        }),
      },
    };
  });
  return require('../app/voice/voiceSettings') as typeof import('../app/voice/voiceSettings');
}

describe('voiceSettings', () => {
  beforeEach(async () => {
    await (AsyncStorage as { clear?: () => Promise<void> }).clear?.();
  });

  it('defaults TTS ON + bundled engine on a fresh install (OTA 127+)', async () => {
    // Per playtest direction — voice is the default experience now.
    // STT stays OFF (it needs explicit consent for mic access).
    const mod = freshImport();
    const s = await mod.loadVoiceSettings();
    expect(s.ttsEnabled).toBe(true);
    expect(s.engine).toBe('bundled');
    expect(s.sttEnabled).toBe(false);
    expect(s.rate).toBe(1.2);
    expect(s.pitch).toBe(1.0);
    expect(s.voiceId).toBeNull();
    expect(s.kokoroVoice).toBe('am_michael');
    expect(s.autoSubmit).toBe(false);
  });

  it('persists and reloads settings', async () => {
    const mod = freshImport();
    await mod.loadVoiceSettings();
    await mod.setVoiceSettings({ ttsEnabled: true, rate: 1.2, voiceId: 'en-us-voice-1' });
    const next = mod.getVoiceSettings();
    expect(next.ttsEnabled).toBe(true);
    expect(next.rate).toBe(1.2);
    expect(next.voiceId).toBe('en-us-voice-1');
  });

  it('clamps rate to [0.5, 1.5]', async () => {
    const mod = freshImport();
    await mod.loadVoiceSettings();
    const hi = await mod.setVoiceSettings({ rate: 5 });
    expect(hi.rate).toBe(1.5);
    const lo = await mod.setVoiceSettings({ rate: 0.1 });
    expect(lo.rate).toBe(0.5);
  });

  it('clamps pitch to [0.5, 2.0]', async () => {
    const mod = freshImport();
    await mod.loadVoiceSettings();
    const hi = await mod.setVoiceSettings({ pitch: 10 });
    expect(hi.pitch).toBe(2.0);
    const lo = await mod.setVoiceSettings({ pitch: -1 });
    expect(lo.pitch).toBe(0.5);
  });

  it('notifies observers on change', async () => {
    const mod = freshImport();
    await mod.loadVoiceSettings();
    const seen: boolean[] = [];
    const unsub = mod.onVoiceSettingsChange((s) => seen.push(s.ttsEnabled));
    await mod.setVoiceSettings({ ttsEnabled: true });
    await mod.setVoiceSettings({ ttsEnabled: false });
    expect(seen).toEqual([true, false]);
    unsub();
  });
});
