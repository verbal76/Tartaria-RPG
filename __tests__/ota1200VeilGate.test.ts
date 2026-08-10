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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));


// OTA-1200 — PUNCHLIST P18, fix 1: the Veil refuses an empty room.
//
// The defect (audit, 2026-08-10): Veil of Ether grants `stealthed`, which is combat-only —
// the first enemy-less action expires it. So an out-of-combat channel charged fuel, a
// 4-corruption dose and 10 in-game minutes for an effect the next step deleted. Owner's
// call: refuse, spoken, at zero cost.
// OTA-1200 — PUNCHLIST P18, fix 1: the Veil refuses an empty room.
//
// The defect (audit, 2026-08-10): Veil of Ether grants `stealthed`, which is combat-only —
// the first enemy-less action expires it. So an out-of-combat channel charged fuel, a
// 4-corruption dose and 10 in-game minutes for an effect the next step deleted. Owner's
// call: refuse, spoken, at zero cost.
import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';
import { findEnemyByName } from '../app/engine/encounter';

jest.setTimeout(180000);

const feedTail = (n: number) =>
  useGameStore.getState().gameLog.slice(n).map((l: { text: string }) => l.text).join('\n');

async function veilReady() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Veiled', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
  store.getState().skipTutorial?.();
  const p = store.getState().player!;
  useGameStore.setState({
    player: {
      ...p,
      stats: { ...p.stats, intelligence: 20 },
      knownTechniques: ['veil_of_ether'],
      corruption: 0,
      inventory: [{ id: 'vf', name: 'Aether Residue', kind: 'misc', quantity: 5, tags: ['aether'] } as InventoryItem],
    },
  });
  return store;
}

describe('OTA-1200 / P18 — the Veil refuses an empty room', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ out of combat it refuses BEFORE any cost — no fuel, no dose, no roll', async () => {
    const store = await veilReady();
    const before = store.getState().gameLog.length;
    await store.getState().submitPlayerAction('channel veil of ether');
    const after = store.getState().player!;
    expect(feedTail(before)).toMatch(/Nothing here is looking/);
    // ⚠ ZERO cost is the whole point of fix 1 — a refusal that still charged anything
    // would be P18 wearing a polite sentence.
    expect(after.inventory.find((i) => i.name === 'Aether Residue')?.quantity).toBe(5);
    expect(after.corruption).toBe(0);
    expect(feedTail(before)).not.toMatch(/Veil of Ether — d20/);
  });

  test('⚠⚠ with a live hostile in the scene it channels exactly as before', async () => {
    const store = await veilReady();
    const proto = findEnemyByName('Silt Serpent') ?? findEnemyByName('Mud Spider');
    const enemy = JSON.parse(JSON.stringify(proto));
    const scene = store.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...scene, enemies: [enemy], enemyHps: [enemy.hp], activeEnemyIdx: 0,
        range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false],
      },
    });
    const before = store.getState().gameLog.length;
    await store.getState().submitPlayerAction('channel veil of ether');
    // The roll HAPPENED — the gate is about empty rooms, not about the technique.
    expect(feedTail(before)).toMatch(/Veil of Ether — d20/);
    expect(store.getState().player!.inventory.find((i) => i.name === 'Aether Residue')?.quantity).toBe(4);
  });

  test('⚠ the other techniques still channel out of combat — the gate is Veil-only', async () => {
    const store = await veilReady();
    const p = store.getState().player!;
    useGameStore.setState({ player: { ...p, knownTechniques: ['veil_of_ether', 'aether_shield'] } });
    const before = store.getState().gameLog.length;
    await store.getState().submitPlayerAction('channel aether shield');
    // Shield/Slip are deliberately NOT combat-only, so pre-channelling them is legal;
    // only the Veil's effect evaporates outside a fight.
    expect(feedTail(before)).toMatch(/Aether Shield — d20/);
  });
});
