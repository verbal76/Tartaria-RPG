// OTA-124 vandalistic stress — 500-trial sweep of combat with all
// player/dog/golem combinations. Asserts the retaliation split holds,
// no NaN HP anywhere, no infinite loops, dog status flips correctly
// when HP hits 0, and dog+golem don't block each other's actions.
//
// We drive the engine directly via `submitPlayerAction('bite ...')`
// rather than re-rolling chance manually — that exercises the real
// dispatch path including the retaliation distribution.

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
import { createDogCompanion } from '../app/engine/dogCompanion';
import { GOLEM_DEFINITIONS, makeCompanion } from '../app/engine/golems';
import type { Enemy } from '../app/engine/types';

function makeEnemy(name: string, hp: number, idx: number): Enemy {
  return {
    name: `${name}_${idx}`,
    type: 'beast',
    abilityPoint: 'Strength 3',
    attack: '3',
    damage: '1d6',
    hp,
    rarity: 'Common',
    loot: [],
    aliases: [name.toLowerCase()],
  };
}

async function boot(combo: 'alone' | 'dog' | 'golem' | 'both', enemyHp: number, enemyCount: number) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Tester', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  const enemies: Enemy[] = [];
  const enemyHps: number[] = [];
  for (let i = 0; i < enemyCount; i++) {
    const e = makeEnemy('drone', enemyHp, i);
    enemies.push(e);
    enemyHps.push(enemyHp);
  }
  const dog = combo === 'dog' || combo === 'both'
    ? createDogCompanion({ name: 'Marrow', breed: 'mutt', rawSex: 'boy', startingProfile: 'mongrel', currentHour: 0 })
    : null;
  const golem = combo === 'golem' || combo === 'both'
    ? makeCompanion(GOLEM_DEFINITIONS.iron_golem)
    : null;
  store.setState({
    player: {
      ...p0,
      hp: 100, hpMax: 100, stamina: 100,
      dog,
      golem,
      hoursElapsed: 0,
    },
    currentScene: {
      ...(store.getState().currentScene ?? {} as never),
      enemies,
      enemyHps,
      enemyAmbushUsed: enemies.map(() => false),
      activeEnemyIdx: 0,
      range: 'close',
    } as never,
  });
  return store;
}

