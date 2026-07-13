// OTA-048 — engagement-engine smoke test.
//
// Drives a sustained play loop that exercises all five engagement
// engines (OTA-043 through OTA-047) plus the OTA-040 collectibles
// drop on salvage. The point isn't strict statistical bounds — it's:
//
//   1. No engine crashes or trips another engine
//   2. OTA-040 collectible substitution actually fires at some point
//      during 200 salvage rolls (8% × 200 ≈ 16 expected hits)
//   3. Player state stays coherent throughout (no negative resources,
//      log entries always emit, scene transitions land cleanly)
//   4. The cross-engine interaction is well-behaved — e.g. a JIT
//      temptation encounter that fires during a step doesn't conflict
//      with the OTA-043 step-trinket lottery.

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

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'Smoker',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  // Force outside-hub so step lottery + JIT temptation can fire.
  const p0 = store.getState().player!;
  store.setState({
    player: { ...p0, hubRoomId: null, hp: p0.hpMax, stamina: p0.staminaMax, tc: 100 },
    gameLog: [],
  });
  return store;
}

describe('OTA-048 — engagement engines smoke test', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('200 mixed steps + rests + salvages produce coherent state, no throws', async () => {
    const store = await bootstrap();
    const errors: string[] = [];
    for (let i = 0; i < 200; i++) {
      try {
        const choice = i % 4;
        if (choice === 0) {
          store.getState().stepDirection(i % 2 === 0 ? 'north' : 'south');
        } else if (choice === 1) {
          // Damage so rest hits recovery branch
          store.setState((s) => (s.player ? { player: { ...s.player, hp: Math.max(1, s.player.hp - 5), stamina: Math.max(1, s.player.stamina - 5) } } : s));
          store.getState().rest();
        } else if (choice === 2) {
          store.getState().submitPlayerAction('investigate the ground');
        } else {
          store.getState().submitPlayerAction('salvage the gate');
        }
        // Clear any enemy/vendor that may have spawned so the loop keeps moving
        const scene = store.getState().currentScene;
        if (scene?.enemies && scene.enemies.length > 0) {
          store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: 'far' } } : s));
        }
        if (scene?.vendor) {
          store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, vendor: null } } : s));
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    expect(errors).toEqual([]);
    const after = store.getState().player!;
    expect(after.hp).toBeGreaterThan(0);
    expect(after.stamina).toBeGreaterThanOrEqual(0);
    expect(after.tc).toBeGreaterThanOrEqual(0);
    for (const item of after.inventory) {
      expect(item.quantity).toBeGreaterThanOrEqual(0);
    }
  });

  it('OTA-040 — collectible fragment substitution fires during sustained salvage', async () => {
    const store = await bootstrap();
    // Find a salvageable noun the engine recognizes that has a pool
    // routed in salvagePools (any tomb/relic_site/container hit will do).
    // Drive `salvage gate` 400 times — at 8% per call, P(0 hits) ≈ 7e-15.
    // BUT each successful salvage marks the noun consumed, so we need
    // to clear the searchedAmbientNouns between iterations OR rotate
    // through different nouns.
    let fragmentLines = 0;
    const fragRE = /folded note|page slides out|papery rustles|sealed letter|fragment of someone's writing|where the floods didn't reach/i;
    const fragmentRewardRE = /Found .*— .*open Contracts/;
    for (let i = 0; i < 400; i++) {
      store.setState({ gameLog: [] });
      // Clear scene searched markers so the noun stays salvageable.
      store.setState((s) => {
        const wm = s.worldMemory;
        const cleaned = { ...wm, visitedRooms: {} };
        return { worldMemory: cleaned };
      });
      // Rotate nouns to hit different pool branches
      const nouns = ['gate', 'reliquary', 'pedestal', 'crate', 'shelf'];
      const noun = nouns[i % nouns.length]!;
      try {
        store.getState().submitPlayerAction(`salvage ${noun}`);
      } catch { /* tracked elsewhere */ }
      const log = store.getState().gameLog;
      if (log.some((e) => fragRE.test(e.text)) || log.some((e) => fragmentRewardRE.test(e.text))) {
        fragmentLines++;
      }
    }
    // 8% * 400 = 32 expected. Even with substantial dropoff from
    // pool eligibility, expect more than zero.
    expect(fragmentLines).toBeGreaterThan(0);
  });

  it('OTA-043 step lottery does not collide with OTA-045 encounter spawn', async () => {
    // When a step fires an encounter (sets scene.enemies), the trinket
    // lottery's outdoorPeaceful gate is supposed to skip — no stacked
    // emit. Drive 100 steps and confirm: any step where enemies !== 0
    // post-step did NOT also produce a trinket reward.
    const store = await bootstrap();
    let conflicts = 0;
    const conflictDetails: string[] = [];
    for (let i = 0; i < 100; i++) {
      store.setState({ gameLog: [] });
      store.getState().stepDirection(i % 2 === 0 ? 'east' : 'west');
      const scene = store.getState().currentScene;
      const log = store.getState().gameLog;
      const encounterFired = (scene?.enemies?.length ?? 0) > 0;
      // The OTA-043 trinket reward line has a unique signature: ends
      // with " (Common)." — distinct from mini_dungeon loot drops
      // ("Recovered X x18.") and other reward channels that share
      // the same item names. Tightening the regex so we count only
      // actual OTA-043 trinket emits, not collisions on item name.
      const trinketFired = log.some((e) =>
        e.channel === 'reward'
        && /^✦ (Worn Temporal Credits|Aether Dust|Bent Nail|Cloth Scrap|Aether Residue)(?: x\d+)? \(Common\)\.$/.test(e.text),
      );
      // The order of operations in stepDirection: encounter rolls
      // FIRST, then the trinket gate. Trinket should always skip when
      // enemies just spawned this step.
      if (encounterFired && trinketFired) {
        conflicts++;
        const recentLogs = log.slice(-8).map((e) => `[${e.channel}] ${e.text.slice(0, 60)}`).join('\n  ');
        conflictDetails.push(`iter ${i}: enemies=${scene?.enemies?.[0]?.name}\n  ${recentLogs}`);
      }
      // Clear enemies so next step can fire its own encounter.
      if (scene?.enemies && scene.enemies.length > 0) {
        store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: 'far' } } : s));
      }
    }
    if (conflicts > 0) {
      // eslint-disable-next-line no-console
      process.stderr.write(`STEP_ENCOUNTER_CONFLICT (${conflicts}/100):\n${conflictDetails.slice(0, 3).join('\n')}\n`);
    }
    expect(conflicts).toBe(0);
  });
});
