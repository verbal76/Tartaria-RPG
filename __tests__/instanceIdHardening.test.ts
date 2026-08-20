// OTA-696 — (1) starter inventory ids are unique (no static literals, no
// same-millisecond Date.now collisions); (2) the dog vest resolves its AC from the
// EXACT worn instance by id, so a fused vest's uniqueStats apply to the right copy.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
// ⚠ OTA-1404 — combat resolution moved out of gameStore into its own leaf.
import { dogVestAcBonus } from '../app/state/combatResolution';
import { getRaces, getFactions } from '../app/engine/character';
import type { PlayerCharacter, InventoryItem, DogCompanion } from '../app/engine/types';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-696 — starter inventory ids are unique + non-static', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('every starter id is unique and none are the old static literals', async () => {
    const store = await boot('Fresh');
    const ids = store.getState().player!.inventory.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length); // no collisions
    for (const legacy of ['aetheric_torch', 'rations', 'water_bottle', 'aether_locket']) {
      expect(ids).not.toContain(legacy);
    }
  });
});

describe('OTA-696 — dog vest AC resolves the exact worn instance by id', () => {
  const fusedVest = (id: string, ac: number): InventoryItem =>
    ({ id, name: 'Fused Aegis Vest', kind: 'dog_armor', rarity: 'Rare', quantity: 1, tags: ['dog_armor'], uniqueStats: { acBonus: ac } } as unknown as InventoryItem);
  const mkPlayer = (inventory: InventoryItem[], vestId: string | undefined): PlayerCharacter =>
    ({ inventory, dog: { equipped: { vest: 'Fused Aegis Vest', vestId }, status: 'with_player' } as DogCompanion } as PlayerCharacter);

  it('picks the vestId-matched fused copy, not the first-by-name', () => {
    const inv = [fusedVest('v-weak', 1), fusedVest('v-strong', 4)];
    expect(dogVestAcBonus(mkPlayer(inv, 'v-strong'))).toBe(4);
    expect(dogVestAcBonus(mkPlayer(inv, 'v-weak'))).toBe(1);
  });

  it('legacy save (no vestId) falls back to first-by-name', () => {
    const inv = [fusedVest('v-a', 2), fusedVest('v-b', 5)];
    expect(dogVestAcBonus(mkPlayer(inv, undefined))).toBe(2);
  });

  it('no vest → 0', () => {
    expect(dogVestAcBonus({ inventory: [], dog: { equipped: { vest: null } } as DogCompanion } as PlayerCharacter)).toBe(0);
  });
});
