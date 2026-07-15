// OTA-814 — coating a STACKED, EQUIPPED weapon peeled the coating onto a fresh
// instance but left the equipped slot pointing at the uncoated stack remainder, so
// the on-hit resolver (keyed off equipped.mainId/offId) never fired — the weapon read
// "Now wielding the Burning …" but landed zero burn. Fix: re-point the equipped slot
// to the coated instance.

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
import type { InventoryItem } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Coater', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-814 — coating an equipped stacked weapon keeps the equip pointed at it', () => {
  it('after coating, equipped.mainId resolves to a coated instance', async () => {
    const store = await boot();
    const weapon = {
      id: 'w_stack', name: 'Bone Blade', kind: 'weapon', quantity: 2, tags: [],
      uniqueStats: { kind: 'weapon', rarity: 'Common', damageDice: '1d6', damageType: 'slashing' },
    } as unknown as InventoryItem;
    const paste = { id: 'c_paste', name: 'Incendiary Paste', kind: 'consumable', quantity: 1, tags: [] } as unknown as InventoryItem;
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [...s.player!.inventory.filter((i) => i.kind !== 'weapon'), weapon, paste],
        equipped: { ...(s.player!.equipped ?? {}), mainId: 'w_stack' },
      },
    }));

    store.getState().applyCoating('c_paste', 'w_stack');

    const p = store.getState().player!;
    const equippedInst = p.inventory.find((i) => i.id === p.equipped?.mainId);
    expect(equippedInst).toBeTruthy();
    expect(equippedInst!.coating).toBeTruthy();               // the weapon you swing IS coated
    expect(equippedInst!.coating!.kind).toBe('burn');
    // The bare stack remainder still exists, uncoated, and is NOT what's equipped.
    const remainder = p.inventory.find((i) => i.id === 'w_stack');
    expect(remainder?.coating).toBeFalsy();
    expect(p.equipped?.mainId).not.toBe('w_stack');
  });
});
