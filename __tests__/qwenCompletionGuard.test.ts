// OTA-351 — Qwen completion-crash guard. A native SIGSEGV inside llama.rn's
// completion() leaves the "completion in progress" breadcrumb behind; the next
// boot counts it, and after MAX_QWEN_COMPLETION_CRASHES (3) Qwen is disabled
// (template narration), while the classifier (broad ML guard) stays enabled.

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

  it('a surviving breadcrumb counts as one completion crash on next boot', async () => {
    const { AS, m } = await setup({ [KEY_IN_PROGRESS]: new Date().toISOString() });
    expect(m.shouldAttemptQwen()).toBe(true);            // 1 crash < 3 threshold
    expect(await AS.getItem(KEY_IN_PROGRESS)).toBeNull(); // breadcrumb consumed
    expect(await AS.getItem(KEY_QWEN_COUNT)).toBe('1');
  });

  it('disables ONLY Qwen after 3 completion crashes — classifier stays on', async () => {
    const { AS, m } = await setup({ [KEY_QWEN_COUNT]: '2', [KEY_IN_PROGRESS]: new Date().toISOString() });
    expect(m.shouldAttemptQwen()).toBe(false);   // Qwen off
    expect(m.shouldAttemptMLInit()).toBe(true);  // classifier still on
    expect(await AS.getItem(KEY_QWEN_DISABLED)).toBe('true');
  });

  it('once disabled, markQwenCompletionStart is a no-op (no new breadcrumb)', async () => {
    const { AS, m } = await setup({ [KEY_QWEN_DISABLED]: 'true', [KEY_QWEN_COUNT]: '3' });
    expect(m.shouldAttemptQwen()).toBe(false);
    await m.markQwenCompletionStart();
    expect(await AS.getItem(KEY_IN_PROGRESS)).toBeNull();
  });

  it('resetMLHealth re-enables Qwen', async () => {
    const { m } = await setup({ [KEY_QWEN_DISABLED]: 'true', [KEY_QWEN_COUNT]: '3' });
    expect(m.shouldAttemptQwen()).toBe(false);
    await m.resetMLHealth();
    expect(m.shouldAttemptQwen()).toBe(true);
  });
});
