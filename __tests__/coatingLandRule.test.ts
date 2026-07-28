// verifyCoatingLandRule — engine_Dev coating-landing rule verification.
//
// THE RULE (concludeRolls, gameStore.ts ~14515): a weapon coating ALWAYS
// "takes" on a landing hit UNLESS the enemy RESISTS the coating's damage
// type — in which case it has only a small chance (COATING_RESIST_LAND_CHANCE
// = 0.15) to take. So:
//   enemy WEAK    → always lands
//   enemy NEUTRAL → always lands
//   enemy RESISTS → ~15% chance, else "...coating fails to take..." logged.
//
// We drive REAL store combat: boot, plant an enemy at close range, equip a
// real catalog weapon carrying a POISON coating instance (coatDT='poison'),
// then submitPlayerAction('attack') and resolve every roll step (forcing a
// natural-20 attack so the strike always lands and concludeRolls runs the
// coating block). We pin Math.random to control the resist roll, and detect
// "took" via the poison_coat DOT in enemyStatuses[idx] and/or the absence of
// the "fails to take" combat-log line.
//
// Poison relationships used (TYPE_RESISTANCE_MAP in app/engine/crafting.ts):
//   Automation  (Scrap Drone) RESISTS poison.
//   Mud Creature (Mudling)    NEUTRAL  to poison.
//   Animal      (Mud Boar)    WEAK to poison — OTA-827 made poison anti-ORGANIC, so
//                             living flesh (Animal / Human / fleshy Aetheric Mutation)
//                             is vulnerable to it.
//   Mud Boar + injected trait vulnerable:poison → WEAK to poison.

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
import { applyDamageTypeModifier } from '../app/engine/crafting';
import { traitDamageMultiplier } from '../app/engine/enemyTraits';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

// Plant a single enemy at close range. `mutate` lets a case tweak the proto
// (e.g. inject a vulnerable:poison trait) before it goes into the scene.
function plant(name: string, mutate?: (e: any) => void) {
  const proto = findEnemyByName(name);
  if (!proto) throw new Error(`test enemy not found: ${name}`);
  const enemy = JSON.parse(JSON.stringify(proto));
  if (mutate) mutate(enemy);
  // Keep the enemy alive through the swing so the coating SURVIVE-gated DOT
  // seeds (a coating DOT is applied only if the enemy lives past the blow).
  enemy.hp = 9999;
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies: [enemy],
      enemyHps: [enemy.hp],
      activeEnemyIdx: 0,
      range: 'close',
      enemyAmbushUsed: [false],
      enemyKnockedOut: [false],
      enemyStatuses: [[]],
      enemyArmorShred: [0],
      enemyCorruptionStacks: [0],
    },
  });
  return enemy;
}

// Equip a real catalog melee weapon carrying a poison coating instance.
function equipCoatedWeapon(weaponName = 'Rusted Blade') {
  const store = useGameStore;
  const p = store.getState().player!;
  const id = 'coated-test-weapon';
  const item: any = {
    id,
    name: weaponName,
    kind: 'weapon',
    quantity: 1,
    coating: { kind: 'poison', dice: '1d4', label: 'Poisoned' },
  };
  useGameStore.setState({
    player: {
      ...p,
      inventory: [...(p.inventory ?? []).filter((i) => i.id !== id), item],
      equipped: { ...(p.equipped ?? {}), main: weaponName, mainId: id },
    },
  });
}

// Drive submitPlayerAction('attack') to completion, resolving every roll
// step. Force a natural 20 on the attack step so the strike ALWAYS lands and
// concludeRolls runs the coating block. Returns when pendingRolls clears.
async function attackResolvingAll() {
  const store = useGameStore;
  await store.getState().submitPlayerAction('attack');
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 50) throw new Error('roll-step loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    let values: number[];
    if (step.id === 'attack') {
      values = [20]; // natural 20 → forced hit + crit
    } else {
      const count = step.count ?? 1;
      const sides = step.sides ?? 1;
      values = Array.from({ length: count }, () => sides); // max each die
    }
    store.getState().resolveRollStep(values);
  }
}

// Did the poison coating "take" this swing? Look for poison_coat in the
// active enemy's status array AND the absence of a "fails to take" line.
function observe() {
  const sc = useGameStore.getState().currentScene!;
  const statuses = sc.enemyStatuses?.[0] ?? [];
  const hasPoisonCoat = statuses.some((st: any) => st.kind === 'poison_coat');
  const log = useGameStore.getState().gameLog.map((l: any) => l.text).join('\n');
  const failsLogged = /coating fails to take/i.test(log);
  return { hasPoisonCoat, failsLogged };
}

// Sanity: confirm the relationships we rely on actually hold in the engine.
describe('coating-rule preconditions (relationship sanity)', () => {
  it('Automation RESISTS poison; Mud Creature is NEUTRAL; Animal is WEAK; vulnerable:poison trait is WEAK', () => {
    expect(applyDamageTypeModifier(1, 'poison', 'Automation').match).toBe('resist');
    // OTA-827 — poison is anti-organic, so Mud Creatures (inorganic) stay NEUTRAL…
    expect(applyDamageTypeModifier(1, 'poison', 'Mud Creature').match).toBe('normal');
    // …but living flesh (Animal) is WEAK to it.
    expect(applyDamageTypeModifier(1, 'poison', 'Animal').match).toBe('weak');
    expect(traitDamageMultiplier(['vulnerable:poison'], 'poison').match).toBe('vulnerable');
    // A creature with no poison-relevant trait resolves neutral at the trait layer.
    expect(traitDamageMultiplier(['savage', 'ambush_strike'], 'poison').match).toBe('normal');
  });
});

