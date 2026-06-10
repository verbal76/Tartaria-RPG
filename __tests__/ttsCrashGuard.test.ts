// OTA-463 — voice (TTS) crash guard auto-disable. A native SIGSEGV inside the
// bundled neural TTS (Kokoro) leaves the "tts in progress" breadcrumb behind; the
// next boot counts it, and after MAX_TTS_CRASHES_BEFORE_DISABLE (1) the bundled
// voice is disabled — the Arbiter falls back to the system device voice
// (expo-speech), which doesn't crash. A tester's Pixel 10 Pro XL diagnostic
// ("last voice: kokoro:am_michael", 3 crashes) confirmed voice was the culprit
// that the OTA-413 detection-only guard was waiting on.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KEY_TTS_IN_PROGRESS = 'tartaria.ml.ttsInProgress';
const KEY_TTS_COUNT = 'tartaria.ml.ttsCrashCount';
const KEY_TTS_DISABLED = 'tartaria.ml.ttsDisabledByCrash';

async function setup(seed: Record<string, string> = {}) {
  jest.resetModules();
  const ASmod = require('@react-native-async-storage/async-storage');
  const AS = ASmod.default ?? ASmod;
  await AS.clear();
  for (const [k, v] of Object.entries(seed)) await AS.setItem(k, v);
  const m = require('../app/diagnostics/mlHealth') as typeof import('../app/diagnostics/mlHealth');
  await m.loadMLHealth();
  return { AS, m };
}

describe('OTA-463 — voice (TTS) crash guard', () => {
  it('a clean run (no breadcrumb) keeps the bundled voice enabled', async () => {
    const { m } = await setup();
    expect(m.shouldAttemptBundledTTS()).toBe(true);
  });

  it('a surviving voice breadcrumb disables the bundled voice on next boot (threshold 1)', async () => {
    const { AS, m } = await setup({
      [KEY_TTS_IN_PROGRESS]: JSON.stringify({ label: 'kokoro:am_michael', at: new Date().toISOString() }),
    });
    expect(m.shouldAttemptBundledTTS()).toBe(false);
    expect(await AS.getItem(KEY_TTS_IN_PROGRESS)).toBeNull(); // breadcrumb consumed
    expect(await AS.getItem(KEY_TTS_COUNT)).toBe('1');
    expect(await AS.getItem(KEY_TTS_DISABLED)).toBe('true');
    // The summary names the device-voice fallback + the last bundled voice.
    expect(m.mlHealthSummary()).toMatch(/auto-disabled.*system device voice/i);
    expect(m.mlHealthSummary()).toMatch(/am_michael/);
  });

  it('stays disabled across a later clean boot (persisted flag, no breadcrumb)', async () => {
    const { m } = await setup({ [KEY_TTS_DISABLED]: 'true', [KEY_TTS_COUNT]: '1' });
    expect(m.shouldAttemptBundledTTS()).toBe(false);
  });

  it('resetMLHealth re-enables the bundled voice', async () => {
    const { m } = await setup({ [KEY_TTS_DISABLED]: 'true', [KEY_TTS_COUNT]: '1' });
    expect(m.shouldAttemptBundledTTS()).toBe(false);
    await m.resetMLHealth();
    expect(m.shouldAttemptBundledTTS()).toBe(true);
  });

  it('the voice guard is independent of Qwen (Qwen stays enabled)', async () => {
    const { m } = await setup({
      [KEY_TTS_IN_PROGRESS]: JSON.stringify({ label: 'kokoro:am_michael', at: new Date().toISOString() }),
    });
    expect(m.shouldAttemptBundledTTS()).toBe(false);
    expect(m.shouldAttemptQwen()).toBe(true);
  });
});
