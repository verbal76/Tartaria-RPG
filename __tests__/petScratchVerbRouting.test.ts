// OTA-196 — verifies the new `pet` / `scratch` / `pat` / `nuzzle`
// short-circuit at the top of submitPlayerAction. Playtest log:
//   [player] pet Rocky → parser: intent=unknown (bad: 'pet' matched
//     'petrified' on the noun resolver, but the verb was unrecognized)
//   [player] scratch Rocky → parser: intent=unknown + arbiter gave
//     a totally unrelated "Your disease sample is still there" line
//
// Post-fix: those verbs route to selectCallDogOption('scratch') when
// the player has a live dog, and emit a clear refusal otherwise.

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

async function bootstrapWithDog(loyalty = 50) {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({
    name: 'PetTester',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  useGameStore.getState().skipTutorial?.();
  useGameStore.setState((s) => ({
    player: s.player
      ? {
          ...s.player,
          dog: {
            id: 'test_dog',
            name: 'Rocky',
            breed: 'mongrel',
            sex: { raw: 'boy', pronoun: 'he' },
            startingProfile: 'mongrel',
            hp: 10,
            hpMax: 14,
            stats: { strength: 10, dexterity: 10, intelligence: 10 },
            statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
            loyalty,
            lastFedAtHour: 0,
            equipped: { vest: null },
            status: 'with_player',
          },
        }
      : s.player,
  }));
}

async function bootstrapWithoutDog() {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({
    name: 'PetTester',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  useGameStore.getState().skipTutorial?.();
}

describe('OTA-196 — pet / scratch / pat / nuzzle route to the dog', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it("`pet Rocky` raises the dog's loyalty by +2", async () => {
    await bootstrapWithDog(50);
    const loyaltyBefore = useGameStore.getState().player?.dog?.loyalty ?? 0;
    useGameStore.getState().submitPlayerAction('pet Rocky');
    const loyaltyAfter = useGameStore.getState().player?.dog?.loyalty ?? 0;
    expect(loyaltyAfter - loyaltyBefore).toBe(2);
  });

  it('`scratch Rocky` triggers the same scratch flow', async () => {
    await bootstrapWithDog(50);
    const loyaltyBefore = useGameStore.getState().player?.dog?.loyalty ?? 0;
    useGameStore.getState().submitPlayerAction('scratch Rocky');
    const loyaltyAfter = useGameStore.getState().player?.dog?.loyalty ?? 0;
    expect(loyaltyAfter - loyaltyBefore).toBe(2);
  });

  it('`pat the dog` works as a synonym', async () => {
    await bootstrapWithDog(50);
    const before = useGameStore.getState().player?.dog?.loyalty ?? 0;
    useGameStore.getState().submitPlayerAction('pat the dog');
    const after = useGameStore.getState().player?.dog?.loyalty ?? 0;
    expect(after - before).toBe(2);
  });

  it('`nuzzle Rocky` works', async () => {
    await bootstrapWithDog(50);
    const before = useGameStore.getState().player?.dog?.loyalty ?? 0;
    useGameStore.getState().submitPlayerAction('nuzzle Rocky');
    const after = useGameStore.getState().player?.dog?.loyalty ?? 0;
    expect(after - before).toBe(2);
  });

  it('refuses with an arbiter line when no dog is present', async () => {
    await bootstrapWithoutDog();
    const before = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction('pet Rocky');
    const lines = useGameStore.getState().gameLog.slice(before).map((e) => e.text).join('\n');
    expect(lines).toMatch(/no dog at your side/i);
  });

  it('does NOT match `petrify` or `petrified` — the leading "pet" must be a standalone token', async () => {
    await bootstrapWithDog(50);
    const loyaltyBefore = useGameStore.getState().player?.dog?.loyalty ?? 0;
    useGameStore.getState().submitPlayerAction('petrify the wall');
    const loyaltyAfter = useGameStore.getState().player?.dog?.loyalty ?? 0;
    expect(loyaltyAfter).toBe(loyaltyBefore);
  });
});
