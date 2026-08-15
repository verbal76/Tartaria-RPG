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

// OTA-935 — test backfill for the OTA-948/949 dev-grant cleanup (shipped without
// dedicated tests) + a lock on the retired load-path latches. The creation-time
// grants fire at the tutorial NAME-COMMIT — the single point a brand-new character
// is named — and nowhere else.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import * as saveSystem from '../app/engine/saveSystem';

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

const countOf = (name: string): number =>
  (useGameStore.getState().player?.inventory ?? [])
    .filter((i) => i.name === name)
    .reduce((n, i) => n + (i.quantity ?? 0), 0);

async function bootAtNameBeat() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Placeholder', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  // Drive the actual name-commit branch: arm the tutorial name beat directly so the
  // test exercises the real grant path (submitPlayerAction's tutorial pre-check).
  store.setState({ awaitingTutorialName: true, tutorialStep: 0 } as never);
  return store;
}

describe('OTA-935 — dev starter grants fire at the name-commit, once, dev names only', () => {
  it('a dev name gets exactly one gem + one crash-test kit at creation; a re-submit re-grants nothing', async () => {
    const store = await bootAtNameBeat();
    const gems0 = store.getState().resurrectionGems ?? 0;
    const kits0 = countOf('First Aid Kit');
    const rations0 = countOf('Trail Rations');

    store.getState().submitPlayerAction('Verbal');
    await flush();

    expect(store.getState().player?.name).toBe('Verbal');
    expect(store.getState().resurrectionGems).toBe(gems0 + 1);
    expect(countOf('First Aid Kit')).toBe(kits0 + 10);
    expect(countOf('Trail Rations')).toBe(rations0 + 20);
    expect(countOf('Smoke-Cured Jerky Strip')).toBe(20);
    expect(countOf('Bioluminescent Fungus')).toBe(20);

    // the name beat is spent — typing the dev name again is just an action, not a grant
    expect(store.getState().awaitingTutorialName).toBe(false);
    store.getState().submitPlayerAction('Verbal');
    await flush();
    expect(store.getState().resurrectionGems).toBe(gems0 + 1);
    expect(countOf('First Aid Kit')).toBe(kits0 + 10);
  });

  it('a non-dev name gets nothing', async () => {
    const store = await bootAtNameBeat();
    const gems0 = store.getState().resurrectionGems ?? 0;
    const kits0 = countOf('First Aid Kit');

    store.getState().submitPlayerAction('Wanderer');
    await flush();

    expect(store.getState().player?.name).toBe('Wanderer');
    expect(store.getState().resurrectionGems ?? 0).toBe(gems0);
    expect(countOf('First Aid Kit')).toBe(kits0);
    expect(countOf('Smoke-Cured Jerky Strip')).toBe(0);
  });
});

describe('OTA-935 — the retired load-path latches stay retired', () => {
  it('grantDevGemOnce / grantTestSupplyGiftOnce no longer exist in saveSystem', () => {
    expect('grantDevGemOnce' in saveSystem).toBe(false);
    expect('grantTestSupplyGiftOnce' in saveSystem).toBe(false);
  });
});
