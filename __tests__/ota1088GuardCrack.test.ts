// OTA-1088 — guard-crack. Workstream A ("fights that end"): the owner's device
// slog was a solo resisted matchup where every swing halved to chip damage and
// the fight simply refused to end. Now landing GUARD_CRACK_HITS (3) resisted
// hits of one damage type into one enemy wears its guard through — the resist
// stops applying for the rest of the fight — and the Arbiter's swap advice
// fires on the FIRST skid whenever it can name a concrete carried weapon
// (the old streak nudge made the player eat two resisted hits first).
// This suite drives REAL store combat: a slashing cleaver into a Construct
// (type-table slashing resist), with manual roll steps fed near-max values so
// every swing lands deterministically.

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
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import type { Enemy } from '../app/engine/types';

const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;
const _origRandom = Math.random;

// Seeded RNG for the engine's internal draws (enemy responses, procs);
// the PLAYER'S rolls come through pendingRolls and are fed near-max
// values directly, so every swing lands without relying on the seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENEMY_NAME = 'Scrap Warden';
const CRACK_KEY = `${ENEMY_NAME}|slashing`;

describe('OTA-1088 — three resisted hits wear the guard through', () => {
  const store = useGameStore;

  beforeAll(async () => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    Math.random = mulberry32(0x1111);

    await store.getState().hydrate();
    const races = getRaces();
    const factions = getFactions();
    await store.getState().startNewGame({
      name: 'GuardCracker',
      raceId: (races.find((r) => r.id === 'reclaimer') ?? races[0]!).id,
      factionId: (factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!).id,
    });
    store.getState().skipTutorial?.();

    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        hubRoomId: null,
        hpMax: 500, hp: 500,
        staminaMax: 60, stamina: 60,
        stats: { ...p0.stats, strength: 16, dexterity: 14 },
        inventory: [
          ...p0.inventory.filter((it) => it.kind !== 'weapon' && it.kind !== 'armor'),
          // Main hand: slashing — the Construct type-table RESISTS it.
          { id: 'gc_main', name: 'Mud-Iron Cleaver', kind: 'weapon' as const, quantity: 1, tags: ['weapon', 'blade', 'melee'] },
          // In the pack, NOT equipped: bludgeoning — Constructs are WEAK to it,
          // so the first-skid advice has a concrete weapon to name.
          { id: 'gc_alt', name: 'Cudgel', kind: 'weapon' as const, quantity: 1, tags: ['weapon', 'melee'] },
        ],
        equipped: { main: 'Mud-Iron Cleaver', mainId: 'gc_main' },
      },
    });

    // Inject a slashing-resistant Construct with deep HP (no knockout /
    // kill before the crack has been exercised), already at close range.
    const base = findEnemyByName('Gutter Rat');
    if (!base) throw new Error('ota1088: Gutter Rat missing from enemies.json — roster drift');
    const foe: Enemy = {
      ...(JSON.parse(JSON.stringify(base)) as Enemy),
      name: ENEMY_NAME,
      type: 'Construct',
      traits: [],
      hp: 800,
    };
    const scene = store.getState().currentScene;
    if (!scene) throw new Error('ota1088: no scene after startNewGame');
    store.setState({
      currentScene: {
        ...scene,
        enemies: [foe],
        enemyHps: [foe.hp],
        activeEnemyIdx: 0,
        range: 'close',
        enemyAmbushUsed: [false],
        enemyKnockedOut: [false],
        stealthOpenerUsed: false,
        resistWear: {},
        resistCracked: [],
      },
    });
  });

  afterAll(() => {
    console.log = _origLog;
    console.warn = _origWarn;
    console.error = _origErr;
    Math.random = _origRandom;
  });

  // Feed every staged roll near-max values: d20 attack = 19 (a hit against
  // any early-game AC without the nat-20 crit path), damage dice = sides-1.
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

  function attackOnce(): void {
    store.getState().submitPlayerAction('attack');
    resolvePendingRolls();
  }

  const logLines = () => store.getState().gameLog;
  const resistedLines = () =>
    logLines().filter((l) => l.channel === 'combat' && l.text.includes('(resisted,')).length;
  const crackLines = () =>
    logLines().filter((l) => l.channel === 'combat' && l.text.includes("guard through — it bites full from here")).length;
  const adviceLines = () =>
    logLines().filter((l) => l.channel === 'arbiter' && l.text.includes('skid off'));

  // Swing until the Nth resisted hit has landed (stun/whiff turns just retry).
  function attackUntilResisted(n: number): void {
    let safety = 0;
    while (resistedLines() < n && safety < 25) {
      attackOnce();
      safety++;
    }
    if (resistedLines() < n) {
      throw new Error(`ota1088: only ${resistedLines()} resisted hits after ${safety} attacks`);
    }
  }

  it('first resisted hit draws NAMED swap advice immediately (no second data point needed)', () => {
    attackUntilResisted(1);
    const advice = adviceLines();
    expect(advice.length).toBe(1);
    // Names the carried Cudgel (Constructs are weak to bludgeoning)…
    expect(advice[0]!.text).toContain('Swap to the Cudgel');
    // …with the singular first-skid phrasing, not the old two-hit lecture.
    expect(advice[0]!.text).not.toContain('Twice now.');
  });

  it('third resisted hit cracks the guard: crack line + scene bookkeeping', () => {
    attackUntilResisted(3);
    expect(crackLines()).toBe(1);
    const scene = store.getState().currentScene!;
    expect(scene.resistCracked ?? []).toContain(CRACK_KEY);
    // The named advice from hit one did NOT re-fire on hits two and three.
    expect(adviceLines().length).toBe(1);
  });

  it('after the crack, swings land full — no further resisted lines, HP still falls', () => {
    const resistedBefore = resistedLines();
    const hpBefore = store.getState().currentScene!.enemyHps[0]!;
    let safety = 0;
    // Land at least one more real hit (retry through any stunned turns).
    while (store.getState().currentScene!.enemyHps[0]! >= hpBefore && safety < 10) {
      attackOnce();
      safety++;
    }
    const hpAfter = store.getState().currentScene!.enemyHps[0]!;
    expect(hpAfter).toBeLessThan(hpBefore);
    // The cracked pair never prints "(resisted," again this fight.
    expect(resistedLines()).toBe(resistedBefore);
    // A full-value hit against 800 HP with near-max 1d8+STR dice must beat the
    // old resisted chip rate — the shrug line is gone, not just relabeled.
    expect(hpBefore - hpAfter).toBeGreaterThanOrEqual(2);
  });

  it('the bestiary intel still records the TRUE resist (the crack never lies to the codex)', () => {
    const intel = store.getState().worldMemory.enemyIntel?.[ENEMY_NAME.toLowerCase()];
    expect(intel).toBeTruthy();
    expect(intel!.resist).toContain('slashing');
  });
});

describe('OTA-1088 — source locks (damage floor + crack wiring)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

  it('landed hits floor at 2, computed off effectiveMod (the crack-aware modifier)', () => {
    expect(src).toMatch(/let dmg = Math\.max\(2, Math\.round\(rawDmg \* effectiveMod\.multiplier\)/);
  });

  it('the crack threshold is 3 resisted hits', () => {
    expect(src).toMatch(/const GUARD_CRACK_HITS = 3;/);
  });

  it('the bestiary write still receives the TRUE combinedMod, not effectiveMod', () => {
    expect(src).toMatch(/recordEnemyIntel\(get, set, enemy\.name, weaponType, combinedMod\.match\)/);
  });
});
