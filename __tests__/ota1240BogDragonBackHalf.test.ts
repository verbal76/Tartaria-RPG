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

// OTA-1240 — THE OWNER'S SAVE, PLAYED FORWARD: Bog Dragon stages 5→7 in order.
// His character sits at stage 5/7 (rec.stage 4, attack_provoke) after the burst
// incident; he asked for proof the back half completes IN ORDER under the new
// trigger law. This drives the REAL store through his exact position:
//   wrong verb refused → attack provokes (5→6 shown as stages) → cast binds the
//   name (6→7) → the apex advance SPAWNS the dragon and FREEZES (the OTA-796
//   no-bounty-without-the-kill rule) → the kill completes the hunt.
// It CAUGHT a real one: the frozen apex stage re-matched `boss && attack` on
// every swing OF THE BOSS FIGHT ITSELF — each attack re-spawned the dragon at
// full HP. The fix (this OTA) guards the hunt attack rows on out-of-combat.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findHuntById } from '../app/engine/hunts';
import { huntStageAnchorId } from '../app/engine/contractMarkers';

jest.setTimeout(180000);

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe('OTA-1240 — Bog Dragon back half, in order, each stage on its own verb', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('⚠⚠ the two stages before the apex, each on its own ground and its own verb → apex spawn, freeze, kill, complete', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Verbal', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    // ⚠ The opening scene lands via an async continuation AFTER currentScene
    // first appears — seed before it settles and it clobbers the seeded
    // location back to the faction hub (this test's first red run). Quiesce:
    // the log must hold still across two samples before we touch state.
    {
      let last = -1;
      await settle(() => {
        const n = store.getState().gameLog.length;
        const stable = n === last;
        last = n;
        return stable;
      }, 8000);
    }
    const def = findHuntById('hunt_bog_dragon')!;
    const stage = () => store.getState().player!.activeHunts?.[0]?.stage ?? -1;
    // ⚠ Any verb can open the real dice modal (a cast always does), and
    // submitPlayerAction SILENTLY DROPS input while pendingRolls is open —
    // exactly as the device does. Walk every modal the way a player would
    // (the ota976 step-through) or the next action in the script never lands.
    const drainRolls = () => {
      let guard = 0;
      while (store.getState().pendingRolls) {
        if (guard++ > 50) throw new Error('roll loop did not terminate');
        const pr = store.getState().pendingRolls!;
        const step = pr.steps[pr.currentStep]!;
        store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 15));
      }
    };

    // ⚠⚠ DERIVED, NOT HARD-CODED. This suite used to name the back half's verbs and its
    // one anchor in prose — stage 5 attack, stage 6 cast, all on the biome cell. P19 gave
    // every stage its own ground and the content pass re-cut the verbs, and a test that
    // spells out a MECHANISM instead of the RULE goes red on a content edit while proving
    // nothing about the rule. The rule is: each stage advances on ITS OWN verb, on ITS OWN
    // ground, wrong verbs pay nothing, and the apex spawns frozen. All four read off the def.
    const VERB: Record<string, string> = {
      investigate: 'investigate the area', stealth: 'sneak', diplomacy: 'negotiate',
      cast: 'cast stone shaping', attack_provoke: 'attack', boss: 'attack',
    };
    const WRONG: Record<string, string> = {
      investigate: 'negotiate', stealth: 'negotiate', diplomacy: 'investigate the area',
      cast: 'negotiate', attack_provoke: 'investigate the area', boss: 'negotiate',
    };
    let apexIdx0 = -1;
    for (let i = 0; i < def.stages.length; i++) if (def.stages[i]!.checkKind === 'boss') apexIdx0 = i;
    const backHalfStart = apexIdx0 - 2; // the owner's position: two stages out from the apex

    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        currentLocationId: huntStageAnchorId(def, backHalfStart),
        gridX: undefined, gridY: undefined, mapX: undefined, mapY: undefined,
        hubRoomId: null,
        hp: 500, hpMax: 500, stamina: 50, staminaMax: 50,
        stats: { ...p.stats, strength: 20, dexterity: 20 },
        activeHunts: [{ id: 'hunt_bog_dragon', stage: backHalfStart, tracked: true, postedByFaction: null, acceptedAt: 0 }],
      },
    });
    const scene = store.getState().currentScene!;
    useGameStore.setState({ currentScene: { ...scene, enemies: [], enemyHps: [], hooks: [], range: null } });
    expect(store.getState().player!.currentLocationId).toBe(huntStageAnchorId(def, backHalfStart));

    // Walk the two prep stages before the apex, each on its own ground and its own verb.
    for (let sIdx = backHalfStart; sIdx < apexIdx0; sIdx++) {
      const kind = def.stages[sIdx]!.checkKind!;
      const here = huntStageAnchorId(def, sIdx);
      useGameStore.setState({
        player: {
          ...store.getState().player!, currentLocationId: here, travelTarget: undefined, hubRoomId: null,
          gridX: undefined, gridY: undefined, mapX: undefined, mapY: undefined,
        },
        currentScene: { ...store.getState().currentScene!, enemies: [], enemyHps: [], hooks: [], range: null },
      });

      // ⚠ ORDER, negative half: the WRONG verb pays nothing.
      await store.getState().submitPlayerAction(WRONG[kind]!);
      await new Promise((r) => setTimeout(r, 300));
      drainRolls();
      expect({ stage: sIdx, afterWrongVerb: stage() }).toEqual({ stage: sIdx, afterWrongVerb: sIdx });

      // The right verb advances it. (Clear first — the exploration rows hold in combat.)
      useGameStore.setState({
        currentScene: { ...store.getState().currentScene!, enemies: [], enemyHps: [], hooks: [], range: null },
      });
      await store.getState().submitPlayerAction(VERB[kind]!);
      await settle(() => stage() > sIdx);
      drainRolls();
      await new Promise((r) => setTimeout(r, 150));
      drainRolls();
      expect({ stage: sIdx, kind, advanced: stage() > sIdx }).toEqual({ stage: sIdx, kind, advanced: true });
    }
    expect(stage()).toBe(apexIdx0);

    // Stand on the apex's ground for the kill.
    useGameStore.setState({
      player: {
        ...store.getState().player!, currentLocationId: huntStageAnchorId(def, apexIdx0),
        travelTarget: undefined, hubRoomId: null,
        gridX: undefined, gridY: undefined, mapX: undefined, mapY: undefined,
      },
    });

    // Stage 7 — the apex: the ATTACK advance SPAWNS the scaled dragon and the
    // stage FREEZES (OTA-796 — the bounty needs the body, not the spawn).
    useGameStore.setState({
      currentScene: { ...store.getState().currentScene!, enemies: [], enemyHps: [], hooks: [], range: null },
    });
    await store.getState().submitPlayerAction('attack');
    await new Promise((r) => setTimeout(r, 100));
    drainRolls();
    // ⚠ Settle for the DRAGON specifically — a Danger-4 tile can also roll an
    // environmental spawn off the same action, and grabbing enemies[0] blindly
    // caught a passing marsh creature on one run.
    await settle(() => (store.getState().currentScene?.enemies ?? []).some((e) => /bog dragon/i.test(e.name)));
    const apexIdx = store.getState().currentScene!.enemies.findIndex((e) => /bog dragon/i.test(e.name));
    expect(apexIdx).toBeGreaterThan(-1);
    const apex = store.getState().currentScene!.enemies[apexIdx]!;
    expect(stage()).toBe(apexIdx0); // frozen — spawning is not completing

    // The kill: wound the apex to a sliver, then swing through the real dice
    // modal (the ota976 step-through) until it falls.
    useGameStore.setState({
      currentScene: {
        ...store.getState().currentScene!,
        enemies: [apex], enemyHps: [1], activeEnemyIdx: 0, range: 'close',
        enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
        enemyArmorShred: [0], enemyCorruptionStacks: [0],
      },
    });
    for (let round = 0; round < 8 && stage() < def.stages.length; round++) {
      await store.getState().submitPlayerAction('attack');
      drainRolls();
      await new Promise((r) => setTimeout(r, 200));
      drainRolls();
    }
    await settle(() => stage() === def.stages.length);
    // Complete: stage index == stages.length is the turn-in gate's own test.
    expect(stage()).toBe(def.stages.length);
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/slain\. Return to a posting agent/);
  });
});
