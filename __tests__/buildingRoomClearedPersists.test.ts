// OTA-659 — building rooms must remember what you've cleared across a
// save→exit→rehydrate cycle. Building state is intentionally transient across
// load (you resume outside), and the tile's outdoor micro-micro re-rolls when the
// scene rebuilds — but building-room consumed nouns used to be keyed by that
// volatile outdoor micro-micro, so re-entering refilled every salvage/take/
// investigate tab: a save/exit/rehydrate material farm. Building rooms are now
// keyed by a stable "building:<id>:<room>" identity, independent of the outdoor
// micro-micro, so cleared rooms stay cleared.

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

import { useGameStore, makeRoomKey } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name: 'Delver', raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  // Peaceful outdoor scene so enterBuilding doesn't bail on a live fight.
  store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0 } } : s));
  return store;
}

describe('building room cleared state survives reload (OTA-659)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('stamps a stable building-room micro id and keeps a cleared noun cleared across a simulated reload', async () => {
    const store = await freshGame();

    // Step into the flooded house's kitchen.
    store.getState().enterBuilding('flooded_house');
    let scene = store.getState().currentScene!;
    expect(scene.microMicroId).toBe('building:flooded_house:kitchen');
    expect(scene.ambientNouns).toContain('cupboard');

    // Simulate salvaging the cupboard: record it consumed at the building-room key.
    const pl = store.getState().player!;
    const key = makeRoomKey(pl.currentLocationId, 'building:flooded_house:kitchen', pl.mapX, pl.mapY, pl.hubRoomId);
    store.setState((s) => ({
      worldMemory: {
        ...s.worldMemory,
        visitedRooms: {
          ...s.worldMemory.visitedRooms,
          [key]: { ...(s.worldMemory.visitedRooms?.[key] ?? { visitCount: 1 }), searchedAmbientNouns: ['cupboard'] } as any,
        },
      },
    }));

    // Re-enter the kitchen within the session: the cupboard stays gone.
    store.getState().goBuildingRoom('attic');
    store.getState().goBuildingRoom('kitchen');
    scene = store.getState().currentScene!;
    expect(scene.ambientNouns).not.toContain('cupboard');
    expect(scene.ambientNouns).toContain('hearth');

    // Simulate save→exit→rehydrate: leave the building (restores the outdoor
    // scene), RE-ROLL the outdoor micro-micro (what the reload/scene-rebuild
    // does), then step back into the building — the classic farm attempt.
    store.getState().exitBuilding();
    store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, microMicroId: 'rerolled_outdoor_' + Math.floor(1) } } : s));
    store.getState().enterBuilding('flooded_house');

    scene = store.getState().currentScene!;
    // Key is stable regardless of the outdoor re-roll…
    expect(scene.microMicroId).toBe('building:flooded_house:kitchen');
    // …so the cupboard is STILL cleared. The farm is closed.
    expect(scene.ambientNouns).not.toContain('cupboard');
    expect(scene.ambientNouns).toContain('hearth');
  });

  it('gives each building room its own key (great hall clear does not clear the vault)', async () => {
    const store = await freshGame();
    store.getState().enterBuilding('flooded_house');
    // kitchen and attic must resolve to DIFFERENT stable keys.
    const pl = store.getState().player!;
    const kitchenKey = makeRoomKey(pl.currentLocationId, 'building:flooded_house:kitchen', pl.mapX, pl.mapY, pl.hubRoomId);
    const atticKey = makeRoomKey(pl.currentLocationId, 'building:flooded_house:attic', pl.mapX, pl.mapY, pl.hubRoomId);
    expect(kitchenKey).not.toBe(atticKey);

    // Clear 'trunk' in the attic; the kitchen's nouns are unaffected.
    store.getState().goBuildingRoom('attic');
    let scene = store.getState().currentScene!;
    expect(scene.microMicroId).toBe('building:flooded_house:attic');
    expect(scene.ambientNouns).toContain('trunk');
    store.setState((s) => ({
      worldMemory: {
        ...s.worldMemory,
        visitedRooms: {
          ...s.worldMemory.visitedRooms,
          [atticKey]: { ...(s.worldMemory.visitedRooms?.[atticKey] ?? { visitCount: 1 }), searchedAmbientNouns: ['trunk'] } as any,
        },
      },
    }));
    store.getState().goBuildingRoom('kitchen');
    scene = store.getState().currentScene!;
    expect(scene.ambientNouns).toContain('cupboard'); // kitchen untouched
    store.getState().goBuildingRoom('attic');
    scene = store.getState().currentScene!;
    expect(scene.ambientNouns).not.toContain('trunk'); // attic clear held
  });
});
