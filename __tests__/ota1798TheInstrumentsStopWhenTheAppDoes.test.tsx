// ⚠⚠⚠ OTA-1798 — THE INSTRUMENTS STOP WHEN THE APP DOES.
//
// Owner ruling: "OTA-1743/runtimePressureWatch: Repair next as its own package.
// Proven lifecycle/test-isolation defect. Do not associate it with the SE
// freeze without evidence." App's boot effect reaches bootQwen through the
// hydrate chain; bootQwen starts the Qwen watchdog and the runtime-pressure
// watch — a rescheduling sample timer, a requestAnimationFrame frame clock and
// two AppState subscriptions — and nothing on the unmount side stopped either.
// startQwenWatchdog had no stop at all. Measured under jest (RN's rAF is a 16ms
// setTimeout): ~11,000 "environment has been torn down" firings per full
// surface run from the one suite that renders App. This suite holds the
// lifecycle, not a theory about the phone.

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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
/* ⚠⚠ App.tsx's boot installs the crash transport, which `require`s the native
 * Sentry SDK. Leaving that require to fail for real poisons the worker's
 * resolver for every LATER test file that registers the same module virtually —
 * measured: ota1685/ota1735/ota1489/ota1505/ota1682 all pass alone and fail
 * behind this one. A virtual stub here keeps the resolution local to this file.
 * ⚠ It is inert: nothing in this suite asserts on Sentry. */
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureEvent: jest.fn(),
  crashedLastRun: jest.fn(async () => null),
  flush: jest.fn(async () => true),
}), { virtual: true });
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// The two stops, spied THROUGH the real modules so App's unmount can be seen
// calling them without stubbing what they do.
jest.mock('../app/diagnostics/runtimePressureWatch', () => {
  const real = jest.requireActual('../app/diagnostics/runtimePressureWatch');
  return { ...real, stopRuntimePressureWatch: jest.fn(() => real.stopRuntimePressureWatch()) };
});
jest.mock('../app/ai/qwenWatchdog', () => {
  const real = jest.requireActual('../app/ai/qwenWatchdog');
  return { ...real, stopQwenWatchdog: jest.fn(() => real.stopQwenWatchdog()) };
});

import React from 'react';
import { useGameStore } from '../app/state/gameStore';
import { startRuntimePressureWatch, stopRuntimePressureWatch } from '../app/diagnostics/runtimePressureWatch';
import { startQwenWatchdog, stopQwenWatchdog } from '../app/ai/qwenWatchdog';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void };
};

jest.setTimeout(120000);
const get = () => useGameStore.getState();
const set = useGameStore.setState as never;
const hooks = { qwenReinitAttempts: () => 0 };
const REAL_HYDRATE = useGameStore.getState().hydrate;

afterEach(() => {
  stopRuntimePressureWatch();
  stopQwenWatchdog();
  useGameStore.setState({ hydrate: REAL_HYDRATE });
  jest.useRealTimers();
});

describe('OTA-1798 — each instrument leaves nothing behind when stopped', () => {
  it('⚠⚠⚠ THE RUNTIME-PRESSURE WATCH: start schedules, stop clears, nothing outlives the stop', () => {
    jest.useFakeTimers();
    const baseline = jest.getTimerCount();
    startRuntimePressureWatch(get, set, hooks);
    expect(jest.getTimerCount()).toBeGreaterThan(baseline);
    // It reschedules itself: advancing time keeps the count up, not down.
    jest.advanceTimersByTime(20_000);
    expect(jest.getTimerCount()).toBeGreaterThan(baseline);
    stopRuntimePressureWatch();
    expect(jest.getTimerCount()).toBe(baseline);
    // ...and stays down: a stopped loop does not reschedule from a late tick.
    jest.advanceTimersByTime(60_000);
    expect(jest.getTimerCount()).toBe(baseline);
  });

  it('⚠⚠⚠ THE QWEN WATCHDOG: the stop the start never had', () => {
    jest.useFakeTimers();
    const baseline = jest.getTimerCount();
    startQwenWatchdog(get, set);
    expect(jest.getTimerCount()).toBeGreaterThan(baseline);
    stopQwenWatchdog();
    expect(jest.getTimerCount()).toBe(baseline);
    jest.advanceTimersByTime(120_000);
    expect(jest.getTimerCount()).toBe(baseline);
  });

  it('⚠⚠ start → stop → start is one clean instrument, not two; and stop before any start is harmless', () => {
    jest.useFakeTimers();
    stopRuntimePressureWatch();
    stopQwenWatchdog();
    const baseline = jest.getTimerCount();
    startRuntimePressureWatch(get, set, hooks);
    const one = jest.getTimerCount() - baseline;
    stopRuntimePressureWatch();
    startRuntimePressureWatch(get, set, hooks);
    expect(jest.getTimerCount() - baseline).toBe(one);
    startRuntimePressureWatch(get, set, hooks); // a second start replaces, never stacks
    expect(jest.getTimerCount() - baseline).toBe(one);
    stopRuntimePressureWatch();
    expect(jest.getTimerCount()).toBe(baseline);
  });
});

describe('OTA-1798 — App owns the teardown of what its boot starts', () => {
  it('⚠⚠⚠ UNMOUNTING App STOPS BOTH INSTRUMENTS — beside the audio and TTS controllers it already stops', async () => {
    // A hydrate that settles quietly, so the boot effect installs and the
    // unmount cleanup is the thing under test.
    useGameStore.setState({ hydrated: false, hydrate: async () => {} });
    const stopWatch = stopRuntimePressureWatch as unknown as jest.Mock;
    const stopDog = stopQwenWatchdog as unknown as jest.Mock;
    stopWatch.mockClear(); stopDog.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const App = (require('../App') as { default: React.ComponentType }).default;
    let tree!: { unmount(): void };
    await renderer.act(async () => { tree = renderer.create(<App />); });
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const watchCallsBefore = stopWatch.mock.calls.length;
    const dogCallsBefore = stopDog.mock.calls.length;
    await renderer.act(async () => { tree.unmount(); });
    expect(stopWatch.mock.calls.length).toBeGreaterThan(watchCallsBefore);
    expect(stopDog.mock.calls.length).toBeGreaterThan(dogCallsBefore);
  });

  it('⚠⚠ a rendered-then-unmounted App with the instruments running leaves the timer count where it found it', async () => {
    useGameStore.setState({ hydrated: false, hydrate: async () => {} });
    jest.useFakeTimers();
    const baseline = jest.getTimerCount();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const App = (require('../App') as { default: React.ComponentType }).default;
    let tree!: { unmount(): void };
    await renderer.act(async () => { tree = renderer.create(<App />); });
    // What bootQwen would have started, started here explicitly — the claim is
    // about the UNMOUNT side, and it must not depend on the model booting in jest.
    startRuntimePressureWatch(get, set, hooks);
    startQwenWatchdog(get, set);
    expect(jest.getTimerCount()).toBeGreaterThan(baseline);
    await renderer.act(async () => { tree.unmount(); });
    // App's own boot/alive/interval timers are cleared by its own cleanups; the
    // instruments' timers by the two stops. Nothing of ours remains.
    jest.advanceTimersByTime(60_000);
    expect(jest.getTimerCount()).toBeLessThanOrEqual(baseline);
  });
});
