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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));



// OTA-1199 — LIVE: the app actually HANDS the roller this place's loot table.
//
// ⚠⚠ THIS SUITE EXISTS BECAUSE THE UNIT TESTS CANNOT CATCH A NO-OP. `ota1199SiteLoot`
// calls `rollAreaSearch` with a `siteLoot` array built by hand — so it proves the roller
// and the resolver, and says nothing about whether the STORE passes them. If
// `siteLootForScene` returned [] on every real scene, the feature would ship doing
// precisely nothing with eight green tests behind it. That is the OTA-1186 lesson, and it
// cost a whole OTA to learn.
//
// ⚠ It reads the SEAM rather than a search outcome, deliberately: a noun can only be
// searched once per room, so a sampling loop is refused after the first attempt — and a
// single 10% roll asserted as an outcome is a coin flip wearing a test's clothes.
import { useGameStore, siteLootForScene } from '../app/state/gameStore';
import { ladderLootPool } from '../app/engine/encounter';
import { WORLD_LADDER, findMicroMicroAnywhere } from '../app/engine/worldLadder';

jest.setTimeout(180000);

/** The first micro-micro in the ladder that actually authors loot. */
function firstLootSite() {
  for (const macro of WORLD_LADDER.macroLocations) {
    for (const micro of macro.microLocations ?? []) {
      for (const mm of micro.microMicroLocations ?? []) {
        if (mm.lootTable && mm.lootTable.length > 0) return { macro, micro, mm };
      }
    }
  }
  return null;
}

describe('OTA-1199 / P15 — LIVE, the store hands the roller the site table', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ standing on a real micro-micro, the store resolves THAT place\'s loot rows', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Searcher', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();

    const site = firstLootSite();
    expect(site).not.toBeNull();
    const expected = ladderLootPool(findMicroMicroAnywhere(site!.mm.id)).map((p) => p.name).sort();
    expect(expected.length).toBeGreaterThan(0);

    // ⚠ OUT OF THE HUB FIRST. `beginScene` skips ladder resolution entirely while the
    // player is inside an outpost room — the hub is ground truth there — so a character
    // still standing in their own outpost resolves microMicroId to null, and this test
    // would report the feature dead when it is simply not applicable indoors.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LOCATION_TO_MACRO } = require('../app/engine/worldLadder') as typeof import('../app/engine/worldLadder');
    const openTile = Object.keys(LOCATION_TO_MACRO).find((k) => LOCATION_TO_MACRO[k] === site!.macro.id);
    expect(openTile).toBeTruthy();
    const p0 = store.getState().player!;
    useGameStore.setState({ player: { ...p0, currentLocationId: openTile!, hubRoomId: null } });

    await store.getState().beginScene({ microMicroId: site!.mm.id });
    // The premise: the scene really is standing on that micro-micro.
    expect(store.getState().currentScene?.microMicroId).toBe(site!.mm.id);

    // ⚠⚠ THE CLAIM: what the store would hand `rollAreaSearch` is this place's OWN table.
    // Empty here is the silent-no-op failure the whole suite exists to catch.
    expect(siteLootForScene(store.getState).map((r) => r.name).sort()).toEqual(expected);
  });

  test('⚠ inside a hub room there is no site table, and search is unchanged', async () => {
    const store = useGameStore;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FACTION_STARTING_LOCATION } = require('../app/engine/character') as typeof import('../app/engine/character');
    const p = store.getState().player!;
    // ⚠ The ROOM is not enough — `inHub` is decided by the LOCATION. Setting hubRoomId on a
    // character standing out in the silt leaves them outdoors, and the first version of
    // this test did exactly that and read the outdoor table back.
    useGameStore.setState({
      player: { ...p, currentLocationId: FACTION_STARTING_LOCATION['mud_monarchs']!, hubRoomId: 'outpost_gate' },
    });
    await store.getState().beginScene();
    expect(store.getState().currentScene?.microMicroId ?? null).toBeNull();
    // A hub is ground truth for its own rooms; the ladder does not apply, and the
    // substitution must therefore be inert rather than reaching for a stale micro-micro.
    expect(siteLootForScene(store.getState)).toEqual([]);
  });

  test('⚠ and a searchable noun still resolves normally at such a place', async () => {
    const store = useGameStore;
    const site = firstLootSite()!;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LOCATION_TO_MACRO } = require('../app/engine/worldLadder') as typeof import('../app/engine/worldLadder');
    const openTile = Object.keys(LOCATION_TO_MACRO).find((k) => LOCATION_TO_MACRO[k] === site.macro.id)!;
    const p = store.getState().player!;
    useGameStore.setState({ player: { ...p, currentLocationId: openTile, hubRoomId: null } });
    await store.getState().beginScene({ microMicroId: site.mm.id });
    const before = store.getState().gameLog.length;
    await store.getState().submitPlayerAction('search the rubble');
    const since = store.getState().gameLog.slice(before).map((l: { text: string }) => l.text).join('\n');
    // ⚠ Deliberately NOT asserting WHICH item: the substitution is a 10% roll and pinning
    // the outcome would make this a coin flip wearing a test's clothes. What must hold is
    // that the search still resolves and says something.
    expect(since.length).toBeGreaterThan(0);
  });
});
