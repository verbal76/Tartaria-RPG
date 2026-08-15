// golem (ported from engine_Dev) — coat armor for damage resists. A weapon-coating
// vial can be worked into an ARMOR piece for a permanent damage-type resist; while
// worn, aggregateArmor adds it to the slot and the existing applyArmorResistance
// combat path reduces incoming damage of that type. Covers the resist math + the
// applyCoatingToArmor store action (stamp, consume, dedup, cap).

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
import { getRaces, getFactions } from '../app/engine/character';
import { applyArmorResistance, armorResistanceFraction } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

describe('armor resist math (existing system the coating feeds)', () => {
  it('a poison-resisting chest piece cuts incoming poison damage', () => {
    const r = applyArmorResistance(10, 'poison', [{ type: 'poison', slot: 'chest' }]);
    expect(r.blocked).toBe(true);
    expect(r.damage).toBeLessThan(10);
  });
  it('does nothing against a different damage type', () => {
    const r = applyArmorResistance(10, 'fire', [{ type: 'poison', slot: 'chest' }]);
    expect(r.blocked).toBe(false);
    expect(r.damage).toBe(10);
  });
  it('stacks across slots with diminishing returns, capped below immunity', () => {
    const one = armorResistanceFraction('poison', [{ type: 'poison', slot: 'chest' }]);
    const two = armorResistanceFraction('poison', [{ type: 'poison', slot: 'chest' }, { type: 'poison', slot: 'legs' }]);
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThanOrEqual(0.8); // never full immunity
  });
});

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

function seed(store: typeof useGameStore, extra: InventoryItem[]) {
  const p = store.getState().player!;
  store.setState({ player: { ...p, inventory: [...p.inventory, ...extra] } });
}

const vial = (id: string): InventoryItem =>
  ({ id, name: 'Poison Vial', kind: 'consumable', rarity: 'Uncommon', quantity: 1, tags: ['potion', 'weapon_coating', 'poison'] } as InventoryItem);
const plate = (id: string): InventoryItem =>
  ({ id, name: 'Test Breastplate', kind: 'armor', rarity: 'Common', quantity: 1, tags: ['armor'] } as InventoryItem);

describe('applyCoatingToArmor store action', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('stamps the coating damage type onto the armor and consumes the vial', async () => {
    const store = await boot('Coater');
    seed(store, [vial('v1'), plate('a1')]);
    store.getState().applyCoatingToArmor('v1', 'a1');
    const inv = store.getState().player!.inventory;
    const armor = inv.find((i) => i.id === 'a1')!;
    expect(armor.addedResists).toEqual(['poison']);
    expect(inv.find((i) => i.id === 'v1')).toBeFalsy(); // vial consumed
  });

  it('refuses a duplicate resist type (does not waste the vial)', async () => {
    const store = await boot('Dup');
    seed(store, [vial('v2'), { ...plate('a2'), addedResists: ['poison'] }]);
    store.getState().applyCoatingToArmor('v2', 'a2');
    const inv = store.getState().player!.inventory;
    expect(inv.find((i) => i.id === 'a2')!.addedResists).toEqual(['poison']); // unchanged
    expect(inv.find((i) => i.id === 'v2')).toBeTruthy(); // vial NOT consumed
  });

  it('caps a piece at 3 worked-in resists', async () => {
    const store = await boot('Cap');
    seed(store, [vial('v3'), { ...plate('a3'), addedResists: ['acid', 'corruption', 'cold'] }]);
    store.getState().applyCoatingToArmor('v3', 'a3');
    const inv = store.getState().player!.inventory;
    expect(inv.find((i) => i.id === 'a3')!.addedResists).toHaveLength(3); // not added
    expect(inv.find((i) => i.id === 'v3')).toBeTruthy(); // vial NOT consumed
  });
});
