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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-956 — dog-vest equipped visibility. Owner: "dog vests don't show which
// one is equipped in the inventory." One shared resolver
// (dogCompanion.wornDogVestInstanceId) now answers "which instance is on the
// dog": exact vestId first, then a name match that also accepts fused vests
// whose stored kind drifted (uniqueStats.kind === 'dog_armor'). The inventory
// badge, the "(on <dog>)" label, and the details modal (which now shows
// "Unequip (worn by <dog>)" on the worn vest) all read it. And when a vest
// equipped while still cooling gets its settled Crucible name, the dog's
// record follows the rename.
import { useGameStore } from '../app/state/gameStore';
import { createDogCompanion, wornDogVestInstanceId } from '../app/engine/dogCompanion';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem } from '../app/engine/types';

const mkDog = () => createDogCompanion({
  name: 'Rocky2', breed: 'mutt', rawSex: 'male', startingProfile: 'mutt', currentHour: 0,
});

const vest = (id: string, name: string, kind: InventoryItem['kind'] = 'dog_armor', fused = false): InventoryItem => ({
  id, name, kind, rarity: 'Rare', quantity: 1, tags: fused ? ['fused'] : [],
  ...(fused ? { uniqueStats: { kind: 'dog_armor' as const, rarity: 'Rare' as const, durability: { current: 35, max: 35 }, acBonus: 3 } } : {}),
});

describe('OTA-956 — wornDogVestInstanceId resolves the exact worn vest', () => {
  it('by instance id, even with two same-named vests', () => {
    const dog = { ...mkDog(), equipped: { vest: 'Reinforced Vest', vestId: 'v2' } };
    const player = { dog, inventory: [vest('v1', 'Reinforced Vest'), vest('v2', 'Reinforced Vest')] };
    expect(wornDogVestInstanceId(player)).toBe('v2');
  });
  it('by name when no id was recorded (legacy saves)', () => {
    const dog = { ...mkDog(), equipped: { vest: 'Reinforced Vest' } };
    const player = { dog, inventory: [vest('v1', 'Reinforced Vest')] };
    expect(wornDogVestInstanceId(player)).toBe('v1');
  });
  it('accepts a fused vest whose stored kind drifted (uniqueStats.kind only)', () => {
    const dog = { ...mkDog(), equipped: { vest: 'Marrow-Etched Barding' } };
    const drifted = vest('v9', 'Marrow-Etched Barding', 'misc', true);
    const player = { dog, inventory: [drifted] };
    expect(wornDogVestInstanceId(player)).toBe('v9');
  });
  it('null when nothing is worn, the dog is gone, or the vest left the pack', () => {
    expect(wornDogVestInstanceId({ dog: mkDog(), inventory: [vest('v1', 'X')] })).toBeNull();
    const deadDog = { ...mkDog(), status: 'dead' as const, equipped: { vest: 'X', vestId: 'v1' } };
    expect(wornDogVestInstanceId({ dog: deadDog, inventory: [vest('v1', 'X')] })).toBeNull();
    const dog = { ...mkDog(), equipped: { vest: 'X', vestId: 'gone' } };
    expect(wornDogVestInstanceId({ dog, inventory: [] })).toBeNull();
  });
});

describe('OTA-956 — a settled Crucible rename follows onto the dog', () => {
  it('renaming the worn (still-cooling) vest updates dog.equipped.vest', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Kennel', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const cooling: InventoryItem = {
      id: 'coolv1', name: 'Cooling Crucible-Work', kind: 'dog_armor', rarity: 'Rare', quantity: 1, tags: ['fused'],
      uniqueStats: { kind: 'dog_armor', rarity: 'Rare', durability: { current: 35, max: 35 }, acBonus: 3 },
    };
    store.setState((s) => ({
      player: {
        ...s.player!,
        dog: { ...mkDog(), equipped: { vest: 'Cooling Crucible-Work', vestId: 'coolv1' } },
        inventory: [...s.player!.inventory, cooling],
      },
    }));
    store.getState().settleFusion('coolv1', 'Sinew-Wrapped Barding', 'A vest, fully formed.');
    await new Promise((r) => setTimeout(r, 5));
    const p = store.getState().player!;
    expect(p.inventory.find((i) => i.id === 'coolv1')?.name).toBe('Sinew-Wrapped Barding');
    expect(p.dog?.equipped?.vest).toBe('Sinew-Wrapped Barding');
    expect(wornDogVestInstanceId(p)).toBe('coolv1');
  });
});
