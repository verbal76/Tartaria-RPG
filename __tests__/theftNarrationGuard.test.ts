// OTA-034 — narration-channel invariant for the vendor caught-stealing
// line. Asserts the appendLog guard demotes any "thief / caught mid-lift
// / steel comes out / answer for my actions" emission to a debug
// breadcrumb when the legitimate steal-context flag isn't carried in
// meta. Belt-and-braces: the line is currently emitted from exactly
// one call site, but a future cognitive-layer leak or hook misfire
// could surface a paraphrase to a brand-new player who never stole
// anything (the bug report that motivated this guard).

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

import { useGameStore } from '../app/state/gameStore';

function logTexts() {
  return useGameStore.getState().gameLog.map((e) => `${e.channel}: ${e.text}`);
}

function findTheftLine(): { channel: string; text: string } | undefined {
  return useGameStore.getState().gameLog.find((e) =>
    /thief|caught.*mid[- ]?lift|steel comes out|answer for/i.test(e.text)
    && e.channel !== 'debug',
  );
}

describe('OTA-034 — theft-narration guard on appendLog', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    useGameStore.setState({ gameLog: [] });
  });

  it('blocks a "Thief!" line on the combat channel when meta.stealCaught is absent', () => {
    const before = useGameStore.getState().gameLog.length;
    useGameStore.getState().appendLog(
      'combat',
      'Some vendor catches your hand mid-lift. "Thief!" — steel comes out.',
    );
    // Guard demotes the emit to a debug-only persistEntry breadcrumb;
    // nothing should land in the in-memory feed (which is what the
    // player sees). Matches the existing arbiter-dedup pattern.
    expect(findTheftLine()).toBeUndefined();
    expect(useGameStore.getState().gameLog.length).toBe(before);
  });

  it('passes the same line through when meta.stealCaught is true', () => {
    useGameStore.getState().appendLog(
      'combat',
      'Irma catches your hand mid-lift. "Thief!" — steel comes out.',
      { stealCaught: true },
    );
    expect(findTheftLine()).toBeDefined();
  });

  it('blocks "answer for your actions" on any channel without the flag', () => {
    useGameStore.getState().appendLog('arbiter', 'You will answer for your actions.');
    expect(findTheftLine()).toBeUndefined();
  });

  it('blocks "steel comes out" alone (no vendor name) on any channel without the flag', () => {
    useGameStore.getState().appendLog('world', 'Steel comes out.');
    expect(findTheftLine()).toBeUndefined();
  });

  it('lets benign lines through untouched', () => {
    useGameStore.getState().appendLog('world', 'You crouch beside the table.');
    useGameStore.getState().appendLog('arbiter', 'The Arbiter looks around.');
    const texts = logTexts();
    expect(texts).toContain('world: You crouch beside the table.');
    expect(texts).toContain('arbiter: The Arbiter looks around.');
  });
});
