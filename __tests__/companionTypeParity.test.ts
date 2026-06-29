// Combat-Parity verification — companion (golem swing + dog bite) damage must
// RESPECT enemy type resist/weakness, the same way the player's swing does.
// Boots a REAL store, plants the SAME companion against three enemy TYPES
// (resist / neutral / weak to the companion's damage type), strips enemy traits
// so only the enemy-TYPE macro map applies, pins Math.random for deterministic
// dice, and measures the actual enemy-HP delta per case.

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
import { makeCompanion, getSidekickDefinition } from '../app/engine/sidekicks';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

// Plant a single enemy of a given TYPE. Traits stripped, AC pinned low (so the
// companion reliably HITS), HP set high (so the kill path never fires and we can
// read a clean HP delta). Only the enemy `type` varies between scenarios.
function plantTyped(type: string): void {
  const proto = findEnemyByName('Mud Boar');
  if (!proto) throw new Error('seed enemy not found');
  const enemy = JSON.parse(JSON.stringify(proto));
  enemy.type = type;
  enemy.traits = [];          // clean signal — only the enemy-TYPE macro map applies
  enemy.abilityPoint = '0';   // → AC 5 (floor), so a mid d20 always lands
  enemy.hp = 1000;
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies: [enemy],
      enemyHps: [1000],
      activeEnemyIdx: 0,
      range: 'close',
      enemyAmbushUsed: [false],
      enemyKnockedOut: [false],
      enemyStatuses: [[]],
    },
  });
}

function enemyHp(): number {
  return useGameStore.getState().currentScene!.enemyHps[0]!;
}

// Pull the most recent "<N> <type> damage / <N> piercing" number out of the log.
function lastCompanionDamage(): number | null {
  const log = useGameStore.getState().gameLog.map((l) => l.text);
  for (let i = log.length - 1; i >= 0; i--) {
    const m = log[i]!.match(/lands (\d+) \w+ damage|teeth into .* for (\d+) piercing|(\d+) piercing\./);
    if (m) return parseInt(m[1] ?? m[2] ?? m[3]!, 10);
  }
  return null;
}