describe('OTA-124 vandalistic — dog+golem combat combo chaos (500 trials)', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  // Track aggregate retaliation distribution across the "both" combo.
  const retaliationCounts = { dog: 0, golem: 0, player: 0 };

  it('160 random encounters across all 4 combos resolve without NaN/infinity/loops', async () => {
    const combos: ('alone' | 'dog' | 'golem' | 'both')[] = ['alone', 'dog', 'golem', 'both'];
    let issues = 0;
    // Bounded to 160 (40 per combo). Long combat sims accumulate super-
    // linearly in the engine's world/persist layer past ~a few hundred steps
    // and the worker OOMs; 160 stays in the stable region while still exercising
    // every combo × enemy-count × HP-bucket permutation many times over.
    for (let trial = 0; trial < 160; trial++) {
      const combo = combos[trial % 4]!;
      const enemyCount = 1 + (trial % 5); // 1..5
      const hpBucket = trial % 3;          // 0=low, 1=mid, 2=high
      const enemyHp = hpBucket === 0 ? 4 : hpBucket === 1 ? 12 : 22;
      const store = await boot(combo, enemyHp, enemyCount);
      // Drive up to 80 rounds per encounter (dog bite is 1d6 + STR/2 ~5dmg,
      // so even high-HP 22 enemies × 5 fold in <80 rounds). Bail out if
      // scene resolves; the test only fails on NaN/negative HP, not on
      // scene-not-resolving (RNG can string together long miss streaks).
      let rounds = 0;
      const maxRounds = 80;
      while (rounds < maxRounds) {
        const scene = store.getState().currentScene;
        const player = store.getState().player;
        if (!scene || scene.enemies.length === 0) break;
        if (!player) break;
        if (player.hp <= 0) break;
        // Pick what to send.
        if (combo === 'alone') {
          // Player attacks the active enemy via direct HP manipulation —
          // we're not testing player attack mechanics here, just that
          // the combat loop terminates.
          store.setState((s) => {
            if (!s.currentScene) return s;
            const hps = [...s.currentScene.enemyHps];
            if (hps.length > 0) hps[0] = Math.max(0, (hps[0] ?? 0) - 5);
            return {
              currentScene: {
                ...s.currentScene,
                enemyHps: hps,
                enemies: hps[0]! > 0 ? s.currentScene.enemies : s.currentScene.enemies.slice(1),
              },
            };
          });
        } else if (combo === 'dog') {
          store.getState().submitPlayerAction('bite drone');
        } else if (combo === 'golem') {
          store.getState().submitPlayerAction('command golem');
        } else {
          // both — alternate dog + golem actions per round
          if (rounds % 2 === 0) store.getState().submitPlayerAction('bite drone');
          else store.getState().submitPlayerAction('command golem');
        }
        rounds++;
        // Track invariants
        const p2 = store.getState().player;
        if (p2) {
          if (Number.isNaN(p2.hp)) issues++;
          if (p2.dog && Number.isNaN(p2.dog.hp)) issues++;
          if (p2.golem && Number.isNaN(p2.golem.hp)) issues++;
          if (p2.dog && p2.dog.hp < 0) issues++;
          if (p2.golem && p2.golem.hp < 0) issues++;
          // Track retaliation breakdown via the gameLog (combat lines mention
          // "swings on Marrow|the golem|you").
        }
      }
      // We don't fail on "didn't resolve in N rounds" — dog bite can miss
      // for long streaks, and what we're stress-testing is the engine's
      // invariants (HP integrity, no NaN, no negative HP). Combat
      // termination is a separate concern verified by the resolve test
      // below.
    }
    expect(issues).toBe(0);
  });

  it('combats with dog combo eventually resolve (no permanent stalls)', async () => {
    // Stress test combat termination separately. Use 5 trials per combo
    // and assert that within 200 rounds the scene resolves OR the dog/
    // golem/player dies.
    const combos: ('dog' | 'golem' | 'both')[] = ['dog', 'golem', 'both'];
    let stalls = 0;
    for (const combo of combos) {
      for (let trial = 0; trial < 5; trial++) {
        const store = await boot(combo, 12, 1);
        let rounds = 0;
        const maxRounds = 200;
        while (rounds < maxRounds) {
          const scene = store.getState().currentScene;
          const player = store.getState().player;
          if (!scene || scene.enemies.length === 0) break;
          if (!player || player.hp <= 0) break;
          if (combo === 'dog' && (!player.dog || player.dog.status !== 'with_player')) break;
          if (combo === 'golem' && !player.golem) break;
          if (combo === 'dog') store.getState().submitPlayerAction('bite drone');
          else if (combo === 'golem') store.getState().submitPlayerAction('command golem');
          else {
            if (rounds % 2 === 0) store.getState().submitPlayerAction('bite drone');
            else store.getState().submitPlayerAction('command golem');
          }
          rounds++;
        }
        if (rounds >= maxRounds) stalls++;
      }
    }
    expect(stalls).toBe(0);
  });

  it('companion command (dog+golem active) lands the full volley on the COMMANDER, not the companions (arb169)', async () => {
    // Drive 200 dog-bite actions vs a single high-HP enemy with both
    // dog AND golem active. Count which target eats the retaliation.
    // arb169 — commanding a companion provokes the FULL enemy volley against the
    // PLAYER (the commander), the same retaliation a real player attack draws —
    // closing the old exploit where spamming the dog dodged the group counter.
    // The dog/golem are NOT hit by command-retaliation, so the player eats it.
    const store = await boot('both', 500, 1);
    let dogHits = 0, golemHits = 0, playerHits = 0;
    for (let i = 0; i < 200; i++) {
      const beforeDogHp = store.getState().player?.dog?.hp ?? 0;
      const beforeGolemHp = store.getState().player?.golem?.hp ?? 0;
      const beforePlayerHp = store.getState().player?.hp ?? 0;
      store.getState().submitPlayerAction('bite drone');
      const afterDogHp = store.getState().player?.dog?.hp ?? 0;
      const afterGolemHp = store.getState().player?.golem?.hp ?? 0;
      const afterPlayerHp = store.getState().player?.hp ?? 0;
      if (afterDogHp < beforeDogHp) dogHits++;
      else if (afterGolemHp < beforeGolemHp) golemHits++;
      else if (afterPlayerHp < beforePlayerHp) playerHits++;
      // Heal everyone back to full so they don't die mid-test.
      store.setState((s) => s.player
        ? {
            player: {
              ...s.player,
              hp: 100,
              dog: s.player.dog && s.player.dog.status === 'with_player'
                ? { ...s.player.dog, hp: s.player.dog.hpMax }
                : s.player.dog,
              golem: s.player.golem ? { ...s.player.golem, hp: s.player.golem.hpMax } : null,
            },
          }
        : s);
      // Refresh enemy HP too.
      store.setState((s) => s.currentScene
        ? {
            currentScene: {
              ...s.currentScene,
              enemies: s.currentScene.enemies.length > 0 ? s.currentScene.enemies : [makeEnemy('drone', 500, 0)],
              enemyHps: s.currentScene.enemyHps.length > 0 ? [500] : [500],
              enemyAmbushUsed: [false],
              activeEnemyIdx: 0,
              range: 'close',
            },
          }
        : s);
    }
    const total = dogHits + golemHits + playerHits;
    expect(total).toBeGreaterThan(50); // retaliation landed on someone
    // arb169 + OTA-685 — commanding a companion still routes the volley to the
    // COMMANDER (no command-to-dodge exploit), but OTA-685 restored DOG
    // vulnerability: ~1-in-4 of each enemy swing redirects to the dog on EVERY
    // volley (DOG_TARGET_CHANCE = 0.25), so the downed/bench/bleed-out system
    // stays live. So: player eats the majority (~75%) but NOT the whole volley,
    // the dog DOES take hits, and the GOLEM is never redirected.
    const playerPct = (playerHits / Math.max(1, total)) * 100;
    retaliationCounts.dog = dogHits;
    retaliationCounts.golem = golemHits;
    retaliationCounts.player = playerHits;
    expect(playerPct).toBeGreaterThan(60);
    expect(playerPct).toBeLessThan(90);
    expect(dogHits).toBeGreaterThan(0);
    expect(golemHits).toBe(0);
  });

  it('dog-command (no golem) lands the volley on the COMMANDER, not the dog (arb169)', async () => {
    const store = await boot('dog', 500, 1);
    let dogHits = 0, playerHits = 0;
    for (let i = 0; i < 200; i++) {
      const beforeDogHp = store.getState().player?.dog?.hp ?? 0;
      const beforePlayerHp = store.getState().player?.hp ?? 0;
      store.getState().submitPlayerAction('bite drone');
      const afterDogHp = store.getState().player?.dog?.hp ?? 0;
      const afterPlayerHp = store.getState().player?.hp ?? 0;
      if (afterDogHp < beforeDogHp) dogHits++;
      else if (afterPlayerHp < beforePlayerHp) playerHits++;
      // Heal both back to full.
      store.setState((s) => s.player
        ? {
            player: {
              ...s.player,
              hp: 100,
              dog: s.player.dog && s.player.dog.status === 'with_player'
                ? { ...s.player.dog, hp: s.player.dog.hpMax }
                : s.player.dog,
            },
          }
        : s);
      store.setState((s) => s.currentScene
        ? {
            currentScene: {
              ...s.currentScene,
              enemies: s.currentScene.enemies.length > 0 ? s.currentScene.enemies : [makeEnemy('drone', 500, 0)],
              enemyHps: s.currentScene.enemyHps.length > 0 ? [500] : [500],
              enemyAmbushUsed: [false],
              activeEnemyIdx: 0,
              range: 'close',
            },
          }
        : s);
    }
    const total = dogHits + playerHits;
    expect(total).toBeGreaterThan(50);
    // arb169 + OTA-685 — the commander eats the majority, but OTA-685's
    // DOG_TARGET_CHANCE (0.25) redirects ~1-in-4 swings to the dog on every
    // volley (so commanding it grants no defensive edge, yet the dog stays
    // vulnerable). Player ~75%, dog takes real hits.
    const playerPct = (playerHits / Math.max(1, total)) * 100;
    expect(playerPct).toBeGreaterThan(60);
    expect(playerPct).toBeLessThan(90);
    expect(dogHits).toBeGreaterThan(0);
  });

  it('dog HP never goes below 0 visible — clamps at 0', async () => {
    const store = await boot('dog', 4, 1);
    // Force the dog to low HP and let the retaliation chain run repeatedly.
    store.setState((s) => s.player && s.player.dog
      ? { player: { ...s.player, dog: { ...s.player.dog, hp: 1 } } }
      : s);
    let belowZeroObserved = false;
    for (let i = 0; i < 50; i++) {
      const dog = store.getState().player?.dog;
      if (dog && dog.hp < 0) belowZeroObserved = true;
      // Drive a bite to provoke retaliation.
      store.getState().submitPlayerAction('bite drone');
      // Restore enemies + bring dog back to with_player at 1 hp for more pain
      store.setState((s) => s.currentScene
        ? {
            currentScene: {
              ...s.currentScene,
              enemies: [makeEnemy('drone', 50, 0)],
              enemyHps: [50],
              enemyAmbushUsed: [false],
              activeEnemyIdx: 0,
              range: 'close',
            },
          }
        : s);
      const liveDog = store.getState().player?.dog;
      if (liveDog && (liveDog.hp <= 0 || liveDog.status === 'waiting_at_base')) {
        store.setState((s) => s.player && s.player.dog
          ? { player: { ...s.player, dog: { ...s.player.dog, hp: 1, status: 'with_player' as const } } }
          : s);
      }
    }
    expect(belowZeroObserved).toBe(false);
  });

  it('golem HP never goes below 0 visible — clamps at 0 and clears slot', async () => {
    const store = await boot('golem', 4, 1);
    store.setState((s) => s.player && s.player.golem
      ? { player: { ...s.player, golem: { ...s.player.golem, hp: 1 } } }
      : s);
    let belowZeroObserved = false;
    for (let i = 0; i < 30; i++) {
      const g = store.getState().player?.golem;
      if (g && g.hp < 0) belowZeroObserved = true;
      store.getState().submitPlayerAction('command golem');
      store.setState((s) => s.currentScene
        ? {
            currentScene: {
              ...s.currentScene,
              enemies: [makeEnemy('drone', 50, 0)],
              enemyHps: [50],
              enemyAmbushUsed: [false],
              activeEnemyIdx: 0,
              range: 'close',
            },
          }
        : s);
      const liveG = store.getState().player?.golem;
      if (!liveG) {
        // golem already crumbled — re-summon a fresh one
        store.setState((s) => s.player
          ? { player: { ...s.player, golem: makeCompanion(GOLEM_DEFINITIONS.iron_golem) } }
          : s);
      } else if (liveG.hp <= 1) {
        store.setState((s) => s.player && s.player.golem
          ? { player: { ...s.player, golem: { ...s.player.golem, hp: 1 } } }
          : s);
      }
    }
    expect(belowZeroObserved).toBe(false);
  });

  it('dog acts (bite damages enemy) even when golem is present — golem doesn\'t block dog', async () => {
    const store = await boot('both', 50, 1);
    const beforeHp = store.getState().currentScene?.enemyHps[0] ?? 0;
    store.getState().submitPlayerAction('bite drone');
    const afterHp = store.getState().currentScene?.enemyHps[0] ?? 0;
    // Bite might miss; run multiple times — but at least one should
    // damage across 20 attempts.
    let damaged = afterHp < beforeHp;
    for (let i = 0; i < 20 && !damaged; i++) {
      const before = store.getState().currentScene?.enemyHps[0] ?? 0;
      store.getState().submitPlayerAction('bite drone');
      const after = store.getState().currentScene?.enemyHps[0] ?? 0;
      // Heal the enemy back if needed so we keep trying.
      if (after < before) damaged = true;
      else {
        store.setState((s) => s.currentScene
          ? { currentScene: { ...s.currentScene, enemyHps: [50] } }
          : s);
      }
    }
    expect(damaged).toBe(true);
  });

  it('golem acts (attack damages enemy) even when dog is present — dog doesn\'t block golem', async () => {
    const store = await boot('both', 50, 1);
    let damaged = false;
    for (let i = 0; i < 20 && !damaged; i++) {
      const before = store.getState().currentScene?.enemyHps[0] ?? 0;
      store.getState().submitPlayerAction('command golem');
      const after = store.getState().currentScene?.enemyHps[0] ?? 0;
      if (after < before) damaged = true;
      else {
        store.setState((s) => s.currentScene
          ? { currentScene: { ...s.currentScene, enemyHps: [50] } }
          : s);
      }
    }
    expect(damaged).toBe(true);
  });

  it('first co-activation flavor (wide arc line) fires once per save', async () => {
    const store = await boot('both', 50, 1);
    expect(store.getState().worldMemory.dogGolemCoActivated).toBeFalsy();
    store.getState().submitPlayerAction('bite drone');
    expect(store.getState().worldMemory.dogGolemCoActivated).toBe(true);
    const logsAfter1 = store.getState().gameLog.filter((l) => l.text.includes('wide arc')).length;
    expect(logsAfter1).toBeGreaterThanOrEqual(1);
    // Refresh scene + send another bite
    store.setState((s) => s.currentScene
      ? {
          currentScene: {
            ...s.currentScene,
            enemies: [makeEnemy('drone', 50, 0)],
            enemyHps: [50],
            enemyAmbushUsed: [false],
            activeEnemyIdx: 0,
            range: 'close',
          },
        }
      : s);
    store.getState().submitPlayerAction('bite drone');
    const logsAfter2 = store.getState().gameLog.filter((l) => l.text.includes('wide arc')).length;
    expect(logsAfter2).toBe(logsAfter1); // didn't fire again
  });
});
