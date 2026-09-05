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

// ⚠⚠⚠ OTA-1596 — THE MARK CATCHES UP AT THE DOOR.
//
// FROM THE OWNER'S 22:12 SESSION (bundle mthspfn82jjo), the hunt he has
// re-tested across six OTAs:
//
//   missions: hunt:hunt_servants_doubter stage 1/5 [boss→attack]
//             @great_tartary_plains HERE
//             needs=Servants' Mark of Sanction✗MISSING spawn=Tartarian Raider×3
//   [player] My mission says I'm here ... and nothing spawned here to combat
//
// His record sits past stage 0 without stage 0's grant — the exact state P19's
// self-heal was built for. But the heal fires only inside the ATTACK-verb
// matcher, and a spawn stage with nothing spawned offers no attack affordance.
// The heal sat forty lines from the player with no road between them. All
// NINETEEN hunt spawn stages are requires-gated the same way.
//
// The fix meets the player at arrival: the debt is settled before the receipt
// prints, and a hunt spawn stage arms — through advanceHunt, the one writer —
// the moment the player stands on it, paid up.

import { useGameStore, grantStageItems } from '../app/state/gameStore';
import { healStageDebtsAtArrival, armSpawnStagesAtArrival } from '../app/state/stageArrival';
import { getRaces, getFactions } from '../app/engine/character';
import { HUNTS } from '../app/engine/hunts';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const set = (fn: (s: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>) => store.setState(fn as never);

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

function packNames(): string[] {
  return (get().player?.inventory ?? []).map((i) => i.name);
}

/** His exact save-state: the Doubter parked at stage 1, mark never granted. */
function seedDoubterAtStageOne() {
  const p = get().player!;
  store.setState({
    player: {
      ...p,
      ...placedAt('great_tartary_plains'),
      hubRoomId: null,
      inventory: p.inventory.filter((i) => i.name !== "Servants' Mark of Sanction"),
      activeHunts: [{ id: 'hunt_servants_doubter', stage: 1, tracked: true } as never],
    },
  });
}

describe('OTA-1596 — his exact save, healed and armed at the door', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Doubter', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ THE HEAL — standing on the stage ground back-grants what stage 0 owed', () => {
    seedDoubterAtStageOne();
    expect(packNames()).not.toContain("Servants' Mark of Sanction");
    healStageDebtsAtArrival(get, set as never, grantStageItems as never);
    expect(packNames()).toContain("Servants' Mark of Sanction");
    const lines = get().gameLog.slice(-8).map((e) => e.text).join('\n');
    expect(lines).toContain("hands over what they owed you");
  });

  it('⚠⚠⚠ THE ARM — the three raiders stand up on arrival, and the stage freezes for the kill', () => {
    // The heal above left the mark in the pack; clear the ground and arm.
    set((s) => (s.currentScene ? {
      currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null },
    } : s));
    armSpawnStagesAtArrival(get, set as never);
    const scene = get().currentScene!;
    const raiders = scene.enemies.filter((e) => e.name.includes('Tartarian Raider'));
    expect(raiders.length).toBe(3);
    // Frozen for the kill (OTA-1578): the record does not move until the pack
    // is down — the escort clear owns the advance.
    const rec = (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter');
    expect(rec?.stage).toBe(1);
    // And the stage's own narration printed — the "three of his sworn ...
    // standing up out of positions" beat finally happens where it says it does.
    const lines = get().gameLog.slice(-12).map((e) => e.text).join('\n');
    expect(lines).toContain('three of his sworn');
  });

  it('⚠⚠ a live hostile on the tile keeps the door — no pile-on', () => {
    seedDoubterAtStageOne();
    healStageDebtsAtArrival(get, set as never, grantStageItems as never);
    // Something ambient is already mid-fight on the tile.
    set((s) => (s.currentScene ? {
      currentScene: {
        ...s.currentScene,
        enemies: [{ name: 'Mud Boar', hp: 20, attack: 7, damage: '2D6', rarity: 'Common' } as never],
        enemyHps: [20], activeEnemyIdx: 0, range: 'close',
      },
    } : s));
    const before = get().currentScene!.enemies.length;
    armSpawnStagesAtArrival(get, set as never);
    expect(get().currentScene!.enemies.length).toBe(before);
  });

  it('⚠ and never under a roof — a hubRoomId parks the arm entirely', () => {
    seedDoubterAtStageOne();
    set((s) => (s.player ? { player: { ...s.player, hubRoomId: 'outpost_gate' } } : s));
    set((s) => (s.currentScene ? {
      currentScene: { ...s.currentScene, enemies: [], enemyHps: [], range: null },
    } : s));
    armSpawnStagesAtArrival(get, set as never);
    expect(get().currentScene!.enemies.length).toBe(0);
    set((s) => (s.player ? { player: { ...s.player, hubRoomId: null } } : s));
  });
});

