// OTA-1112 — pack action economy + anti-stun-lock. The OTA-1110 telemetry
// showed every stalled sim matchup was a 4-5 member faction pack at 0-5%
// resisted lines with 844 player-stuns per run: five attack rolls and five
// 20% stun re-rolls a round chained the player's turns away. Two levers:
//   1. MELEE_PACK_SWINGS_PER_ROUND (3) — only three melee blades fit around
//      one person per volley; the overflow presses in behind (one line).
//   2. `braced` — the moment a stun/paralyze takes hold, further
//      incapacitations cannot land for BRACED_ROUNDS.
// This suite drives the REAL exported volley (runEnemyGroupCounters) with a
// hand-built pack and a deterministic Math.random.

jest.setTimeout(60000);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async () => {}),
    getItem: jest.fn(async () => null),
    removeItem: jest.fn(async () => {}),
    multiSet: jest.fn(async () => {}),
    multiGet: jest.fn(async () => []),
    multiRemove: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => []),
    clear: jest.fn(async () => {}),
    mergeItem: jest.fn(async () => {}),
  },
}));
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
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
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

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore, runEnemyGroupCounters } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import { tickEffects, applyEffect } from '../app/engine/statusEffects';
import type { Enemy } from '../app/engine/types';

const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;
const _origRandom = Math.random;

describe('OTA-1112 — pack action economy + anti-stun-lock (live volley)', () => {
  const store = useGameStore;

  function makePack(n: number, traits: string[] = []): Enemy[] {
    const base = findEnemyByName('Gutter Rat');
    if (!base) throw new Error('ota1112: Gutter Rat missing — roster drift');
    return Array.from({ length: n }, (_, i) => ({
      ...(JSON.parse(JSON.stringify(base)) as Enemy),
      name: `Test Raider ${i + 1}`,
      traits,
      hp: 60,
    }));
  }

  function installPack(pack: Enemy[]): void {
    const scene = store.getState().currentScene;
    if (!scene) throw new Error('ota1112: no scene');
    store.setState({
      currentScene: {
        ...scene,
        enemies: pack,
        enemyHps: pack.map((e) => e.hp),
        activeEnemyIdx: 0,
        range: 'close',
        enemyAmbushUsed: pack.map(() => false),
        enemyKnockedOut: pack.map(() => false),
        stealthOpenerUsed: false,
        resistWear: {},
        resistCracked: [],
      },
    });
  }

  const combatLinesSince = (mark: number) =>
    store.getState().gameLog.slice(mark).filter((l) => l.channel === 'combat');

  beforeAll(async () => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};

    await store.getState().hydrate();
    const races = getRaces();
    const factions = getFactions();
    await store.getState().startNewGame({
      name: 'PackTester',
      raceId: (races.find((r) => r.id === 'reclaimer') ?? races[0]!).id,
      factionId: (factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!).id,
    });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        hubRoomId: null,
        hpMax: 1000, hp: 1000,
        dog: null,
        statusEffects: [],
      },
    });
  });

  afterAll(() => {
    console.log = _origLog;
    console.warn = _origWarn;
    console.error = _origErr;
    Math.random = _origRandom;
  });

  it('a 5-melee pack lands at most 3 swings per volley; the overflow gets one crowd line', async () => {
    // High constant roll: every allowed attacker HITS (d20 ≈ 19 vs early AC),
    // and no trait/status procs fire (all proc chances are < 0.95).
    Math.random = () => 0.95;
    installPack(makePack(5));
    const mark = store.getState().gameLog.length;
    runEnemyGroupCounters(store.getState.bind(store), (fn) => store.setState(fn as never), store.getState().player!);
    await Promise.resolve(); // damage lines land on a microtask
    const lines = combatLinesSince(mark);
    const dealt = lines.filter((l) => /deals \d+ .* damage/.test(l.text));
    expect(dealt.length).toBe(3);
    const crowd = lines.filter((l) => l.text.includes('press in behind'));
    expect(crowd.length).toBe(1);
    expect(crowd[0]!.text).toMatch(/and 1 other press in behind their own pack/);
  });

  it('the first stun grants braced, and braced turns the next incapacitation away', async () => {
    // rng 0.15: every attacker hits nothing (d20 = 4 → miss)… no — 0.15 must
    // still HIT for the concussive proc to roll. Instead run TWO volleys with
    // different constants: 0.15 would miss, so use a two-phase stub — high for
    // the attack roll region is not distinguishable, so drive with a cycling
    // sequence tuned so hits land AND the 20% concussive roll passes:
    // Math.random cycling [0.9, 0.1] gives every other draw low — attack
    // rolls that draw 0.9 hit, trait rolls that draw 0.1 stun.
    let flip = false;
    Math.random = () => { flip = !flip; return flip ? 0.9 : 0.1; };
    store.setState({ player: { ...store.getState().player!, statusEffects: [], hp: 1000 } });
    installPack(makePack(5, ['concussive']));

    // Volley until a stun actually lands (draw order varies per swing).
    let safety = 0;
    while (!store.getState().player!.statusEffects?.some((e) => e.kind === 'stun') && safety < 10) {
      runEnemyGroupCounters(store.getState.bind(store), (fn) => store.setState(fn as never), store.getState().player!);
      await Promise.resolve();
      safety++;
    }
    const fx = store.getState().player!.statusEffects ?? [];
    expect(fx.some((e) => e.kind === 'stun')).toBe(true);
    // The stun that took hold opened the braced window alongside it.
    expect(fx.some((e) => e.kind === 'braced')).toBe(true);

    // With braced pinned active and the stun cleared, further volleys can
    // never re-apply an incapacitation — only the braced deflection line.
    store.setState({
      player: {
        ...store.getState().player!,
        hp: 1000,
        statusEffects: [{ kind: 'braced', remainingRounds: 99, label: 'braced' }],
      },
    });
    for (let i = 0; i < 5; i++) {
      runEnemyGroupCounters(store.getState.bind(store), (fn) => store.setState(fn as never), store.getState().player!);
      await Promise.resolve();
    }
    const fxAfter = store.getState().player!.statusEffects ?? [];
    expect(fxAfter.some((e) => e.kind === 'stun')).toBe(false);
    expect(fxAfter.some((e) => e.kind === 'paralyzed')).toBe(false);
    const rangOff = store.getState().gameLog.filter((l) => l.text.includes('braced; you keep your feet'));
    expect(rangOff.length).toBeGreaterThan(0);
  });
});

