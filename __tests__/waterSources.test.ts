// OTA-375 — water sources for refilling the Water Bottle. beginScene
// surfaces a water source in look-around on ~55% of outdoor tiles
// (stable per room key). Every generated noun must be fillable — this
// drives the real 'fill bottle' handler with each of them to prove the
// refill loop works.

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

// The exact pool beginScene draws water-source nouns from (OTA-375).
const WATER_NOUNS = ['rain pool', 'crevice-pool', 'puddle', 'shallow pool', 'standing water', 'cold spring', 'still pond'];

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name, raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  return store;
}

describe('water sources are fillable (OTA-375)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it.each(WATER_NOUNS)('a "%s" in the scene lets you fill an empty bottle', async (noun) => {
    const store = await boot(`Filler-${noun}`);
    const scene = store.getState().currentScene!;
    store.setState((s) => ({
      currentScene: { ...scene, ambientNouns: [noun] },
      player: s.player ? {
        ...s.player,
        inventory: [
          ...s.player.inventory.filter((i) => !/water bottle/i.test(i.name)),
          { id: 'empty_1', name: 'Empty Water Bottle', kind: 'misc' as const, quantity: 1, tags: ['container', 'water'] },
        ],
      } : s.player,
    }));

    store.getState().submitPlayerAction('fill bottle');

    const inv = store.getState().player!.inventory;
    const full = inv.find((i) => i.name === 'Water Bottle');
    expect(full).toBeDefined();
    expect((full?.quantity ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
