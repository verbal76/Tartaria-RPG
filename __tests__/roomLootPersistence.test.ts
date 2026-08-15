// arb39 — persistent-room emptiness. Once an interactable has been taken
// or salvaged in a room (recorded in visitedRooms[key].searchedAmbientNouns),
// it must NOT respawn as a chip when the player re-enters — closing the
// re-enter-a-room-to-farm-skills/supplies exploit. Covers both the building
// composer (patchSceneForBuildingRoom) and, via the same helper, the hub
// composer in beginScene.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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

jest.setTimeout(15000);

import { useGameStore, makeRoomKey } from '../app/state/gameStore';
import { getBuilding, buildingEntryRoom } from '../app/engine/buildings';

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Looter', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p = store.getState().player!;
  // Off the city anchor, not in a hub room — a wild tile that can hold a building.
  store.setState({
    player: { ...p, currentLocationId: 'outskirts', mapX: 5, mapY: 5, hubRoomId: null },
    currentScene: { ...store.getState().currentScene!, microMicroId: null, enemies: [], enemyHps: [], vendor: null, elevatedOn: null },
  });
  return store;
}

describe('arb39 — looted interactables do not respawn on re-entry', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('control: a fresh building room shows all its interactables', async () => {
    const store = await boot();
    const entry = buildingEntryRoom('shack')!;
    store.getState().enterBuilding('shack');
    const shown = store.getState().currentScene!.displayedAmbientNouns ?? [];
    for (const noun of entry.interactables) {
      expect(shown).toContain(noun);
    }
  });

  it('an interactable already taken/salvaged here is filtered out on entry', async () => {
    const store = await boot();
    const entry = buildingEntryRoom('shack')!;
    const consumedNoun = entry.interactables[0]!; // 'stove'
    // Seed the room's terminal-consumption record (what take/salvage write).
    // OTA-659 — building rooms key by a STABLE "building:<id>:<room>" identity
    // (not the volatile outdoor micro-micro), so seed at that key.
    const roomKey = makeRoomKey('outskirts', `building:shack:${entry.id}`, 5, 5, null);
    store.setState((s: any) => ({
      worldMemory: {
        ...s.worldMemory,
        visitedRooms: {
          ...(s.worldMemory.visitedRooms ?? {}),
          [roomKey]: { firstVisitAt: Date.now(), lastVisitAt: Date.now(), visitCount: 1, searchedAmbientNouns: [consumedNoun.toLowerCase()] },
        },
      },
    }));
    store.getState().enterBuilding('shack');
    const shown = store.getState().currentScene!.displayedAmbientNouns ?? [];
    expect(shown).not.toContain(consumedNoun);
    // The un-looted ones are still there.
    for (const noun of entry.interactables.slice(1)) {
      expect(shown).toContain(noun);
    }
  });

  it('the building entry room id matches the template (sanity)', async () => {
    expect(getBuilding('shack')!.entryRoomId).toBe(buildingEntryRoom('shack')!.id);
  });
});
