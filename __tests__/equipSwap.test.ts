// OTA 041 — Equip-swap verification. Pre-ship audit flagged equipItem
// at gameStore.ts:9432-9505 as vaporizing the previously equipped item
// when the player equips a new one into the same slot. This test pins
// the actual behavior end to end.

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
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
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
import { getRaces, getFactions } from '../app/engine/character';

describe('equipItem swap preserves the previously-equipped item', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('equipping a new amulet over an existing one keeps both in inventory', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Swapper', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        inventory: [
          ...p0.inventory.filter((i) => i.name !== 'Aetheric Locket' && i.name !== 'Reclaimer Compass'),
          { id: 'locket_x', name: 'Aetheric Locket', kind: 'relic', quantity: 1, tags: ['amulet', 'relic'] },
          { id: 'compass_x', name: 'Reclaimer Compass', kind: 'relic', quantity: 1, tags: ['amulet', 'relic'] },
        ],
        equipped: {
          ...(p0.equipped ?? {}),
          amulet: 'Aetheric Locket',
          amuletId: 'locket_x',
        },
      },
    });

    // Sanity: locket equipped, compass in inventory waiting.
    const before = store.getState().player!;
    expect(before.equipped?.amulet).toBe('Aetheric Locket');
    expect(before.inventory.find((i) => i.id === 'locket_x')).toBeDefined();
    expect(before.inventory.find((i) => i.id === 'compass_x')).toBeDefined();

    // Swap — equip the Compass into the same Amulet slot.
    store.getState().equipItem('Reclaimer Compass', 'amulet');

    const after = store.getState().player!;
    expect(after.equipped?.amulet).toBe('Reclaimer Compass');
    // BOTH items must remain in inventory — the old Locket is just
    // un-equipped now, not destroyed.
    expect(after.inventory.find((i) => i.id === 'locket_x')).toBeDefined();
    expect(after.inventory.find((i) => i.id === 'compass_x')).toBeDefined();
    expect(after.inventory.find((i) => i.id === 'locket_x')!.quantity).toBe(1);
  });
});
