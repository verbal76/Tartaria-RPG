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
import { getRaces, getFactions } from '../app/engine/character';

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name: 'Delver', raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0 } } : s));
  return store;
}

describe('OTA-786 — market stalls auto-open their wares', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('sets a stall vendor with offers AND auto-opens the vendor screen on entry and each stall swap', async () => {
    const store = await freshGame();

    // Step into the market: lands in the weapons stall and the shop opens.
    store.getState().enterBuilding('market');
    let scene = store.getState().currentScene!;
    expect(store.getState().activeBuildingId).toBe('market');
    expect(scene.microMicroId).toBe('building:market:weapons_stall');
    expect(scene.vendor).toBeTruthy();
    expect(scene.vendor!.offers.length).toBeGreaterThan(0);
    expect(store.getState().currentScreen).toBe('vendor');

    // "← BACK" returns to the stall exploration view WITHOUT clearing the
    // vendor, so the stall tabs + EXIT are available to swap or leave.
    store.getState().setScreen('exploration');
    expect(store.getState().currentScene!.vendor).toBeTruthy();

    for (const room of ['armor_stall', 'food_stall', 'materials_stall']) {
      store.getState().goBuildingRoom(room);
      scene = store.getState().currentScene!;
      expect(scene.microMicroId).toBe(`building:market:${room}`);
      expect(scene.vendor).toBeTruthy();
      expect(scene.vendor!.offers.length).toBeGreaterThan(0);
      expect(store.getState().currentScreen).toBe('vendor');
      store.getState().setScreen('exploration');
    }
  });

  it('does NOT auto-open a vendor for ordinary (non-market) building rooms', async () => {
    const store = await freshGame();
    store.getState().enterBuilding('flooded_house');
    expect(store.getState().activeBuildingId).toBe('flooded_house');
    expect(store.getState().currentScene!.vendor).toBeFalsy();
    expect(store.getState().currentScreen).not.toBe('vendor');
  });
});