describe('OTA-1112 — knockouts end fights (subdual resolution)', () => {
  const store = useGameStore;

  function resolvePendingRolls(): void {
    let safety = 0;
    while (store.getState().pendingRolls && safety < 30) {
      const pr = store.getState().pendingRolls!;
      const step = pr.steps[pr.currentStep];
      if (!step) { try { store.getState().cancelPendingRolls(); } catch { /* noop */ } break; }
      const count = step.count ?? 1;
      const sides = step.sides ?? 6;
      const values: number[] = [];
      for (let i = 0; i < count; i++) values.push(Math.max(1, sides - 1));
      try {
        store.getState().resolveRollStep(values);
      } catch {
        try { store.getState().cancelPendingRolls(); } catch { /* noop */ }
        break;
      }
      safety++;
    }
  }

  it('killing the last standing enemy of a half-subdued pack strips the sleepers and ends the fight', async () => {
    Math.random = () => 0.9;
    const base = findEnemyByName('Gutter Rat')!;
    const sleeper: Enemy = {
      ...(JSON.parse(JSON.stringify(base)) as Enemy),
      name: 'Sleeping Raider', type: 'Human', traits: [], hp: 40,
    };
    const fighter: Enemy = {
      ...(JSON.parse(JSON.stringify(base)) as Enemy),
      name: 'Standing Raider', type: 'Human', traits: [], hp: 3,
    };
    const scene = store.getState().currentScene!;
    store.setState({
      player: { ...store.getState().player!, hp: 1000, statusEffects: [] },
      currentScene: {
        ...scene,
        enemies: [sleeper, fighter],
        enemyHps: [22, 3],
        activeEnemyIdx: 1,
        range: 'close',
        enemyAmbushUsed: [false, false],
        enemyKnockedOut: [true, false],
        stealthOpenerUsed: false,
        resistWear: {}, resistCracked: [],
      },
    });
    // One near-max blow kills the 3-HP fighter; the KO'd sleeper is the only
    // body left — the fight must resolve by subdual, not lock onto a sleeper.
    store.getState().submitPlayerAction('attack');
    resolvePendingRolls();
    await Promise.resolve();
    const sc = store.getState().currentScene!;
    expect(sc.enemies.length).toBe(0);
    expect(sc.range).toBeNull();
    const log = store.getState().gameLog;
    expect(log.some((l) => l.text.includes('Nobody left standing'))).toBe(true);
    expect(log.some((l) => l.text.includes('You strip the unconscious Sleeping Raider'))).toBe(true);
  });
});

describe('OTA-1112 — braced tick class + source locks', () => {
  it('braced is per-encounter: ticks in combat, cleared the moment the fight ends', () => {
    const fx = applyEffect([], { kind: 'braced', remainingRounds: 3, label: 'braced' });
    const inFight = tickEffects(fx, { inCombat: true });
    expect(inFight.effects.find((e) => e.kind === 'braced')?.remainingRounds).toBe(2);
    const outOfFight = tickEffects(fx, { inCombat: false });
    expect(outOfFight.effects.some((e) => e.kind === 'braced')).toBe(false);
  });

  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

  it('the braced window is 3 rounds and the melee cap is 3 swings', () => {
    expect(src).toMatch(/const BRACED_ROUNDS = 3;/);
    expect(src).toMatch(/const MELEE_PACK_SWINGS_PER_ROUND = 3;/);
  });

  it('both incapacitation kinds are gated (stun AND paralyzed)', () => {
    expect(src).toMatch(/const isIncapKind = \(k: string\) => k === 'stun' \|\| k === 'paralyzed';/);
  });

  it('bosses and ranged enemies are exempt from the swing cap', () => {
    expect(src).toMatch(/const meleeAttacker = !enemy\.boss && !isRangedEnemy\(enemy\);/);
  });
});
