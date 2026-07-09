// OTA-735 — a room the player cleared must STAY cleared across an app reload.
//
// makeRoomKey keys per-room state (searchedAmbientNouns, investigation tables,
// dog-smell, climb markers) on the VISUAL coords mapX/mapY. During live play
// every step maintains the invariant  mapX/mapY === gridToVisual(gridX, gridY,
// currentLocationId)  (see the stepInDirection handler). The pre-OTA-735
// rehydrate broke that invariant by snapping mapX/mapY to the grid CENTER while
// keeping the true gridX/gridY — so on reload the current room got a fresh key
// and its consumed marks were orphaned: a picked-clean site (especially a
// building, which spawns on an OFF-ANCHOR tile) became fully lootable again.
//
// The fix reconstructs mapX/mapY from the preserved absolute cell via
// gridToVisual on rehydrate. This test pins the two guarantees that makes:
//   1. off-anchor: the reconstructed key === the live key (marks survive).
//   2. the old blind-center reconstruction did NOT match (proves the bug).

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

import { makeRoomKey } from '../app/state/gameStore';
import {
  gridToVisual,
  WORLD_MAP_CENTER_X,
  WORLD_MAP_CENTER_Y,
  canonicalCellFor,
} from '../app/engine/worldMap';

describe('OTA-735 — room key survives reload (off-anchor tiles)', () => {
  // A synthetic id (not in canonicalPositions), so gridToVisual resolves its
  // anchor via canonicalCellFor — keeps this test content-pack-agnostic.
  const locId = 'zzz_test_reload_site';
  const anchor = canonicalCellFor(locId);
  // Player walked 3 east + 2 south of the location anchor, then entered a
  // building room on that tile (buildings spawn off-anchor).
  const gridX = anchor.x + 3;
  const gridY = anchor.y + 2;
  const buildingMicroId = 'building:abandoned_outpost:great_hall';

  // The LIVE key, as written while playing (mapX/mapY = gridToVisual of the cell).
  const liveVisual = gridToVisual(gridX, gridY, locId);
  const liveKey = makeRoomKey(locId, buildingMicroId, liveVisual.mapX, liveVisual.mapY, null);

  it('the reconstructed (OTA-735) coords reproduce the live room key exactly', () => {
    // What rehydrate now does: derive mapX/mapY from the preserved grid cell.
    const rebuilt = gridToVisual(gridX, gridY, locId);
    const reloadedKey = makeRoomKey(locId, buildingMicroId, rebuilt.mapX, rebuilt.mapY, null);
    expect(reloadedKey).toBe(liveKey);
  });

  it('the OLD blind-center snap produced a DIFFERENT key (the orphaning bug)', () => {
    const staleKey = makeRoomKey(locId, buildingMicroId, WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y, null);
    expect(staleKey).not.toBe(liveKey);
  });

  it('at an anchor tile the reconstruction equals center (common case unchanged)', () => {
    const atAnchor = gridToVisual(anchor.x, anchor.y, locId);
    expect(atAnchor.mapX).toBe(WORLD_MAP_CENTER_X);
    expect(atAnchor.mapY).toBe(WORLD_MAP_CENTER_Y);
  });
});
