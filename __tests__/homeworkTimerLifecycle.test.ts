/**
 * THE HOMEWORK SCHEDULER STOPS WHEN THE SUITE DOES.
 *
 * ⚠⚠⚠ THE DEFECT THIS PINS, PROVEN BEFORE IT WAS REPAIRED. The exact full-fast
 * Jest command reproduced `TypeError: _findWeaponByName2 is not a function`
 * thrown from equipment.ts inside a bare Node timer:
 *
 *     at heldShieldAc → equippedGearAc → standingAc → formatPlayerStats
 *     at buildLlmContext → maybeGenerateAmbientArbiter
 *     at homeworkTick (bootSlice) → Timeout.homeworkTickFn (gameStore)
 *     at listOnTimeout (node:internal/timers)   →   Node.js v22.22.2
 *
 * That last line is Node killing the WORKER, not Jest failing a test. It was
 * read as a production CommonJS/ESM interop defect; it is not. The module shape
 * is correct — `require('./crafting').findWeaponByName` is a function, and it is
 * identical to the top-level import — and ota1471TheGridHasToSettle, which wore
 * the blame once, passes 42/42 isolated AND passed on the very next full run
 * while the same crash still fired somewhere else. The attribution moves because
 * the crash belongs to whichever worker the dead timer lands in.
 *
 * The real fault is a LIFECYCLE one: `setHomeworkTick(fn)` arms a 5s interval at
 * module scope, `setHomeworkTick(null)` clears it, and nothing ever called the
 * second one. The interval outlived the suite that armed it, fired into a torn-
 * down environment, and re-entered app code whose registry was already gone.
 *
 * This suite pins BOTH halves: that the product's own disarm really disarms, and
 * that the harness now invokes it. It uses fake timers inside its own scope only
 * — the 5s cadence is the product's and is not changed here.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠ expo-file-system/legacy is the path production takes after the Expo 54
// move; the store reaches it through the same module, so it is mocked too.
jest.mock('expo-file-system/legacy', () => require('expo-file-system'));

import {
  setHomeworkTick,
  _homeworkInstalled,
  _homeworkTickForTest,
} from '../app/state/gameStore';

const HOMEWORK_INTERVAL_MS = 5_000;

describe('the homework scheduler arms and disarms through one door', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    setHomeworkTick(null);
    jest.useRealTimers();
  });

  it('arms a repeating tick at the product cadence', () => {
    const tick = jest.fn();
    const before = jest.getTimerCount();
    setHomeworkTick(tick);

    expect(_homeworkInstalled()).toBe(true);
    expect(jest.getTimerCount()).toBe(before + 1);

    jest.advanceTimersByTime(HOMEWORK_INTERVAL_MS);
    expect(tick).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(HOMEWORK_INTERVAL_MS * 3);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it('⚠⚠ setHomeworkTick(null) CLEARS THE HANDLE — not just the function', () => {
    const tick = jest.fn();
    const before = jest.getTimerCount();
    setHomeworkTick(tick);
    jest.advanceTimersByTime(HOMEWORK_INTERVAL_MS);
    expect(tick).toHaveBeenCalledTimes(1);

    setHomeworkTick(null);

    // The handle is gone, so there is nothing left to fire into a dead
    // environment. A disarm that only nulled the function would leave the
    // interval scheduled and this count one higher.
    expect(jest.getTimerCount()).toBe(before);
    expect(_homeworkInstalled()).toBe(false);

    jest.advanceTimersByTime(HOMEWORK_INTERVAL_MS * 10);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('a disarmed scheduler runs nothing even when the tick is driven by hand', () => {
    const tick = jest.fn();
    setHomeworkTick(tick);
    _homeworkTickForTest();
    expect(tick).toHaveBeenCalledTimes(1);

    setHomeworkTick(null);
    _homeworkTickForTest();
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('re-arming replaces the interval rather than stacking a second one', () => {
    const first = jest.fn();
    const second = jest.fn();
    const before = jest.getTimerCount();

    setHomeworkTick(first);
    setHomeworkTick(second);
    expect(jest.getTimerCount()).toBe(before + 1);

    jest.advanceTimersByTime(HOMEWORK_INTERVAL_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('the harness invokes that disarm when a suite ends', () => {
  const read = (f: string): string =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('node:path').join(__dirname, '..', f),
      'utf8',
    ) as string;
  const TEARDOWN = read('jest.teardown.js');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PKG = require('../package.json') as { jest?: { setupFilesAfterEnv?: string[] } };

  it('⚠⚠⚠ THE HOOK ACTUALLY REGISTERED — not merely written down', () => {
    // The first attempt at this repair put the afterAll in jest.setup.js, which
    // `setupFiles` loads BEFORE the test framework: `afterAll` was undefined
    // there and the hook was silently never registered, while a source-text pin
    // read green. This marker is set by the teardown file itself, in the real
    // environment, so that failure mode cannot pass again.
    expect(
      (globalThis as { __TARTARIA_HOMEWORK_TEARDOWN_REGISTERED__?: boolean })
        .__TARTARIA_HOMEWORK_TEARDOWN_REGISTERED__,
    ).toBe(true);
    expect(typeof afterAll).toBe('function');
  });

  it('it is wired through setupFilesAfterEnv, which is the only stage that works', () => {
    expect(PKG.jest?.setupFilesAfterEnv).toEqual(['<rootDir>/jest.teardown.js']);
  });

  it('and it calls the product’s own disarm', () => {
    expect(TEARDOWN).toMatch(/afterAll\(/);
    expect(TEARDOWN).toContain('setHomeworkTick(null)');
  });

  it('⚠ only for a suite that actually loaded the store', () => {
    // A blanket require in teardown would make all ~1300 suites load a
    // 22k-line module they never used. The gate is require.cache, which is
    // per-suite under this runtime.
    expect(TEARDOWN).toContain('require.cache');
    expect(TEARDOWN).toContain('/app/state/gameStore.ts');
  });

  it('⚠⚠ the harness does not reach for a blunter instrument', () => {
    // Not a fix: faking timers globally, clearing every outstanding handle,
    // or swallowing the worker's exception. Each would hide the next late
    // timer instead of stopping this one.
    expect(TEARDOWN).not.toMatch(/useFakeTimers|clearAllTimers|enableGlobally/);
    expect(TEARDOWN).not.toMatch(/unhandledRejection|uncaughtException/);
  });
});
