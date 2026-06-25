// engine_Dev — the developer door + publish lock. Naming a character "Verbal"
// (while unpublished) opens the content console; publishing closes that door and
// the build plays as a normal game.

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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { useContentPackStore } from '../app/state/contentPackStore';
import { isPublished } from '../app/engine/contentPack';

async function freshGameAtNameBeat() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: '', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().startTutorial(); // arms tutorialStep 0 (the name beat) + awaitingTutorialName
  store.setState({ currentScreen: 'exploration' });
  return store;
}

describe('engine_Dev — developer door + publish lock', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  beforeEach(() => { useContentPackStore.getState().clearAll(); }); // unpublished, clean

  it('naming a character "Verbal" (unpublished) opens Settings on the DEV tab', async () => {
    const store = await freshGameAtNameBeat();
    store.getState().submitPlayerAction('Verbal');
    // Routes to Settings, which (dev mode on) defaults to the DEV console tab.
    expect(store.getState().currentScreen).toBe('about');
    expect(useContentPackStore.getState().devMode).toBe(true);
    expect(isPublished()).toBe(false);
  });

  it('a normal name starts a normal game (not the console)', async () => {
    const store = await freshGameAtNameBeat();
    store.getState().submitPlayerAction('Sarah');
    expect(store.getState().currentScreen).not.toBe('about');
    expect(store.getState().player!.name).toBe('Sarah');
  });

  it('publish() hides the DEV pill + drops dev mode — "Verbal" backdoor re-enables both', async () => {
    useContentPackStore.getState().publish();
    expect(isPublished()).toBe(true); // pill hidden (TitleScreen reads this)
    expect(useContentPackStore.getState().devMode).toBe(false); // clean Settings for testers
    const store = await freshGameAtNameBeat();
    store.getState().submitPlayerAction('Verbal');
    // The author gets back in: dev mode on + Settings open on the DEV tab.
    expect(store.getState().currentScreen).toBe('about');
    expect(useContentPackStore.getState().devMode).toBe(true);
  });

  it('unpublish() brings the pill back (non-destructive — content untouched)', () => {
    useContentPackStore.getState().publish();
    expect(isPublished()).toBe(true);
    useContentPackStore.getState().unpublish();
    expect(isPublished()).toBe(false);
    expect(useContentPackStore.getState().published).toBe(false);
  });

  it('a full reset also un-publishes (the nuke escape hatch)', () => {
    useContentPackStore.getState().publish();
    useContentPackStore.getState().clearAll();
    expect(isPublished()).toBe(false);
    expect(useContentPackStore.getState().published).toBe(false);
  });
});
