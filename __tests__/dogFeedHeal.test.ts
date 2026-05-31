// OTA-120 Phase 4 — feed / heal / use on dog.
//
// Asserts the +20 (regular) vs +40 (dogTreat) loyalty math, HP heal
// pulled from the consumable effect, and that the item is consumed.

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
import { createDogCompanion } from '../app/engine/dogCompanion';

async function bootWithDog(opts?: { hp?: number; loyalty?: number; inventory?: any[] }) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Tester', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  const dog = createDogCompanion({
    name: 'Marrow',
    breed: 'mutt',
    rawSex: 'boy',
    startingProfile: 'mongrel',
    currentHour: 0,
  });
  store.setState({
    player: {
      ...p0,
      dog: {
        ...dog,
        hp: opts?.hp ?? 8, // half-HP so heal has room
        loyalty: opts?.loyalty ?? 50,
        lastFedAtHour: 0,
      },
      inventory: opts?.inventory ?? p0.inventory,
      hoursElapsed: 0,
    },
  });
  return store;
}

describe('OTA-120 Phase 4 — feed / heal / use on dog', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
  });

  it('feed dog Trail Rations: +20 loyalty + consumes 1', async () => {
    const store = await bootWithDog({
      loyalty: 30,
      inventory: [
        { id: 'rat_1', name: 'Trail Rations', kind: 'consumable', quantity: 3, tags: ['food'], rarity: 'Common' },
      ],
    });
    store.getState().submitPlayerAction('feed dog Trail Rations');
    const p = store.getState().player!;
    expect(p.dog?.loyalty).toBe(50); // 30 + 20
    expect(p.inventory.find((i) => i.name === 'Trail Rations')?.quantity).toBe(2);
  });

  it('feed dog Marrow Bone: +40 loyalty (treat) + consumes 1', async () => {
    const store = await bootWithDog({
      loyalty: 20,
      inventory: [
        { id: 'bone_1', name: 'Marrow Bone', kind: 'consumable', quantity: 2, tags: ['food', 'treat', 'dog_treat'], rarity: 'Uncommon' },
      ],
    });
    store.getState().submitPlayerAction('feed dog Marrow Bone');
    const p = store.getState().player!;
    expect(p.dog?.loyalty).toBe(60); // 20 + 40
    expect(p.inventory.find((i) => i.name === 'Marrow Bone')?.quantity).toBe(1);
  });

  it('feed dog Smoke-Cured Jerky Strip: +40 loyalty', async () => {
    const store = await bootWithDog({
      loyalty: 50,
      inventory: [
        { id: 'jky_1', name: 'Smoke-Cured Jerky Strip', kind: 'consumable', quantity: 4, tags: ['food', 'treat', 'dog_treat'], rarity: 'Common' },
      ],
    });
    store.getState().submitPlayerAction('feed dog Smoke-Cured Jerky Strip');
    expect(store.getState().player?.dog?.loyalty).toBe(90); // 50 + 40
  });

  it('caps loyalty at 100', async () => {
    const store = await bootWithDog({
      loyalty: 90,
      inventory: [
        { id: 'jky_1', name: 'Smoke-Cured Jerky Strip', kind: 'consumable', quantity: 4, tags: ['food', 'treat', 'dog_treat'], rarity: 'Common' },
      ],
    });
    store.getState().submitPlayerAction('feed dog Smoke-Cured Jerky Strip');
    expect(store.getState().player?.dog?.loyalty).toBe(100);
  });

  it('heal dog First Aid Kit: HP restored + loyalty bumped', async () => {
    const store = await bootWithDog({
      hp: 4,
      loyalty: 50,
      inventory: [
        { id: 'fak_1', name: 'First Aid Kit', kind: 'consumable', quantity: 1, tags: ['healing'], rarity: 'Uncommon' },
      ],
    });
    store.getState().submitPlayerAction('heal dog First Aid Kit');
    const dog = store.getState().player?.dog;
    expect(dog).toBeDefined();
    // hpMax for mongrel is 16; First Aid Kit healHP=25 clamps to (16-4)=12.
    expect(dog!.hp).toBe(16);
    expect(dog!.loyalty).toBeGreaterThan(50);
    expect(store.getState().player?.inventory.find((i) => i.name === 'First Aid Kit')).toBeUndefined();
  });

  it('use Trail Rations on dog: feed-equivalent', async () => {
    const store = await bootWithDog({
      loyalty: 40,
      inventory: [
        { id: 'rat_1', name: 'Trail Rations', kind: 'consumable', quantity: 2, tags: ['food'], rarity: 'Common' },
      ],
    });
    store.getState().submitPlayerAction('use Trail Rations on dog');
    expect(store.getState().player?.dog?.loyalty).toBe(60);
  });

  it('refuses to feed an abandoned dog', async () => {
    const store = await bootWithDog({
      loyalty: 10,
      inventory: [
        { id: 'rat_1', name: 'Trail Rations', kind: 'consumable', quantity: 1, tags: ['food'], rarity: 'Common' },
      ],
    });
    const p = store.getState().player!;
    store.setState({
      player: { ...p, dog: { ...p.dog!, status: 'abandoned' as const } },
    });
    store.getState().submitPlayerAction('feed dog Trail Rations');
    expect(store.getState().player?.dog?.loyalty).toBe(10); // unchanged
    expect(store.getState().player?.inventory.find((i) => i.name === 'Trail Rations')?.quantity).toBe(1);
  });

  it('refuses when the named item is absent from pack', async () => {
    const store = await bootWithDog({
      loyalty: 50,
      inventory: [], // empty
    });
    store.getState().submitPlayerAction('feed dog Trail Rations');
    expect(store.getState().player?.dog?.loyalty).toBe(50);
  });
});
