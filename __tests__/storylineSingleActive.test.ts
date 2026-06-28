// engine_Dev — storyline single-active focus. The storyline joins the single-active
// pool: activating it stands every contract down; activating a contract unfocuses the
// storyline. "Unfocus only" — the storyline still advances regardless (this flag only
// drives focus + contract-parking + the toggle UI).

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

const store = useGameStore;

function seedContracts(tracked: boolean) {
  const p = store.getState().player!;
  store.setState({
    player: {
      ...p,
      mainQuestActive: true,
      activeFactionQuestIds: ['q1', 'q2'],
      activeFactionQuests: [
        { id: 'q1', stage: 0, postedByFaction: 'f', acceptedAt: 1, tracked },
        { id: 'q2', stage: 0, postedByFaction: 'f', acceptedAt: 2, tracked: false },
      ],
    },
  });
}

describe('storyline single-active focus', () => {
  beforeEach(async () => {
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Verbal', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
  });

  it('activating the storyline stands every contract down', () => {
    seedContracts(true); // q1 active
    store.getState().setMainQuestActive(true);
    const p = store.getState().player!;
    expect(p.mainQuestActive).toBe(true);
    expect((p.activeFactionQuests ?? []).every((q) => q.tracked === false)).toBe(true);
  });

  it('deactivating the storyline just unfocuses it (contracts untouched)', () => {
    seedContracts(false);
    store.getState().setMainQuestActive(false);
    const p = store.getState().player!;
    expect(p.mainQuestActive).toBe(false);
    // it did NOT activate any contract
    expect((p.activeFactionQuests ?? []).some((q) => q.tracked !== false)).toBe(false);
  });

  it('activating a contract unfocuses the storyline', () => {
    seedContracts(false);
    expect(store.getState().player!.mainQuestActive).toBe(true);
    store.getState().setFactionQuestActive('q1', true);
    const p = store.getState().player!;
    expect(p.mainQuestActive).toBe(false);
    expect((p.activeFactionQuests ?? []).find((q) => q.id === 'q1')!.tracked).toBe(true);
  });

  it('toggling with no arg flips the current state', () => {
    seedContracts(false); // mainQuestActive true
    store.getState().setMainQuestActive(); // → false
    expect(store.getState().player!.mainQuestActive).toBe(false);
    store.getState().setMainQuestActive(); // → true
    expect(store.getState().player!.mainQuestActive).toBe(true);
  });
});
