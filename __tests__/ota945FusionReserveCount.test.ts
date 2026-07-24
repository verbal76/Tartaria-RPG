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

// OTA-945 — count-aware fusion reserve. Owner: reserving a x5 stack meant five modal
// round-trips at one peel per tap. toggleReserveForFusion now takes a count; the UI's
// "Save all xN" button passes the whole stack.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem } from '../app/engine/types';

const rows = (name: string) =>
  useGameStore.getState().player!.inventory.filter((i) => i.name === name);

async function bootWithStack(qty: number) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'StackSaver', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  const id = 'ota_stack_bolt';
  store.setState((s) => ({
    player: {
      ...s.player!,
      inventory: [
        ...s.player!.inventory.filter((i) => i.name !== 'Test Bone Bolt'),
        { id, name: 'Test Bone Bolt', kind: 'misc', quantity: qty, tags: ['loot', 'organic'] } as unknown as InventoryItem,
      ],
    },
  }));
  return { store, id };
}

describe('OTA-945 — toggleReserveForFusion moves N units in one call', () => {
  it('default tap still peels exactly one (old behavior unchanged)', async () => {
    const { store, id } = await bootWithStack(5);
    store.getState().toggleReserveForFusion(id);
    const r = rows('Test Bone Bolt');
    expect(r.find((i) => i.reservedForFusion)?.quantity).toBe(1);
    expect(r.find((i) => !i.reservedForFusion)?.quantity).toBe(4);
  });

  it('a partial count splits the stack exactly (3 of 5)', async () => {
    const { store, id } = await bootWithStack(5);
    store.getState().toggleReserveForFusion(id, 3);
    const r = rows('Test Bone Bolt');
    expect(r.find((i) => i.reservedForFusion)?.quantity).toBe(3);
    expect(r.find((i) => !i.reservedForFusion)?.quantity).toBe(2);
  });

  it('save-all flips the whole stack in one call — no split, no churn', async () => {
    const { store, id } = await bootWithStack(5);
    store.getState().toggleReserveForFusion(id, 5);
    const r = rows('Test Bone Bolt');
    expect(r).toHaveLength(1);
    expect(r[0]!.reservedForFusion).toBe(true);
    expect(r[0]!.quantity).toBe(5);
  });

  it('free-all merges a split stack back into one free row', async () => {
    const { store, id } = await bootWithStack(5);
    store.getState().toggleReserveForFusion(id, 3); // 3 reserved / 2 free
    const reservedRow = rows('Test Bone Bolt').find((i) => i.reservedForFusion)!;
    store.getState().toggleReserveForFusion(reservedRow.id, 3); // free all 3 back
    const r = rows('Test Bone Bolt');
    expect(r).toHaveLength(1);
    expect(r[0]!.reservedForFusion ?? false).toBe(false);
    expect(r[0]!.quantity).toBe(5);
  });

  it('an oversized count clamps to the stack instead of going negative', async () => {
    const { store, id } = await bootWithStack(4);
    store.getState().toggleReserveForFusion(id, 99);
    const r = rows('Test Bone Bolt');
    expect(r).toHaveLength(1);
    expect(r[0]!.reservedForFusion).toBe(true);
    expect(r[0]!.quantity).toBe(4);
  });
});
