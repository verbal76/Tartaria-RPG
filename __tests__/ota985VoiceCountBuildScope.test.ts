// OTA-985 — the voice-crash count describes a BUILD, not an install.
// Owner: "can we reset the crash counter to 0 for my install? those are a few
// hundred fixes ago." Their device read "2 voice crash(es) this install" — a
// number banked hundreds of OTAs back, still being reported as if it described
// the code running today. Worse, the counter is inflated by the very act of
// shipping fixes: OTA-464 pulled the voice auto-disable because the breadcrumb
// cannot tell a real Kokoro SIGSEGV from a benign termination, and an OTA reload
// mid-utterance IS a benign termination. So the count is stamped with its build
// and starts over when the build changes.
//
// SCOPE IS THE POINT: this forgives the voice counter ONLY. arb128 removed the
// OTA-560 blanket amnesty after it forgave a genuinely-incapable device and
// produced a crash-to-home loop. The Qwen + init guards gate real safety
// behaviour and keep their install-lifetime counts and their manual-only reset.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import * as fs from 'fs';
import * as path from 'path';

const KEY_TTS_IN_PROGRESS = 'tartaria.ml.ttsInProgress';
const KEY_TTS_COUNT = 'tartaria.ml.ttsCrashCount';
const KEY_TTS_COUNT_BUILD = 'tartaria.ml.ttsCrashCountBuild';
const KEY_QWEN_COUNT = 'tartaria.ml.qwenCompletionCrashCount';
const KEY_QWEN_DISABLED = 'tartaria.ml.qwenDisabledByCrash';
const KEY_CRASH_COUNT = 'tartaria.ml.crashCount';
const KEY_DISABLED = 'tartaria.ml.disabledByCrash';

const THIS_BUILD = (require('../app/buildInfo') as typeof import('../app/buildInfo')).OTA_BUILD_ID;
const crumb = (label: string) => JSON.stringify({ label, at: '2026-07-27T00:00:00.000Z' });

async function boot(seed: Record<string, string> = {}) {
  jest.resetModules();
  const ASmod = require('@react-native-async-storage/async-storage');
  const AS = ASmod.default ?? ASmod;
  await AS.clear();
  for (const [k, v] of Object.entries(seed)) await AS.setItem(k, v);
  const m = require('../app/diagnostics/mlHealth') as typeof import('../app/diagnostics/mlHealth');
  const state = await m.loadMLHealth();
  return { AS, m, state };
}

