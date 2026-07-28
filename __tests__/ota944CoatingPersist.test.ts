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

// OTA-944 — regression lock: a weapon's SECOND coating (coating2) must survive the full
// save round-trip. Investigation of "the corruption coating vanished from the Mud-fist Wraps"
// proved persistence is clean on the current build; this pins it so it stays that way.
// (The real destroy vector was the one-tap 'replace' coat action, hardened in InventoryScreen.)
import { useGameStore, backfillPlayer } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

function dualCoatedWraps(): InventoryItem {
  return {
    id: 'ota944_wraps',
    name: 'Mud-fist Wraps',
    kind: 'weapon',
    quantity: 1,
    rarity: 'Rare',
    tags: ['weapon', 'barehanded', 'melee'],
    durability: { current: 11, max: 11 },
    coatingSlots: 2,
    coating: { kind: 'electrical', dice: '1d4', label: 'Charged' },
    coating2: { kind: 'corruption', dice: '1d4', label: 'Corrupted' },
  } as unknown as InventoryItem;
}

describe('OTA-944 — coating2 survives the save round-trip', () => {
  it('keeps both coatings + the second slot through stringify -> parse -> backfillPlayer', async () => {
    const store = await boot('CoatTwoRegress');
    const base = store.getState().player as PlayerCharacter;
    const withWraps: PlayerCharacter = { ...base, inventory: [...base.inventory, dualCoatedWraps()] };

    // Full persistence path: the slot save is JSON.stringify(state) and load is JSON.parse
    // -> backfillPlayer. Round-trip exactly that.
    const serialized = JSON.parse(JSON.stringify(withWraps)) as PlayerCharacter;
    const out = backfillPlayer(serialized);

    const w = out.inventory.find((i) => i.id === 'ota944_wraps')! as unknown as {
      coating?: { kind?: string }; coating2?: { kind?: string }; coatingSlots?: number;
    };
    expect(w).toBeTruthy();
    expect(w.coating?.kind).toBe('electrical');
    expect(w.coating2?.kind).toBe('corruption');
    expect(w.coatingSlots).toBe(2);
  });
});
