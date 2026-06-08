// OTA-368 — persist() integrity guard. Beyond the existing player=null
// guard, persist refuses to overwrite a slot when the in-memory player
// is missing its core identity (name / raceId / stats) — a half-built
// or corrupt record. The good save on disk must survive; a stub must
// never blow it out.

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

describe('persist() integrity guard (OTA-368)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('refuses to overwrite a good save when the in-memory player lost its identity', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Guarded', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    await store.getState().persist();

    const slotId = store.getState().activeSlotId!;
    expect(slotId).toBeTruthy();
    const good = await loadSlot(slotId);
    expect(good?.player?.name).toBe('Guarded');
    expect(good?.player?.raceId).toBeTruthy();

    // Corrupt the in-memory player: strip raceId (a half-built stub).
    store.setState((s) => ({ player: s.player ? ({ ...s.player, raceId: '' } as typeof s.player) : s.player }));
    await store.getState().persist();

    // The on-disk save must be UNCHANGED — the guard skipped the write.
    const after = await loadSlot(slotId);
    expect(after?.player?.name).toBe('Guarded');
    expect(after?.player?.raceId).toBe(good!.player!.raceId);
    expect(after?.player?.raceId).toBeTruthy();
  });

  it('a valid player still persists normally (guard does not over-block)', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Valid', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // Mutate a real field, persist, and confirm it lands.
    store.setState((s) => ({ player: s.player ? { ...s.player, tc: 4242 } : s.player }));
    await store.getState().persist();
    const slotId = store.getState().activeSlotId!;
    const saved = await loadSlot(slotId);
    expect(saved?.player?.tc).toBe(4242);
  });
});
