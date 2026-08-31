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

// ⚠⚠⚠ OTA-1590 — THE WHOLE GAMUT. Owner: *"test a whole different hunt and see
// if you have run the whole gamut of the hunts before I even move on."*
//
// ⚠⚠ WHAT THE 1219 WALKER PROVES, AND THE TWO DOORS IT NEVER OPENS. That walker
// plays every hunt on TYPED VERBS and stops at "turn-in ready". The owner does
// not play that way any more: since OTA-1581 every person-stage fronts a MODAL
// CONVERSATION CARD — on the device you cannot type past it — and since
// OTA-1589 a finished hunt routes to a pay window where the trophy changes
// hands. Neither the card door nor the turn-in leg had a walker. Those are
// precisely the two newest pieces of the mission structure, and "the tests are
// green but the phone is broken" has ALWAYS meant the tests exercise a
// different door than the player walks through (OTA-1589's whole finding).
//
// So this walker plays every hunt the way HE does:
//   accept (real door for neutral hunts) → every stage on its OWN ground →
//   PERSON stages answered through the CARD (armedEncounter → PROCEED →
//   advance → the card disarms) → spawns cleared, apex killed →
//   the OTA-1589 pin comes home → walk to the pay window → seed an agent →
//   turnInHunt → the record leaves the slate and the TC actually lands.
//
// ⚠ Harness traps inherited from 1219 (each cost a debug round there): the boot
// race, the modal swallow (drain rolls after every submit), the environmental
// photobomb (settle on the EXACT name), scene resets before verbs, forced
// tracked:true after accept, and the grid-cell stamp on relocation.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { HUNTS, firstActionableHuntStage } from '../app/engine/hunts';
import type { HuntDef } from '../app/engine/hunts';
import { huntStageAnchorId, openContractMarkers } from '../app/engine/contractMarkers';
import { isHubLocation } from '../app/engine/hub';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { choicesFor, freshEncounter } from '../app/engine/missionEncounter';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

function moveTo(locationId: string) {
  useGameStore.setState({
    player: {
      ...store.getState().player!,
      currentLocationId: locationId, travelTarget: undefined, hubRoomId: null,
      gridX: undefined, gridY: undefined, mapX: undefined, mapY: undefined,
    },
  });
}

const VERB_FOR: Record<string, string> = {
  investigate: 'investigate the area',
  stealth: 'sneak',
  diplomacy: 'negotiate',
  cast: 'cast stone shaping',
  attack_provoke: 'attack',
  boss: 'attack',
  escape: 'flee',
};

