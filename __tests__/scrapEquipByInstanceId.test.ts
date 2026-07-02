// Playtester: with several same-name items of different durability, SCRAP broke the
// wrong one and EQUIP made no change (it grabbed the first row by name). Both store
// actions now resolve the EXACT instance by its unique id when the UI passes it.
// These lock that: the selected id is the one scrapped / equipped, others untouched.

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

jest.setTimeout(20000);

import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Tester', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

function setInventory(store: typeof useGameStore, inv: InventoryItem[]) {
  store.setState((s) => (s.player ? { player: { ...s.player, inventory: inv, equipped: {} } } : s));
}

const spear = (id: string, dur: number): InventoryItem => ({
  id, name: 'Iron Spear', kind: 'weapon', rarity: 'Common', quantity: 1,
  tags: ['weapon', 'spear'], durability: { current: dur, max: 30 },
});
const band = (id: string, dur: number): InventoryItem => ({
  id, name: "Scholar's Headband of Knowledge", kind: 'armor', armorSlot: 'head',
  rarity: 'Uncommon', quantity: 1, tags: ['armor'], durability: { current: dur, max: 40 },
  statBonuses: [{ stat: 'intelligence', amount: 2 }],
} as InventoryItem);

describe('scrap resolves the exact instance by id', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('scraps ONLY the selected (worst-durability) spear, leaving the others', async () => {
    const store = await boot();
    setInventory(store, [spear('spear-hi', 30), spear('spear-mid', 15), spear('spear-lo', 5)]);
    store.getState().scrapInventoryItem('Iron Spear', 'spear-lo');
    const inv = store.getState().player!.inventory;
    expect(inv.find((i) => i.id === 'spear-lo')).toBeUndefined(); // the one picked, gone
    expect(inv.find((i) => i.id === 'spear-hi')).toBeTruthy();
    expect(inv.find((i) => i.id === 'spear-mid')).toBeTruthy();
  });
});

describe('equip resolves the exact instance by id', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('equips the selected headband instance (its id lands in the head slot)', async () => {
    const store = await boot();
    setInventory(store, [band('band-lo', 15), band('band-hi', 33)]);
    // Player selects the high-durability one and equips it.
    store.getState().equipItem("Scholar's Headband of Knowledge", 'head', 'band-hi');
    expect(store.getState().player!.equipped?.headId).toBe('band-hi');
  });

  it('without an id, falls back to name (first match) — legacy/ typed path unchanged', async () => {
    const store = await boot();
    setInventory(store, [band('band-lo', 15), band('band-hi', 33)]);
    store.getState().equipItem("Scholar's Headband of Knowledge", 'head');
    expect(store.getState().player!.equipped?.headId).toBe('band-lo'); // first row
  });
});
