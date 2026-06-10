// OTA-414 — Qwen completion-guard AUTO-RETRY with backoff. Once the guard
// disables Qwen after MAX completion crashes, it isn't permanent: after a
// cooldown (in cold boots) Qwen gets another attempt; a clean retry RECOVERS it,
// a crashing retry grows the cooldown.

// A shared in-memory AsyncStorage that survives jest.isolateModules so we can
// simulate a sequence of cold boots. (Must be `mock`-prefixed for jest's factory.)
const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    getItem: jest.fn(async (k: string) => (k in mockStore ? mockStore[k] : null)),
    removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
  },
}));

interface MLHealth {
  qwenDisabledByCrash: boolean;
  qwenCompletionCrashCount: number;
  qwenRetryingThisBoot: boolean;
  qwenRecoveredThisBoot: boolean;
  qwenNextRetryInBoots: number | null;
}

// One cold boot = a fresh module (so the in-module cache resets) reading the
// shared, persistent mockStore.
async function boot(): Promise<MLHealth> {
  let result: MLHealth | undefined;
  await jest.isolateModulesAsync(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ml = require('../app/diagnostics/mlHealth');
    result = (await ml.loadMLHealth()) as MLHealth;
  });
  return result!;
}

const K = {
  crash: 'tartaria.ml.qwenCompletionCrashCount',
  disabled: 'tartaria.ml.qwenDisabledByCrash',
  retryAt: 'tartaria.ml.qwenRetryAtBoot',
  pending: 'tartaria.ml.qwenRetryPending',
  backoff: 'tartaria.ml.qwenBackoffBoots',
  boot: 'tartaria.ml.bootCount',
  completionInProgress: 'tartaria.ml.qwenCompletionInProgress',
};

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
});

describe('OTA-414 — Qwen auto-retry / backoff', () => {
  it('schedules a retry when first seen disabled (cooldown in the future)', async () => {
    mockStore[K.crash] = '3';
    mockStore[K.disabled] = 'true';
    const h = await boot();
    expect(h.qwenDisabledByCrash).toBe(true);
    expect(h.qwenRetryingThisBoot).toBe(false);
    expect(h.qwenNextRetryInBoots).toBeGreaterThan(0);
    expect(mockStore[K.retryAt]).toBeDefined();
  });

  it('retries the boot the cooldown elapses (Qwen attempts again)', async () => {
    mockStore[K.crash] = '3';
    mockStore[K.disabled] = 'true';
    mockStore[K.backoff] = '5';
    mockStore[K.boot] = '5';
    mockStore[K.retryAt] = '6'; // bootCount becomes 6 → >= retryAt
    const h = await boot();
    expect(h.qwenRetryingThisBoot).toBe(true);
    expect(h.qwenDisabledByCrash).toBe(false); // attempts this session
    expect(mockStore[K.pending]).toBe('1'); // retry marked pending for next boot
  });

  it('RECOVERS when the retry survived a clean run (no completion crash)', async () => {
    mockStore[K.crash] = '3';
    mockStore[K.disabled] = 'true';
    mockStore[K.pending] = '1'; // last boot was a retry
    // no completionInProgress breadcrumb → the retry session didn't crash
    const h = await boot();
    expect(h.qwenRecoveredThisBoot).toBe(true);
    expect(h.qwenDisabledByCrash).toBe(false);
    expect(h.qwenCompletionCrashCount).toBe(0);
    expect(mockStore[K.disabled]).toBeUndefined(); // disable flag cleared
    expect(mockStore[K.pending]).toBeUndefined();
  });

  it('grows the backoff when the retry crashed again', async () => {
    mockStore[K.crash] = '3';
    mockStore[K.disabled] = 'true';
    mockStore[K.pending] = '1'; // last boot was a retry…
    mockStore[K.backoff] = '5';
    mockStore[K.boot] = '6';
    mockStore[K.completionInProgress] = new Date().toISOString(); // …and it crashed
    const h = await boot();
    expect(h.qwenDisabledByCrash).toBe(true); // stays disabled
    expect(h.qwenCompletionCrashCount).toBe(4); // crash counted
    expect(Number(mockStore[K.backoff])).toBe(10); // 5 → 10 (doubled)
    expect(mockStore[K.pending]).toBeUndefined(); // pending cleared
    expect(h.qwenNextRetryInBoots).toBeGreaterThan(0);
  });
});
