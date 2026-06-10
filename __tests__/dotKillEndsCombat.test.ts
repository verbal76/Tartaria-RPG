// OTA-429 — a damage-over-time tick that drops the LAST living enemy must end
// the fight. Pre-OTA the DOT tick (start of the attack round) left the killed
// enemy at 0 HP for "the next attack to clean up" — but when the DOT kills the
// final enemy the player has nothing to swing at, so the fight hung: range
// stayed set, no loot, no victory. The tick now sweeps any all-dead scene
// through resolveEnemyDefeat and ends combat.

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
import { findEnemyByName } from '../app/engine/encounter';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

function plant(name = 'Mud Boar') {
  const proto = findEnemyByName(name);
  if (!proto) throw new Error('test enemy not found');
  const enemy = JSON.parse(JSON.stringify(proto));
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies: [enemy],
      enemyHps: [enemy.hp],
      activeEnemyIdx: 0,
      range: 'arm',
      enemyAmbushUsed: [false],
      enemyKnockedOut: [false],
      enemyStatuses: [[]],
    },
  });
  return enemy;
}

describe('OTA-429 — DOT kill of the last enemy ends combat', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('a lethal poison tick on the lone enemy ends the fight (no hang)', async () => {
    const store = await boot('Toxin');
    plant('Mud Boar');
    // Lone enemy at 1 HP with a poison coat that deals 5/turn → the
    // start-of-round tick kills it before the player can swing.
    useGameStore.setState((s) => ({
      currentScene: {
        ...s.currentScene!,
        enemyHps: [1],
        enemyStatuses: [[{ kind: 'poison_coat', turnsRemaining: 3, dmgPerTurn: 5, sourceName: 'Acid-Etched' }]],
      },
    }));

    await store.getState().submitPlayerAction('attack');

    const sc = store.getState().currentScene;
    expect(sc?.enemies.length ?? 0).toBe(0); // enemy resolved out
    expect(sc?.range ?? null).toBeNull();    // combat ended
    const log = store.getState().gameLog.map((l) => l.text).join('\n');
    expect(log).toMatch(/Mud Boar defeated/); // victory/loot fired
  });

  it('leaves a mixed fight alone (one enemy still alive after a DOT kill)', async () => {
    const store = await boot('Toxin2');
    const proto = findEnemyByName('Mud Boar')!;
    const a = JSON.parse(JSON.stringify(proto));
    const b = JSON.parse(JSON.stringify(proto));
    const scene = useGameStore.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...scene,
        enemies: [a, b],
        enemyHps: [1, b.hp],
        activeEnemyIdx: 1,
        range: 'arm',
        enemyAmbushUsed: [false, false],
        enemyKnockedOut: [false, false],
        // Only enemy A is poisoned; B stays alive, so combat must NOT auto-end.
        enemyStatuses: [
          [{ kind: 'poison_coat', turnsRemaining: 3, dmgPerTurn: 5, sourceName: 'Acid-Etched' }],
          [],
        ],
      },
    });

    await store.getState().submitPlayerAction('attack');

    const sc = store.getState().currentScene;
    // Still fighting B — range stays set, at least one enemy remains.
    expect(sc?.range ?? null).not.toBeNull();
    expect((sc?.enemies.length ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
