// OTA-912 — using a Skyreacher Chart unlocks its great climb, reveals the
// landmark, logs the mission, and consumes the chart.

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

describe('OTA-912 — Skyreacher Chart unlocks a great climb', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('using the Grand Spire chart unlocks the climb, reveals the landmark, and is consumed', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Cartographer', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    const chart: InventoryItem = {
      id: 'chart1', name: 'Skyreacher Map 1 of 5 — Grand Spire', kind: 'misc', rarity: 'Rare', quantity: 1, tags: ['map', 'skyreacher_chart', 'chart'],
    };
    store.setState({ player: { ...p0, inventory: [...p0.inventory, chart] } });

    expect((store.getState().worldMemory.unlockedGreatClimbs ?? [])).not.toContain('grand_spire');
    // The real player path — tapping USE on the chart in the inventory.
    store.getState().useInventoryItem('Skyreacher Map 1 of 5 — Grand Spire');

    const wm = store.getState().worldMemory;
    expect(wm.unlockedGreatClimbs ?? []).toContain('grand_spire');
    expect(wm.discoveredLocationIds ?? []).toContain('grand_spire_of_etheria');
    // chart consumed
    expect((store.getState().player!.inventory).some((i) => i.id === 'chart1')).toBe(false);
  });
});
