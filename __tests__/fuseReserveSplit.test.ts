// arb107 — reserving ONE unit of a stack for fusion must split it out (save one,
// keep the rest), not flip the whole stack. Repro for the player report: a Shrike
// Claw ×2 marked reserved BOTH; you could only save-all or save-none.

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

const claw = (id: string, qty: number, reserved?: boolean): InventoryItem =>
  ({ id, name: 'Shrike Claw', kind: 'misc', rarity: 'Common', quantity: qty, tags: [], reservedForFusion: reserved } as InventoryItem);

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Splitter', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

describe('toggleReserveForFusion — per-unit stack split', () => {
  beforeAll(() => { console.log = () => {}; });

  it('reserving one of a ×2 stack splits it: one reserved ×1, one free ×1', async () => {
    const store = await boot();
    const p0 = store.getState().player!;
    store.setState({ player: { ...p0, inventory: [claw('claw-stack', 2)] } });

    store.getState().toggleReserveForFusion('claw-stack');

    const claws = store.getState().player!.inventory.filter((i) => i.name === 'Shrike Claw');
    const reserved = claws.filter((i) => i.reservedForFusion === true);
    const free = claws.filter((i) => i.reservedForFusion !== true);
    expect(reserved.reduce((n, i) => n + i.quantity, 0)).toBe(1);
    expect(free.reduce((n, i) => n + i.quantity, 0)).toBe(1);
    // Total preserved.
    expect(claws.reduce((n, i) => n + i.quantity, 0)).toBe(2);
  });

  it('un-reserving merges the unit back into the free stack (×2 free, no reserved)', async () => {
    const store = await boot();
    const p0 = store.getState().player!;
    store.setState({ player: { ...p0, inventory: [claw('claw-free', 1, false), claw('claw-rsv', 1, true)] } });

    store.getState().toggleReserveForFusion('claw-rsv');

    const claws = store.getState().player!.inventory.filter((i) => i.name === 'Shrike Claw');
    expect(claws.filter((i) => i.reservedForFusion === true)).toHaveLength(0);
    expect(claws.reduce((n, i) => n + i.quantity, 0)).toBe(2);
  });

  it('a single-unit stack just flips the flag in place', async () => {
    const store = await boot();
    const p0 = store.getState().player!;
    store.setState({ player: { ...p0, inventory: [claw('claw-one', 1)] } });

    store.getState().toggleReserveForFusion('claw-one');
    let item = store.getState().player!.inventory.find((i) => i.id === 'claw-one')!;
    expect(item.reservedForFusion).toBe(true);
    expect(item.quantity).toBe(1);

    store.getState().toggleReserveForFusion('claw-one');
    item = store.getState().player!.inventory.find((i) => i.id === 'claw-one')!;
    expect(item.reservedForFusion).toBe(false);
  });
});
