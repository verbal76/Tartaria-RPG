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
    multiRemove: jest.fn(async (ks: string[]) => { for (const k of ks) delete mockStore[k]; }),
  },
}));

const K = {
  crash: 'tartaria.ml.crashCount',
  disabled: 'tartaria.ml.disabledByCrash',
  succeeded: 'tartaria.ml.lastInitSuccess',
  attempted: 'tartaria.ml.lastInitAttempt',
  qwenInProgress: 'tartaria.ml.qwenCompletionInProgress',
  qwenCrash: 'tartaria.ml.qwenCompletionCrashCount',
  qwenDisabled: 'tartaria.ml.qwenDisabledByCrash',
  ttsInProgress: 'tartaria.ml.ttsInProgress',
  ttsCrash: 'tartaria.ml.ttsCrashCount',
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

  it('does NOT re-count a phantom crash every boot — clears the stale attempted breadcrumb', async () => {
    // A stale "attempted (newer) without a matching success" = one detectable
    // crash. Before the fix it re-counted on EVERY boot (74 → 78 in the field).
    mockStore[K.attempted] = '2026-06-10T22:38:22.000Z';
    mockStore[K.succeeded] = '2026-06-10T22:38:19.000Z';
    mockStore[K.crash] = '5';
    await bootAndGates(); // boot 1: detect → crashCount 6, breadcrumb cleared
    expect(Number(mockStore[K.crash])).toBe(6);
    expect(mockStore[K.attempted]).toBeUndefined();
    await bootAndGates(); // boot 2: no breadcrumb → no phantom crash
    expect(Number(mockStore[K.crash])).toBe(6);
  });
});

describe('arb126 — completion/voice breadcrumb is not a benign-exit false positive', () => {
  it('clearInFlightBreadcrumbs wipes BOTH the Qwen-completion and TTS breadcrumbs', async () => {
    mockStore[K.qwenInProgress] = '2026-06-13T17:43:00.000Z';
    mockStore[K.ttsInProgress] = JSON.stringify({ label: 'kokoro:af_heart', at: '2026-06-13T17:43:00.000Z' });
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.clearInFlightBreadcrumbs();
    });
    expect(mockStore[K.qwenInProgress]).toBeUndefined();
    expect(mockStore[K.ttsInProgress]).toBeUndefined();
  });

  it('a backgrounded exit (breadcrumbs cleared) is NOT counted as a crash next boot', async () => {
    // Qwen loaded + ran a completion last session; then the user backgrounded the
    // app. The AppState handler calls clearInFlightBreadcrumbs → breadcrumbs gone.
    mockStore[K.qwenInProgress] = '2026-06-13T17:43:00.000Z';
    mockStore[K.ttsInProgress] = JSON.stringify({ label: 'kokoro:af_heart', at: '2026-06-13T17:43:00.000Z' });
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.clearInFlightBreadcrumbs(); // app goes to background
    });
    const before = mockStore[K.qwenCrash];
    await bootAndGates(); // next cold boot: nothing survived → nothing to count
    expect(mockStore[K.qwenCrash]).toBe(before); // still undefined / unchanged
    expect(mockStore[K.qwenDisabled]).toBeUndefined();
    expect(Number(mockStore[K.ttsCrash] ?? '0')).toBe(0);
  });

  it('a real FOREGROUND crash (breadcrumb survives) still trips the guard', async () => {
    // Process died mid-completion while foregrounded → no AppState background
    // event fired → breadcrumb survives → correctly counted + (threshold 1) disabled.
    mockStore[K.qwenInProgress] = '2026-06-13T17:43:00.000Z';
    await bootAndGates();
    expect(Number(mockStore[K.qwenCrash])).toBe(1);
    expect(mockStore[K.qwenDisabled]).toBe('true');
  });

  it('a clean completion wipes lingering completion-crash suspicion (self-heal)', async () => {
    mockStore[K.qwenCrash] = '1';
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.loadMLHealth();
      await ml.markQwenCompletionDone();
    });
    expect(mockStore[K.qwenCrash]).toBeUndefined();
  });

  it('healStaleGuardState forgives the false-positive disable ONCE, then loadMLHealth reads it enabled', async () => {
    // Device benched by the pre-fix detector: Qwen disabled + a phantom voice crash.
    mockStore[K.qwenDisabled] = 'true';
    mockStore[K.qwenCrash] = '1';
    mockStore[K.ttsCrash] = '1';
    mockStore['tartaria.ml.qwenRetryAtBoot'] = '99';
    let gates: { qwen: boolean } | undefined;
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.healStaleGuardState(); // boot amnesty runs BEFORE loadMLHealth
      await ml.loadMLHealth();
      gates = { qwen: ml.shouldAttemptQwen() };
    });
    expect(mockStore[K.qwenDisabled]).toBeUndefined();
    expect(mockStore[K.qwenCrash]).toBeUndefined();
    expect(mockStore[K.ttsCrash]).toBeUndefined();
    expect(mockStore['tartaria.ml.guardResetVersion']).toBe('arb126-benign-exit-amnesty');
    expect(gates!.qwen).toBe(true); // Arbiter back this very boot
  });

  it('healStaleGuardState is a no-op once already migrated (does not wipe a real later disable)', async () => {
    mockStore['tartaria.ml.guardResetVersion'] = 'arb126-benign-exit-amnesty';
    // A genuine disable accrued AFTER the amnesty (a real foreground crash).
    mockStore[K.qwenDisabled] = 'true';
    mockStore[K.qwenCrash] = '1';
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.healStaleGuardState();
    });
    expect(mockStore[K.qwenDisabled]).toBe('true'); // preserved — not re-forgiven
    expect(mockStore[K.qwenCrash]).toBe('1');
  });
});
