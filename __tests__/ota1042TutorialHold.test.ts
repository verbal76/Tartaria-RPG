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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1042 — THE ARBITER HOLDS HIS TONGUE. Owner: "the arbiter says his
// tutorial opening line over top of the new origin text screens — it needs
// to hold until you are in the tutorial." This suite locks the hand-off:
// while the OTA-1041 opening crawl is up, the tutorial is ARMED (so
// scene-entry hints stay suppressed) but SILENT — the "Your name,
// traveler" prompt prints only when the crawl is dismissed, exactly once,
// and a REPLAY OPENING dismissal can never restart the tutorial.
jest.setTimeout(60000);

import { useGameStore } from '../app/state/gameStore';

const NAME_PROMPT = /Your name, traveler/;

function promptCount(): number {
  return useGameStore.getState().gameLog.filter((e) => NAME_PROMPT.test(e.text)).length;
}

describe('OTA-1042 — the name prompt holds until the crawl closes', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('a fresh game arms the tutorial but the Arbiter says NOTHING under the crawl', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: '', raceId: 'unknowing_mass', factionId: 'reclaimers_guild', motiveId: 'debt',
    } as any);
    const st = store.getState();
    expect(st.storyIntro).not.toBeNull();          // the crawl is up
    expect(st.tutorialStep).toBe(0);               // armed — hints suppressed
    expect(st.awaitingTutorialName).toBe(true);
    expect(promptCount()).toBe(0);                 // …but not a word spoken
  });

  it('dismissing the crawl is the hand-off — the prompt fires exactly once', () => {
    const store = useGameStore;
    store.getState().dismissStoryIntro();
    const st = store.getState();
    expect(st.storyIntro).toBeNull();
    expect(st.player!.storyIntroSeen).toBe(true);
    expect(st.tutorialStep).toBe(0);
    expect(st.awaitingTutorialName).toBe(true);
    expect(promptCount()).toBe(1);
  });

  it('REPLAY OPENING after the tutorial can never re-speak the prompt or re-arm', () => {
    const store = useGameStore;
    // Simulate the name beat having completed long ago: tutorial done.
    store.setState({
      tutorialStep: null,
      awaitingTutorialName: false,
      player: { ...store.getState().player!, hasSeenIntro: true },
    } as any);
    store.getState().replayStoryIntro();
    expect(store.getState().storyIntro).not.toBeNull();
    store.getState().dismissStoryIntro();
    const st = store.getState();
    expect(st.storyIntro).toBeNull();
    expect(st.tutorialStep).toBeNull();            // tutorial did NOT restart
    expect(st.awaitingTutorialName).toBe(false);
    expect(promptCount()).toBe(1);                 // still just the one
  });
});
