// engine_Dev — the tutorial's FIRST action beat is "look around you", placed
// before TAKE (the cudgel beat). Per design: "the look around button part should
// be the first thing that is done, even before take." This guards both the static
// ordering and the live advance chain name → look → cudgel.

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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';

const store = useGameStore;

describe('tutorial look-around beat', () => {
  it('is the first action beat — after name, before cudgel (TAKE)', () => {
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(ids[0]).toBe('name');
    expect(ids[1]).toBe('look');
    expect(ids[2]).toBe('cudgel');
    expect(TUTORIAL_STEPS[1].area).toBe('quick-row');
    expect(TUTORIAL_STEPS[1].pulse).toBe(true);
  });

  it('advances name → look → cudgel as the player acts', async () => {
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: '', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });

    // The tutorial opens on the name beat.
    const at = () => TUTORIAL_STEPS[store.getState().tutorialStep ?? -1]?.id;
    expect(at()).toBe('name');

    // Naming advances to the look beat.
    await store.getState().submitPlayerAction('Verbal');
    expect(at()).toBe('look');

    // "look around you" advances to the cudgel (TAKE) beat — and never skips it.
    await store.getState().submitPlayerAction('look');
    expect(at()).toBe('cudgel');
  });
});
