// I-002 / D-cold-coating-dot-defect — production defect repair.
//
// tickEnemyDotsAndMaybeEndFight() (app/state/combatResolution.ts) is the one
// place every coating DOT ticks: dmgPerTurn off the HP, decrement
// turnsRemaining, expire with a kind-flavored line. Its `isDot` whitelist
// listed infected/poison_coat/acid_coat/corruption_coat/electrical_coat/
// burn_coat/typed_dot — but NOT cold_coat, even though coatingStatusKind('cold')
// (app/engine/weaponCoating.ts) mints exactly that kind string, and
// applyCoatingProc (gameStore.ts) seeds it with a real dmgPerTurn/turnsRemaining
// identical to every other coating. A cold_coat status fell into the function's
// else-branch and was pushed back onto the enemy completely unchanged, forever:
// no damage, no countdown, no expiry narration. A cold/frost weapon coating did
// nothing beyond its instant on-hit effect.
//
// Fix: cold_coat joins the isDot whitelist, with its own tick line ("stiffens —
// clinging frost gnaws N") and expiry coatWord ("frost"), matching the existing
// per-kind pattern exactly.
//
// This test drives the real production door directly: tickEnemyDotsAndMaybeEndFight(get, set).

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
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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
import { tickEnemyDotsAndMaybeEndFight } from '../app/state/combatResolution';
import { getRaces, getFactions } from '../app/engine/character';
import type { Enemy } from '../app/engine/types';

const store = useGameStore;
const get = () => store.getState();
const set = (fn: (s: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>) => store.setState(fn as never);

function makeEnemy(name: string): Enemy {
  return {
    name,
    type: 'Animal',
    abilityPoint: '2',
    attack: '1',
    damage: '1d4',
    hp: 30,
    rarity: 'Common',
    loot: [],
  } as Enemy;
}

async function standAtSceneWithSoloEnemy(enemy: Enemy) {
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));

  store.setState((s) => ({
    currentScreen: 'exploration',
    currentScene: {
      ...s.currentScene!,
      enemies: [enemy],
      enemyHps: [enemy.hp],
      activeEnemyIdx: 0,
      enemyStatuses: [[{ kind: 'cold_coat', turnsRemaining: 2, dmgPerTurn: 4, sourceName: 'Frost-Rimed Blade' }]],
    },
  }));
}

describe('I-002 — cold-coat DOT ticks damage, counts down, and expires like every other coating', () => {
  it('ticks damage off the enemy and decrements turnsRemaining', async () => {
    await standAtSceneWithSoloEnemy(makeEnemy('Silt Rat'));

    const ended = tickEnemyDotsAndMaybeEndFight(get, set);

    expect(ended).toBe(false);
    const scene = get().currentScene!;
    expect(scene.enemyHps[0]).toBe(26); // 30 - 4
    expect(scene.enemyStatuses![0]![0]!.turnsRemaining).toBe(1);
    expect(scene.enemyStatuses![0]![0]!.kind).toBe('cold_coat');
  });

  it('expires and clears the status after its final tick, narrating the frost running its course', async () => {
    await standAtSceneWithSoloEnemy(makeEnemy('Silt Rat'));
    // Drop to a single remaining turn so this call is the expiry tick.
    store.setState((s) => ({
      currentScene: {
        ...s.currentScene!,
        enemyStatuses: [[{ kind: 'cold_coat', turnsRemaining: 1, dmgPerTurn: 4, sourceName: 'Frost-Rimed Blade' }]],
      },
    }));

    tickEnemyDotsAndMaybeEndFight(get, set);

    const scene = get().currentScene!;
    expect(scene.enemyHps[0]).toBe(26);
    expect(scene.enemyStatuses![0]).toEqual([]);
  });

  it('negative control: a fresh scene with no statuses is untouched', async () => {
    await standAtSceneWithSoloEnemy(makeEnemy('Silt Rat'));
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemyStatuses: [[]] },
    }));

    const ended = tickEnemyDotsAndMaybeEndFight(get, set);

    expect(ended).toBe(false);
    expect(get().currentScene!.enemyHps[0]).toBe(30);
  });
});
