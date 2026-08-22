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

  it('lands in the square (no shop) then auto-opens each stall you step into', async () => {
    const store = await freshGame();

    // OTA-787 — ENTER drops you in the market SQUARE: flavor + a choice of
    // stalls, NO vendor and NO auto-open. You pick a stall to shop.
    store.getState().enterBuilding('market');
    let scene = store.getState().currentScene!;
    expect(store.getState().activeBuildingId).toBe('market');
    expect(scene.microMicroId).toBe('building:market:market_square');
    expect(scene.vendor).toBeFalsy();
    expect(store.getState().currentScreen).not.toBe('vendor');

    // Stepping into any stall mints its vendor with offers AND opens the shop.
    for (const room of ['weapons_stall', 'armor_stall', 'food_stall', 'materials_stall']) {
      store.getState().goBuildingRoom(room);
      scene = store.getState().currentScene!;
      expect(scene.microMicroId).toBe(`building:market:${room}`);
      expect(scene.vendor).toBeTruthy();
      expect(scene.vendor!.offers.length).toBeGreaterThan(0);
      expect(store.getState().currentScreen).toBe('vendor');
      // "← BACK" returns to the stall WITHOUT clearing the vendor, so the stall
      // tabs + EXIT stay available to swap stalls or leave.
      store.getState().setScreen('exploration');
      expect(store.getState().currentScene!.vendor).toBeTruthy();

      // OTA-788 — tapping the stall tab you're already in re-opens its wares
      // (the TRADE button is gone).
      store.getState().goBuildingRoom(room);
      expect(store.getState().currentScreen).toBe('vendor');
      store.getState().setScreen('exploration');
    }
  });

  it('⚠⚠ OTA-1430 — the SQUARE is back on the tab list, and it is still not a vendor', () => {
    // It was navHidden from OTA-787 ("the row is the four stall tabs + EXIT").
    // OTA-1430 tied the way out to the room with the door, and for the market
    // that room IS the square — so a hidden square would have left a player at
    // the food stall with no chip back to it and no EXIT of its own: stranded.
    // It is a tab again. What must NOT change is that walking into it opens no
    // vendor, which is this file's whole subject — it carries no stallCategory.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { visibleBuildingRooms, getBuildingRoom } = require('../app/engine/buildings') as typeof import('../app/engine/buildings');
    const tabs = visibleBuildingRooms('market', new Set<string>()).filter((r) => !r.navHidden);
    expect(tabs.map((r) => r.id)).toEqual([
      'market_square', 'weapons_stall', 'armor_stall', 'food_stall', 'materials_stall',
    ]);
    expect(getBuildingRoom('market', 'market_square')?.stallCategory).toBeUndefined();
  });

  it('does NOT auto-open a vendor for ordinary (non-market) building rooms', async () => {
    const store = await freshGame();
    store.getState().enterBuilding('flooded_house');
    expect(store.getState().activeBuildingId).toBe('flooded_house');
    expect(store.getState().currentScene!.vendor).toBeFalsy();
    expect(store.getState().currentScreen).not.toBe('vendor');
  });
});
