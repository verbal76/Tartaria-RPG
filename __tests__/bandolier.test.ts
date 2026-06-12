// arb110 — Bandolier: rack one-shot throwables (max 5), pull them back out, and
// (eligibility) reject non-throwables and the improvised `thrown` rocks.

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
import { isBandolierEligible } from '../app/engine/bandolierEligibility';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const shard = (qty: number): InventoryItem =>
  ({ id: 'shard-1', name: 'Shaped Aetheric Shard', kind: 'misc', rarity: 'Rare', quantity: qty, tags: ['throwable', 'aether', 'shaped'] } as InventoryItem);
const rock = (): InventoryItem =>
  ({ id: 'rock-1', name: 'Small Rock', kind: 'material', rarity: 'Common', quantity: 3, tags: ['thrown', 'stone', 'improvised'] } as InventoryItem);

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Thrower', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

describe('bandolier — rack / unrack / eligibility', () => {
  beforeAll(() => { console.log = () => {}; });

  it('eligibility: throwables yes, rocks (thrown) no', () => {
    const p = { equipped: {} } as PlayerCharacter;
    expect(isBandolierEligible(shard(3), p).eligible).toBe(true);
    expect(isBandolierEligible(rock(), p).eligible).toBe(false);
  });

  it('stowInBandolier racks a throwable; removeFromBandolier pulls it back', async () => {
    const store = await boot();
    const p0 = store.getState().player!;
    store.setState({ player: { ...p0, inventory: [shard(3)], equipped: { ...p0.equipped, bandolierIds: [] } } });

    store.getState().stowInBandolier('Shaped Aetheric Shard');
    expect(store.getState().player!.equipped!.bandolierIds).toEqual(['shard-1']);
    // The item stays in inventory (it's racked, not removed).
    expect(store.getState().player!.inventory.find((i) => i.id === 'shard-1')!.quantity).toBe(3);

    store.getState().removeFromBandolier('Shaped Aetheric Shard');
    expect(store.getState().player!.equipped!.bandolierIds).toEqual([]);
  });

  it('refuses a non-throwable (rock stays out of the bandolier)', async () => {
    const store = await boot();
    const p0 = store.getState().player!;
    store.setState({ player: { ...p0, inventory: [rock()], equipped: { ...p0.equipped, bandolierIds: [] } } });
    store.getState().stowInBandolier('Small Rock');
    expect(store.getState().player!.equipped!.bandolierIds).toEqual([]);
  });

  it('caps at 5 slots', async () => {
    const store = await boot();
    const p0 = store.getState().player!;
    const items = Array.from({ length: 6 }, (_, i) =>
      ({ id: `t${i}`, name: `Throw ${i}`, kind: 'misc', rarity: 'Common', quantity: 1, tags: ['throwable'] } as InventoryItem));
    store.setState({ player: { ...p0, inventory: items, equipped: { ...p0.equipped, bandolierIds: [] } } });
    for (const it of items) store.getState().stowInBandolier(it.name);
    expect(store.getState().player!.equipped!.bandolierIds).toHaveLength(5);
  });
});
