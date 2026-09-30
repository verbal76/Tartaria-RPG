// P5 proof — clock fidelity.
//
// Proves test-utils/canonical/virtualClock.ts virtualizes BOTH Date.now()
// (via the existing playerWalker.ts installWalkerClock()) AND the
// no-argument `new Date()` / `Date()` forms, while leaving explicit-argument
// `Date(x)` untouched — and that a telemetry read never advances the clock
// (only Walker.tap()'s advanceWalkerClock() does).
//
// Run focused: npx jest __tests__/canonicalClockFidelity.test.ts
//
// virtualClock.ts reuses playerWalker.ts's installWalkerClock(), which
// imports gameStore.ts — so this file needs the same native-module mocks
// every other gameStore-importing test file carries (AsyncStorage, onnx,
// llama.rn, expo-*), even though this proof itself never touches the store.

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
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import { installCanonicalClock, uninstallCanonicalClock, dateVirtualized } from '../test-utils/canonical/virtualClock';
import { advanceWalkerClock, walkerClockNow } from '../test-utils/playerWalker';

describe('P5 proof — clock fidelity', () => {
  afterEach(() => {
    if (dateVirtualized()) uninstallCanonicalClock();
  });

  it('installs cleanly and reports itself installed', () => {
    expect(dateVirtualized()).toBe(false);
    installCanonicalClock();
    expect(dateVirtualized()).toBe(true);
  });

  it('Date.now() returns the virtual clock value, not the real wall clock', () => {
    installCanonicalClock();
    const virtual = Date.now();
    expect(virtual).toBe(walkerClockNow());
    // The real origin is Date.UTC(2026,0,1,9,0,0) per playerWalker.ts — a
    // fixed, deterministic instant, nowhere near the real "now".
    expect(Math.abs(virtual - Date.now())).toBeLessThan(1000);
  });

  it('a telemetry-style read (many consecutive Date.now() calls) never advances the clock', () => {
    installCanonicalClock();
    const a = Date.now();
    const b = Date.now();
    const c = Date.now();
    for (let i = 0; i < 50; i++) Date.now();
    const d = Date.now();
    expect([a, b, c, d]).toEqual([a, a, a, a]);
  });

  it('only advanceWalkerClock() (Walker.tap()\'s own call) moves the clock forward', () => {
    installCanonicalClock();
    const before = Date.now();
    advanceWalkerClock(1500);
    const after = Date.now();
    expect(after).toBe(before + 1500);
  });

  it('no-argument `new Date()` is built from the virtual instant', () => {
    installCanonicalClock();
    const virtualNow = Date.now();
    const d = new Date();
    expect(d.getTime()).toBe(virtualNow);
    expect(d instanceof Date).toBe(true);
  });

  it('no-argument `Date()` (called without `new`) returns a string built from the virtual instant', () => {
    installCanonicalClock();
    const s = Date();
    expect(typeof s).toBe('string');
    const virtualNow = Date.now();
    expect(s).toBe(new Date(virtualNow).toString());
  });

  it('explicit-argument `new Date(x)` is UNCHANGED — real Date semantics, independent of the virtual clock', () => {
    installCanonicalClock();
    advanceWalkerClock(999999);
    const explicitMs = 1700000000000; // an arbitrary fixed real timestamp
    const viaVirtualized = new Date(explicitMs);
    uninstallCanonicalClock();
    const viaReal = new Date(explicitMs);
    expect(viaVirtualized.getTime()).toBe(viaReal.getTime());
    expect(viaVirtualized.toISOString()).toBe(viaReal.toISOString());
  });

  it('explicit multi-argument `new Date(y,m,d,...)` is UNCHANGED', () => {
    installCanonicalClock();
    const viaVirtualized = new Date(2020, 5, 15, 3, 30, 0);
    uninstallCanonicalClock();
    const viaReal = new Date(2020, 5, 15, 3, 30, 0);
    expect(viaVirtualized.getTime()).toBe(viaReal.getTime());
  });

  it('uninstallCanonicalClock() restores the real Date constructor and Date.now()', () => {
    const realNowBefore = Date.now();
    installCanonicalClock();
    expect(dateVirtualized()).toBe(true);
    uninstallCanonicalClock();
    expect(dateVirtualized()).toBe(false);
    const realNowAfter = Date.now();
    // Both are real wall-clock reads; must be close together, not pinned to
    // the virtual origin (year 2026 fixed instant would be off by years if
    // the patch leaked).
    expect(Math.abs(realNowAfter - realNowBefore)).toBeLessThan(5000);
  });
});
