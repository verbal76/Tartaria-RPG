// OTA-351 — Qwen completion-crash guard. A native SIGSEGV inside llama.rn's
// completion() leaves the "completion in progress" breadcrumb behind; the next
// boot counts it, and after MAX_QWEN_COMPLETION_CRASHES Qwen is disabled
// (template narration), while the classifier (broad ML guard) stays enabled.
// arb127 — threshold RESTORED to 3 (OTA-457 had lowered it to 1). The breadcrumb
// can't tell a real SIGSEGV from a benign mid-generation app close, and at 1 a
// single benign close falsely benched the Arbiter repeatedly. With the OTA-559
// success-reset (a clean completion wipes the count), only CONSECUTIVE failures
// accumulate, so 3 cleanly separates a broken device from a healthy one.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KEY_IN_PROGRESS = 'tartaria.ml.qwenCompletionInProgress';
const KEY_QWEN_COUNT = 'tartaria.ml.qwenCompletionCrashCount';
const KEY_QWEN_DISABLED = 'tartaria.ml.qwenDisabledByCrash';

// mlHealth caches the first loadMLHealth() per module instance. Reset the module
// registry per test and require BOTH AsyncStorage and mlHealth from that same
// fresh registry so they share one in-memory store.
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

describe('Qwen completion-crash guard', () => {
  it('a clean completion leaves no breadcrumb and keeps Qwen enabled', async () => {
    const { AS, m } = await setup();
    await m.markQwenCompletionStart();
    expect(await AS.getItem(KEY_IN_PROGRESS)).not.toBeNull();
    await m.markQwenCompletionDone();
    expect(await AS.getItem(KEY_IN_PROGRESS)).toBeNull();
    expect(m.shouldAttemptQwen()).toBe(true);
  });

  it('a single surviving breadcrumb COUNTS but does NOT disable Qwen (arb127 threshold 3)', async () => {
    const { AS, m } = await setup({ [KEY_IN_PROGRESS]: new Date().toISOString() });
    expect(m.shouldAttemptQwen()).toBe(true);             // 1 < 3 → still enabled
    expect(await AS.getItem(KEY_IN_PROGRESS)).toBeNull();  // breadcrumb consumed
    expect(await AS.getItem(KEY_QWEN_COUNT)).toBe('1');
    expect(await AS.getItem(KEY_QWEN_DISABLED)).toBeNull();
  });

  it('THREE consecutive surviving breadcrumbs disable Qwen — classifier stays on (arb127 threshold 3)', async () => {
    // Each "boot" carries a surviving breadcrumb with no successful completion
    // between → the count accumulates 1 → 2 → 3 and trips on the third.
    const seed = { [KEY_QWEN_COUNT]: '2', [KEY_IN_PROGRESS]: new Date().toISOString() };
    const { AS, m } = await setup(seed);
    expect(m.shouldAttemptQwen()).toBe(false);            // 3rd crash hits the threshold
    expect(m.shouldAttemptMLInit()).toBe(true);           // classifier still on
    expect(await AS.getItem(KEY_QWEN_COUNT)).toBe('3');
    expect(await AS.getItem(KEY_QWEN_DISABLED)).toBe('true');
  });

  it('once disabled, markQwenCompletionStart is a no-op (no new breadcrumb)', async () => {
    const { AS, m } = await setup({ [KEY_QWEN_DISABLED]: 'true', [KEY_QWEN_COUNT]: '1' });
    expect(m.shouldAttemptQwen()).toBe(false);
    await m.markQwenCompletionStart();
    expect(await AS.getItem(KEY_IN_PROGRESS)).toBeNull();
  });

  it('resetMLHealth re-enables Qwen', async () => {
    const { m } = await setup({ [KEY_QWEN_DISABLED]: 'true', [KEY_QWEN_COUNT]: '1' });
    expect(m.shouldAttemptQwen()).toBe(false);
    await m.resetMLHealth();
    expect(m.shouldAttemptQwen()).toBe(true);
  });
});
