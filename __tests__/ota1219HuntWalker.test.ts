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

// ⚠⚠ OTA-1219 — THE HUNT WALKER. Owner: "since you keep finding errors when you
// test hunts is it possible to build a test for each one and test them? ... I
// mean a test like you tested the bog dragon 5-7." This is that test,
// GENERALIZED: one walker that plays EVERY hunt in the catalog end to end
// through the real store — accept (or the faction-posted equivalent), then each
// stage in order on its own verb, wrong verb refused, every dice modal walked,
// mid-hunt bosses spawned, the apex spawn FROZEN (OTA-796), the kill completing
// the chain, the slain/turn-in line in the log. A hunt added to hunts.json is
// walked automatically — an unplayable hunt can never ship.
//
// It caught a real one on its first step: hunts had NO way off stage 0.
// Stage 0 is checkKind:null on all 18; mysteries/storylines auto-consume null
// stages (OTA-871) but hunts never got that loop, and the OTA-1213 verb
// matcher can't match null — every hunt accepted after 1236 was wedged
// forever. Fixed this OTA (accept starts past nulls + advanceHunt consumes +
// backfill heals stuck saves).
//
// ⚠⚠ HARNESS TRAPS — READ BEFORE EDITING (each cost a debug round to find):
//  1. BOOT RACE: startNewGame's opening scene lands via an async continuation
//     AFTER currentScene first appears. Seed state before the log QUIESCES
//     (holds still across samples) and the continuation clobbers your seeded
//     location back to the faction hub.
//  2. THE MODAL SWALLOW: submitPlayerAction SILENTLY drops ALL input while
//     pendingRolls is open (line one of the function — correct on device,
//     where the modal fills the screen). Walk every modal with drainRolls()
//     after every submit or the next scripted action never lands, no log line.
//  3. ENVIRONMENTAL PHOTOBOMB: a Danger tile can roll a wandering spawn off
//     the same action that spawns the boss. Settle for the boss's EXACT
//     "(hunted)"-tagged name, never for enemies[0].
//  4. SCENE RESETS: the attack rows advance OUT of combat only (OTA-1217), so
//     clear enemies/hooks/range before each stage's verb — leftover hooks also
//     eat verbs (hook intercepts run before the switch).
//  5. TRACKED: a booted character may already hold a tracked contract, so a
//     fresh accept can arrive PARKED (tracked:false) — and the matcher freezes
//     paused hunts. Force tracked:true after accepting.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { HUNTS, firstActionableHuntStage } from '../app/engine/hunts';
import type { HuntDef } from '../app/engine/hunts';
import { huntAnchorId } from '../app/engine/contractMarkers';

jest.setTimeout(600000);

const store = useGameStore;

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

function drainRolls() {
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 60) throw new Error('roll loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 15));
  }
}

function clearScene() {
  const scene = store.getState().currentScene!;
  useGameStore.setState({
    currentScene: { ...scene, enemies: [], enemyHps: [], hooks: [], range: null },
  });
}

/** The input each stage kind is paid by — every phrase parses to the matching
 *  intent at full confidence. A NEW checkKind added to hunts.json throws here,
 *  so extending the authoring vocabulary forces extending the walker. */
const VERB_FOR: Record<string, string> = {
  investigate: 'investigate the area',
  stealth: 'sneak',
  diplomacy: 'negotiate',
  cast: 'cast stone shaping',
  attack_provoke: 'attack',
  boss: 'attack',
  escape: 'flee',
};
/** A verb guaranteed NOT to pay the given stage (for the order-negative). */
function wrongVerbFor(kind: string): string {
  return kind === 'investigate' ? 'negotiate' : 'investigate the area';
}

