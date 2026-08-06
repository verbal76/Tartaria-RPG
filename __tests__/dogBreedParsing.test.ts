// OTA-142 — smart breed parsing.
//
// Pre-fix, the player who role-played their answer to "What kind of
// dog is that?" got the WHOLE sentence stored as the breed. Playtest
// log surfaced this with input "looks like a Pitbull" → breed stored
// as "looks like a Pitbull". Player feedback: "should be smarter
// about parsing the dog breed."
//
// Strip common preamble phrases ("looks like a", "I think it's a",
// "kind of a", etc.) before storing. Cap at 24 chars after stripping.
// When no preamble matches, the raw input is preserved (no false-
// positive stripping). Trailing punctuation is stripped too.
//
// OTA-1050 UPDATE — the typed three-step takeover was replaced by the
// DogOnboardingModal popup; the same parsing now runs inside
// confirmDogOnboarding. These tests drive the popup commit directly.

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

async function bootInBreedStage(): Promise<typeof useGameStore> {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'BreedTest',
    raceId: 'mud_dweller',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  // Seed an onboarding state at the 'breed' stage so we can drive
  // breed inputs directly without spawning a captor.
  store.setState((s) => ({
    worldMemory: {
      ...s.worldMemory,
      pendingDogOnboarding: {
        stage: 'breed',
        rescueData: { scenario: 'smelter', startingProfile: 'mongrel' },
      },
    },
  }));
  return store;
}

describe('OTA-142 smart breed parsing — strips role-play preambles', () => {
  it.each([
    // Playtester repro: "looks like a Pitbull" → "Pitbull"
    ['looks like a Pitbull', 'Pitbull'],
    ['Looks like a pitbull', 'pitbull'],
    ['looks like an old bloodhound', 'old bloodhound'],
    ["I think it's a Border Collie", 'Border Collie'],
    ['I think its a Border Collie', 'Border Collie'],
    ['I think it is a Border Collie', 'Border Collie'],
    ['kind of a mutt', 'mutt'],
    ['sort of a wolfhound', 'wolfhound'],
    ['seems like a heeler', 'heeler'],
    ['probably a shepherd', 'shepherd'],
    ['maybe a Lab', 'Lab'],
    ['definitely a Pit', 'Pit'],
    ['some kind of terrier', 'terrier'],
    ["its a German Shepherd", 'German Shepherd'],
    ["it's a Husky", 'Husky'],
    ['a black lab', 'black lab'],
    ['an old hound', 'old hound'],
    // Trailing punctuation stripped
    ['Pitbull.', 'Pitbull'],
    ['looks like a Pitbull!', 'Pitbull'],
  ])('input %j → breed stored as %j', async (input, expectedBreed) => {
    const store = await bootInBreedStage();
    store.getState().confirmDogOnboarding(input, 'Rex', 'boy');
    expect(store.getState().worldMemory.pendingDogOnboarding).toBeNull();
    expect(store.getState().player?.dog?.breed).toBe(expectedBreed);
  });

  it('input without preamble preserves the raw text', async () => {
    const store = await bootInBreedStage();
    store.getState().confirmDogOnboarding('Pitbull', 'Rex', 'boy');
    expect(store.getState().player?.dog?.breed).toBe('Pitbull');
  });

  it('long input still caps at 24 chars after stripping', async () => {
    const store = await bootInBreedStage();
    store.getState().confirmDogOnboarding('looks like a very-long-breed-name-that-overflows', 'Rex', 'boy');
    const breed = store.getState().player?.dog?.breed ?? '';
    expect(breed.length).toBeLessThanOrEqual(24);
    expect(breed.startsWith('very-long-breed-name')).toBe(true);
  });

  it('whitespace-only breed falls back to "mutt" (the popup has no empty-trim guard)', async () => {
    const store = await bootInBreedStage();
    store.getState().confirmDogOnboarding('  ', 'Rex', 'boy');
    expect(store.getState().player?.dog?.breed).toBe('mutt');
  });

  it('preserves capitalization on the breed token', async () => {
    const store = await bootInBreedStage();
    store.getState().confirmDogOnboarding('looks like a German Shepherd', 'Rex', 'boy');
    expect(store.getState().player?.dog?.breed).toBe('German Shepherd');
  });
});