describe('OTA-1590 — every hunt, played the way the owner plays it', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Gamut', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
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

  const walk = async (def: HuntDef) => {
    const stage = () => store.getState().player!.activeHunts?.[0]?.stage ?? -1;
    const start = firstActionableHuntStage(def);
    let lastBoss = -1;
    for (let i = 0; i < def.stages.length; i++) {
      if (def.stages[i]!.checkKind === 'boss') lastBoss = i;
    }

    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        currentLocationId: huntStageAnchorId(def, start),
        gridX: undefined, gridY: undefined, mapX: undefined, mapY: undefined,
        hubRoomId: null,
        hp: 500, hpMax: 500, stamina: 50, staminaMax: 50,
        stats: { ...p.stats, strength: 20, dexterity: 20 },
        activeHunts: [],
        missionEncounters: {},
        tc: 0,
      },
    });
    clearScene();

    if (def.factionId === null) {
      store.getState().acceptHunt(def.id);
      const rec = store.getState().player!.activeHunts?.[0];
      expect({ hunt: def.id, accepted: rec?.id, stage: rec?.stage })
        .toEqual({ hunt: def.id, accepted: def.id, stage: start });
      useGameStore.setState({
        player: { ...store.getState().player!, activeHunts: [{ ...rec!, tracked: true }] },
      });
    } else {
      useGameStore.setState({
        player: {
          ...store.getState().player!,
          activeHunts: [{ id: def.id, stage: start, postedByFaction: def.factionId, acceptedAt: Date.now(), tracked: true }],
        },
      });
    }

    let guard = 0;
    while (stage() < def.stages.length) {
      if (guard++ > def.stages.length + 6) throw new Error(`${def.id}: gamut did not converge (stuck at stage ${stage()})`);
      const s = stage();
      const stageDef = def.stages[s]!;
      const kind = stageDef.checkKind;
      if (kind === null) throw new Error(`${def.id}: landed ON a null stage (${s})`);

      // Stand on the stage's own ground, moving only where the game routed us.
      const want = huntStageAnchorId(def, s);
      if (store.getState().player!.currentLocationId !== want) {
        const course = store.getState().player!.travelTarget?.locationId;
        expect({ hunt: def.id, stage: s, routedTo: course, needs: want })
          .toEqual({ hunt: def.id, stage: s, routedTo: want, needs: want });
        moveTo(want);
      }
      clearScene();

      // ⚠⚠⚠ THE CARD DOOR — the one the 1219 walker never opens. On device this
      // modal fills the screen on every person-stage; if it fails to arm, fails
      // to offer a way forward, or PROCEED fails to advance, the player is not
      // inconvenienced — they are STOPPED. So a person-stage here is answered
      // exactly as a thumb answers it, never typed past.
      if (stageDef.npcName && !stageDef.spawn && !(kind === 'boss' && s === lastBoss)) {
        const armed = armedEncounter(store.getState().player!);
        expect({ hunt: def.id, stage: s, armedKey: armed?.key })
          .toEqual({ hunt: def.id, stage: s, armedKey: `hunt:${def.id}:${s}` });
        const enc = store.getState().player!.missionEncounters?.[armed!.key] ?? freshEncounter(armed!.key);
        const offered = choicesFor(enc, {
          hasFight: armed!.hasFight, canPersuade: armed!.canPersuade, canKill: armed!.person.canKill,
        });
        // A card with no way forward is a locked screen, which is worse than any
        // single broken stage. `owed` names what the pack is missing.
        expect({ hunt: def.id, stage: s, offered, owed: armed!.owed, forward: offered.includes('proceed') })
          .toEqual({ hunt: def.id, stage: s, offered, owed: null, forward: true });
        store.getState().answerMissionEncounter('proceed');
        await settle(() => stage() > s);
        drainRolls();
        expect({ hunt: def.id, stage: s, via: 'card', advanced: stage() > s })
          .toEqual({ hunt: def.id, stage: s, via: 'card', advanced: true });
        // And the modal must actually STAND DOWN — a card still armed on the
        // same key after PROCEED is a screen the player can never leave.
        const still = armedEncounter(store.getState().player!);
        expect({ hunt: def.id, stage: s, rearmedSameBeat: still?.key === armed!.key })
          .toEqual({ hunt: def.id, stage: s, rearmedSameBeat: false });
        continue;
      }

      // Everything else: the typed-verb door 1219 already guards, kept here so
      // the same run that opens the card also clears spawns and kills the apex.
      const verb = VERB_FOR[kind];
      if (!verb) throw new Error(`${def.id}: stage ${s} has unhandled checkKind '${kind}'`);
      await store.getState().submitPlayerAction(verb);
      drainRolls();

      const escortSpawn = stageDef.spawn;
      if (escortSpawn) {
        const wantName = escortSpawn.enemyName;
        await settle(() => (store.getState().currentScene?.enemies ?? []).some((e) => e.name === wantName));
        expect(stage()).toBe(s); // frozen until cleared
        for (let k = (escortSpawn.count ?? 1); k > 0; k--) {
          const live = store.getState().currentScene!;
          const alive = live.enemies.filter((e, i) => e.name === wantName && (live.enemyHps[i] ?? 0) > 0);
          useGameStore.setState({
            currentScene: {
              ...live,
              enemies: alive, enemyHps: alive.map(() => 1), activeEnemyIdx: 0, range: 'close',
              enemyAmbushUsed: alive.map(() => false), enemyKnockedOut: alive.map(() => false),
              enemyStatuses: alive.map(() => []), enemyArmorShred: alive.map(() => 0),
              enemyCorruptionStacks: alive.map(() => 0),
            },
          });
          for (let round = 0; round < 6 && stage() === s
            && (store.getState().currentScene?.enemies.length ?? 0) >= k; round++) {
            await store.getState().submitPlayerAction('attack');
            drainRolls();
            await new Promise((r) => setTimeout(r, 150));
            drainRolls();
          }
        }
        await settle(() => stage() > s);
      } else if (kind === 'boss' && s === lastBoss) {
        const hunted = `${def.targetEnemyName} (hunted)`;
        await settle(() => (store.getState().currentScene?.enemies ?? []).some((e) => e.name === hunted));
        const enemies = store.getState().currentScene!.enemies;
        const apex = enemies.find((e) => e.name === hunted)!;
        expect({ hunt: def.id, apexSpawned: !!apex }).toEqual({ hunt: def.id, apexSpawned: true });
        expect(stage()).toBe(s);
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
        if (stage() <= s) { // photobomb retry, as in 1219
          clearScene();
          await store.getState().submitPlayerAction(verb);
          drainRolls();
          await settle(() => stage() > s);
          drainRolls();
        }
        expect({ hunt: def.id, at: s, kind, advanced: stage() > s })
          .toEqual({ hunt: def.id, at: s, kind, advanced: true });
      }
    }
    expect({ hunt: def.id, done: stage() }).toEqual({ hunt: def.id, done: def.stages.length });

    // ⚠⚠⚠ THE TURN-IN LEG — the other door no walker ever walked, and the one
    // OTA-1589 exists for. The finished record's pin must come HOME (a hub, not
    // the field), and handing the trophy to an agent there must pay and clear
    // the slate. Stopping at "turn-in ready" is how a broken hand-in stays
    // green for five OTAs.
    const pin = openContractMarkers(store.getState().player!).find((m) => m.key === `hunt:${def.id}`)!;
    expect({ hunt: def.id, ready: pin.ready, atHub: isHubLocation(pin.anchorId) })
      .toEqual({ hunt: def.id, ready: true, atHub: true });
    moveTo(pin.anchorId);
    const agent = { id: 'v_gamut_agent', name: 'Gamut Agent', title: 'agent', faction: def.factionId, offers: [] };
    useGameStore.setState({
      currentScene: { ...store.getState().currentScene!, enemies: [], hooks: [], vendor: agent as never },
    });
    const tcBefore = store.getState().player!.tc ?? 0;
    store.getState().turnInHunt(def.id);
    await settle(() => !(store.getState().player!.activeHunts ?? []).some((h) => h.id === def.id));
    const tcAfter = store.getState().player!.tc ?? 0;
    expect({ hunt: def.id, offSlate: !(store.getState().player!.activeHunts ?? []).some((h) => h.id === def.id), paid: tcAfter > tcBefore })
      .toEqual({ hunt: def.id, offSlate: true, paid: true });
  };

  for (const def of HUNTS) {
    it(`⚠⚠⚠ ${def.id} — accept → card → stages → apex → pin home → PAID`, async () => {
      await walk(def);
    });
  }
});