describe('OTA-1219 — the hunt walker: every hunt in the catalog completes, in order, on its own verbs', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    // Trap #1 — quiesce before touching state.
    let last = -1;
    await settle(() => {
      const n = store.getState().gameLog.length;
      const stable = n === last;
      last = n;
      return stable;
    }, 10000);
  });

  const walk = async (def: HuntDef) => {
    const stage = () => store.getState().player!.activeHunts?.[0]?.stage ?? -1;
    const start = firstActionableHuntStage(def);
    let lastBoss = -1;
    for (let i = 0; i < def.stages.length; i++) {
      if (def.stages[i]!.checkKind === 'boss') lastBoss = i;
    }

    // Place the walker on the hunt's own ground, strong enough to end it.
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        currentLocationId: huntAnchorId(def),
        hubRoomId: null,
        hp: 500, hpMax: 500, stamina: 50, staminaMax: 50,
        stats: { ...p.stats, strength: 20, dexterity: 20 },
        activeHunts: [],
      },
    });
    clearScene();

    if (def.factionId === null) {
      // Neutral hunts take the REAL accept door (this is what caught the
      // stage-0 wedge). Faction hunts gate on a live vendor — seeded below
      // with the exact record shape the vendor branch writes.
      store.getState().acceptHunt(def.id);
      const rec = store.getState().player!.activeHunts?.[0];
      expect({ hunt: def.id, accepted: rec?.id, stage: rec?.stage })
        .toEqual({ hunt: def.id, accepted: def.id, stage: start });
      // Trap #5 — a parked accept freezes; force tracked.
      useGameStore.setState({
        player: {
          ...store.getState().player!,
          activeHunts: [{ ...rec!, tracked: true }],
        },
      });
    } else {
      useGameStore.setState({
        player: {
          ...store.getState().player!,
          activeHunts: [{ id: def.id, stage: start, postedByFaction: def.factionId, acceptedAt: Date.now(), tracked: true }],
        },
      });
    }

    // ⚠ ORDER, negative half: the wrong verb pays nothing at the first stage.
    clearScene();
    const firstKind = def.stages[start]!.checkKind!;
    await store.getState().submitPlayerAction(wrongVerbFor(firstKind));
    await new Promise((r) => setTimeout(r, 250));
    drainRolls();
    expect({ hunt: def.id, at: start, after: 'wrong verb', stage: stage() })
      .toEqual({ hunt: def.id, at: start, after: 'wrong verb', stage: start });

    // The walk: each stage on its own verb, in order.
    let guard = 0;
    while (stage() < def.stages.length) {
      if (guard++ > def.stages.length + 4) throw new Error(`${def.id}: walk did not converge (stuck at stage ${stage()})`);
      const s = stage();
      const kind = def.stages[s]!.checkKind;
      if (kind === null) throw new Error(`${def.id}: walker landed ON a null stage (${s}) — the auto-consume failed`);
      const verb = VERB_FOR[kind];
      if (!verb) throw new Error(`${def.id}: stage ${s} has unhandled checkKind '${kind}' — extend VERB_FOR + the matcher`);
      clearScene();
      await store.getState().submitPlayerAction(verb);
      drainRolls();

      if (kind === 'boss' && s === lastBoss) {
        // The apex: spawn, FREEZE (OTA-796), kill, complete.
        const hunted = `${def.targetEnemyName} (hunted)`;
        await settle(() => (store.getState().currentScene?.enemies ?? []).some((e) => e.name === hunted));
        const enemies = store.getState().currentScene!.enemies;
        const apexIdx = enemies.findIndex((e) => e.name === hunted);
        expect({ hunt: def.id, apexSpawned: apexIdx > -1, names: enemies.map((e) => e.name) })
          .toEqual({ hunt: def.id, apexSpawned: true, names: enemies.map((e) => e.name) });
        expect(stage()).toBe(s); // frozen — spawning is not completing
        const apex = enemies[apexIdx]!;
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
          await new Promise((r) => setTimeout(r, 150));
          drainRolls();
        }
        await settle(() => stage() === def.stages.length);
      } else {
        await settle(() => stage() > s);
        drainRolls();
        expect({ hunt: def.id, at: s, kind, advanced: stage() > s })
          .toEqual({ hunt: def.id, at: s, kind, advanced: true });
      }
    }

    expect({ hunt: def.id, done: stage() }).toEqual({ hunt: def.id, done: def.stages.length });
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toContain(`${def.targetEnemyName} slain. Return to a posting agent`);
  };

  for (const def of HUNTS) {
    it(`⚠⚠ ${def.id} — ${def.stages.length} stages, accept → apex kill → turn-in ready`, async () => {
      await walk(def);
    });
  }
});
