// OTA-695 — mutate the EXACT instance the UI points at, not the first-by-name.
// Covers the two live bugs (stowInPouch couldn't pouch a 2nd same-named tool;
// sellToVendor refused/sold the wrong copy when a same-named item was equipped)
// plus the id-preferring re-plumb of removeFromBandolier.

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
import type { InventoryItem } from '../app/engine/types';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

const scanner = (id: string): InventoryItem =>
  ({ id, name: 'Pulse Scanner', kind: 'relic', rarity: 'Common', quantity: 1, tags: ['tool', 'scanner'] } as InventoryItem);
const gloves = (id: string): InventoryItem =>
  ({ id, name: 'Stone-Grip Gloves', kind: 'armor', rarity: 'Common', quantity: 1, tags: [], durability: { current: 20, max: 20 } } as InventoryItem);
const knife = (id: string): InventoryItem =>
  ({ id, name: 'Throwing Knife', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['throwable'], durability: { current: 10, max: 10 } } as InventoryItem);

describe('OTA-695 — stowInPouch pouches a SECOND same-named tool', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('by-name stow finds the un-pouched instance instead of bouncing off the racked one', async () => {
    const store = await boot('Scout');
    useGameStore.setState((s) => ({
      player: { ...s.player!, inventory: [...s.player!.inventory, scanner('s1'), scanner('s2')], equipped: { ...(s.player!.equipped ?? {}), toolPouchIds: [] } },
    }));
    store.getState().stowInPouch('Pulse Scanner', 's1');
    store.getState().stowInPouch('Pulse Scanner'); // no id → must find s2, not re-find s1
    const pouch = store.getState().player!.equipped!.toolPouchIds ?? [];
    expect(pouch).toContain('s1');
    expect(pouch).toContain('s2'); // the bug: this used to fail
  });

  it('explicit id stows the exact instance', async () => {
    const store = await boot('Scout2');
    useGameStore.setState((s) => ({
      player: { ...s.player!, inventory: [...s.player!.inventory, scanner('s1'), scanner('s2')], equipped: { ...(s.player!.equipped ?? {}), toolPouchIds: [] } },
    }));
    store.getState().stowInPouch('Pulse Scanner', 's2');
    expect(store.getState().player!.equipped!.toolPouchIds).toEqual(['s2']);
  });
});

describe('OTA-695 — sellToVendor sells the exact instance', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('sells a spare even when a same-named copy is equipped', async () => {
    const store = await boot('Trader');
    useGameStore.setState((s) => ({
      player: { ...s.player!, tc: 0, inventory: [...s.player!.inventory, gloves('g-worn'), gloves('g-spare')], equipped: { ...(s.player!.equipped ?? {}), hands: 'Stone-Grip Gloves', handsId: 'g-worn' } },
      currentScene: { ...s.currentScene!, enemies: [], vendor: { name: 'Fence', offers: [] } as never },
    }));
    store.getState().sellToVendor('Stone-Grip Gloves', 'g-spare');
    const inv = store.getState().player!.inventory;
    expect(inv.find((i) => i.id === 'g-spare')).toBeUndefined(); // spare sold
    expect(inv.find((i) => i.id === 'g-worn')).toBeDefined();    // worn one kept
  });

  it('refuses to sell the equipped instance (by id)', async () => {
    const store = await boot('Trader2');
    useGameStore.setState((s) => ({
      player: { ...s.player!, tc: 0, inventory: [...s.player!.inventory, gloves('g-worn'), gloves('g-spare')], equipped: { ...(s.player!.equipped ?? {}), hands: 'Stone-Grip Gloves', handsId: 'g-worn' } },
      currentScene: { ...s.currentScene!, enemies: [], vendor: { name: 'Fence', offers: [] } as never },
    }));
    store.getState().sellToVendor('Stone-Grip Gloves', 'g-worn');
    expect(store.getState().player!.inventory.find((i) => i.id === 'g-worn')).toBeDefined(); // still worn, not sold
    expect(store.getState().player!.tc).toBe(0); // no sale went through
  });
});

describe('OTA-695 — removeFromBandolier pulls the exact racked instance', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('unracks the id the UI tapped, leaving the other racked', async () => {
    const store = await boot('Thrower');
    useGameStore.setState((s) => ({
      player: { ...s.player!, inventory: [...s.player!.inventory, knife('k1'), knife('k2')], equipped: { ...(s.player!.equipped ?? {}), bandolierIds: ['k1', 'k2'] } },
    }));
    store.getState().removeFromBandolier('Throwing Knife', 'k1');
    expect(store.getState().player!.equipped!.bandolierIds).toEqual(['k2']);
  });
});
