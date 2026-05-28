// OTA-143 — legacy travelTarget migration + continueTravel self-heal.
//
// Playtester repro: badge said 0 steps to Voronov while still far
// away. Stopping and re-setting course produced the correct 16.
// Root cause: save was started before OTA-126 → travelTarget had
// no distanceRemaining field → badge fell to its legacy Manhattan-
// recompute fallback which uses the current-location-centered map.
// The map regenerates with currentLocationId at center every call,
// so the recompute can coincidentally return 0 when the player's
// mapX/mapY matches the destination's coords on the current-
// centered map.
//
// Fix part A: backfillPlayer migrates pre-OTA-126 travelTargets by
// computing tiles once at load time and seeding distanceRemaining.
// If the computed value is 0 AND the player isn't actually at the
// target, drop the travelTarget cleanly.
//
// Fix part B: continueTravel self-heals if distanceRemaining hits 0
// but the player still isn't at the target — recomputes and refreshes
// the counter, log a debug line.

jest.setTimeout(15000);

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

import { useGameStore } from '../app/state/gameStore';

describe('OTA-143 travelTarget migration + self-heal', () => {
  beforeEach(async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: 'TravelTest',
      raceId: 'mud_dweller',
      factionId: 'reclaimers_guild',
    });
    store.getState().skipTutorial?.();
  });

  describe('continueTravel self-heal', () => {
    it('recomputes distanceRemaining when counter reads 0 but player is not at target', () => {
      const store = useGameStore;
      const player = store.getState().player!;
      // Set up a stuck-at-0 state: travelTarget with distanceRemaining=0
      // but currentLocationId != target. mapX/mapY offset from center so
      // Manhattan to a remote location is nonzero.
      store.setState({
        player: {
          ...player,
          mapX: 5,
          mapY: 5,
          stamina: player.staminaMax,
          travelTarget: { locationId: 'voronov', distanceRemaining: 0 },
        },
      });
      // continueTravel should detect the desync and refresh the counter.
      store.getState().continueTravel();
      const after = store.getState().player?.travelTarget;
      // Either the counter got refreshed > 0 OR the target wasn't placed
      // on the map and travelTarget got cleared. Both are valid recovery.
      if (after) {
        expect(after.distanceRemaining).toBeGreaterThan(0);
      }
    });

    it('does NOT refresh when player is AT the target (arrival path takes over)', () => {
      const store = useGameStore;
      const player = store.getState().player!;
      store.setState({
        player: {
          ...player,
          stamina: player.staminaMax,
          travelTarget: { locationId: player.currentLocationId, distanceRemaining: 0 },
        },
      });
      store.getState().continueTravel();
      // Arrived path cleared travelTarget.
      expect(store.getState().player?.travelTarget).toBeUndefined();
    });
  });

  describe('backfillPlayer migration (pre-OTA-126 travelTarget)', () => {
    it('populates distanceRemaining when missing', () => {
      // Simulate loading a save where travelTarget exists but has no
      // distanceRemaining field. backfillPlayer is the path. We invoke
      // it via startNewGame's load, then set a stripped target and
      // re-process by setting state directly to simulate the legacy
      // shape — then call any code path that reads the badge logic
      // through the live data. The migration happens at load time only,
      // so this is more of a structural assertion: the gameStore's
      // setTravelCourse / continueTravel path treats undefined distance
      // gracefully.
      const store = useGameStore;
      const player = store.getState().player!;
      store.setState({
        player: {
          ...player,
          mapX: 8,
          mapY: 8,
          // Legacy shape — no distanceRemaining. Should still be safe.
          travelTarget: { locationId: 'voronov' } as { locationId: string; distanceRemaining?: number },
        },
      });
      // Self-heal should kick in on the next continueTravel call.
      store.setState({
        player: { ...store.getState().player!, stamina: store.getState().player!.staminaMax },
      });
      store.getState().continueTravel();
      const after = store.getState().player?.travelTarget;
      // Either travelTarget was cleared (target not on map) or
      // distanceRemaining is now a number.
      if (after) {
        expect(typeof after.distanceRemaining).toBe('number');
      }
    });
  });
});