describe('OTA-1596 — beginScene wires both halves', () => {
  const SRC = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

  it('⚠⚠ the heal runs BEFORE the arrival receipt prints', () => {
    // (OTA-1597 moved the wiring to a static import — same call, no require dot.)
    const heal = SRC.indexOf('healStageDebtsAtArrival(get, set, grantStageItems)');
    const receipt = SRC.indexOf('for (const l of missionArrivalLines(get().player, get().worldMemory))');
    expect(heal).toBeGreaterThan(-1);
    expect(receipt).toBeGreaterThan(heal);
  });

  it('⚠⚠ the arm runs AFTER the scene commits, and not on load', () => {
    const commit = SRC.indexOf('set({ currentScene: scene, pendingRolls: null');
    const arm = SRC.indexOf('armSpawnStagesAtArrival(get, set)'); // OTA-1597: static import
    expect(commit).toBeGreaterThan(-1);
    expect(arm).toBeGreaterThan(commit);
    // Not on load: a save opens where it closed; it does not re-arrive.
    const around = SRC.slice(arm - 400, arm);
    expect(around).toContain('if (!opts?.isOpening)');
  });
});

describe('OTA-1596 — the class, pinned in the data', () => {
  it('⚠⚠ every hunt stage that REQUIRES an item has an EARLIER stage that GRANTS it', () => {
    // This is the invariant that makes the heal always able to pay: a required
    // item with no earlier grantor is a debt no machinery can settle, and the
    // stage carrying it is his wedge waiting for a save to age into it.
    //
    // ⚠⚠ ALL THREE STAGED FAMILIES, because the owner asked the right question
    // ("did you run that same regression across all the missions?") and the
    // honest answer was: the heal covers all three, the sweep covered one.
    // Now it covers what the heal covers — 18 hunts, 18 mysteries, 14
    // storylines, every stage. (Faction quests carry no grants/requires stage
    // machinery; their class audit is ota1594's trigger-vs-objective sweep.)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MYSTERIES } = require('../app/engine/mysteries') as typeof import('../app/engine/mysteries');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { STORYLINES } = require('../app/engine/factionStorylines') as typeof import('../app/engine/factionStorylines');
    const catalogues: Array<[string, ReadonlyArray<{ id: string; stages?: readonly unknown[] }>]> = [
      ['hunt', HUNTS as never], ['mystery', MYSTERIES as never], ['storyline', STORYLINES as never],
    ];
    let requiresChecked = 0;
    for (const [family, defs] of catalogues) {
      for (const h of defs) {
        const stages = (h.stages ?? []) as Array<{ requires?: { item: string }; grants?: { item: string } }>;
        stages.forEach((st, i) => {
          const req = st.requires;
          if (!req) return;
          requiresChecked += 1;
          const grantedEarlier = stages.slice(0, i).some((e) => e.grants?.item === req.item);
          expect(`${family}:${h.id}#${i}:${req.item}:${grantedEarlier}`).toBe(`${family}:${h.id}#${i}:${req.item}:true`);
        });
      }
    }
    // The sweep must actually be sweeping — a refactor that empties a catalogue
    // import would pass vacuously without this floor.
    expect(requiresChecked).toBeGreaterThanOrEqual(25);
  });

  it('⚠ the surface the arm covers: every hunt spawn stage is requires-gated', () => {
    // The measured fact that makes this a class and not a one-off: one skipped
    // grant turns ANY of these tiles into his 22:12 session.
    const spawnStages = HUNTS.flatMap((h) => (h.stages ?? []).filter(
      (st) => !!(st as { spawn?: unknown }).spawn,
    ));
    expect(spawnStages.length).toBeGreaterThanOrEqual(19);
    for (const st of spawnStages) {
      expect((st as { requires?: unknown }).requires).toBeTruthy();
    }
  });

  it('⚠⚠ AGED-SAVE LEDGER — a mission item name, once shipped, is never renamed away', () => {
    // The aged-record audit's sweep 4, made permanent. Measured across the
    // FULL git history of all three quest files before this baseline was cut:
    // zero renames ever — so today's names ARE the complete historic set. A
    // rename that keeps grants/requires consistent passes every other sweep
    // while orphaning the item sitting in an old save's pack; this ledger is
    // APPEND-ONLY, so that edit fails here and has to ship a migration instead.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const baseline = require('./fixtures/missionItemNames.json') as string[];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MYSTERIES } = require('../app/engine/mysteries') as typeof import('../app/engine/mysteries');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { STORYLINES } = require('../app/engine/factionStorylines') as typeof import('../app/engine/factionStorylines');
    const current = new Set<string>();
    for (const defs of [HUNTS, MYSTERIES, STORYLINES] as ReadonlyArray<ReadonlyArray<{ stages?: readonly unknown[] }>>) {
      for (const d of defs) {
        for (const st of (d.stages ?? []) as Array<{ grants?: { item: string }; requires?: { item: string } }>) {
          if (st.grants?.item) current.add(st.grants.item);
          if (st.requires?.item) current.add(st.requires.item);
        }
      }
    }
    expect(baseline.length).toBeGreaterThanOrEqual(125);
    const orphaned = baseline.filter((n) => !current.has(n));
    expect(orphaned).toEqual([]);
  });

  it('⚠ every stage ground across all three families resolves to a real location', () => {
    // Sweep 3 of the same audit: a record aged onto a stage whose locationName
    // stopped resolving would be routed to an anchor it never asked for.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MYSTERIES } = require('../app/engine/mysteries') as typeof import('../app/engine/mysteries');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { STORYLINES } = require('../app/engine/factionStorylines') as typeof import('../app/engine/factionStorylines');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QS = require('../app/engine/questStage') as typeof import('../app/engine/questStage');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CM = require('../app/engine/contractMarkers') as typeof import('../app/engine/contractMarkers');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLocationById } = require('../app/engine/encounter') as typeof import('../app/engine/encounter');
    const bad: string[] = [];
    const check = (family: string, defs: ReadonlyArray<never>, anchorOf: (d: never) => string) => {
      for (const d of defs as ReadonlyArray<{ id: string; stages?: readonly unknown[] }>) {
        (d.stages ?? []).forEach((st, i) => {
          const ground = QS.stageLocationId(st as never, anchorOf(d as never), CM.resolvePosterLocation);
          try {
            if (!getLocationById(ground)?.name) bad.push(`${family}:${d.id}#${i} → ${ground}`);
          } catch {
            bad.push(`${family}:${d.id}#${i} → ${ground}`);
          }
        });
      }
    };
    check('hunt', HUNTS as never, ((d: never) => CM.huntAnchorId(d)) as never);
    check('mystery', MYSTERIES as never, ((d: never) => CM.contractAnchorId(d)) as never);
    check('storyline', STORYLINES as never, ((d: never) => CM.contractAnchorId(d)) as never);
    expect(bad).toEqual([]);
  });
});
