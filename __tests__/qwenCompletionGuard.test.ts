// OTA-351 — Qwen completion-crash guard. A native SIGSEGV inside llama.rn's
// completion() leaves the "completion in progress" breadcrumb behind; the next
// boot counts it, and after MAX_QWEN_COMPLETION_CRASHES Qwen is disabled
// (template narration), while the classifier (broad ML guard) stays enabled.
// arb128 — threshold is 1 (a real completion SIGSEGV is a hard, game-losing crash;
// OTA 557-561 proved this device genuinely crashes on generation), PLUS a perma
// give-up at QWEN_PERMA_DISABLE_AT (3) total crashes after which auto-retry stops
// and Qwen stays off until a manual Reset AI.

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

  it('a single surviving breadcrumb disables Qwen on next boot — classifier stays on (arb128 threshold 1)', async () => {
    const { AS, m } = await setup({ [KEY_IN_PROGRESS]: new Date().toISOString() });
    expect(m.shouldAttemptQwen()).toBe(false);            // 1 crash hits the threshold
    expect(m.shouldAttemptMLInit()).toBe(true);           // classifier still on
    expect(await AS.getItem(KEY_IN_PROGRESS)).toBeNull();  // breadcrumb consumed
    expect(await AS.getItem(KEY_QWEN_COUNT)).toBe('1');
    expect(await AS.getItem(KEY_QWEN_DISABLED)).toBe('true');
  });

  it('a standing count at/over the perma ceiling keeps Qwen off without a fresh breadcrumb (arb128)', async () => {
    // The disable flag was wrongly cleared (e.g. by the removed amnesty), but the
    // count alone (3 ≥ perma) must re-disable — and permanently.
    const { m } = await setup({ [KEY_QWEN_COUNT]: '3' });
    expect(m.shouldAttemptQwen()).toBe(false);
    expect(m.shouldAttemptMLInit()).toBe(true);           // classifier unaffected
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
