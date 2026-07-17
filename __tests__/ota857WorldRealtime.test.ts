// OTA-857 [world is a live scroll] — the war used to advance ONLY when the player took
// actions that burned in-game hours. A player who opened the World board and just watched
// saw a frozen feed ("still nothing populating"). worldRealtimeTick() is driven by a
// wall-clock timer in App.tsx and advances the sim with NO in-game time passing, so the
// board populates continuously no matter what screen is open.

jest.setTimeout(20000);
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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import { useGameStore } from '../app/state/gameStore';

describe('OTA-857 — the world advances on wall-clock time, not in-game hours', () => {
  it('the FIRST realtime tick warms up a blank board with no in-game time passing', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Realtime', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    // Pin the in-game clock — the world must move WITHOUT it.
    const p0 = useGameStore.getState().player!;
    const hourPinned = p0.hoursElapsed; // whatever it is (undefined on a fresh game) — must not change
    useGameStore.setState({
      currentScreen: 'world',
      worldMemory: { ...useGameStore.getState().worldMemory, worldEvents: [], patrols: [] },
    });

    useGameStore.getState().worldRealtimeTick();

    const st = useGameStore.getState();
    // The board filled from the warm-up burst, and patrols were deployed...
    expect((st.worldMemory.worldEvents ?? []).length).toBeGreaterThan(2);
    expect((st.worldMemory.patrols ?? []).length).toBeGreaterThan(0);
    // ...yet NOT ONE in-game hour passed, and the in-game tick baseline is untouched.
    expect(st.player!.hoursElapsed).toBe(hourPinned);
    expect(st.worldMemory.worldRealtimeTicks).toBe(1);
  });

  it('successive ticks keep the scroll moving (the feed keeps growing / rolling)', () => {
    const before = useGameStore.getState().worldMemory.worldEvents ?? [];
    for (let i = 0; i < 8; i++) useGameStore.getState().worldRealtimeTick();
    const after = useGameStore.getState().worldMemory.worldEvents ?? [];
    // Newest lines differ from the pre-tick tail — the board is a live feed, not frozen.
    expect(after.length).toBeGreaterThan(0);
    expect(after[after.length - 1]!.text).not.toBe(before[before.length - 1]?.text ?? '__none__');
    // Capped at 50 so it rolls instead of growing without bound.
    expect(after.length).toBeLessThanOrEqual(50);
    expect(useGameStore.getState().worldMemory.worldRealtimeTicks).toBe(9);
  });

  it('no-ops on the title / creation / ending screens (no game to simulate)', async () => {
    useGameStore.setState({ currentScreen: 'title' });
    const ticksBefore = useGameStore.getState().worldMemory.worldRealtimeTicks ?? 0;
    useGameStore.getState().worldRealtimeTick();
    expect(useGameStore.getState().worldMemory.worldRealtimeTicks ?? 0).toBe(ticksBefore);
  });
});
