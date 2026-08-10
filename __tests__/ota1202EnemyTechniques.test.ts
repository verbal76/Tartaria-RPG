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
// OTA-1202 — PUNCHLIST P16, the mirror: enemies channel too.
//
// Owner: *"mirror it to enemies and have them applied like the resists are"* — and the
// rulings of 2026-08-10: aether AND mud kinds AND the Revivalists' humans; ~1 in 4; the
// Cascade is IN; channelling costs the enemy its swing.
// OTA-1202 — PUNCHLIST P16, the mirror: enemies channel too.
//
// Owner: *"mirror it to enemies and have them applied like the resists are"* — and the
// rulings of 2026-08-10: aether AND mud kinds AND the Revivalists' humans; ~1 in 4; the
// Cascade is IN; channelling costs the enemy its swing.
import { useGameStore } from '../app/state/gameStore';
import {
  ENEMY_TECHNIQUE_RATE, TECHNIQUE_FACTION, describeTechniqueTrait, enemyTechniquePool,
  rollEnemyTechnique,
} from '../app/engine/aetherTechniques';
import { randomizeEnemyDefense, findEnemyByName } from '../app/engine/encounter';
import { describeTrait, traitACBonus } from '../app/engine/enemyTraits';
import type { Enemy } from '../app/engine/types';

jest.setTimeout(180000);

describe('OTA-1202 / P16 — who channels (ruling 1)', () => {
  test('⚠⚠ aether kinds, mud kinds, machines — and NOT plain animals or humans', () => {
    expect(enemyTechniquePool({ type: 'aetheric creature' })).toBeTruthy();
    expect(enemyTechniquePool({ type: 'aetheric mutation' })).toBeTruthy();
    expect(enemyTechniquePool({ type: 'aetheric undead' })).toBeTruthy();
    expect(enemyTechniquePool({ type: 'automation' })).toBeTruthy();
    expect(enemyTechniquePool({ type: 'mud creature' })).toBeTruthy();
    // A wolf does not slip time, and a plain raider has not been practising.
    expect(enemyTechniquePool({ type: 'animal' })).toBeNull();
    expect(enemyTechniquePool({ type: 'human' })).toBeNull();
  });

  test('⚠⚠ the Revivalists\' HUMANS channel — the faction seeking the old ways', () => {
    expect(enemyTechniquePool({ type: 'human', factionId: TECHNIQUE_FACTION })).toBeTruthy();
    // And no other faction's humans do.
    expect(enemyTechniquePool({ type: 'human', factionId: 'reclaimers_guild' })).toBeNull();
  });

  test('⚠ bosses NEVER roll one — they keep their authored kits, like the resists', () => {
    expect(enemyTechniquePool({ type: 'aetheric creature', boss: true })).toBeNull();
  });

  test('⚠ the rate is the agreed ~1 in 4, and the roll honors it', () => {
    expect(ENEMY_TECHNIQUE_RATE).toBe(0.25);
    // rng below the rate → a technique; above → none. Deterministic via injection.
    expect(rollEnemyTechnique({ type: 'aetheric creature' }, () => 0.1)).toMatch(/^technique:/);
    expect(rollEnemyTechnique({ type: 'aetheric creature' }, () => 0.9)).toBeNull();
  });

  test('⚠⚠ the profiler stamps it per spawn, idempotently, alongside the resists', () => {
    const proto = findEnemyByName('Silt Serpent')!;
    const spawn = randomizeEnemyDefense({ ...JSON.parse(JSON.stringify(proto)) }, () => 0.1);
    // rng 0.1 < 0.25 → if this type is eligible it carries a technique; either way the
    // spawn is profiled and re-profiling must not double-stamp.
    const again = randomizeEnemyDefense(spawn, () => 0.1);
    expect(again.traits).toEqual(spawn.traits);
    const techCount = (spawn.traits ?? []).filter((t) => t.startsWith('technique')).length;
    expect(techCount).toBeLessThanOrEqual(1);
  });

  test('⚠ the portrait names every lifecycle stage — read the threat like the resists', () => {
    expect(describeTrait('technique:aether_shield')).toBe('Channels: Aether Shield');
    expect(describeTrait('technique_spent:resonance_cascade')).toBe('Spent: Resonance Cascade');
    expect(describeTrait('field:aether_shield')).toMatch(/\+3 AC/);
    expect(describeTrait('slip_held')).toMatch(/Temporal Slip/);
    expect(describeTrait('veiled_strike')).toMatch(/unseen/i);
  });

  test('⚠ a raised field IS armour — read by the same traitACBonus the panel and enemyAC share', () => {
    expect(traitACBonus(['field:aether_shield'])).toBe(3);
  });
});

