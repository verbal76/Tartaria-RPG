// OTA-464 — the voice (TTS) crash guard is DETECTION-ONLY. OTA-463 briefly wired an
// auto-disable (1 crash → fall back to the system device voice), but the
// breadcrumb-survives detection can't tell a real Kokoro SIGSEGV from a benign app
// termination (OTA reload mid-utterance, backgrounding, swipe-away), so it
// false-tripped on reload churn and forced a healthy Kokoro to the system voice.
// Reverted: voice crashes are counted + named for the diagnostic, but the bundled
// neural voice is NEVER auto-disabled — shouldAttemptBundledTTS() is always true,
// and any stale disable flag from OTA-463 self-heals on load.

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

describe('OTA-464 — voice (TTS) guard is detection-only (no auto-disable)', () => {
  it('a clean run keeps the bundled voice enabled', async () => {
    const { m } = await setup();
    expect(m.shouldAttemptBundledTTS()).toBe(true);
  });

  it('a surviving voice breadcrumb is COUNTED + NAMED but does NOT disable Kokoro', async () => {
    const { AS, m } = await setup({
      [KEY_TTS_IN_PROGRESS]: JSON.stringify({ label: 'kokoro:am_michael', at: new Date().toISOString() }),
    });
    // Still counted for diagnostics...
    expect(await AS.getItem(KEY_TTS_COUNT)).toBe('1');
    expect(await AS.getItem(KEY_TTS_IN_PROGRESS)).toBeNull(); // breadcrumb consumed
    expect(m.mlHealthSummary()).toMatch(/am_michael/);
    // ...but Kokoro stays ON and no disable flag is written.
    expect(m.shouldAttemptBundledTTS()).toBe(true);
    expect(await AS.getItem(KEY_TTS_DISABLED)).toBeNull();
    // And the summary must NOT claim a fallback to the system voice.
    expect(m.mlHealthSummary()).not.toMatch(/system device voice/i);
  });

  it('self-heals: a stale OTA-463 disable flag is cleared on load and Kokoro returns', async () => {
    const { AS, m } = await setup({ [KEY_TTS_DISABLED]: 'true', [KEY_TTS_COUNT]: '1' });
    expect(m.shouldAttemptBundledTTS()).toBe(true);
    expect(await AS.getItem(KEY_TTS_DISABLED)).toBeNull(); // cleared on load
  });
});
