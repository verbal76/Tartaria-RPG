// arb47 — the player's position is a PERSISTENT ABSOLUTE cell on the install-
// fixed canon grid. It never warps when a named tile is crossed; a cardinal step
// moves it by exactly ±1; routing to the same place from the same spot always
// reads the same distance; and 5 paces south then 5 north returns to the SAME
// cell. This is the regression test for the playtest report where setting course
// for The Hidden Market from the same area read 6, then 11, then 24 days.

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
import { canonicalCellOf, canonicalDistanceFromGrid } from '../app/engine/worldMap';
import type { Direction } from '../app/engine/worldMap';

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Surveyor', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  // Plenty of stamina + clear any hub gate so cardinal steps always land.
  store.setState({
    player: {
      ...p0,
      hubRoomId: null,
      stamina: 500,
      staminaMax: 500,
      stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    },
  });
  return store;
}

describe('arb47 — absolute-grid player position never warps', () => {
  beforeAll(() => { console.log = () => {}; });

  it('starts on the start location\'s fixed canon cell', async () => {
    const store = await bootstrap();
    const p = store.getState().player!;
    const cell = canonicalCellOf(p.currentLocationId);
    expect(p.gridX).toBe(cell.x);
    expect(p.gridY).toBe(cell.y);
  });

  it('cardinal steps move the cell by exactly ±1 and are reversible (5 S then 5 N = same cell)', async () => {
    const store = await bootstrap();
    const start = store.getState().player!;
    const x0 = start.gridX!;
    const y0 = start.gridY!;

    // 5 paces south — each step +1 on Y (clamped at the board edge only).
    let prevY = y0;
    for (let i = 0; i < 5; i++) {
      const before = store.getState().player!;
      store.setState({ player: { ...before, stamina: before.staminaMax } });
      store.getState().stepDirection('south' as Direction);
      const after = store.getState().player!;
      // X never drifts on a pure-south walk; Y advances by one (or holds at edge).
      expect(after.gridX).toBe(x0);
      expect(after.gridY === prevY + 1 || after.gridY === prevY).toBe(true);
      prevY = after.gridY!;
    }
    const south = store.getState().player!;
    const paces = south.gridY! - y0; // how far we actually got before any edge clamp

    // The same number of paces NORTH returns to the exact starting cell.
    for (let i = 0; i < paces; i++) {
      const before = store.getState().player!;
      store.setState({ player: { ...before, stamina: before.staminaMax } });
      store.getState().stepDirection('north' as Direction);
    }
    const back = store.getState().player!;
    expect(back.gridX).toBe(x0);
    expect(back.gridY).toBe(y0);
  });

  it('routing to the same place from the same spot always reads the same distance (no 6/11/24 warp)', async () => {
    const store = await bootstrap();
    const startId = store.getState().player!.currentLocationId;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const locs = require('../app/data/locations/locations.json') as Array<{ id: string }>;
    const destId = locs.find((l) => l.id !== startId)?.id;
    if (!destId) throw new Error('No alternate location found');

    // Wander a few tiles off the anchor in open ground (no arrival), then measure.
    const wanderAndMeasure = (): number => {
      const p = store.getState().player!;
      return canonicalDistanceFromGrid(p.gridX!, p.gridY!, destId);
    };

    // From the exact same cell, the distance is identical every time it is asked.
    const a = wanderAndMeasure();
    const b = wanderAndMeasure();
    expect(a).toBe(b);

    // Take one step away and one step back — distance must return to the original.
    const p1 = store.getState().player!;
    store.setState({ player: { ...p1, stamina: p1.staminaMax } });
    store.getState().stepDirection('east' as Direction);
    const p2 = store.getState().player!;
    // If that step didn't cross into a named location, stepping back west restores
    // both the cell and the measured distance.
    if (p2.currentLocationId === startId) {
      const away = canonicalDistanceFromGrid(p2.gridX!, p2.gridY!, destId);
      store.setState({ player: { ...store.getState().player!, stamina: 500 } });
      store.getState().stepDirection('west' as Direction);
      const p3 = store.getState().player!;
      expect(p3.gridX).toBe(p1.gridX);
      expect(p3.gridY).toBe(p1.gridY);
      expect(canonicalDistanceFromGrid(p3.gridX!, p3.gridY!, destId)).toBe(a);
      // and the step away changed distance by exactly 1 (honest, not a warp).
      expect(Math.abs(away - a)).toBe(1);
    }
  });

  it('OTA-510 one-shot: a pre-510 save reloads ONE tile west of the Hidden Market (route reads 1)', async () => {
    const store = await bootstrap();
    const slotId = store.getState().activeSlotId!;
    const market = canonicalCellOf('hidden_market');

    // Simulate a pre-OTA-510 save: strip the one-shot guard + stand somewhere else.
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        _placedWestOfHiddenMarket510: undefined,
        gridX: 5,
        gridY: 5,
      },
    });
    await store.getState().persist();

    // Cold reload through the real boot path — backfillPlayer fires the one-shot.
    await store.getState().loadSlotIntoGame(slotId);
    const after = store.getState().player!;
    expect(after.gridX).toBe(market.x - 1);
    expect(after.gridY).toBe(market.y);
    expect(after._placedWestOfHiddenMarket510).toBe(true);
    expect(canonicalDistanceFromGrid(after.gridX!, after.gridY!, 'hidden_market')).toBe(1);

    // And it does NOT fire a second time — reloading again keeps the player put.
    store.setState({ player: { ...store.getState().player!, gridX: 9, gridY: 9 } });
    await store.getState().persist();
    await store.getState().loadSlotIntoGame(slotId);
    const again = store.getState().player!;
    expect(again.gridX).toBe(9);
    expect(again.gridY).toBe(9);
  });

  it('arriving at a location snaps the cell to that location\'s fixed canon cell', async () => {
    const store = await bootstrap();
    const startId = store.getState().player!.currentLocationId;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const locs = require('../app/data/locations/locations.json') as Array<{ id: string }>;
    const destId = locs.find((l) => l.id !== startId)?.id;
    if (!destId) throw new Error('No alternate location found');

    store.getState().setTravelCourse(destId);
    let safety = 400;
    while (safety-- > 0) {
      const cur = store.getState().player!;
      if (cur.currentLocationId === destId) break;
      if (!cur.travelTarget) break;
      store.setState({ player: { ...cur, stamina: cur.staminaMax } });
      store.getState().continueTravel();
    }
    const arrived = store.getState().player!;
    expect(arrived.currentLocationId).toBe(destId);
    const cell = canonicalCellOf(destId);
    expect(arrived.gridX).toBe(cell.x);
    expect(arrived.gridY).toBe(cell.y);
  });
});