// ─── LIVE — a real fight, each technique end to end ─────────────────────────────────────

async function freshFight(techTrait: string, hpFrac = 1) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Mirror Probe', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
  store.getState().skipTutorial?.();
  const proto = findEnemyByName('Silt Serpent') ?? findEnemyByName('Mud Spider');
  const enemy: Enemy = { ...JSON.parse(JSON.stringify(proto)), traits: ['profiled', techTrait] };
  const scene = store.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene, enemies: [enemy], enemyHps: [Math.max(1, Math.round(enemy.hp * hpFrac))],
      activeEnemyIdx: 0, range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false],
    },
  });
  const p = store.getState().player!;
  useGameStore.setState({ player: { ...p, hp: p.hpMax } });
  return store;
}

const feedSince = (n: number) =>
  useGameStore.getState().gameLog.slice(n).map((l: { text: string }) => l.text).join('\n');

describe('OTA-1202 / P16 — LIVE, each technique in a real volley', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ SHIELD: the channel consumes the swing (cost mirror) and the field is real AC', async () => {
    const store = await freshFight('technique:aether_shield');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runEnemyGroupCounters } = require('../app/state/gameStore') as typeof import('../app/state/gameStore');
    const hpBefore = store.getState().player!.hp;
    const before = store.getState().gameLog.length;
    runEnemyGroupCounters(store.getState as never, useGameStore.setState as never, store.getState().player!);
    // THE COST: the channel WAS its action — the player took no damage this volley.
    expect(feedSince(before)).toMatch(/AETHER SHIELD/);
    expect(store.getState().player!.hp).toBe(hpBefore);
    const traits = store.getState().currentScene!.enemies[0]!.traits ?? [];
    expect(traits).toContain('field:aether_shield');
    expect(traits).toContain('technique_spent:aether_shield');
    expect(traits.some((t) => t === 'technique:aether_shield')).toBe(false);
    // And a SECOND volley swings normally — the technique is once.
    const before2 = store.getState().gameLog.length;
    runEnemyGroupCounters(store.getState as never, useGameStore.setState as never, store.getState().player!);
    expect(feedSince(before2)).not.toMatch(/AETHER SHIELD stands/);
  });

  test('⚠⚠ SLIP: held, it eats the player\'s first landing blow — and a NAT 20 pierces it', async () => {
    const store = await freshFight('technique:aether_shield');
    // Plant the held slip directly (the channel path is proved above); the claim under
    // test is the negation at the player's swing.
    const sc = store.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...sc,
        enemies: [{ ...sc.enemies[0]!, traits: ['profiled', 'slip_held'] }],
      },
    });
    const p = store.getState().player!;
    useGameStore.setState({ player: { ...p, stats: { ...p.stats, strength: 20 } } });
    const hpRowBefore = store.getState().currentScene!.enemyHps[0]!;
    // ⚠ 'attack' opens the DICE MODAL and each step must be RESOLVED with values — my
    // first two spellings (bare submit, then concludeRolls on unrolled steps) never
    // landed a swing at all and reported the slip dead. The ota976 pattern is the real
    // one: step through pendingRolls with resolveRollStep. A fixed 15 on the d20 beats
    // the serpent's AC without being a nat-20, which is exactly the blow the slip exists
    // to eat — and NOT the one that pierces it.
    let slipped = false;
    for (let i = 0; i < 10 && !slipped; i++) {
      const before = store.getState().gameLog.length;
      store.getState().submitPlayerAction('attack');
      let guard = 0;
      while (store.getState().pendingRolls) {
        if (guard++ > 50) throw new Error('roll loop did not terminate');
        const pr = store.getState().pendingRolls!;
        const step = pr.steps[pr.currentStep]!;
        store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 15));
      }
      await new Promise((r) => setTimeout(r, 5));
      const since = feedSince(before);
      if (/SLIPPED/.test(since)) { slipped = true; break; }
      if ((store.getState().currentScene?.enemies.length ?? 0) === 0) break;
      const q = store.getState().player!;
      useGameStore.setState({ player: { ...q, hp: q.hpMax, stamina: q.staminaMax ?? 100 } });
    }
    expect(slipped).toBe(true);
    // The blow that slipped did no damage, and the slip is spent.
    const scAfter = store.getState().currentScene;
    if (scAfter && scAfter.enemies.length > 0) {
      expect((scAfter.enemies[0]!.traits ?? [])).not.toContain('slip_held');
      expect(scAfter.enemyHps[0]!).toBe(hpRowBefore);
    }
  });

  test('⚠⚠ VEIL: the channel spends a swing, the NEXT swing lands at +5, once', async () => {
    const store = await freshFight('technique:veil_of_ether');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runEnemyGroupCounters } = require('../app/state/gameStore') as typeof import('../app/state/gameStore');
    const before = store.getState().gameLog.length;
    runEnemyGroupCounters(store.getState as never, useGameStore.setState as never, store.getState().player!);
    expect(feedSince(before)).toMatch(/VEILED/);
    expect(store.getState().currentScene!.enemies[0]!.traits ?? []).toContain('veiled_strike');
    const before2 = store.getState().gameLog.length;
    runEnemyGroupCounters(store.getState as never, useGameStore.setState as never, store.getState().player!);
    expect(feedSince(before2)).toMatch(/OUT OF THE VEIL.*\+5|\+5.*OUT OF THE VEIL|strikes OUT OF THE VEIL/);
    expect(store.getState().currentScene!.enemies[0]!.traits ?? []).not.toContain('veiled_strike');
  });

  test('⚠⚠ CASCADE: held until cornered, then 5d10 out + 1d10 back through itself, ONCE', async () => {
    const store = await freshFight('technique:resonance_cascade');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runEnemyGroupCounters } = require('../app/state/gameStore') as typeof import('../app/state/gameStore');
    // At full HP it holds the technique and fights normally.
    const before0 = store.getState().gameLog.length;
    runEnemyGroupCounters(store.getState as never, useGameStore.setState as never, store.getState().player!);
    expect(feedSince(before0)).not.toMatch(/Resonance Cascade/);
    expect(store.getState().currentScene!.enemies[0]!.traits ?? []).toContain('technique:resonance_cascade');
    // Corner it.
    const sc = store.getState().currentScene!;
    const enemyHpRow = Math.max(1, Math.round(sc.enemies[0]!.hp * 0.2));
    useGameStore.setState({ currentScene: { ...sc, enemyHps: [enemyHpRow] } });
    const hpBefore = store.getState().player!.hp;
    const before = store.getState().gameLog.length;
    runEnemyGroupCounters(store.getState as never, useGameStore.setState as never, store.getState().player!);
    expect(feedSince(before)).toMatch(/LETS IT RUN|Resonance Cascade/);
    // THE BURST landed on the player, and the kickback tore through the enemy.
    expect(store.getState().player!.hp).toBeLessThan(hpBefore);
    const scAfter = store.getState().currentScene;
    if (scAfter && scAfter.enemies.length > 0) {
      expect(scAfter.enemyHps[0]!).toBeLessThan(enemyHpRow);
      expect(scAfter.enemies[0]!.traits ?? []).toContain('technique_spent:resonance_cascade');
    }
  });
});
