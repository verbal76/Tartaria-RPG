// OTA-791 — combat must make the trade screen unreachable AND visible. A
// resonance-hook combat began while the market vendor was still attached to the
// scene; the player opened TRADE unaware, every sell bounced off the arb166
// guard, and the guard's log lines were invisible from the vendor screen ("I
// never knew I was in combat"). setScreen('vendor') now refuses while enemies
// are live (with the refusal logged to the feed the player IS looking at), and
// the VendorScreen ejects to exploration if a fight starts mid-trade.

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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { buildStallVendor } from '../app/engine/vendors';

// The guard only reads enemies.length — a minimal stand-in is enough.
const FAKE_ENEMY = { name: 'Aetheric Slug', hp: 10 } as any;

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name: 'Delver', raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0 } } : s));
  return store;
}

describe('OTA-791 — combat blocks the trade screen', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('setScreen(vendor) is refused while enemies are live, and the refusal is logged', async () => {
    const store = await freshGame();
    const vendor = buildStallVendor('weapons', 'Weapons');
    store.setState((s) => (s.currentScene
      ? { currentScene: { ...s.currentScene, vendor, enemies: [FAKE_ENEMY], enemyHps: [10], activeEnemyIdx: 0 } }
      : s));
    store.getState().setScreen('exploration');
    const logLenBefore = store.getState().gameLog.length;

    store.getState().setScreen('vendor');

    expect(store.getState().currentScreen).toBe('exploration');
    const newLines = store.getState().gameLog.slice(logLenBefore);
    expect(newLines.some((e) => e.text.includes("Not while you're in a fight"))).toBe(true);
  });

  it('setScreen(vendor) works normally once the fight is over', async () => {
    const store = await freshGame();
    const vendor = buildStallVendor('weapons', 'Weapons');
    store.setState((s) => (s.currentScene
      ? { currentScene: { ...s.currentScene, vendor, enemies: [], enemyHps: [], activeEnemyIdx: 0 } }
      : s));

    store.getState().setScreen('vendor');

    expect(store.getState().currentScreen).toBe('vendor');
  });
});
