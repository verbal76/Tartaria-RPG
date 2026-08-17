// ⚠ OTA-1350 — THE FIRST WORDS ARE FOR HER.
//
// Owner: when someone creates a character named Sasmooch, "right after they
// type in that name … have the arbiter ask them out loud … make sure this is
// pushed out before anything else happens once they type in their name."
// So: the ask is the FIRST line the Arbiter speaks after the name commits —
// before the well-met beat, before any dev grant, before the dedication card
// is even raised. The line itself lives untagged in gameStore (a letter, not
// a feature); this suite only locks the ORDER, so the letter stays hers.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

async function bootToNameBeat() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: '', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  return store;
}

describe('OTA-1350 — the arbiter speaks to Sasmooch first', () => {
  it('⚠⚠ typing Sasmooch: the ask is the FIRST arbiter line, ahead of well-met, grants and the card', async () => {
    const store = await bootToNameBeat();
    if (!store.getState().awaitingTutorialName) {
      store.setState({ awaitingTutorialName: true } as never);
    }
    const tsBefore = store.getState().gameLog[store.getState().gameLog.length - 1]?.ts ?? 0;
    // eslint-disable-next-line no-empty
    while (Date.now() <= tsBefore) {}
    store.getState().submitPlayerAction('Sasmooch');
    const fresh = store.getState().gameLog.filter((e) => e.ts > tsBefore && e.channel === 'arbiter');
    expect(fresh.length).toBeGreaterThan(0);
    // The first thing the Arbiter says is the ask — not "Well met".
    expect(fresh[0]!.text).toContain('stand there');
    expect(fresh[0]!.text.endsWith('?"') || fresh[0]!.text.endsWith('?')).toBe(true);
    const wellMetIdx = fresh.findIndex((e) => e.text.includes('Well met'));
    expect(wellMetIdx).toBeGreaterThan(0);
    // And the dedication card is raised too — the ask precedes it in the feed,
    // the card still arrives the moment the name is written down.
    expect(store.getState().dedicationCard).toBeTruthy();
  });

  it('⚠ any other name gets no ask — first arbiter beat is business as usual', async () => {
    const store = await bootToNameBeat();
    if (!store.getState().awaitingTutorialName) {
      store.setState({ awaitingTutorialName: true } as never);
    }
    const tsBefore = store.getState().gameLog[store.getState().gameLog.length - 1]?.ts ?? 0;
    // eslint-disable-next-line no-empty
    while (Date.now() <= tsBefore) {}
    store.getState().submitPlayerAction('Wayfarer');
    const fresh = store.getState().gameLog.filter((e) => e.ts > tsBefore && e.channel === 'arbiter');
    expect(fresh.some((e) => e.text.includes('stand there'))).toBe(false);
    expect(store.getState().dedicationCard ?? null).toBeNull();
  });
});
