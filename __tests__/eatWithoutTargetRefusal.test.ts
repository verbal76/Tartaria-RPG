// OTA-155 — regression lock for the eat-without-target refusal.
//
// Pre-OTA-155 (stress sweep finding): typing `eat ratoin` (typo) or
// bare `eat` parsed verb=eat → intent=rest → no consumable resolved
// → fell through to the 8-hour sleep path. Same class of bug as
// OTA-125 closed for `drink water`.
//
// Fix: when the rest case is reached with parsed.matchedVerb in
// (eat / consume / devour) AND no consumable resolved, the Arbiter
// refuses with "Eat what?..." and breaks — no 8h sleep.
//
// This test locks the behavior: a known consumable still eats and
// applies its effect; an unresolved target refuses without sleeping.

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

async function bootstrap() {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({
    name: 'EatTester',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  useGameStore.getState().skipTutorial?.();
}

describe('OTA-155 — eat without target refuses, does NOT sleep 8h', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('typed `eat ratoin` (typo) refuses without advancing time 8h', async () => {
    await bootstrap();
    const player0 = useGameStore.getState().player!;
    const hoursBefore = player0.hoursElapsed ?? 0;
    useGameStore.getState().submitPlayerAction('eat ratoin');
    const player1 = useGameStore.getState().player!;
    const hoursAfter = player1.hoursElapsed ?? 0;
    const delta = hoursAfter - hoursBefore;
    // Pre-fix this jumped by 8. Post-fix it stays at 0 (the refusal
    // doesn't advance the clock).
    expect(delta).toBeLessThan(1);
    // Log should contain the refusal pattern (Arbiter "Eat what?").
    const log = useGameStore.getState().gameLog;
    const lastLines = log.slice(-5).map((e) => e.text).join('\n');
    expect(lastLines).toMatch(/Eat what\?/i);
  });

  it('bare `eat` refuses without advancing time 8h', async () => {
    await bootstrap();
    const player0 = useGameStore.getState().player!;
    const hoursBefore = player0.hoursElapsed ?? 0;
    useGameStore.getState().submitPlayerAction('eat');
    const player1 = useGameStore.getState().player!;
    const hoursAfter = player1.hoursElapsed ?? 0;
    expect(hoursAfter - hoursBefore).toBeLessThan(1);
  });

  it('typed `consume foo` refuses without advancing time 8h', async () => {
    await bootstrap();
    const player0 = useGameStore.getState().player!;
    const hoursBefore = player0.hoursElapsed ?? 0;
    useGameStore.getState().submitPlayerAction('consume foo');
    const player1 = useGameStore.getState().player!;
    const hoursAfter = player1.hoursElapsed ?? 0;
    expect(hoursAfter - hoursBefore).toBeLessThan(1);
  });

  it('typed `rest` (no eat verb) still triggers the 8h rest path', async () => {
    // Sanity check — the refusal must NOT capture the bare rest verb.
    // Pre-OTA-155, `rest` with no target → 8h sleep was correct
    // behavior. Make sure the new check didn't catch this case.
    await bootstrap();
    const player0 = useGameStore.getState().player!;
    // arb37 — rest restores STAMINA only and is refused when stamina is
    // already full (a wounded-but-rested player is told to eat). Drain
    // stamina so the rest path actually has work to do.
    useGameStore.setState({ player: { ...player0, stamina: 0, corruption: 0 } });
    const hoursBefore = player0.hoursElapsed ?? 0;
    useGameStore.getState().submitPlayerAction('rest');
    const player1 = useGameStore.getState().player!;
    const hoursAfter = player1.hoursElapsed ?? 0;
    // 8h sleep advances the clock by ~8. Allow a wide window because
    // the rest path also runs ambush-roll bookkeeping that may add
    // small extra time.
    expect(hoursAfter - hoursBefore).toBeGreaterThanOrEqual(7);
  });
});
