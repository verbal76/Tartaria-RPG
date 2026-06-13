// arb124 — the general ML-init crash guard false-positives whenever the OS kills
// the app mid model-load, so it inflated to 74 "crashes" on a device with ZERO
// real Qwen failures and permanently benched generative narration. Qwen now
// ignores the polluted general counter once the device has loaded the model at
// least once, and a successful init wipes the general suspicion outright.

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    getItem: jest.fn(async (k: string) => (k in mockStore ? mockStore[k] : null)),
    removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
  },
}));

const K = {
  crash: 'tartaria.ml.crashCount',
  disabled: 'tartaria.ml.disabledByCrash',
  succeeded: 'tartaria.ml.lastInitSuccess',
  attempted: 'tartaria.ml.lastInitAttempt',
};

async function bootAndGates(): Promise<{ qwen: boolean; mlInit: boolean }> {
  let out: { qwen: boolean; mlInit: boolean } | undefined;
  await jest.isolateModulesAsync(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ml = require('../app/diagnostics/mlHealth');
    await ml.loadMLHealth();
    out = { qwen: ml.shouldAttemptQwen(), mlInit: ml.shouldAttemptMLInit() };
  });
  return out!;
}

beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; });

describe('arb124 — Qwen false-disable recovery', () => {
  it('re-enables Qwen despite a high general crash count when the device has EVER succeeded', async () => {
    mockStore[K.crash] = '74';
    mockStore[K.disabled] = 'true';
    mockStore[K.succeeded] = '2026-06-10T22:38:19.323Z'; // proved it can load the model
    const g = await bootAndGates();
    expect(g.mlInit).toBe(false); // general guard is still disabled…
    expect(g.qwen).toBe(true);    // …but Qwen no longer honors it (no real Qwen failure)
  });

  it('still benches Qwen when ML has NEVER succeeded (boot-resilience preserved)', async () => {
    mockStore[K.crash] = '3';
    mockStore[K.disabled] = 'true';
    // no lastInitSuccess → truly unproven device
    const g = await bootAndGates();
    expect(g.qwen).toBe(false);
  });

  it('a successful init wipes the general crash suspicion (self-heal)', async () => {
    mockStore[K.crash] = '74';
    mockStore[K.disabled] = 'true';
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.loadMLHealth();
      await ml.markMLInitSucceeded();
    });
    expect(mockStore[K.crash]).toBeUndefined();
    expect(mockStore[K.disabled]).toBeUndefined();
  });
});
