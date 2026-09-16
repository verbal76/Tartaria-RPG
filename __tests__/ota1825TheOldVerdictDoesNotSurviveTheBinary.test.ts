// ⚠⚠⚠ THE API 36 TRANSITION AMNESTY — ONE FRESH ATTEMPT, ONCE, PER DEVICE.
//
// Play build 476 replaced the API 35 native architecture IN PLACE. The update
// keeps the data sandbox, so a device the OLD binary had benched woke on the NEW
// one still carrying the old binary's verdict. Measured on an SM-A146U:
// "auto-disabled after 3 failures, crashCount 3, classifier skipped, Qwen not
// initialized" — on a runtime whose fault had been fixed. RELOAD AI cleared it
// and the same device came up active / crashCount 0 / Qwen ready.
//
// ⚠ THIS IS AN ACCELERATOR, NOT A RESCUE. OTA-1705's ladder already benches for
// five cold boots then spends one trying again, so that device would have healed
// itself at boot 6. This grants the same single trial at boot 1. The tests below
// therefore spend most of their weight on what must NOT change: the thresholds,
// the counting, and everything outside `tartaria.ml.*`.

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    getItem: jest.fn(async (k: string) => (k in mockStore ? mockStore[k] : null)),
    removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
  },
}));

// ⚠ The gate reads the NATIVE versionName, so the test drives it directly rather
// than trusting a default — that is the whole point of the parameter.
jest.mock('expo-application', () => ({
  __esModule: true,
  nativeApplicationVersion: '2.5.0',
}));

const MARKER = 'tartaria.ml.resetMigration_2_5_0_done';
const K = {
  crash: 'tartaria.ml.crashCount',
  disabled: 'tartaria.ml.disabledByCrash',
  qwenCrash: 'tartaria.ml.qwenCompletionCrashCount',
  qwenDisabled: 'tartaria.ml.qwenDisabledByCrash',
  ttsDisabled: 'tartaria.ml.ttsDisabledByCrash',
  genBackoff: 'tartaria.ml.genBackoffBoots',
  attempted: 'tartaria.ml.lastInitAttempt',
  succeeded: 'tartaria.ml.lastInitSuccess',
  bootCount: 'tartaria.ml.bootCount',
};

/** Everything a player would lose if this migration were not surgical. None of
 *  it lives under `tartaria.ml.`, which is the invariant §5 asserts. */
const UNRELATED = {
  'tartaria.save.slot1': '{"player":"Verbal","hp":31}',
  'tartaria.activePlayer': 'Verbal',
  'tartaria.inventory': '["asgardar core","rope"]',
  'tartaria.quests': '{"red_tower":"in_progress"}',
  'tartaria.worldState': '{"day":412}',
  'tartaria.settings.voice': 'on',
  'tartaria.crashLedger': '[{"at":"2026-09-06T17:45:48Z"}]',
  'tartaria.models.qwen.downloaded': 'true',
  'tartaria.ota.lastApplied': '2026-09-15-1824',
  'tartaria.sentry.optIn': 'true',
  'tartaria.touchPath.lastBoot': '{"stages":[]}',
};

function seed(rec: Record<string, string>): void {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  Object.assign(mockStore, UNRELATED, rec);
}

async function withML<T>(fn: (ml: typeof import('../app/diagnostics/mlHealth')) => Promise<T>): Promise<T> {
  let out: T | undefined;
  await jest.isolateModulesAsync(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    out = await fn(require('../app/diagnostics/mlHealth'));
  });
  return out as T;
}

describe('OTA-1825 §1 — a legacy verdict is cleared once on 2.5.0', () => {
  it('⚠⚠ the SM-A146U case: disabled + 3 crashes clears, and the marker is written', async () => {
    seed({ [K.disabled]: 'true', [K.crash]: '3', [K.genBackoff]: '20' });
    const ran = await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'));

    expect(ran).toBe(true);
    expect(mockStore[K.disabled]).toBeUndefined();
    expect(mockStore[K.crash]).toBeUndefined();
    // the retry ladder goes with it — RELOAD AI's own scope, unchanged
    expect(mockStore[K.genBackoff]).toBeUndefined();
    expect(mockStore[MARKER]).toBeDefined();
  });

  it('clears the Qwen completion guard and the TTS guard, exactly as RELOAD AI does', async () => {
    seed({ [K.qwenDisabled]: 'true', [K.qwenCrash]: '2', [K.ttsDisabled]: 'true' });
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'))).toBe(true);
    expect(mockStore[K.qwenDisabled]).toBeUndefined();
    expect(mockStore[K.qwenCrash]).toBeUndefined();
    expect(mockStore[K.ttsDisabled]).toBeUndefined();
  });

  it('⚠ leaves lastInitAttempt / lastInitSuccess / bootCount alone — RELOAD AI does not clear them', async () => {
    seed({
      [K.disabled]: 'true',
      [K.attempted]: '2026-09-06T17:45:48Z',
      [K.succeeded]: '2026-09-05T10:00:00Z',
      [K.bootCount]: '87',
    });
    await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'));
    expect(mockStore[K.attempted]).toBe('2026-09-06T17:45:48Z');
    expect(mockStore[K.succeeded]).toBe('2026-09-05T10:00:00Z');
    expect(mockStore[K.bootCount]).toBe('87');
  });
});

describe('OTA-1825 §2 — a healthy device is not touched', () => {
  it('performs no reset, and reports that it did not', async () => {
    seed({ [K.attempted]: 'x', [K.succeeded]: 'y' });
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'))).toBe(false);
  });

  it('⚠⚠⚠ …but STILL writes the marker, which is the entire safety property', async () => {
    // Without this, a healthy device stays unmarked forever — and a REAL disable
    // earned months later under 476 would satisfy "disabled + unmarked" and be
    // wiped. The marker means "the transition check has run here", never "a
    // reset happened". §4 proves the consequence.
    seed({});
    await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'));
    expect(mockStore[MARKER]).toBeDefined();
  });

  it('a crashCount of 0 written out longhand is still healthy', async () => {
    seed({ [K.crash]: '0' });
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'))).toBe(false);
  });
});