describe('engine_Dev coating-landing rule — REAL store combat', () => {
  let rngSpy: jest.SpyInstance;
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  afterEach(() => { if (rngSpy) rngSpy.mockRestore(); });

  // Pin Math.random to a fixed value (controls the resist gate). Everything
  // else in the attack (dice) is supplied via resolveRollStep, so the fixed
  // RNG only matters at the coating gate.
  function pinRandom(v: number) {
    rngSpy = jest.spyOn(Math, 'random').mockReturnValue(v);
  }

  it('CASE 1 — RESISTS poison + Math.random HIGH (0.9): coating FAILS', async () => {
    const store = await boot('CoatRule1');
    plant('Scrap Drone'); // Automation → resists poison
    equipCoatedWeapon();
    pinRandom(0.9); // >= 0.15 → gate fails
    await attackResolvingAll();
    const { hasPoisonCoat, failsLogged } = observe();
    expect(store.getState().currentScene?.enemies[0]?.type).toBe('Automation');
    expect(hasPoisonCoat).toBe(false);   // no DOT seeded
    expect(failsLogged).toBe(true);      // "fails to take" logged
  });

  it('CASE 2 — RESISTS poison + Math.random LOW (0.05): coating LANDS', async () => {
    const store = await boot('CoatRule2');
    plant('Scrap Drone'); // Automation → resists poison
    equipCoatedWeapon();
    pinRandom(0.05); // < 0.15 → slips through
    await attackResolvingAll();
    const { hasPoisonCoat, failsLogged } = observe();
    expect(store.getState().currentScene?.enemies[0]?.type).toBe('Automation');
    expect(hasPoisonCoat).toBe(true);    // DOT seeded
    expect(failsLogged).toBe(false);     // no "fails" line
  });

  it('CASE 3 — NEUTRAL to poison + Math.random HIGH (0.99): coating LANDS (no gate)', async () => {
    const store = await boot('CoatRule3');
    plant('Mudling'); // Mud Creature → NEUTRAL to poison (inorganic; OTA-827 poison is anti-organic)
    equipCoatedWeapon();
    pinRandom(0.99); // would fail IF the gate wrongly applied
    await attackResolvingAll();
    const { hasPoisonCoat, failsLogged } = observe();
    expect(store.getState().currentScene?.enemies[0]?.type).toBe('Mud Creature');
    expect(hasPoisonCoat).toBe(true);    // lands anyway
    expect(failsLogged).toBe(false);     // gate must NOT apply to neutral
  });

  it('CASE 4 — WEAK to poison (vulnerable:poison) + Math.random HIGH (0.99): coating LANDS (no gate)', async () => {
    const store = await boot('CoatRule4');
    plant('Mud Boar', (e) => { e.traits = [...(e.traits ?? []), 'vulnerable:poison']; });
    equipCoatedWeapon();
    pinRandom(0.99); // would fail IF the gate wrongly applied
    await attackResolvingAll();
    const { hasPoisonCoat, failsLogged } = observe();
    const enemy = store.getState().currentScene?.enemies[0];
    expect(enemy?.traits).toContain('vulnerable:poison');
    expect(hasPoisonCoat).toBe(true);    // weakness always lands
    expect(failsLogged).toBe(false);     // gate must NOT apply to weak
  });

  it('CASE 5 — trial sweep: ~15% land on RESISTED; ~100% on NEUTRAL & WEAK', async () => {
    const TRIALS = 200;

    // 5a — RESISTED enemy across the full RNG range: lands iff rng < 0.15.
    let resistLands = 0;
    for (let i = 0; i < TRIALS; i++) {
      const r = i / TRIALS; // 0.000 .. 0.995, evenly spread
      await boot(`CoatRule5a-${i}`);
      plant('Scrap Drone');
      equipCoatedWeapon();
      pinRandom(r);
      await attackResolvingAll();
      if (observe().hasPoisonCoat) resistLands++;
      rngSpy.mockRestore();
    }
    const resistRate = resistLands / TRIALS;
    // Exactly the fraction of [0,1) below 0.15 should land.
    expect(resistRate).toBeGreaterThan(0.10);
    expect(resistRate).toBeLessThan(0.20);

    // 5b — NEUTRAL enemy with rng pinned HIGH every time: must ALWAYS land.
    let neutralLands = 0;
    for (let i = 0; i < TRIALS; i++) {
      await boot(`CoatRule5b-${i}`);
      plant('Mudling'); // Mud Creature → genuinely NEUTRAL to poison
      equipCoatedWeapon();
      pinRandom(0.99);
      await attackResolvingAll();
      if (observe().hasPoisonCoat) neutralLands++;
      rngSpy.mockRestore();
    }
    expect(neutralLands).toBe(TRIALS); // gate never touches neutral

    // 5c — WEAK enemy with rng pinned HIGH every time: must ALWAYS land.
    let weakLands = 0;
    for (let i = 0; i < TRIALS; i++) {
      await boot(`CoatRule5c-${i}`);
      plant('Mud Boar', (e) => { e.traits = [...(e.traits ?? []), 'vulnerable:poison']; });
      equipCoatedWeapon();
      pinRandom(0.99);
      await attackResolvingAll();
      if (observe().hasPoisonCoat) weakLands++;
      rngSpy.mockRestore();
    }
    expect(weakLands).toBe(TRIALS); // gate never touches weak

    // Surface the observed rates for the report.
    // eslint-disable-next-line no-console
    (globalThis as any).__coatRates = { resistRate, neutralLands, weakLands, TRIALS };
  });
});