describe('OTA-1590 — the card sweep: every person-stage in every family offers a way forward', () => {
  it('⚠⚠ all 114 person-stages: a satisfied pack always gets PROCEED (or a fight it can win)', () => {
    // Pure-selector sweep — no store. The invariant the modal makes load-bearing:
    // whenever the card arms with the stage's requirement satisfiable, at least
    // one non-flee choice exists. A card whose only button is WALK AWAY is a
    // mission that can only be abandoned.
    const bad: string[] = [];
    const families = [
      ...HUNTS.map((d) => ({ fam: 'hunt', d })),
      ...MYSTERIES.map((d) => ({ fam: 'mystery', d })),
      ...STORYLINES.map((d) => ({ fam: 'storyline', d })),
    ];
    for (const { fam, d } of families) {
      (d.stages as Array<{ npcName?: string; spawn?: unknown; checkKind?: string | null }>).forEach((s, i) => {
        if (!s.npcName || s.checkKind === null) return;
        const offered = choicesFor(freshEncounter(`${fam}:${d.id}:${i}`), {
          hasFight: !!s.spawn, canPersuade: true, canKill: true,
        });
        const forward = offered.some((c) => c !== 'flee');
        if (!forward) bad.push(`${fam}:${d.id}#${i}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('⚠⚠⚠ THE FIGHT BUTTON REACHES ALL THREE FAMILIES NOW — the latent wedge is closed', () => {
    // `start_fight` dispatched to advanceHunt with NO ELSE while `complete_stage`
    // right below it handled all three families. Latent (zero person-stages
    // carry a spawn today — measured in this same sweep), but OTA-1583 built the
    // spawn machinery all three families share, and the first author to put
    // bodies behind a person would have armed a modal whose FIGHT button did
    // nothing: encounter parked in `fighting`, nothing spawned, no way forward.
    const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    // ⚠ Anchored on the hunt dispatch line itself — the first draft sliced
    // between the two `step.effect.kind` literals and got an empty window,
    // because the type declarations carry the same strings higher in the file.
    const i = STORE.indexOf("if (armed.family === 'hunt') get().advanceHunt(armed.missionId);");
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i, i + 400);
    expect(block).toContain("else if (armed.family === 'mystery') get().advanceMystery(armed.missionId);");
    expect(block).toContain('else get().advanceStoryline(armed.missionId);');
  });
});
