// OTA-776 — integration test for the AIMED Aetheric Torch.
//
// The reward roll is unit-tested in resonanceLantern.test.ts. This pins the
// STORE WIRING (deterministic):
//   1. applyTorchToHook charges a chosen open lead: spends one torch, sets
//      torchCharged, does NOT resolve the lead.
//   2. Typed `use torch` routes: exactly one open lead → charges it; no open
//      lead → keeps the charge (no waste); several leads → keeps the charge and
//      tells the player to choose.
//   3. Working a charged lead to completion pays out the upgraded drop.

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

// An open, un-charged lead: stage 0, unresolved.
const HOOK = { id: 'h_test', kind: 'lore', nouns: ['statue'], stage: 0, resolved: false };

describe('OTA-776 — aiming the torch charges a chosen lead', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('applyTorchToHook charges the lead: spends one torch, sets torchCharged, does NOT resolve', async () => {
    const store = await bootstrap('TorchAimer');
    expect(torchQty()).toBeGreaterThanOrEqual(1);
    const before = torchQty();
    const scene = store.getState().currentScene!;
    store.setState({ currentScene: { ...scene, enemies: [], enemyHps: [], hooks: [{ ...HOOK }] } });

    store.getState().applyTorchToHook('h_test');

    expect(torchQty()).toBe(before - 1);
    const hook = store.getState().currentScene!.hooks!.find((h) => h.id === 'h_test');
    expect(hook!.torchCharged).toBe(true);
    expect(hook!.resolved).toBe(false);
  });

  it('applyTorchToHook on a non-existent / invalid lead spends nothing', async () => {
    const store = await bootstrap('TorchMisfire');
    const before = torchQty();
    const scene = store.getState().currentScene!;
    store.setState({ currentScene: { ...scene, enemies: [], enemyHps: [], hooks: [{ ...HOOK }] } });

    store.getState().applyTorchToHook('does_not_exist');

    expect(torchQty()).toBe(before); // no charge burned on a bad target
  });
});

describe('OTA-776 — typed `use torch` routing', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('exactly ONE open lead → charges it', async () => {
    const store = await bootstrap('TorchOne');
    const before = torchQty();
    const scene = store.getState().currentScene!;
    store.setState({ currentScene: { ...scene, enemies: [], enemyHps: [], hooks: [{ ...HOOK }] } });

    store.getState().submitPlayerAction(`use ${torchName()}`);

    expect(torchQty()).toBe(before - 1);
    expect(store.getState().currentScene!.hooks!.find((h) => h.id === 'h_test')!.torchCharged).toBe(true);
  });

  it('NO open lead → keeps the charge (a purposeful tool is not wasted on nothing)', async () => {
    const store = await bootstrap('TorchNone');
    const before = torchQty();
    const scene = store.getState().currentScene!;
    store.setState({ currentScene: { ...scene, enemies: [], enemyHps: [], hooks: [] } });

    store.getState().submitPlayerAction(`use ${torchName()}`);

    expect(torchQty()).toBe(before);
    expect(tailLog()).toMatch(/no open lead/i);
  });

  it('SEVERAL open leads with no target → keeps the charge and asks you to choose', async () => {
    const store = await bootstrap('TorchMany');
    const before = torchQty();
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene, enemies: [], enemyHps: [],
        hooks: [
          { id: 'h_a', kind: 'lore', nouns: ['statue'], stage: 0, resolved: false },
          { id: 'h_b', kind: 'lore', nouns: ['obelisk'], stage: 0, resolved: false },
        ],
      },
    });

    store.getState().submitPlayerAction(`use ${torchName()}`);

    expect(torchQty()).toBe(before);
    expect(tailLog()).toMatch(/several leads/i);
  });
});

describe('OTA-776 — a charged lead pays out the upgraded drop when worked', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('charge a glint lead, work it to completion → the torch mark pays out', async () => {
    const store = await bootstrap('TorchPayout');
    const scene = store.getState().currentScene!;
    // 'glint' is a real 2-step loot chain (stage 1 is `done`). Silence the
    // one-per-visit investigate ambush so both investigates reach the hook.
    store.setState({
      currentScene: {
        ...scene, enemies: [], enemyHps: [], hooks: [
          { id: 'h_glint', kind: 'glint', nouns: ['glint'], stage: 0, resolved: false },
        ],
        investigateAmbushUsed: true,
      },
    });

    store.getState().applyTorchToHook('h_glint');
    expect(store.getState().currentScene!.hooks!.find((h) => h.id === 'h_glint')!.torchCharged).toBe(true);

    // Work the lead to its terminal step.
    store.getState().submitPlayerAction('investigate glint');
    store.getState().submitPlayerAction('investigate glint');

    // The upgraded drop lands where the player worked the lead.
    expect(tailLog(24)).toMatch(/torch'?s mark pays out/i);
  });
});
