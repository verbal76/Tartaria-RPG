// OTA-163 — regression lock for refused-travel time tick. Stress
// sweep (cartographer) found a 387-turn stuck-state where every
// attempted cardinal step was refused for stamina AND time never
// advanced — the player was frozen in a single minute. Pre-fix the
// 3 refusal paths (case 'travel' / setTravelCourse / continueTravel)
// emitted the Arbiter line and returned without advancing the
// clock. Post-fix each path advances hoursElapsed by 0.25 (~15
// minutes of fumbling) so the clock keeps moving through a depleted
// stretch.

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
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));

import { useGameStore } from '../app/state/gameStore';

async function bootstrapDrained() {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({
    name: 'Drained',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  useGameStore.getState().skipTutorial?.();
  // Drain the player to zero stamina so the travel refusal path
  // fires deterministically.
  useGameStore.setState((s) => ({
    player: s.player ? { ...s.player, stamina: 0 } : s.player,
  }));
}

describe('OTA-163 — depleted travel attempts still advance the clock', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('case `travel`: `go north` refusal ticks ~15 min', async () => {
    await bootstrapDrained();
    const hoursBefore = useGameStore.getState().player!.hoursElapsed ?? 0;
    useGameStore.getState().submitPlayerAction('go north');
    const hoursAfter = useGameStore.getState().player!.hoursElapsed ?? 0;
    const delta = hoursAfter - hoursBefore;
    // Should advance by ~0.25 (15 min). Allow 0.2 – 0.5 range.
    expect(delta).toBeGreaterThanOrEqual(0.2);
    expect(delta).toBeLessThanOrEqual(0.6);
  });

  it('setTravelCourse refusal ticks ~15 min', async () => {
    await bootstrapDrained();
    const hoursBefore = useGameStore.getState().player!.hoursElapsed ?? 0;
    // Try setting a course to any Lost Capital — refused for stamina.
    useGameStore.getState().setTravelCourse('voronov');
    const hoursAfter = useGameStore.getState().player!.hoursElapsed ?? 0;
    expect(hoursAfter - hoursBefore).toBeGreaterThanOrEqual(0.2);
  });

  it('100 consecutive depleted travel attempts each tick the clock', async () => {
    await bootstrapDrained();
    const start = useGameStore.getState().player!.hoursElapsed ?? 0;
    for (let i = 0; i < 100; i++) {
      // Keep stamina at 0 so every attempt refuses.
      useGameStore.setState((s) => ({
        player: s.player ? { ...s.player, stamina: 0 } : s.player,
      }));
      useGameStore.getState().submitPlayerAction('go north');
    }
    const end = useGameStore.getState().player!.hoursElapsed ?? 0;
    // 100 refusals × ~0.25h = ~25h advanced. Pre-fix this was 0.
    expect(end - start).toBeGreaterThanOrEqual(20);
  });
});
