// arb36 — organic building discovery + retirement of the dev "enter <name>"
// teleport. Buildings are now reached only by stumbling on the structure
// standing on the current wild tile (currentScene.sceneBuilding). Typing
// "enter <something>" with no structure here must do nothing.

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

jest.setTimeout(15000);

import { useGameStore } from '../app/state/gameStore';

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Wanderer', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: { ...scene, enemies: [], enemyHps: [], vendor: null, sceneBuilding: null },
  });
  return store;
}

describe('arb36 — organic building entry', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('the old dev teleport is gone: "enter shed" does nothing with no structure here', async () => {
    const store = await boot();
    store.getState().submitPlayerAction('enter shed');
    expect(store.getState().activeBuildingId).toBeNull();
  });

  it('ENTER steps into the structure discovered on this tile', async () => {
    const store = await boot();
    const scene = store.getState().currentScene!;
    store.setState({ currentScene: { ...scene, sceneBuilding: 'shack' } });
    store.getState().submitPlayerAction('enter');
    expect(store.getState().activeBuildingId).toBe('shack');
  });

  it('"go inside" also enters whatever structure is present (name-agnostic)', async () => {
    const store = await boot();
    const scene = store.getState().currentScene!;
    store.setState({ currentScene: { ...scene, sceneBuilding: 'flooded_house' } });
    store.getState().submitPlayerAction('go inside');
    expect(store.getState().activeBuildingId).toBe('flooded_house');
  });
});
