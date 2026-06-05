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

async function bootstrapDrained(opts: { inHub?: boolean } = {}) {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({
    name: 'Drained',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  useGameStore.getState().skipTutorial?.();
  // Drain the player to zero stamina so the travel refusal path fires
  // deterministically. Unless a test explicitly wants the in-hub case,
  // clear hubRoomId so `go north` exercises the OVERLAND refusal path —
  // which is OTA-163's actual scenario (a cartographer roaming the open
  // map, not an outpost interior). arb40 made interior outpost moves
  // free (0 stamina / 0 time), so an in-hub `go north` no longer routes
  // through the overland stamina gate that this guard locks.
  useGameStore.setState((s) => ({
    player: s.player
      ? { ...s.player, stamina: 0, hubRoomId: opts.inHub ? s.player.hubRoomId : null }
      : s.player,
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

  // arb40 — interior outpost movement is free. The OTA-163 overland tick
  // above must NOT apply inside a hub: walking room-to-room costs no
  // stamina and no time, so a player on empty legs is never stuck at a
  // vendor and a 15-room capital is free to roam. Locks that an in-hub
  // 0-stamina cardinal move advances neither the clock nor stamina.
  it('arb40 — an in-hub 0-stamina cardinal move is FREE (no time, no stamina)', async () => {
    await bootstrapDrained({ inHub: true });
    const before = useGameStore.getState().player!;
    // Sanity: the player starts inside the faction outpost.
    expect(before.hubRoomId).toBeTruthy();
    const hoursBefore = before.hoursElapsed ?? 0;
    useGameStore.getState().submitPlayerAction('go north');
    const after = useGameStore.getState().player!;
    // Free move: the clock did not advance and no stamina was spent —
    // proving it did NOT hit the overland gate (which would tick ~15 min).
    expect((after.hoursElapsed ?? 0) - hoursBefore).toBe(0);
    expect(after.stamina).toBe(0);
    // And it was a real move, not a block — the room changed and the
    // player is still inside the hub.
    expect(after.hubRoomId).toBeTruthy();
    expect(after.hubRoomId).not.toBe(before.hubRoomId);
  });
});
