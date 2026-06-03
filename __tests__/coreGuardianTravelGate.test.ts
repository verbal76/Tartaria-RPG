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
import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from '../app/engine/worldMap';
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
    const store = await bootAtCapital();
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        travelTarget: undefined,
        mapX: WORLD_MAP_CENTER_X + 3, // off the city anchor — out in the open
        mapY: WORLD_MAP_CENTER_Y,
      },
    });
    store.getState().submitPlayerAction('investigate the rubble');
    expect(guardianInScene()).toBe(false);
  });

  it('DOES summon the Guardian when actually standing in the capital', async () => {
    const store = await bootAtCapital();
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        travelTarget: undefined,
        mapX: WORLD_MAP_CENTER_X,
        mapY: WORLD_MAP_CENTER_Y,
      },
    });
    store.getState().submitPlayerAction('investigate the rubble');
    expect(guardianInScene()).toBe(true);
  });
});
