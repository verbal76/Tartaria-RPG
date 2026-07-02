// OTA — resuming a mid-journey save must KEEP the tiles already walked.
//
// Repro (Pixel 10 Pro XL): set a course to Mud Seas, walk part-way, hit the
// square/recents button. Backgrounding dumps the ~400 MB Qwen model, so the OS
// often reclaims the process; returning relaunches the app → hydrate →
// backfillPlayer. The old backfill re-seeded distanceRemaining from
// canonicalDistance(currentLocationId, target) — the FULL departure-city→target
// distance — throwing away the walked tiles, so the counter JUMPED UP mid-travel.
//
// Fix: backfill re-seeds from the player's LIVE absolute cell (gridX/gridY via
// playerGridCell), so the badge resumes exactly where the walk left off. Legacy
// saves without gridX/gridY still fall back to the location cell.

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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class {} } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore, backfillPlayer } from '../app/state/gameStore';
import { canonicalCellOf, canonicalDistance, canonicalDistanceFromGrid } from '../app/engine/worldMap';

describe('resuming a mid-journey save keeps the walked progress', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({
      name: 'ResumeTest',
      raceId: 'mud_dweller',
      factionId: 'reclaimers_guild',
    });
    useGameStore.getState().skipTutorial?.();
  });

  it('re-seeds distanceRemaining from the LIVE grid cell, not the departure city', () => {
    const base = useGameStore.getState().player!;
    const from = canonicalCellOf('tartarian_outskirts');
    const to = canonicalCellOf('mud_seas');
    // Stand half-way between the departure city and Mud Seas.
    const midX = Math.round((from.x + to.x) / 2);
    const midY = Math.round((from.y + to.y) / 2);

    const partial = canonicalDistanceFromGrid(midX, midY, 'mud_seas');
    const full = canonicalDistance('tartarian_outskirts', 'mud_seas');
    // Sanity: half-way really is closer than the full trip (else the test proves nothing).
    expect(partial).toBeLessThan(full);

    const midTransit = {
      ...base,
      currentLocationId: 'tartarian_outskirts',
      gridX: midX,
      gridY: midY,
      mapX: undefined,
      mapY: undefined,
      travelTarget: { locationId: 'mud_seas', distanceRemaining: partial },
    };

    const resumed = backfillPlayer(midTransit as typeof base);
    // Must keep the partial distance — NOT jump back up to the full trip.
    expect(resumed.travelTarget?.distanceRemaining).toBe(partial);
    expect(resumed.travelTarget?.distanceRemaining).not.toBe(full);
  });

  it('legacy saves without gridX/gridY still fall back to the location cell', () => {
    const base = useGameStore.getState().player!;
    const full = canonicalDistance('tartarian_outskirts', 'mud_seas');
    const legacy = {
      ...base,
      currentLocationId: 'tartarian_outskirts',
      gridX: undefined,
      gridY: undefined,
      mapX: undefined,
      mapY: undefined,
      travelTarget: { locationId: 'mud_seas', distanceRemaining: full },
    };
    const resumed = backfillPlayer(legacy as typeof base);
    expect(resumed.travelTarget?.distanceRemaining).toBe(full);
  });
});
