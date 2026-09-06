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
// OTA-985 — the count is scoped to the build that produced it, so a test about
// counting has to say WHICH build it is counting on.
const KEY_TTS_COUNT_BUILD = 'tartaria.ml.ttsCrashCountBuild';
const THIS_BUILD = (require('../app/buildInfo') as typeof import('../app/buildInfo')).OTA_BUILD_ID;

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

// ⚠ OTA-1707 — RE-ARMED AT TWO, AND EVERY ASSERTION BELOW STILL HOLDS. The
// bundled voice now steps aside after TWO voice crashes on the SAME build
// (mlHealth's MAX_TTS_CRASHES_BEFORE_DISABLE), because OTA-985 build-scoped the
// count and arb126 clears the crumb on backgrounding — two of the three false
// positives OTA-464 pulled the guard for. Every case in this describe uses ONE
// crash, which is exactly the noise 464 was protecting, so it is still `true`
// here and this file remains that protection's regression guard. The two-crash
// behaviour is pinned in ota1707TheVoiceStepsAside.
describe('OTA-464 — one voice crash never disables Kokoro (OTA-1707 acts at two)', () => {
  it('a clean run keeps the bundled voice enabled', async () => {
    const { m } = await setup();
    expect(m.shouldAttemptBundledTTS()).toBe(true);
  });

  it('a surviving voice breadcrumb is COUNTED + NAMED but does NOT disable Kokoro', async () => {
    const { AS, m } = await setup({
      // OTA-985 — on the SAME build the breadcrumb still counts; only a build CHANGE
      // forgives it (the reload that applies an OTA leaves this same crumb).
      [KEY_TTS_COUNT_BUILD]: THIS_BUILD,
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
