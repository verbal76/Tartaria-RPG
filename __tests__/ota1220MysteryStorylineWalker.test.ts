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

// ⚠⚠ OTA-1220 — TEXAS RANGER RIDES THE OTHER TWO STAGE FAMILIES. The hunt
// walker (OTA-1219, "Texas Ranger" / "run Chuck Norris") generalized to
// MYSTERIES (18) and STORYLINES (14): every one in the catalog is played end to
// end through the real store — accept (or the vendor-door record), each stage
// in order on its own verb, wrong verb refused, every dice modal walked, the
// completion line in the log. A new mystery or storyline is walked
// automatically the day it lands; an unhandled checkKind throws by name.
//
// Differences from hunts, on purpose:
//  • No location gate — the mystery/storyline matchers pay the verb anywhere
//    (their pins are turn-in hubs, not field sites).
//  • No kill loop — a mystery's final "boss" stage completes on INVESTIGATE
//    (the scene of the confrontation is read, not fought) and a storyline's on
//    DIPLOMACY. Nothing spawns; the walk is pure verbs.
//  • Whole-matcher !inCombat — every stage verb needs a clear scene.
//
// ⚠⚠ WHAT ITS FIRST RUN CAUGHT (the OTA-1219 wedge class, third member):
// acceptMystery's NEUTRAL branch (no vendor in scene — the door the three
// faction-neutral mysteries use) left the record at stage 0, a pure-narration
// stage no verb can match. The VENDOR branch has always bumped to stage 1;
// the neutral branch just never did. Fixed this OTA + backfill heal.
//
// ⚠⚠ HARNESS TRAPS: see the ota1219HuntWalker header — all five apply here
// verbatim (boot race, pendingRolls modal swallow, environmental photobomb,
// scene resets, parked-accept freeze). READ THEM before editing this file.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { firstActionableHuntStage } from '../app/engine/hunts';

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

const MYSTERY_VERB: Record<string, string> = {
  investigate: 'investigate the area',
  stealth: 'sneak',
  diplomacy: 'negotiate',
  cast: 'cast stone shaping',
  escape: 'flee',
  boss: 'investigate the area', // the mystery quirk: the confrontation is READ
};
const STORYLINE_VERB: Record<string, string> = {
  investigate: 'investigate the area',
  stealth: 'sneak',
  diplomacy: 'negotiate',
  cast: 'cast stone shaping',
  escape: 'flee',
  attack_provoke: 'attack',
  boss: 'negotiate', // the storyline quirk: the finale is TALKED through
};
function wrongVerbFor(kind: string, verbs: Record<string, string>): string {
  // Any phrase whose intent differs from the stage's paying intent.
  const paying = verbs[kind];
  return paying === 'sneak' ? 'investigate the area' : 'sneak';
}

interface StageDefLite { checkKind: string | null }
interface DefLite { id: string; title: string; factionId: string | null; stages: StageDefLite[] }

describe('OTA-1220 — Texas Ranger on mysteries and storylines: every one completes, in order, on its own verbs', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    let last = -1;
    await settle(() => {
      const n = store.getState().gameLog.length;
      const stable = n === last;
      last = n;
      return stable;
    }, 10000);
  });

  const walk = async (
    family: 'mystery' | 'storyline',
    def: DefLite,
    completionNeedle: string,
  ) => {
    const recField = family === 'mystery' ? 'activeMysteries' : 'activeStorylines';
    const stage = () => (store.getState().player as any)![recField]?.[0]?.stage ?? -1;
    const verbs = family === 'mystery' ? MYSTERY_VERB : STORYLINE_VERB;
    const start = firstActionableHuntStage(def);

    // Isolate: exactly one active contract, tracked, wherever the walker stands.
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        hp: 500, hpMax: 500, stamina: 50, staminaMax: 50,
        hubRoomId: null,
        activeHunts: [],
        activeMysteries: [],
        activeStorylines: [],
      } as typeof p,
    });
    clearScene();

    if (family === 'mystery' && def.factionId === null) {
      // The REAL neutral accept door — the one that shipped wedged at stage 0.
      store.getState().acceptMystery(def.id);
      const rec = store.getState().player!.activeMysteries?.[0];
      expect({ id: def.id, accepted: rec?.id, stage: rec?.stage })
        .toEqual({ id: def.id, accepted: def.id, stage: start });
      useGameStore.setState({
        player: { ...store.getState().player!, activeMysteries: [{ ...rec!, tracked: true }] } as any,
      });
    } else {
      // Faction-posted work gates on a live vendor; seed the exact record the
      // vendor door writes AFTER its stage bump (it advances past stage 0).
      useGameStore.setState({
        player: {
          ...store.getState().player!,
          [recField]: [{ id: def.id, stage: start, postedByFaction: def.factionId, acceptedAt: Date.now(), tracked: true }],
        } as any,
      });
    }

    // ⚠ ORDER, negative half: the wrong verb pays nothing at the first stage.
    clearScene();
    const firstKind = def.stages[start]!.checkKind!;
    await store.getState().submitPlayerAction(wrongVerbFor(firstKind, verbs));
    await new Promise((r) => setTimeout(r, 250));
    drainRolls();
    expect({ id: def.id, after: 'wrong verb', stage: stage() })
      .toEqual({ id: def.id, after: 'wrong verb', stage: start });

    // The walk: each stage on its own verb, in order. Trailing null epilogues
    // are consumed by the OTA-871 loop inside the advance — the walker only
    // ever stands on verb stages.
    let guard = 0;
    while (stage() < def.stages.length) {
      if (guard++ > def.stages.length + 4) throw new Error(`${def.id}: walk did not converge (stuck at stage ${stage()})`);
      const s = stage();
      const kind = def.stages[s]!.checkKind;
      if (kind === null) throw new Error(`${def.id}: walker landed ON a null stage (${s}) — the auto-consume failed`);
      const verb = verbs[kind];
      if (!verb) throw new Error(`${def.id}: stage ${s} has unhandled checkKind '${kind}' — extend the verb map + the matcher`);
      clearScene();
      await store.getState().submitPlayerAction(verb);
      drainRolls();
      await settle(() => stage() > s);
      drainRolls();
      expect({ id: def.id, at: s, kind, advanced: stage() > s })
        .toEqual({ id: def.id, at: s, kind, advanced: true });
    }

    expect({ id: def.id, done: stage() }).toEqual({ id: def.id, done: def.stages.length });
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toContain(completionNeedle);
  };

  for (const def of MYSTERIES) {
    it(`⚠⚠ mystery ${def.id} — ${def.stages.length} stages → trophy recovered`, async () => {
      await walk('mystery', def as unknown as DefLite, `${def.trophyName} recovered. Return to a posting agent`);
    });
  }

  for (const def of STORYLINES) {
    it(`⚠⚠ storyline ${def.id} — ${def.stages.length} stages → complete in the field`, async () => {
      await walk('storyline', def as unknown as DefLite, `Storyline complete in the field — ${def.title}.`);
    });
  }
});
