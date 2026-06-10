// OTA-440 — [audit #25] proactive save-size warning. The save blob auto-trims
// at 100% of the budget (silently shedding rooms/scene); this surfaces a single
// in-feed heads-up the first time the pre-trim blob crosses 70%, so the player
// can lighten their pack before data starts getting trimmed.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

const warnCount = () =>
  useGameStore.getState().gameLog.filter((l) => /save is getting large/i.test(l.text)).length;

describe('OTA-440 — proactive save-size warning', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('stays quiet for a small save, warns once when bloated past 70%, never twice', async () => {
    const store = await boot('Hoarder');

    // A fresh character's save is far under the budget — no warning.
    store.setState({ gameLog: [] });
    await store.getState().persist();
    expect(warnCount()).toBe(0);

    // Bloat the blob past 70% of SAFE_BLOB_CHARS (800k) via a giant item
    // description (~600k chars). Inventory isn't trimmed, so the pre-trim size
    // the warning reads crosses the threshold.
    const big = 'x'.repeat(600_000);
    store.setState((s) => ({
      player: { ...s.player!, inventory: [{ id: 'tome', name: 'Heavy Tome', kind: 'misc', quantity: 1, tags: [], description: big }] },
    }));
    await store.getState().persist();
    expect(warnCount()).toBe(1);

    // Still bloated — must not warn again this session.
    await store.getState().persist();
    expect(warnCount()).toBe(1);
  });
});