describe('OTA-985 — the voice crash count is scoped to its build', () => {
  it("THE OWNER'S CASE: a count banked under an older build re-zeros on this one", async () => {
    const { AS, m, state } = await boot({
      [KEY_TTS_COUNT]: '2',
      [KEY_TTS_COUNT_BUILD]: '2026-01-01-001-ancient-history',
    });
    expect(state.ttsCrashCount).toBe(0);
    expect(state.ttsCountResetThisBoot).toBe(true);
    // Durably gone, not just gone from memory.
    expect(await AS.getItem(KEY_TTS_COUNT)).toBeNull();
    expect(await AS.getItem(KEY_TTS_COUNT_BUILD)).toBe(THIS_BUILD);
    // And the diagnostic says a reset happened rather than quietly reading clean.
    expect(m.mlHealthSummary()).toMatch(/count reset/i);
    expect(m.mlHealthSummary()).not.toMatch(/2 voice crash/);
  });

  it('the OTA reload that delivered the fix is not counted as a crash', async () => {
    // Installing an OTA mid-utterance leaves exactly this breadcrumb behind. On a
    // build change it must NOT become "1 voice crash" — that is the inflation.
    const { AS, state } = await boot({
      [KEY_TTS_COUNT]: '2',
      [KEY_TTS_COUNT_BUILD]: '2026-01-01-001-ancient-history',
      [KEY_TTS_IN_PROGRESS]: crumb('kokoro:am_michael'),
    });
    expect(state.ttsCrashCount).toBe(0);
    expect(state.detectedTtsCrashThisBoot).toBe(false);
    expect(await AS.getItem(KEY_TTS_COUNT)).toBeNull();
    expect(await AS.getItem(KEY_TTS_IN_PROGRESS)).toBeNull();
  });

  it('a FRESH install stamps the build and starts clean', async () => {
    const { AS, state } = await boot();
    expect(state.ttsCrashCount).toBe(0);
    // Nothing was forgiven, so it does not claim a reset.
    expect(state.ttsCountResetThisBoot).toBe(false);
    expect(await AS.getItem(KEY_TTS_COUNT_BUILD)).toBe(THIS_BUILD);
  });

  it('WITHIN a build the counter still works — this is not a mute button', async () => {
    // Same build + a surviving breadcrumb = a real, attributable count.
    const { AS, m, state } = await boot({
      [KEY_TTS_COUNT_BUILD]: THIS_BUILD,
      [KEY_TTS_IN_PROGRESS]: crumb('kokoro:am_michael'),
    });
    expect(state.ttsCrashCount).toBe(1);
    expect(state.detectedTtsCrashThisBoot).toBe(true);
    expect(await AS.getItem(KEY_TTS_COUNT)).toBe('1');
    expect(m.mlHealthSummary()).toMatch(/am_michael/);
  });

  it('an existing same-build count is carried, not wiped', async () => {
    const { state } = await boot({ [KEY_TTS_COUNT]: '3', [KEY_TTS_COUNT_BUILD]: THIS_BUILD });
    expect(state.ttsCrashCount).toBe(3);
    expect(state.ttsCountResetThisBoot).toBe(false);
  });

  it('CATEGORY LOCK: a build change forgives the VOICE only — arb128 stands', async () => {
    // The same ancient-build seed that clears the voice count must leave the Qwen
    // completion guard and the ML-init guard exactly where they were. Forgiving
    // those is what OTA-560 did, and it re-enabled Qwen on a device that SIGSEGVs
    // on generation (crash-to-home loop). Never again automatically.
    const { AS, state } = await boot({
      [KEY_TTS_COUNT]: '2',
      [KEY_TTS_COUNT_BUILD]: '2026-01-01-001-ancient-history',
      [KEY_QWEN_COUNT]: '9',
      [KEY_QWEN_DISABLED]: 'true',
      [KEY_CRASH_COUNT]: '4',
      [KEY_DISABLED]: 'true',
    });
    expect(state.ttsCrashCount).toBe(0);            // voice: forgiven
    expect(state.qwenCompletionCrashCount).toBe(9); // Qwen: untouched
    expect(state.qwenDisabledByCrash).toBe(true);
    expect(state.crashCount).toBe(4);               // init: untouched
    expect(state.disabledByCrash).toBe(true);
    expect(await AS.getItem(KEY_QWEN_COUNT)).toBe('9');
    expect(await AS.getItem(KEY_CRASH_COUNT)).toBe('4');
  });

  it('the manual RESET AI path drops the stamp too, so the next load re-stamps', async () => {
    const { AS, m } = await boot({ [KEY_TTS_COUNT]: '2', [KEY_TTS_COUNT_BUILD]: THIS_BUILD });
    await m.resetMLHealth();
    expect(await AS.getItem(KEY_TTS_COUNT)).toBeNull();
    expect(await AS.getItem(KEY_TTS_COUNT_BUILD)).toBeNull();
  });

  it('source lock: the forgiveness is keyed on the build id and nothing else', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'diagnostics', 'mlHealth.ts'), 'utf8',
    );
    const open = 'if (ttsCountBuildStr !== OTA_BUILD_ID) {';
    expect(src).toContain(open);
    // The stale "this install" wording is retired — the number has a scope now.
    expect(src).not.toContain('voice crash(es) this install');
    // The forgiving block must touch TTS keys and NOTHING else. If someone ever
    // widens it to the Qwen or init guards, that is OTA-560 all over again
    // (amnesty → re-enabled Qwen on an incapable device → crash-to-home loop),
    // and this goes red before it reaches a device.
    const block = src.slice(src.indexOf(open), src.indexOf('let detectedTtsCrashThisBoot'));
    expect(block).toContain('KEY_TTS_CRASH_COUNT');
    for (const forbidden of ['KEY_QWEN_CRASH_COUNT', 'KEY_QWEN_DISABLED', 'KEY_CRASH_COUNT', 'KEY_DISABLED']) {
      expect(block).not.toContain(forbidden);
    }
  });
});
