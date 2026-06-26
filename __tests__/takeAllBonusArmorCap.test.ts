// engine_Dev — the per-take bonus armor (OTA-891) is capped at ONE for a whole
// "Take All" batch (OTA-892). A single take still grants its own bonus armor;
// taking a pile in one tap grants exactly one bonus, not one per item.

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

// Built-in weapon names that resolve via findCatalogItem and are portable.
const TAKEABLE = ['Club', 'Cudgel', 'Rusted Blade'];

async function freshSceneWithTakeables() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Hauler', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  store.setState({
    currentScene: { ...store.getState().currentScene!, ambientNouns: [...TAKEABLE] },
    // Clear any prior room-consume marks so all three takeables are grabbable.
    worldMemory: { ...store.getState().worldMemory, visitedRooms: {} },
    player: { ...p0, inventory: [] }, // empty pack → no cap interference, clean count
  });
  return store;
}

const bonusArmorCount = () =>
  useGameStore.getState().player!.inventory.filter((i) => i.id.startsWith('take_armor_')).length;

describe('engine_Dev — Take All caps bonus armor at one', () => {
  it('grants exactly ONE bonus armor for a 3-item Take All (not one per item)', async () => {
    const store = await freshSceneWithTakeables();
    store.getState().takeAllAmbientNouns([...TAKEABLE]);
    // All three takeables landed...
    const inv = store.getState().player!.inventory;
    expect(inv.some((i) => i.name === 'Club')).toBe(true);
    expect(inv.some((i) => i.name === 'Cudgel')).toBe(true);
    // ...but only one bonus armor piece for the whole batch.
    expect(bonusArmorCount()).toBe(1);
  });

  it('a single take still grants its own bonus armor', async () => {
    const store = await freshSceneWithTakeables();
    const took = store.getState().takeAmbientNoun('Club');
    expect(took).toBe(true);
    expect(bonusArmorCount()).toBe(1);
  });

  it('Take All with nothing actually taken grants no bonus armor', async () => {
    const store = await freshSceneWithTakeables();
    // Nouns that resolve to nothing → no item taken → no batch bonus.
    store.getState().takeAllAmbientNouns(['nonexistent gizmo', 'imaginary doohickey']);
    expect(bonusArmorCount()).toBe(0);
  });
});
