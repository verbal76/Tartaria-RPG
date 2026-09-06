// arb124 — the general ML-init crash guard false-positives whenever the OS kills
// the app mid model-load, so it inflated to 74 "crashes" on a device with ZERO
// real Qwen failures and permanently benched generative narration. Qwen now
// ignores the polluted general counter once the device has loaded the model at
// least once, and a successful init wipes the general suspicion outright.

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    // arb127 — deliberately NO multiRemove: the device's AsyncStorage silently
    // no-op'd it, so the clear functions must work with removeItem alone. This
    // mock omitting multiRemove is the regression guard for that.
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
    // ⚠⚠ PIN FLIPPED BY OTA-1704 — DELIBERATELY. arb124's exemption was
    // unbounded, and the owner's old iPhone rode it into the ground: one
    // success on 2026-08-23, eight failed boots after it, and the loader still
    // allocating ~400MB every session against its own "auto-disabled" record
    // until iOS killed the process. A past success now buys a bounded number of
    // failures (QWEN_FAILURES_AFTER_SUCCESS_CEILING), and 74 is far past it.
    // arb124's ACTUAL protection — a proven device riding OS-kill noise — is
    // still tested, by the case directly below and by ota1704.
    expect(g.qwen).toBe(false);
  });

  it('arb124 (bounded by OTA-1704) — a proven device under the ceiling still ignores the polluted counter', async () => {
    mockStore[K.crash] = '3'; // OS-kill noise, not real Qwen failures
    mockStore[K.disabled] = 'true';
    mockStore[K.succeeded] = '2026-06-10T22:38:19.323Z';
    const g = await bootAndGates();
    expect(g.mlInit).toBe(false); // general guard still disabled…
    expect(g.qwen).toBe(true);    // …and Qwen still overrides it, as arb124 intended
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

  it('one surviving foreground-crash breadcrumb disables Qwen (arb128 threshold 1)', async () => {
    // A real SVE SIGSEGV mid-generation leaves the breadcrumb; threshold 1 disables
    // fast so the player isn't crashed again next session.
    mockStore[K.qwenInProgress] = '2026-06-13T17:43:00.000Z';
    const g = await bootAndGates();
    expect(Number(mockStore[K.qwenCrash])).toBe(1);
    expect(mockStore[K.qwenDisabled]).toBe('true');
    expect(g.qwen).toBe(false);
  });

  it('arb128 — a clean completion does NOT reset the standing crash count (no masking)', async () => {
    // The OTA-559 success-reset was removed: an intermittently-crashing device must
    // not keep wiping its count and re-crashing forever.
    mockStore[K.qwenCrash] = '1';
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.loadMLHealth();
      await ml.markQwenCompletionDone();
    });
    expect(mockStore[K.qwenCrash]).toBe('1'); // unchanged
  });

  it('arb128 — at the perma ceiling Qwen stays disabled with no retry countdown', async () => {
    mockStore[K.qwenCrash] = '3';
    const g = await bootAndGates();
    expect(g.qwen).toBe(false);
    // No "auto-retry in N boots" — the device has given up (permanent until reset).
    expect(mockStore['tartaria.ml.qwenRetryPending']).toBeUndefined();
  });
});
