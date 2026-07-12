// OTA-773 — integration smoke test for the Aetheric Torch resonance gamble.
//
// The odds engine is unit-tested in resonanceLantern.test.ts. This pins the
// STORE WIRING, deterministically (independent of the hit/miss RNG):
//   1. Using a torch in a room with an UNDISCOVERED lead (stage-0 hook) spends
//      one charge (hit or miss both consume — it's a gamble), marks that lead
//      torch-probed, but does NOT resolve it (a normal INVESTIGATE still works).
//   2. One-use, NON-REFUNDABLE: using a torch in a room with no undiscovered
//      lead ALSO spends the charge (the risk is the player's to judge).

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

// An UNDISCOVERED lead: stage 0, unresolved, not yet torch-probed.
const HOOK = { id: 'h_test', kind: 'lore', nouns: ['statue'], stage: 0, resolved: false };

describe('OTA-773 — torch resonance gamble wiring', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('a room WITH an undiscovered lead spends one torch and marks the lead probed (not resolved)', async () => {
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
    // The lead is now torch-probed but NOT resolved — a normal INVESTIGATE
    // still works, and it can't be re-torched.
    const hooksAfter = store.getState().currentScene!.hooks ?? [];
    const probed = hooksAfter.find((h) => h.id === 'h_test');
    expect(probed).toBeTruthy();
    expect(probed!.torchProbed).toBe(true);
    expect(probed!.resolved).toBe(false);
  });

  it('one-use & non-refundable: a room with NO undiscovered lead still spends the charge', async () => {
    const store = await bootstrap('TorchSaver');
    const before = torchQty();
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: { ...scene, enemies: [], enemyHps: [], hooks: [] },
    });

    store.getState().submitPlayerAction(`use ${torchName()}`);

    // Non-refundable — the charge is spent even with nothing to find.
    expect(torchQty()).toBe(before - 1);
    expect(tailLog()).toMatch(/nothing here is still hidden|gutters out/i);
  });

  it('a torch cannot re-probe a lead it already probed (charge still spent, no double-dip)', async () => {
    const store = await bootstrap('TorchRepeater');
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene, enemies: [], enemyHps: [],
        hooks: [{ ...HOOK, torchProbed: true }], // already probed
      },
    });
    const before = torchQty();
    if (before < 1) return; // no torch to test with (defensive)

    store.getState().submitPlayerAction(`use ${torchName()}`);

    // Already-probed lead is not undiscovered → no-effect branch, still spent.
    expect(torchQty()).toBe(before - 1);
    expect(tailLog()).toMatch(/nothing here is still hidden|gutters out/i);
  });
});
