// OTA-345 — boot-resilience guard (OTA-338 hardening #2). beginScene is a thin
// wrapper that try/catches the real builder (_beginSceneCore): a scene build
// that throws must NOT crash the app or strand the player on a gray screen — it
// bails to the title with a recoverable error. This protects every call site
// (load-resume, travel, new game) regardless of where the throw originates.

// Native-module mocks required to import the game store under jest (mirrors
// dogSaveBrickRepro.test.ts).
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

describe('beginScene boot-resilience guard', () => {
  const store = useGameStore;
  let original: ReturnType<typeof store.getState>['_beginSceneCore'];

  beforeEach(() => {
    original = store.getState()._beginSceneCore;
    store.setState({ slotLoadError: null, currentScreen: 'exploration' });
  });
  afterEach(() => {
    store.setState({ _beginSceneCore: original });
  });

  it('a throwing scene build bails to title instead of throwing', () => {
    store.setState({ _beginSceneCore: () => { throw new Error('scene boom'); } });
    expect(() => store.getState().beginScene()).not.toThrow();
    expect(store.getState().currentScreen).toBe('title');
    expect(store.getState().slotLoadError).toMatch(/scene failed to build/i);
    expect(store.getState().slotLoadError).toMatch(/scene boom/);
  });

  it('passes through to the real builder and leaves the screen alone when it succeeds', () => {
    let called = false;
    store.setState({ _beginSceneCore: () => { called = true; } });
    store.getState().beginScene({ isOpening: true });
    expect(called).toBe(true);
    expect(store.getState().currentScreen).toBe('exploration'); // not bailed
    expect(store.getState().slotLoadError).toBeNull();
  });

  it('forwards opts through to the real builder', () => {
    let seen: unknown = null;
    store.setState({ _beginSceneCore: (opts) => { seen = opts; } });
    store.getState().beginScene({ arrivalFromName: 'The Flats' });
    expect(seen).toEqual({ arrivalFromName: 'The Flats' });
  });
});
