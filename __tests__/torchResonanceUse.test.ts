// OTA-772 — integration smoke test for the Aetheric Torch resonance gamble.
//
// The odds engine is unit-tested in resonanceLantern.test.ts. This pins the
// STORE WIRING, deterministically (independent of the hit/miss RNG):
//   1. Using a torch in a room that HAS an unresolved hook spends one charge
//      (hit or miss both consume — it's a gamble) and advances the clock.
//   2. Using a torch in a room with NO unresolved hook refunds it (charge
//      unchanged) — a torch is never wasted on nothing.
//   3. The unresolved hook is NOT consumed by the probe (story/quest threads
//      must survive), so scarcity is the only throttle.

jest.setTimeout(20000);

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
      static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

async function bootstrap(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name, raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  return store;
}

function torchRows() {
  const inv = useGameStore.getState().player!.inventory;
  return inv.filter((i) => /torch|lantern|lamp/i.test(i.name) && (i.tags ?? []).includes('light'));
}
function torchQty(): number {
  return torchRows().reduce((n, i) => n + i.quantity, 0);
}
// The starter torch is named "Aetheric Torch" on the Tartaria worktrees and
// "Hand Torch" on the engine-branded one — use whatever is actually in the
// pack so the action resolves on all three.
function torchName(): string {
  return torchRows()[0]?.name ?? 'Aetheric Torch';
}

function tailLog(n = 8): string {
  return useGameStore.getState().gameLog.slice(-n).map((e) => e.text).join('\n');
}

const HOOK = { id: 'h_test', kind: 'lore', nouns: ['statue'], resolved: false };

describe('OTA-772 — torch resonance gamble wiring', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('a room WITH an unresolved hook spends one torch (hit or miss) and keeps the hook', async () => {
    const store = await bootstrap('TorchGambler');
    // Player starts with one torch. Guarantee at least one for the assertion.
    expect(torchQty()).toBeGreaterThanOrEqual(1);
    const before = torchQty();
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene, enemies: [], enemyHps: [],
        hooks: [{ ...HOOK }],
      },
    });

    store.getState().submitPlayerAction(`use ${torchName()}`);

    // Charge spent regardless of the RNG outcome.
    expect(torchQty()).toBe(before - 1);
    // The hook survives the probe — no authored thread was consumed.
    const hooksAfter = store.getState().currentScene!.hooks ?? [];
    expect(hooksAfter.some((h) => h.id === 'h_test' && !h.resolved)).toBe(true);
    // It routed through the gamble, not the plain "unspent" refund.
    expect(tailLog()).not.toMatch(/unspent/i);
  });

  it('a room with NO unresolved hook refunds the torch (never wasted on nothing)', async () => {
    const store = await bootstrap('TorchSaver');
    const before = torchQty();
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: { ...scene, enemies: [], enemyHps: [], hooks: [] },
    });

    store.getState().submitPlayerAction(`use ${torchName()}`);

    // No hook to resonate with → charge preserved.
    expect(torchQty()).toBe(before);
    expect(tailLog()).toMatch(/unspent|nothing here/i);
  });
});
