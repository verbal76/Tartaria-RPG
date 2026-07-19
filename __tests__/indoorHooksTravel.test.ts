// engine_Dev — indoorsForOutdoorHooks gates whether wandering/hook narration uses
// INDOOR framing ("you move from room to room") vs OUTDOOR sightings. Setting course
// for a long overland journey FROM inside a hub room left hubRoomId set, so open
// travel leaked indoor prompts (playtester: "why indoor prompts when traveling in the
// open?"). An active mid-transit journey must read as OUTDOORS.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { indoorsForOutdoorHooks } from '../app/state/gameStore';
import type { GameStore } from '../app/state/gameStore';

// Minimal fake store — the predicate only touches player.{hubRoomId,travelTarget,
// currentLocationId} and activeBuildingId.
const mk = (player: Record<string, unknown> | null, activeBuildingId: string | null = null) =>
  (() => ({ player, activeBuildingId }) as unknown as GameStore);

describe('indoorsForOutdoorHooks — travel is outdoors', () => {
  it('is indoors when standing in a hub room, not travelling', () => {
    expect(indoorsForOutdoorHooks(mk({ hubRoomId: 'operations', currentLocationId: 'hq' }))).toBe(true);
  });

  it('is indoors inside a building (activeBuildingId), not travelling', () => {
    expect(indoorsForOutdoorHooks(mk({ currentLocationId: 'hq' }, 'bunker'))).toBe(true);
  });

  it('is OUTDOORS mid-journey even with hubRoomId still set (the leak)', () => {
    // Set course from inside Operations → hubRoomId lingers, but travelTarget points
    // at a DIFFERENT location, so we're crossing open ground.
    const store = mk({
      hubRoomId: 'operations',
      currentLocationId: 'hq',
      travelTarget: { locationId: 'phila_wash', distanceRemaining: 20 },
    });
    expect(indoorsForOutdoorHooks(store)).toBe(false);
  });

  it('is OUTDOORS on an active whisper course even with hubRoomId still set', () => {
    const store = mk({
      hubRoomId: 'operations',
      currentLocationId: 'hq',
      whisperCourse: { mapX: 3, mapY: 7, label: 'Yulka' },
    });
    expect(indoorsForOutdoorHooks(store)).toBe(false);
  });

  it('is still indoors when the travelTarget is the CURRENT location (arrived / stale)', () => {
    const store = mk({
      hubRoomId: 'operations',
      currentLocationId: 'phila_wash',
      travelTarget: { locationId: 'phila_wash', distanceRemaining: 0 },
    });
    expect(indoorsForOutdoorHooks(store)).toBe(true);
  });

  it('is outdoors with no hub/building and no travel (open wilderness tile)', () => {
    expect(indoorsForOutdoorHooks(mk({ currentLocationId: 'wastes' }))).toBe(false);
  });
});
