// OTA — the travel badge must always report the GRID-EXACT distance, never the
// re-centered-visual-map Manhattan (which undercounts from an outdoor tile).
//
// Repro: leave toward Mud Seas with a roadside vendor on the first tile.
// confirmLeaveAndTravel set the course WITHOUT distanceRemaining, so the badge
// fell to the legacy visual-map fallback and read low (e.g. 8). The first
// continue self-healed to the true grid distance (16) — looking like the counter
// "jumped up mid-travel". Now a course always carries a grid-exact
// distanceRemaining, and the display fallback is grid-exact too.

jest.setTimeout(30000);
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
import { canonicalDistanceFromGrid } from '../app/engine/worldMap';

describe('travel badge stays grid-exact even when distanceRemaining was left unset', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({
      name: 'BadgeTest', raceId: 'mud_dweller', factionId: 'reclaimers_guild',
    });
    useGameStore.getState().skipTutorial?.();
  });

  it('a course whose distanceRemaining is undefined resolves UP to the true grid distance, not a lower visual estimate', () => {
    const store = useGameStore;
    store.setState({ player: { ...store.getState().player!, stamina: 999999, staminaMax: 999999 } });
    store.getState().setTravelCourse('mud_seas');

    // The honest grid distance from where the player now stands.
    const p0 = store.getState().player!;
    const trueDist = canonicalDistanceFromGrid(p0.gridX!, p0.gridY!, 'mud_seas');
    expect(trueDist).toBeGreaterThan(1);

    // Simulate the vendor-departure state: a course with NO distanceRemaining.
    store.setState({
      player: {
        ...store.getState().player!,
        stamina: 999999,
        travelTarget: { locationId: 'mud_seas' } as { locationId: string; distanceRemaining?: number },
      },
    });

    // One continue. The badge/self-heal must land on the grid-exact value — a step
    // toward the target from the true distance, i.e. trueDist - 1 — NOT an
    // undercounted visual-map number.
    store.getState().continueTravel();
    const after = store.getState().player?.travelTarget;
    expect(after).toBeTruthy();
    expect(typeof after!.distanceRemaining).toBe('number');
    const pAfter = store.getState().player!;
    const expected = canonicalDistanceFromGrid(pAfter.gridX!, pAfter.gridY!, 'mud_seas');
    expect(after!.distanceRemaining).toBe(expected);
    // And it advanced toward the target (one step closer than the start), never up.
    expect(after!.distanceRemaining!).toBeLessThan(trueDist);
  });
});
