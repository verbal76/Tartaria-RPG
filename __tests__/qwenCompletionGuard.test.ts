// OTA-351 — Qwen completion-crash guard. A native SIGSEGV inside llama.rn's
// completion() leaves the "completion in progress" breadcrumb behind; the next
// boot counts it, and after MAX_QWEN_COMPLETION_CRASHES Qwen is disabled
// (template narration), while the classifier (broad ML guard) stays enabled.
// OTA-457 lowered that threshold 3 → 1: on the Pixel 10 Pro XL / Tensor G5 a
// completion SIGSEGV drops the whole app to the home screen, so one occurrence is
// enough signal to self-protect (OTA-414 auto-retry re-enables on clean boots).

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

  it('a single surviving breadcrumb disables Qwen on next boot — classifier stays on (OTA-457 threshold 1)', async () => {
    const { AS, m } = await setup({ [KEY_IN_PROGRESS]: new Date().toISOString() });
    expect(m.shouldAttemptQwen()).toBe(false);            // 1 crash hits the threshold
    expect(m.shouldAttemptMLInit()).toBe(true);           // classifier still on
    expect(await AS.getItem(KEY_IN_PROGRESS)).toBeNull();  // breadcrumb consumed
    expect(await AS.getItem(KEY_QWEN_COUNT)).toBe('1');
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
