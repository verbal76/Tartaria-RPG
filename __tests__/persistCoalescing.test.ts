// OTA-627 — regression test for the persist concurrency guard.
//
// Repro: persist() is fired `void`-style from ~120 call sites; a single action
// could trip several in one tick. With no serialization each concurrent
// saveSlot() raced on the 8 rotating temp keys, every verify read back another
// writer's bytes ("readback mismatch (got N vs M)"), which triggered
// emergencyReclaimDiskSpace() + retry in a tight loop that hammered AsyncStorage
// hard enough to ANR the app ("dropped to desktop after crafting Spark Strike").
//
// The guard serializes writes: a burst coalesces to the in-flight write plus at
// most ONE trailing write. This test fires a burst of persist() calls in one tick
// and asserts the underlying staged-write count stays tiny (would be ~N before).

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// Wrap the REAL saveSlot with a concurrency counter. saveSlot is the unit the
// persist() guard serializes; if two ran at once they'd race on the rotating temp
// keys (the storm's root cause). mockMaxSaveSlotInFlight must stay 1.
let mockSaveSlotInFlight = 0;
let mockMaxSaveSlotInFlight = 0;
let mockSaveSlotCalls = 0;
jest.mock('../app/engine/saveSystem', () => {
  const actual = jest.requireActual('../app/engine/saveSystem');
  return {
    ...actual,
    saveSlot: jest.fn(async (slotId: string, state: unknown) => {
      mockSaveSlotInFlight += 1;
      mockSaveSlotCalls += 1;
      mockMaxSaveSlotInFlight = Math.max(mockMaxSaveSlotInFlight, mockSaveSlotInFlight);
      try {
        return await actual.saveSlot(slotId, state);
      } finally {
        mockSaveSlotInFlight -= 1;
      }
    }),
  };
});
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import { useGameStore } from '../app/state/gameStore';

describe('OTA-627 — persist() serializes; a burst coalesces instead of racing', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('a burst of persist() calls never runs two saveSlot writes at once (the temp-key race that caused the storm)', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Saver', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    await store.getState().persist();
    await new Promise((r) => setTimeout(r, 0));

    // Reset counters after setup so we measure only the burst window.
    mockMaxSaveSlotInFlight = 0;
    mockSaveSlotCalls = 0;

    // Fire a burst in a single synchronous tick — the real-world storm shape.
    const bursts: Promise<boolean>[] = [];
    for (let i = 0; i < 25; i++) bursts.push(store.getState().persist());
    await Promise.all(bursts);
    await new Promise((r) => setTimeout(r, 0)); // let any trailing drain settle

    expect(mockSaveSlotCalls).toBeGreaterThanOrEqual(1); // real writes happened
    expect(mockMaxSaveSlotInFlight).toBe(1);             // never two saveSlot writes at once
    // 25 calls coalesce to the in-flight write + at most one trailing write.
    expect(mockSaveSlotCalls).toBeLessThanOrEqual(2);
  }, 15000);

  it('a later, separate persist() still runs (the lock is released after each batch)', async () => {
    const store = useGameStore;
    // First batch settles and releases the lock.
    await store.getState().persist();
    await new Promise((r) => setTimeout(r, 0));
    const before = mockSaveSlotCalls;
    // A fresh call after the previous one settled must write again (lock freed).
    await store.getState().persist();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSaveSlotCalls).toBeGreaterThan(before);
  }, 15000);
});
