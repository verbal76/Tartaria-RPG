// OTA-043 — variable-reward engines on cardinal step + rest.
//
// Drives enough iterations to make the 10% step lottery and the 30%
// rest pull statistically certain to fire at least once. The point is
// to confirm wiring: when the lotteries roll, narration + reward
// channel entries land on the log. Statistics:
//   - step:  300 trials at p=0.10 (gated by ~55% peaceful-step rate)
//            → ~16 expected hits, P(0 hits) effectively 0
//   - rest:  100 trials at p=0.30 (gated by ~78% no-ambush rate)
//            → ~23 expected hits, P(0 hits) effectively 0

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

const TRINKET_NAMES = new Set([
  'Worn Tartarian Coin',
  'Aether Dust',
  'Bent Nail',
  'Cloth Scrap',
  'Aether Residue',
]);

function trinketRewardEntries() {
  return useGameStore.getState().gameLog.filter((e) => {
    if (e.channel !== 'reward') return false;
    return Array.from(TRINKET_NAMES).some((name) => e.text.includes(name));
  });
}

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'Stepper',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  // Force outside-hub so the lottery gate clears. Leave the outpost
  // explicitly — the tutorial flow drops the player inside a hub
  // room by default.
  store.setState({
    player: {
      ...p0,
      hubRoomId: null,
      hp: p0.hpMax,
      stamina: p0.staminaMax,
      hoursElapsed: 12, // afternoon — no time-of-day modifier extremes
      // High HP / TC so JIT temptation bias (OTA-045 future) doesn't
      // skew weights. Doesn't affect OTA-043 but keeps the harness
      // forward-compatible.
      tc: 100,
    },
    gameLog: [],
  });
  return store;
}

describe('OTA-043 — variable rewards on cardinal step', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('cardinal step occasionally drops a trinket (≥1 hit in 300 trials at p≈10%)', async () => {
    const store = await bootstrap();
    for (let i = 0; i < 300; i++) {
      // The step-trinket roll is gated on a NOVEL tile (anti-farm, OTA-532) and
      // costs stamina. This test verifies the lottery FIRES when its conditions
      // hold (statSpamGates owns the novelty gate itself), so keep every tile
      // novel and the tank topped up — otherwise a 2-tile bounce trips the gate
      // and a drained tank turns steps into no-ops.
      store.setState((s) => (s.player ? { player: { ...s.player, recentTileHistory: [], stamina: s.player.staminaMax } } : s));
      const dir = (i % 2 === 0 ? 'north' : 'south') as 'north' | 'south';
      store.getState().stepDirection(dir);
      // Bail out if combat starts — encounter takes over the scene
      // and subsequent steps are no-ops. Reset combat by clearing
      // enemies so the loop can keep walking.
      const scene = store.getState().currentScene;
      if (scene?.enemies && scene.enemies.length > 0) {
        store.setState((s) =>
          s.currentScene ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: 'far' } } : s,
        );
      }
      // Same for vendor — clear so the outdoorPeaceful gate stays
      // open on the next step.
      if (scene?.vendor) {
        store.setState((s) =>
          s.currentScene ? { currentScene: { ...s.currentScene, vendor: null } } : s,
        );
      }
    }
    const trinkets = trinketRewardEntries();
    expect(trinkets.length).toBeGreaterThan(0);
  });

  it('every step-trinket emit pairs a world narration with the reward', async () => {
    const store = await bootstrap();
    // Drive a smaller loop and verify the world-channel "tiny find"
    // narration comes alongside each reward emit. Looks for the
    // "glint" / "snags" / "shifts" / "shadow" / "nudges" cues from
    // STEP_TRINKET_LINES.
    for (let i = 0; i < 200; i++) {
      // Keep every tile novel + stamina topped (see note above).
      store.setState((s) => (s.player ? { player: { ...s.player, recentTileHistory: [], stamina: s.player.staminaMax } } : s));
      const dir = (i % 2 === 0 ? 'east' : 'west') as 'east' | 'west';
      store.getState().stepDirection(dir);
      const scene = store.getState().currentScene;
      if (scene?.enemies && scene.enemies.length > 0) {
        store.setState((s) =>
          s.currentScene ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: 'far' } } : s,
        );
      }
      if (scene?.vendor) {
        store.setState((s) =>
          s.currentScene ? { currentScene: { ...s.currentScene, vendor: null } } : s,
        );
      }
    }
    const stepCues = /glint|snags|shifts|shadow|nudges/;
    const log = useGameStore.getState().gameLog;
    const matches = log.filter((e) => e.channel === 'world' && stepCues.test(e.text));
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe('OTA-051 — hub rests can fire ambushes at a lower rate', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('60+ rests inside a hub produce at least one encounter (no more "60 days nothing")', async () => {
    const store = await bootstrap();
    // Send the player INTO the hub (Asgardar / their faction's starter
    // hub — startNewGame drops them in a hub by default). Confirm the
    // hub flag is set so we're actually exercising the new code path.
    const p0 = store.getState().player!;
    // Reset to confirm hub state — Reclaimer starter faction lands in
    // Old Reclaimers' Outpost, which IS a hub location per
    // isHubLocation. If a future change moves the starting tile out
    // of a hub this test will gracefully skip.
    const scene = store.getState().currentScene;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isHubLocation } = require('../app/engine/hub');
    const inHub = scene && isHubLocation(scene.location.id);
    if (!inHub) return; // starter location isn't a hub — can't test
    // Stamina must be BELOW max or the OTA-238 "already fully rested, save the
    // hours" gate refuses the rest before the while-you-slept/ambush roll. A
    // deficit makes each rest a real rest (which then rolls + refills).
    store.setState({
      player: { ...p0, hp: p0.hpMax, stamina: 1, hungerStaminaPenalty: 0 },
      gameLog: [],
    });
    let encounters = 0;
    const ENCOUNTER_CUES = /Silt Thief|Reclaimer Ambusher|Mud Giant|Mud Monarch|closes the distance through the dark|something circled while you were out/i;
    for (let i = 0; i < 100; i++) {
      const before = useGameStore.getState().gameLog.length;
      store.getState().submitPlayerAction('rest');
      const after = useGameStore.getState().gameLog.slice(before);
      if (after.some((e) => ENCOUNTER_CUES.test(e.text))) encounters++;
      // Re-fill and clear enemies for next iteration
      store.setState((s) => (s.player ? {
        player: { ...s.player, hp: s.player.hpMax, stamina: 1 },
      } : s));
      const liveScene = useGameStore.getState().currentScene;
      if (liveScene?.enemies && liveScene.enemies.length > 0) {
        store.setState((s) => (s.currentScene ? {
          currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: 'far' },
        } : s));
      }
    }
    // 8% hub rate × time-of-day modifier (0.85-1.3) over 100 rests:
    // expected 6-10 hits. P(0 hits) with p=0.05 lower-bound = 0.95^100
    // ≈ 0.006. Reliable.
    expect(encounters).toBeGreaterThan(0);
  });
});