describe('OTA-1825 §3 — it runs once, and only on the migrated binary', () => {
  it('a second boot does nothing even with the state still dirty', async () => {
    seed({ [K.disabled]: 'true', [K.crash]: '3' });
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'))).toBe(true);
    // a genuine 476-era failure lands after the migration
    mockStore[K.disabled] = 'true';
    mockStore[K.crash] = '2';
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'))).toBe(false);
    expect(mockStore[K.disabled]).toBe('true');
    expect(mockStore[K.crash]).toBe('2');
  });

  it('⚠ a 2.4.1 binary is refused AND left unmarked, so it stays eligible when it updates', async () => {
    seed({ [K.disabled]: 'true', [K.crash]: '3' });
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded('2.4.1'))).toBe(false);
    expect(mockStore[K.disabled]).toBe('true');
    expect(mockStore[MARKER]).toBeUndefined();
    // …and then it updates to 476
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'))).toBe(true);
    expect(mockStore[MARKER]).toBeDefined();
  });

  it('a null version (no native module) is refused rather than guessed', async () => {
    seed({ [K.disabled]: 'true' });
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded(null))).toBe(false);
    expect(mockStore[MARKER]).toBeUndefined();
  });

  it('2.5.1 is still the 2.5 runtime and is accepted', async () => {
    seed({ [K.disabled]: 'true' });
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.1'))).toBe(true);
  });

  it('⚠ 2.6.0 is NOT this migration — a later runtime gets its own decision', async () => {
    seed({ [K.disabled]: 'true' });
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded('2.6.0'))).toBe(false);
  });
});

describe('OTA-1825 §4 — the safety guard survives intact', () => {
  it('⚠⚠⚠ a genuine failure after the migration still disables at the SAME threshold', async () => {
    seed({ [K.disabled]: 'true', [K.crash]: '3' });
    await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'));
    expect(mockStore[K.crash]).toBeUndefined();
    expect(mockStore[K.disabled]).toBeUndefined();

    // ⚠ The real detector: a boot that ATTEMPTS init and dies before marking
    // success leaves the breadcrumb; the NEXT boot's loadMLHealth() reads it and
    // counts a crash. Each pass below is one cold boot — the migration is not
    // involved in any of them, which is exactly the point.
    for (let boot = 0; boot < 2; boot++) {
      await withML(async (ml) => { await ml.markMLInitAttempted(); });
      await withML(async (ml) => { await ml.loadMLHealth(); });
    }

    // MAX_CRASHES_BEFORE_DISABLE is 2 and this work did not move it.
    expect(Number.parseInt(mockStore[K.crash] ?? '0', 10)).toBeGreaterThanOrEqual(2);
    expect(mockStore[K.disabled]).toBe('true');

    // …and the device stays disabled: the amnesty was spent.
    expect(await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'))).toBe(false);
    expect(mockStore[K.disabled]).toBe('true');
  });

  it('the migration never clears the counter a second time, so counting is real', async () => {
    seed({ [K.disabled]: 'true', [K.crash]: '3' });
    await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'));
    mockStore[K.crash] = '1';
    await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'));
    expect(mockStore[K.crash]).toBe('1');
  });
});

describe('OTA-1825 §5 — nothing outside tartaria.ml.* is touched', () => {
  it('⚠⚠ saves, player, inventory, quests, world, settings, ledger, models, OTA, Sentry, telemetry all survive', async () => {
    seed({ [K.disabled]: 'true', [K.crash]: '3' });
    await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'));
    for (const [k, v] of Object.entries(UNRELATED)) {
      expect(mockStore[k]).toBe(v);
    }
  });

  it('⚠ every key the migration removed was under the tartaria.ml. prefix', async () => {
    seed({ [K.disabled]: 'true', [K.crash]: '3', [K.qwenCrash]: '2', [K.genBackoff]: '20' });
    const before = new Set(Object.keys(mockStore));
    await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'));
    const removed = [...before].filter((k) => !(k in mockStore));
    expect(removed.length).toBeGreaterThan(0);
    for (const k of removed) expect(k.startsWith('tartaria.ml.')).toBe(true);
  });
});

describe('OTA-1825 §6 — the manual button is unchanged', () => {
  it('resetMLHealth still clears the same state on its own, with no marker involved', async () => {
    seed({ [K.disabled]: 'true', [K.crash]: '3', [K.qwenDisabled]: 'true' });
    await withML((ml) => ml.resetMLHealth());
    expect(mockStore[K.disabled]).toBeUndefined();
    expect(mockStore[K.crash]).toBeUndefined();
    expect(mockStore[K.qwenDisabled]).toBeUndefined();
    // ⚠ the button does NOT write the migration marker — pressing it by hand
    // must never consume the one-time transition amnesty.
    expect(mockStore[MARKER]).toBeUndefined();
    for (const [k, v] of Object.entries(UNRELATED)) expect(mockStore[k]).toBe(v);
  });

  it('⚠ and it still works after the migration has already run', async () => {
    seed({ [K.disabled]: 'true' });
    await withML((ml) => ml.runMLResetMigrationIfNeeded('2.5.0'));
    mockStore[K.disabled] = 'true';
    mockStore[K.crash] = '2';
    await withML((ml) => ml.resetMLHealth());
    expect(mockStore[K.disabled]).toBeUndefined();
    expect(mockStore[K.crash]).toBeUndefined();
  });
});
