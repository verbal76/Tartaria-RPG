// Regression — a Core Guardian must only answer when the player is
// genuinely STANDING IN the Lost Capital, never mid-journey or wandered
// out into its wilderness tiles.
//
// Bug (playtest, "how did I find a guardian between two capitals?"):
// player.currentLocationId only flips on ARRIVAL, so it lingers as the
// DEPARTURE capital for the whole of a plotted trip (and stays put while
// you cardinally wander off the anchor). The Core-recovery gate keyed
// purely off currentLocationId, so a faction gate-intent action out in
// the open — e.g. a Reclaimer's `investigate` on a roadside prop —
// summoned the departure capital's Guardian miles from the city.
//
// Fix: isStationedAtNamedLocation gate (no travelTarget + on map anchor /
// in a hub room). This test pins all three states.

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

import { useGameStore } from '../app/state/gameStore';
import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y, canonicalCellOf } from '../app/engine/worldMap';
import { isCoreGuardian } from '../app/engine/coreGuardians';

const CAPITAL = 'asgardar'; // a Lost Capital with a Guardian def

async function bootAtCapital() {
  const store = useGameStore;
  await store.getState().hydrate();
  // Reclaimers gate intent is `investigate` — no combat scene needed.
  await store.getState().startNewGame({ name: 'Pathfinder', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const scene = store.getState().currentScene!;
  const player = store.getState().player!;
  store.setState({
    player: {
      ...player,
      currentLocationId: CAPITAL,
      // ⚠⚠ OTA-1480 — gridX/gridY MOVE WITH currentLocationId. This fixture used
      // to set the id to Asgardar and leave the AUTHORITATIVE cell on the
      // character's start location, so "am I standing in the capital" was only
      // ever true by accident: the old predicate asked the RE-CENTERED visual
      // frame, which the tests below set by hand. `gridToVisual` makes the two an
      // identity — mapX === CENTER_X exactly when gridX is the location's canon
      // cell — and no real path in the game writes one without the other
      // (creation, travelTo and stepDirection write both; the save loader derives
      // mapX/mapY from gridX/gridY). So this is the fixture it always meant to be.
      //
      // ⚠ The per-test `mapX/mapY` overrides below still do the work they always
      // did: the off-anchor case sets mapX = CENTER + 3 to stand out in the open,
      // and it stays off-anchor because the tests that need to be ON the anchor
      // set it back to centre. Those two readings now agree instead of one of them
      // being the only one anybody checked.
      ...(() => { const c = canonicalCellOf(CAPITAL); return { gridX: c.x, gridY: c.y }; })(),
      // mainQuest is in the `cores` phase with nothing recovered, so the
      // capital's Core is still up for grabs (canRecoverCore === true).
      mainQuest: { phase: 'cores', coresRecovered: [] },
      hubRoomId: null,
    },
    currentScene: {
      ...scene,
      enemies: [],
      enemyHps: [],
      vendor: null,
      hooks: [],
      ambientNouns: ['rubble', 'marker', 'rope'],
      displayedAmbientNouns: ['rubble', 'marker', 'rope'],
    },
  });
  return store;
}

function guardianInScene(): boolean {
  const enemies = useGameStore.getState().currentScene?.enemies ?? [];
  return enemies.some((e) => isCoreGuardian(e));
}

describe('Core Guardian — stationing gate (no spawns mid-travel)', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('does NOT summon the Guardian while in transit (travelTarget set)', async () => {
    const store = await bootAtCapital();
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        travelTarget: { locationId: 'samarran', distanceRemaining: 4 },
        mapX: WORLD_MAP_CENTER_X,
        mapY: WORLD_MAP_CENTER_Y,
      },
    });
    store.getState().submitPlayerAction('investigate the rubble');
    expect(guardianInScene()).toBe(false);
  });

  it('does NOT summon the Guardian when wandered off the anchor tile', async () => {
    // ⚠⚠ OTA-1480 — THIS MOVED THE DISPLAY FRAME AND NOT THE PLAYER. It set
    // `mapX = CENTER + 3` and left gridX on the capital's cell, which was
    // off-anchor only to the old visual-frame predicate. Once the predicate reads
    // the authoritative cell, that fixture is standing squarely IN the capital,
    // and the test would have passed for a reason that had nothing to do with
    // anchors — the verb stopped summoning at all when that door was closed.
    // Both coordinates move now, so the character is really out in the open.
    const store = await bootAtCapital();
    const p = store.getState().player!;
    const cell = canonicalCellOf(CAPITAL);
    store.setState({
      player: {
        ...p,
        travelTarget: undefined,
        gridX: cell.x + 3, gridY: cell.y,        // off the city anchor — out in the open
        mapX: WORLD_MAP_CENTER_X + 3,            // …and the frame agrees, as gridToVisual would
        mapY: WORLD_MAP_CENTER_Y,
      },
    });
    store.getState().submitPlayerAction('investigate the rubble');
    expect(guardianInScene()).toBe(false);
    // ⚠ AND THE BUTTON REFUSES TOO — the half this suite never checked. The verb
    // no longer summons under any circumstances, so asserting on it alone can no
    // longer tell an anchored player from an un-anchored one.
    const res = store.getState().summonCoreGuardian();
    expect(res).toEqual({ ok: false, reason: 'not_at_capital' });
    expect(guardianInScene()).toBe(false);
  });

  // ⚠⚠ THE VERB NO LONGER SUMMONS — THE BUTTON DOES. Owner: *"guardians should
  // only come from the summon button, because there are other quests in some of
  // the capital cities that need to examine the area and the examine summon will
  // eat the other events."* So the pair below is the whole rule: investigating
  // inside a capital is just investigating, and the summon action still works and
  // still respects the stationing gate this suite was written for.
  it('⚠⚠ investigating in the capital does NOT summon — that door is closed', async () => {
    const store = await bootAtCapital();
    const p = store.getState().player!;
    store.setState({
      player: { ...p, travelTarget: undefined, mapX: WORLD_MAP_CENTER_X, mapY: WORLD_MAP_CENTER_Y },
    });
    store.getState().submitPlayerAction('investigate the rubble');
    expect(guardianInScene()).toBe(false);
  });

  it('⚠⚠ ...and the SUMMON action does, when actually standing in the capital', async () => {
    const store = await bootAtCapital();
    const p = store.getState().player!;
    store.setState({
      player: { ...p, travelTarget: undefined, mapX: WORLD_MAP_CENTER_X, mapY: WORLD_MAP_CENTER_Y },
    });
    const res = store.getState().summonCoreGuardian();
    expect(res.ok).toBe(true);
    expect(guardianInScene()).toBe(true);
  });

  it('⚠ the stationing gate this suite exists for still holds on the button', async () => {
    // Mid-journey, currentLocationId still reads as the departure capital.
    const store = await bootAtCapital();
    const p = store.getState().player!;
    // ⚠ The subject here is the TRAVEL clause, which refuses on `travelTarget`
    // alone — the coordinates below are belt-and-braces and are deliberately left
    // inconsistent with each other, because a player mid-journey is not "here"
    // whatever the map says. The off-anchor case is covered by its own test above.
    store.setState({ player: { ...p, travelTarget: { locationId: 'somewhere_else' }, mapX: 3, mapY: 3 } });
    const res = store.getState().summonCoreGuardian();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('not_at_capital');
    expect(guardianInScene()).toBe(false);
  });
});