describe('OTA-050 — parser-routed rest also rolls the OTA-043 pull', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('typed `rest` at full HP still occasionally produces a while-you-slept beat', async () => {
    const store = await bootstrap();
    // Reproduces the playtester's session: player at full HP/stamina,
    // taps rest repeatedly. PARSER-ROUTED rest is what they hit
    // (intent=rest via submitPlayerAction). Before OTA-050, the
    // OTA-043 pull only fired on the dead store-method rest() that
    // the UI doesn't reach. Now it fires on the parser path too.
    const p0 = store.getState().player!;
    // Stamina must be BELOW max or the OTA-238 "already fully rested, save the
    // hours" gate refuses the rest before the while-you-slept/ambush roll. A
    // deficit makes each rest a real rest (which then rolls + refills).
    store.setState({
      player: { ...p0, hp: p0.hpMax, stamina: 1, hungerStaminaPenalty: 0 },
      gameLog: [],
    });
    let pullHits = 0;
    const PULL_CUES = /chewed on something|remembered a name|patient.*wasn't quiet|Word travelled|dream the same dream|voices somewhere|bird you can't name|haze has cleared|wind in the silt|shake out your cloak|pre-dawn light|roll up your bedroll|brushing yourself/i;
    for (let i = 0; i < 100; i++) {
      const before = useGameStore.getState().gameLog.length;
      store.getState().submitPlayerAction('rest');
      const after = useGameStore.getState().gameLog.slice(before);
      if (after.some((e) => PULL_CUES.test(e.text))) pullHits++;
      // Re-fill HP but keep stamina LOW so the next iteration is a real rest
      // (full HP + full stamina would trip the OTA-238 "already fully rested"
      // refusal before the while-you-slept pull rolls).
      store.setState((s) => (s.player ? { player: { ...s.player, hp: s.player.hpMax, stamina: 1 } } : s));
      // ⚠ OTA-1202 hardening — CLEAR ANY AMBUSH, exactly as the sibling encounter test
      // above already does. This loop had no enemy cleanup, so the first war-party or
      // rest-ambush spawn STUCK: every later `rest` was refused mid-combat ("Nothing here
      // has agreed to that") and the pull never rolled again — 0 hits out of 100 at a
      // claimed p≈30%. It passed for months only because the file's fixed rng stream
      // happened to dodge an early spawn; OTA-1202's technique roll draws from the same
      // stream, shifted it, and the latent deadlock surfaced. The test is about the PULL,
      // not about spawn luck — so the fight is cleared the way its sibling clears it.
      const liveSceneRest = useGameStore.getState().currentScene;
      if (liveSceneRest?.enemies && liveSceneRest.enemies.length > 0) {
        store.setState((s) => (s.currentScene ? {
          currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: 'far' },
        } : s));
      }
    }
    // 30% per rest → expected ~30 hits over 100, P(0 hits) negligible.
    expect(pullHits).toBeGreaterThan(0);
  });
});

describe('OTA-043 — variable rewards on rest', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('rest occasionally fires a "while you slept" pull (≥1 hit in 100 trials at p≈30%)', async () => {
    const store = await bootstrap();
    // Damage the player so each rest hits the recovery branch (not
    // the full-HP no-op early return).
    store.setState((s) => (s.player ? { player: { ...s.player, hp: 1, stamina: 1 } } : s));
    let pullHits = 0;
    const REST_CUES = /chewed on something|remembered a name|dream the same dream|voices somewhere|bird you can't name|haze has cleared|wind in the silt|shake out your cloak|pre-dawn light|roll up your bedroll|brushing yourself/i;
    for (let i = 0; i < 100; i++) {
      const before = useGameStore.getState().gameLog.length;
      store.getState().rest();
      const after = useGameStore.getState().gameLog.slice(before);
      if (after.some((e) => REST_CUES.test(e.text))) pullHits++;
      // Re-damage the player for the next loop iteration so we keep
      // hitting the recovery branch.
      store.setState((s) => (s.player ? { player: { ...s.player, hp: 1, stamina: 1 } } : s));
    }
    expect(pullHits).toBeGreaterThan(0);
  });
});