describe('Combat-Parity — companion damage respects enemy type resist/weakness', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  afterEach(() => { (Math.random as unknown as { mockRestore?: () => void }).mockRestore?.(); });

  // ── 1. GOLEM swing (Crystal Golem — innate PIERCING) ─────────────────────
  // piercing: Construct RESISTS, Aetheric Mutation NEUTRAL, Animal WEAK.
  it('GOLEM (piercing) swing differs across resist / neutral / weak', async () => {
    const store = await boot('GolemTester');
    const def = getSidekickDefinition('crystal_golem');
    expect(def.damageType).toBe('piercing'); // confirm innate type assumption

    const fight = (enemyType: string): number => {
      plantTyped(enemyType);
      // Re-bind a FRESH base golem each time (no stat training carry-over).
      useGameStore.setState((s) => ({ player: { ...s.player!, sidekick: makeCompanion(def) } }));
      const before = enemyHp();
      // Pin RNG: 0.5 → d20=11 (hit vs AC5), d12=7. base dmg = 7 + attackMod(3) = 10.
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      store.getState().submitPlayerAction('command golem');
      (Math.random as unknown as { mockRestore: () => void }).mockRestore();
      const delta = before - enemyHp();
      return delta;
    };

    const resist = fight('Construct');           // resists piercing → ×0.5 floor
    const neutral = fight('Aetheric Mutation');  // no piercing entry → ×1.0
    const weak = fight('Animal');                // weak to piercing → ×1.5 ceil

    // eslint-disable-next-line no-console
    process.stdout.write(`\n[GOLEM piercing] resist(Construct)=${resist}  neutral(Aetheric Mutation)=${neutral}  weak(Animal)=${weak}\n`);

    expect(neutral).toBe(10);                 // base 7+3
    expect(resist).toBe(Math.floor(10 / 2));  // 5
    expect(weak).toBe(Math.ceil(10 * 1.5));   // 15
    expect(resist).toBeLessThan(neutral);
    expect(weak).toBeGreaterThan(neutral);
    // Loud guard: if the fix didn't take, all three are identical.
    expect(new Set([resist, neutral, weak]).size).toBe(3);
  });

  // ── 2. DOG bite (innate PIERCING) ────────────────────────────────────────
  it('DOG (piercing) bite differs across resist / neutral / weak', async () => {
    const store = await boot('DogTester');

    // Build a plain combat-ready dog with a known STR so damage is deterministic.
    const makeDog = () => ({
      id: 'd1', name: 'Fang', breed: 'mutt',
      sex: { raw: 'male', pronoun: 'he' as const },
      startingProfile: 'mongrel' as const,
      hp: 20, hpMax: 20,
      stats: { strength: 10, dexterity: 10, intelligence: 10 },
      statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
      loyalty: 100, lastFedAtHour: 0,
      equipped: { vest: null },
      status: 'with_player' as const,
    });

    const fight = (enemyType: string): number => {
      plantTyped(enemyType);
      useGameStore.setState((s) => ({ player: { ...s.player!, dog: makeDog(), sidekick: null } }));
      const before = enemyHp();
      // 0.5 → d20=11 (hit vs AC5, not nat1/nat20), d6=4. base dmg = 4 + floor(10/2)=4 → 8.
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      store.getState().submitPlayerAction('bite');
      (Math.random as unknown as { mockRestore: () => void }).mockRestore();
      return before - enemyHp();
    };

    const resist = fight('Construct');           // resists piercing
    const neutral = fight('Aetheric Mutation');  // neutral to piercing
    const weak = fight('Animal');                // weak to piercing

    process.stdout.write(`\n[DOG piercing] resist(Construct)=${resist}  neutral(Aetheric Mutation)=${neutral}  weak(Animal)=${weak}\n`);

    // 0.5 → rollDie(6)=1+floor(0.5*6)=4, +floor(STR10/2)=5 → base 9.
    expect(neutral).toBe(9);                  // 4 + 5
    expect(resist).toBe(Math.floor(9 / 2));   // 4
    expect(weak).toBe(Math.ceil(9 * 1.5));    // 14
    expect(resist).toBeLessThan(neutral);
    expect(weak).toBeGreaterThan(neutral);
    expect(new Set([resist, neutral, weak]).size).toBe(3);
  });

  // ── 3. SANITY — player weapon swing still scales with enemy type ──────────
  // The fix did NOT touch the player path; confirm it still behaves the same.
  // The starting weapon (Rusted Blade) is SLASHING. Construct RESISTS slashing,
  // Aetheric Mutation is NEUTRAL to it (no built-in type is slashing-WEAK, so we
  // assert resist < neutral, the same direction as the companion fixes).
  //
  // The player attack is a manual dice-roll flow (pendingRolls: initiative →
  // attack → damage). We drive resolveRollStep with explicit dice: initiative 10
  // (win), attack 18 (hit, not a nat-20 crit), damage 4. concludeRolls then
  // applies the SAME type modifiers the companion path now uses.
  it('SANITY: player slashing swing — resist < neutral (player path unchanged)', async () => {
    const store = await boot('PlayerTester');

    const fight = (enemyType: string): number => {
      plantTyped(enemyType);
      useGameStore.setState((s) => ({ player: { ...s.player!, dog: null, sidekick: null } }));
      const before = enemyHp();
      store.getState().submitPlayerAction('attack'); // opens the roll flow
      // Resolve each pending step with fixed dice until the flow closes.
      let guard = 0;
      while (useGameStore.getState().pendingRolls && guard++ < 10) {
        const step = useGameStore.getState().pendingRolls!.steps[useGameStore.getState().pendingRolls!.currentStep]!;
        const v = step.id === 'initiative' ? 10 : step.id === 'attack' ? 18 : 4;
        store.getState().resolveRollStep([v]);
      }
      return before - enemyHp();
    };

    const resist = fight('Construct');           // resists slashing → ×0.5
    const neutral = fight('Aetheric Mutation');  // neutral to slashing → ×1.0
    process.stdout.write(`\n[PLAYER slashing] resist(Construct)=${resist}  neutral(Aetheric Mutation)=${neutral}\n`);

    expect(neutral).toBeGreaterThan(0);
    expect(resist).toBeLessThan(neutral);  // player path still scales down vs a resisting type
  });
});
