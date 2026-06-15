// 2026-05-25 — quick repro for the user's report that
// "Set Course button no longer sets the course on the main screen"
// + "when it did it never reached the destination."

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

async function bootstrapOutsideHub() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Walker', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  // Clear hubRoomId so the gate doesn't fire.
  const p0 = store.getState().player!;
  store.setState({
    player: {
      ...p0,
      hubRoomId: null,
      stamina: 50,
      staminaMax: 50,
      stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    },
  });
  return store;
}

describe('travel — setTravelCourse engine repro', () => {
  beforeAll(() => { console.log = () => {}; });

  it('writes player.travelTarget when called outside a hub', async () => {
    const store = await bootstrapOutsideHub();
    const before = store.getState().player!;
    expect(before.travelTarget).toBeFalsy();

    // Pick any location different from the starting one.
    const startId = before.currentLocationId;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const locs = require('../app/data/locations/locations.json') as Array<{ id: string }>;
    const destId = locs.find((l) => l.id !== startId)?.id;
    if (!destId) throw new Error('No alternate location found');

    store.getState().setTravelCourse(destId);

    const after = store.getState().player!;
    // The setTravelCourse implementation takes the first step
    // immediately; if the destination was 1 tile away the
    // travelTarget is cleared on arrival, otherwise it stays set.
    // For locations far from the start, travelTarget must be set.
    if (after.currentLocationId === destId) {
      expect(after.travelTarget).toBeFalsy(); // arrived in 1 step
    } else {
      expect(after.travelTarget).toBeTruthy();
      expect(after.travelTarget?.locationId).toBe(destId);
    }
  });

  it('OTA-615 — sets the course but does NOT move when stamina is 0', async () => {
    const store = await bootstrapOutsideHub();
    const before = store.getState().player!;
    const startId = before.currentLocationId;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const locs = require('../app/data/locations/locations.json') as Array<{ id: string }>;
    const destId = locs.find((l) => l.id !== startId)?.id;
    if (!destId) throw new Error('No alternate location found');
    // Deplete stamina to 0 — should still be allowed to PLAN the route.
    store.setState({ player: { ...before, stamina: 0 } });
    const p = store.getState().player!;
    const posBefore = { x: p.mapX, y: p.mapY, loc: p.currentLocationId };

    store.getState().setTravelCourse(destId);

    const after = store.getState().player!;
    // The course is planned (the travel row will render) even at 0 stamina...
    expect(after.travelTarget?.locationId).toBe(destId);
    // ...but the first step was NOT taken — the player hasn't moved.
    expect({ x: after.mapX, y: after.mapY, loc: after.currentLocationId }).toEqual(posBefore);
  });

  it('reaches the destination via repeated continueTravel calls', async () => {
    const store = await bootstrapOutsideHub();
    const startId = store.getState().player!.currentLocationId;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const locs = require('../app/data/locations/locations.json') as Array<{ id: string }>;
    const destId = locs.find((l) => l.id !== startId)?.id;
    if (!destId) throw new Error('No alternate location found');

    store.getState().setTravelCourse(destId);
    let safety = 200;
    while (safety-- > 0) {
      const cur = store.getState().player!;
      if (cur.currentLocationId === destId) break;
      if (!cur.travelTarget) {
        // Lost the course before arriving — print debug and fail.
        // eslint-disable-next-line no-console
        console.error('travel target cleared but did not arrive:', {
          currentLocationId: cur.currentLocationId,
          mapX: cur.mapX,
          mapY: cur.mapY,
          destId,
        });
        throw new Error('Travel target cleared before arrival');
      }
      // Restock stamina so we can keep walking.
      if (cur.stamina < 5) {
        store.setState({ player: { ...cur, stamina: cur.staminaMax } });
      }
      store.getState().continueTravel();
    }
    expect(store.getState().player!.currentLocationId).toBe(destId);
  });
});
