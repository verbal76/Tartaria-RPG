jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-915 — one-time dead/abandoned-dog revive migration (fires exactly once ever) +
// the bleed-out window constant the countdown reads.
import { backfillPlayer, DOG_BLEED_OUT_HOURS } from '../app/state/gameStore';
import type { PlayerCharacter, DogCompanion } from '../app/engine/types';
import { useGameStore } from '../app/state/gameStore';

const deadDog = (): DogCompanion => ({
  id: 'dog_test', name: 'Rocky', breed: 'mutt',
  sex: { raw: 'male', pronoun: 'he' },
  startingProfile: 'mongrel',
  hp: 0, hpMax: 24,
  stats: { strength: 10, dexterity: 10, intelligence: 10 },
  statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
  loyalty: 20, lastFedAtHour: 0,
  equipped: { vest: null },
  status: 'dead',
});

describe('OTA-915 — one-time dog revive', () => {
  let base: PlayerCharacter;
  beforeAll(async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Reviver', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    base = store.getState().player!;
  });

  it('revives a DEAD dog once, at full HP, and latches the migration', () => {
    const withDeadDog = { ...base, dog: deadDog(), dogRevivedOta915: undefined } as PlayerCharacter;
    const out = backfillPlayer(withDeadDog);
    expect(out.dog?.status).toBe('with_player');
    expect(out.dog?.hp).toBe(out.dog?.hpMax);
    expect(out.dog?.loyalty).toBeGreaterThanOrEqual(60);
    expect(out.dogRevivedOta915).toBe(true);
  });

  it('does NOT re-revive a dog that dies AFTER the latch is set', () => {
    const alreadyRun = { ...base, dog: deadDog(), dogRevivedOta915: true } as PlayerCharacter;
    const out = backfillPlayer(alreadyRun);
    expect(out.dog?.status).toBe('dead');
  });

  it('leaves a healthy dog untouched (no revive needed)', () => {
    const healthy = { ...base, dog: { ...deadDog(), status: 'with_player' as const, hp: 24 }, dogRevivedOta915: undefined } as PlayerCharacter;
    const out = backfillPlayer(healthy);
    expect(out.dog?.status).toBe('with_player');
    expect(out.dog?.hp).toBe(24);
  });

  it('DOG_BLEED_OUT_HOURS is the 24h window the countdown reads', () => {
    expect(DOG_BLEED_OUT_HOURS).toBe(24);
  });
});
