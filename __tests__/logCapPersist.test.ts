// OTA-373 — the game log is capped so the slot save blob can't grow past
// AsyncStorage's readback window. Before this, MAX_LOG_IN_MEMORY was
// Infinity: persist() embeds the whole log in the slot blob, so a
// long-played character's blob crossed ~2 MB, the atomic save's verify
// read back a truncated copy, and EVERY persist failed ("staged save did
// not verify"). Capping the in-memory log (and therefore the saved
// slice) keeps the blob small. COPY LOG history (the dedicated on-disk
// log key) is unaffected.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
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
import { getRaces, getFactions } from '../app/engine/character';
import { loadSlot } from '../app/engine/saveSystem';

const CAP = 500;

describe('game-log cap bounds the save blob (OTA-373)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('the in-memory log is capped, and the persisted slot blob is too', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Logger', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    // Flood the log well past the cap with unique lines (avoid dedup).
    for (let i = 0; i < CAP + 400; i++) {
      store.getState().appendLog('debug', `flood line ${i} — unique-${Math.random()}`);
    }

    // In-memory log is bounded.
    expect(store.getState().gameLog.length).toBeLessThanOrEqual(CAP);

    await store.getState().persist();
    const slotId = store.getState().activeSlotId!;
    const saved = await loadSlot(slotId);

    // The save round-tripped (didn't fail verify) AND its embedded log is capped.
    expect(saved).not.toBeNull();
    expect(saved!.player?.name).toBe('Logger');
    expect((saved!.gameLog?.length ?? 0)).toBeLessThanOrEqual(CAP);
  });
});
