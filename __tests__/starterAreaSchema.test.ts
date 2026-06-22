// engine_Dev — STARTER AREA schema wiring. The dev-console form (and the JSON box)
// emit per-faction areas carrying the newer fields: a per-room missionBoard flag, a
// per-area `returnable` flag, and `coords`. This locks that those fields survive the
// real loader and that the engine helpers read them — so the Mission Board lands in
// the flagged room and a non-returnable area routes to remote turn-in.

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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));

import { useContentPackStore } from '../app/state/contentPackStore';
import {
  getStartingAreas,
  startingAreaForFaction,
  startingAreaIsReturnable,
  factionUsesRemoteTurnIn,
} from '../app/engine/contentPack';

// The exact shape the dev-console StartingAreasBox form serializes.
const FORM_AREA = [{
  factionId: 'allies',
  name: 'Drydock 4 Command',
  locationId: 'harbor',
  coords: { x: 7, y: 12 },
  returnable: false,
  rooms: [
    { id: 'operations', name: 'Operations', shortName: 'Operations', description: 'Operations — part of Drydock 4 Command.', exits: { north: 'world', east: 'armory' }, anchorNpc: null, missionBoard: true },
    { id: 'armory', name: 'Armory', shortName: 'Armory', description: 'Armory — part of Drydock 4 Command.', exits: { west: 'operations', east: 'mess' }, anchorNpc: null },
    { id: 'mess', name: 'Mess', shortName: 'Mess', description: 'Mess — part of Drydock 4 Command.', exits: { west: 'armory' }, anchorNpc: null },
  ],
}];

describe('starter area — new fields survive the loader + drive the engine', () => {
  beforeEach(() => { useContentPackStore.getState().clearStartingAreas(); });

  test('form-shaped area loads, and missionBoard / returnable / coords are read back', () => {
    const r = useContentPackStore.getState().loadStartingAreasJson(JSON.stringify(FORM_AREA));
    expect(r.ok).toBe(true);

    const area = startingAreaForFaction('allies');
    expect(area).not.toBeNull();
    expect(area!.coords).toEqual({ x: 7, y: 12 });

    // exactly one board room, and it's Operations
    const boardRooms = area!.rooms.filter((rm) => rm.missionBoard === true);
    expect(boardRooms).toHaveLength(1);
    expect(boardRooms[0]!.id).toBe('operations');

    // non-returnable → remote turn-in
    expect(startingAreaIsReturnable(area)).toBe(false);
    expect(factionUsesRemoteTurnIn('allies')).toBe(true);
  });

  test('a returnable area (default) does NOT use remote turn-in', () => {
    const returnable = [{ ...FORM_AREA[0], returnable: true }];
    useContentPackStore.getState().loadStartingAreasJson(JSON.stringify(returnable));
    expect(factionUsesRemoteTurnIn('allies')).toBe(false);
    expect(getStartingAreas()).toHaveLength(1);
  });
});
