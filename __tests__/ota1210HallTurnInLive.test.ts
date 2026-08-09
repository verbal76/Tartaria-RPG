// OTA-1210 — LIVE PROOF FOR P8. A finished bounty closes at the faction's own HALL, with
// no vendor standing anywhere in the room.
//
// ⚠ Everything in ota1210ContractFixes pins source and maths. This drives the real store,
// because "the resolver returns a counterparty" and "a player standing there can finish
// the quest" are different claims — and this session has already had three assertions that
// passed while proving nothing.
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


import { useGameStore } from '../app/state/gameStore';
import { HUNTS } from '../app/engine/hunts';
import { FACTION_STARTING_LOCATION } from '../app/engine/character';

jest.setTimeout(120000);

// A hub room with NO anchorNpc, so beginScene lands no vendor: the hall branch is the only
// thing that can take a hand-in here.
const EMPTY_ROOM = 'outpost_quarters';

async function standInHall(locationId: string) {
  const store = useGameStore;
  const p = store.getState().player!;
  useGameStore.setState({ player: { ...p, currentLocationId: locationId, hubRoomId: EMPTY_ROOM } });
  await store.getState().beginScene?.();
  return store.getState();
}

describe('OTA-1210 / P8 — the faction hall takes its own bounty back', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ a finished hunt closes at the hall with NO vendor present', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Hall Probe', raceId: 'tartarian_giant', factionId: 'forgotten_order' });
    store.getState().skipTutorial?.();

    const hunt = HUNTS.find((h) => h.factionId === 'forgotten_order')!;
    expect(hunt).toBeDefined();
    const home = FACTION_STARTING_LOCATION['forgotten_order']!;

    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        activeHunts: [{
          id: hunt.id, stage: hunt.stages.length,
          postedByFaction: hunt.factionId, acceptedAt: Date.now(),
        }],
      },
    });

    const s = await standInHall(home);
    // ⚠ The premise: there really is nobody here. If a vendor spawned, this test would be
    // proving the vendor path and quietly saying nothing about the hall.
    expect(s.currentScene?.vendor ?? null).toBeNull();

    store.getState().turnInHunt(hunt.id);
    const after = store.getState().player!;
    expect(after.completedHuntIds ?? []).toContain(hunt.id);
    expect((after.activeHunts ?? []).some((h) => h.id === hunt.id)).toBe(false);
  });

  test('⚠ ANOTHER faction’s hall still refuses it', async () => {
    // The hall takes its OWN work. Otherwise P8 would have quietly become "anywhere".
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Hall Probe 2', raceId: 'tartarian_giant', factionId: 'forgotten_order' });
    store.getState().skipTutorial?.();

    const hunt = HUNTS.find((h) => h.factionId === 'forgotten_order')!;
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        activeHunts: [{
          id: hunt.id, stage: hunt.stages.length,
          postedByFaction: hunt.factionId, acceptedAt: Date.now(),
        }],
      },
    });

    const s = await standInHall(FACTION_STARTING_LOCATION['mud_monarchs']!);
    expect(s.currentScene?.vendor ?? null).toBeNull();
    store.getState().turnInHunt(hunt.id);
    expect(store.getState().player!.completedHuntIds ?? []).not.toContain(hunt.id);
  });

  test('⚠ and out in the wilds, with nobody at all, it is still refused', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Hall Probe 3', raceId: 'tartarian_giant', factionId: 'forgotten_order' });
    store.getState().skipTutorial?.();

    const hunt = HUNTS.find((h) => h.factionId === 'forgotten_order')!;
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        currentLocationId: 'asgardar', hubRoomId: undefined,
        activeHunts: [{
          id: hunt.id, stage: hunt.stages.length,
          postedByFaction: hunt.factionId, acceptedAt: Date.now(),
        }],
      },
    });
    store.getState().turnInHunt(hunt.id);
    expect(store.getState().player!.completedHuntIds ?? []).not.toContain(hunt.id);
  });
});
