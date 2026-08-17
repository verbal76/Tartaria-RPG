// ⚠ OTA-1335 — DOG ARMOR IS BUILT FOR *YOUR* DOG, AND THE NAME SAYS SO.
//
// Owner, after naming his dog's breed "Skinwalker" as a joke and realising the field is
// honest free text: *"when we make the dog armor how about we put the breed name in front
// of it? … if I have a pitbull it's Pitbull studded leather vest. if I have a parakeet it's
// parakeet metal plated armor. they get no other special bonuses."*
//
// The rules this pins:
//   - a CRAFTED ("built") dog-armor piece takes the breed prefix, whatever the breed says;
//   - no dog at the bench → no prefix (nothing to tailor it to);
//   - a non-dog craft never takes a prefix, dog or not;
//   - the prefix is purely a name — kind stays 'dog_armor' so the vest still equips.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
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
import type { InventoryItem } from '../app/engine/types';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

// Burlap Vest = Patched Cloth ×2 + Spider Silk ×1 (dog_armor tier); Acid Flask is the
// non-dog control craft (Aether Dust ×1 + Scrap Metal ×1).
const mats = (): InventoryItem[] => ([
  { id: 'cloth1', name: 'Patched Cloth', kind: 'misc', quantity: 2, tags: [] },
  { id: 'silk1', name: 'Spider Silk', kind: 'misc', quantity: 1, tags: [] },
  { id: 'dust1', name: 'Aether Dust', kind: 'misc', quantity: 1, tags: [] },
  { id: 'scrap1', name: 'Scrap Metal', kind: 'misc', quantity: 1, tags: [] },
] as InventoryItem[]);

const giveDog = (breed: string): void => {
  useGameStore.setState((s) => ({
    player: {
      ...s.player!,
      dog: {
        name: 'Wren', breed, sex: 'female', hp: 20, hpMax: 20, hunger: 0,
        status: 'active', bond: 10,
      },
    } as never,
  }));
};

describe('OTA-1335 — breed-named dog armor', () => {
  it('⚠⚠ a crafted vest takes the breed prefix — whatever the breed says', async () => {
    const store = await boot('Kennel');
    store.setState((s) => ({ player: { ...s.player!, inventory: mats(), knownRecipes: ['Burlap Vest'] } as never }));
    giveDog('skinwalker');
    store.getState().submitPlayerAction('craft Burlap Vest');
    const item = store.getState().player!.inventory.find((i) => i.name.includes('Burlap Vest'));
    expect(item?.name).toBe('Skinwalker Burlap Vest');
    // ⚠ Name only — the kind must survive intact or the vest stops equipping on the dog.
    expect(item?.kind).toBe('dog_armor');
  });

  it('⚠ a parakeet gets parakeet armor — the breed is honest free text', async () => {
    const store = await boot('Aviary');
    store.setState((s) => ({ player: { ...s.player!, inventory: mats(), knownRecipes: ['Burlap Vest'] } as never }));
    giveDog('parakeet');
    store.getState().submitPlayerAction('craft Burlap Vest');
    expect(store.getState().player!.inventory.some((i) => i.name === 'Parakeet Burlap Vest')).toBe(true);
  });

  it('⚠ no dog at the bench → plain catalog name', async () => {
    const store = await boot('Solo');
    store.setState((s) => ({ player: { ...s.player!, inventory: mats(), knownRecipes: ['Burlap Vest'], dog: null } as never }));
    store.getState().submitPlayerAction('craft Burlap Vest');
    expect(store.getState().player!.inventory.some((i) => i.name === 'Burlap Vest')).toBe(true);
  });

  it('⚠ a non-dog craft never takes the prefix, dog or not', async () => {
    const store = await boot('Chemist');
    store.setState((s) => ({ player: { ...s.player!, inventory: mats(), knownRecipes: ['Acid Flask'] } as never }));
    giveDog('skinwalker');
    store.getState().submitPlayerAction('craft Acid Flask');
    expect(store.getState().player!.inventory.some((i) => i.name === 'Acid Flask')).toBe(true);
    expect(store.getState().player!.inventory.some((i) => i.name.startsWith('Skinwalker Acid'))).toBe(false);
  });
});
