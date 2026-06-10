// OTA-362 — weapon coating combat wiring. On a landing hit a coated
// weapon's roll lands as immediate bonus damage (folded into the blow,
// counting toward the knockout threshold) AND seeds an enemy DOT that
// ticks at the start of the player's next action. Acid also shreds the
// target's AC (read by buildCombatSteps via acReduction); corruption
// also adds a stack that makes its DOT tick harder.

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
import { findEnemyByName } from '../app/engine/encounter';
import { buildCombatSteps } from '../app/engine/combatRules';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name, raceId: race.id, factionId: fac.id });
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
    },
  });
  return enemy;
}

describe('acid armor shred lowers the attack target AC', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('buildCombatSteps subtracts acReduction from the enemy AC (floored at 1)', async () => {
    const store = await boot('AcidAC');
    const enemy = plant('Mud Boar');
    const player = store.getState().player!;
    const baseAttack = buildCombatSteps('attack', player, enemy, {}).find((s) => s.id === 'attack')!;
    const shredAttack = buildCombatSteps('attack', player, enemy, { acReduction: 2 }).find((s) => s.id === 'attack')!;
    expect(shredAttack.target).toBe(Math.max(1, (baseAttack.target as number) - 2));
    // Huge shred can't push AC below 1.
    const floored = buildCombatSteps('attack', player, enemy, { acReduction: 999 }).find((s) => s.id === 'attack')!;
    expect(floored.target).toBe(1);
  });
});

describe('OTA-403 — manual weapon-coating damage roll', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('buildCombatSteps appends a coating step when the swinging weapon is coated', async () => {
    const store = await boot('Coater');
    const enemy = plant('Mud Boar');
    const base = store.getState().player!;
    // No coating equipped → no coating step (plain 3-step flow).
    const plain = buildCombatSteps('attack', base, enemy, {});
    expect(plain.find((s) => s.id === 'coating')).toBeUndefined();

    // Equip a coated weapon instance in the main hand and rebuild.
    const mainId = 'coated-blade-1';
    const coatedPlayer = {
      ...base,
      inventory: [
        ...base.inventory,
        {
          id: mainId,
          name: 'Rusty Shortsword',
          kind: 'weapon' as const,
          rarity: 'Common' as const,
          quantity: 1,
          tags: [],
          coating: { kind: 'acid' as const, dice: '1d4', label: 'Acid-Etched' },
        },
      ],
      equipped: { ...(base.equipped ?? {}), main: 'Rusty Shortsword', mainId },
    };
    const steps = buildCombatSteps('attack', coatedPlayer as typeof base, enemy, {});
    const coatStep = steps.find((s) => s.id === 'coating');
    expect(coatStep).toBeDefined();
    expect(coatStep!.sides).toBe(4);
    expect(coatStep!.count).toBe(1);
    // The coating step is hit-gated (no target — it applies on a landed hit).
    expect(coatStep!.target).toBeUndefined();
    // It comes after the damage step.
    expect(steps.findIndex((s) => s.id === 'coating')).toBeGreaterThan(
      steps.findIndex((s) => s.id === 'damage'),
    );
  });
});

describe('coating DOT ticks at the start of the next action', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('a seeded poison_coat DOT bleeds the enemy and counts down', async () => {
    const store = await boot('Ticker');
    plant('Mud Boar');
    // Give the enemy a big HP pool so the DOT + any attack won't kill it,
    // and seed a poison coating DOT.
    const sc = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...sc,
        enemyHps: [999],
        enemyStatuses: [[{ kind: 'poison_coat', turnsRemaining: 3, dmgPerTurn: 5, sourceName: 'Poison Vial' }]],
      },
    });

    // The enemy-status tick runs at the TOP of the 'attack' intent,
    // before the attack roll is even queued — so the DOT lands
    // immediately on submitting the attack.
    store.getState().submitPlayerAction('attack');

    const after = store.getState().currentScene!;
    // The DOT bled 5 off the enemy (999 → 994).
    expect(after.enemyHps[0]).toBeLessThanOrEqual(994);
    // And ticked down 3 → 2 (still active).
    const dot = (after.enemyStatuses?.[0] ?? []).find((s) => s.kind === 'poison_coat');
    expect(dot?.turnsRemaining).toBe(2);
  });
});
