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
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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

// ⚠⚠⚠ PACKAGE A — THE NINE SENTENCES THAT NAME BODIES.
//
// The story-arc immersion audit ran a structural census, then traced the actual
// runtime handlers, and threw away two thirds of what the census had flagged.
// The delivery machinery works: a hunt `boss` stage stands up the hunt's own
// target through `scaleHuntBoss`, and `spawnStageEscort` is wired into all
// three families' advance handlers. What survived the trace was ONE class with
// NINE instances:
//
//   A stage whose prose names discrete bodies and instructs the player to deal
//   with them, and which carries no `spawn`. `override = stageDef.spawn` is
//   undefined, `spawnStageEscort` returns false at its first line, and
//   `checkKind !== 'boss'` keeps the boss branch shut. The player types the
//   verb the arrival line gave them, reads a description of a fight, takes the
//   item and walks on. `currentScene.enemies` is never touched.
//
// Seven of the nine sit in the SAME template slot — `standard_7`'s `catalyst`
// and `bait_switch_5`'s `gauntlet` — that three sibling hunts (bog_dragon #5,
// iron_titan #5, mud_siren_queen #3) fill correctly with a spawn. That is what
// makes this an unfinished content pass rather than a design position, and why
// the repair is data.
//
// ⚠⚠⚠ EIGHT OF THE NINE ARE REPAIRED HERE. The ninth —
// `hunt_salamander_voronov` #3 — was written, measured and then reverted,
// because placing its bodies breaks a ratchet this repository already keeps
// (OTA-1601: a fight-ground may not be its predecessor's tile, and stages 2
// and 3 of that arc are both authored at Voronov). It is recorded in BLOCKED
// below with an assertion of its own, so the finding survives and a future
// ground change has to come back through this file.
//
// ⚠⚠ WHAT THIS SUITE IS NOT. It is not a prose parser. Nothing here tries to
// decide from English whether a sentence promises a fight — that classifier
// cannot be written reliably and would either miss a real beat or outlaw the
// legitimate abstractions the audit UPHELD (weather, an environment, a
// construct's barrage, a non-lethal ceremonial duel, a cast/engineering beat,
// the Karok-Sa judgment, a mystery's confirm-what-you-have close). The contract
// is a CURATED MANIFEST whose rows carry the exact promise clause, so the gate
// binds four things together — promise ↔ authored spawn ↔ catalogue identity ↔
// paying verb — and its scope is exactly those rows. Everything outside the
// manifest is free to have no spawn, which is the whole point.

import { useGameStore } from '../app/state/gameStore';
import { resolveStageEscortClear } from '../app/state/slices/questSlice';
import { getRaces, getFactions } from '../app/engine/character';
import { payingIntent, type MissionFamily } from '../app/engine/questStage';
import { placedAt } from '../test-utils/placePlayer';
import huntsData from '../app/data/quests/hunts.json';
import mysteriesData from '../app/data/quests/mysteries.json';
import storyData from '../app/data/quests/faction-storylines.json';
import enemiesData from '../app/data/enemies/enemies.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(180000);

interface Stage {
  narration: string;
  checkKind?: string | null;
  stageType?: string;
  requires?: { item: string; quantity?: number };
  grants?: { item: string; quantity?: number };
  locationName?: string;
  spawn?: { enemyName: string; count?: number; ambush?: boolean };
}
interface Mission { id: string; title: string; targetEnemyName?: string; stages?: Stage[] }

const rows = <T,>(mod: unknown): T[] => {
  const v = mod as Record<string, unknown>;
  return (Array.isArray(v) ? v : Object.values(v).find(Array.isArray)) as T[];
};
const HUNTS = rows<Mission>(huntsData);
const MYSTERIES = rows<Mission>(mysteriesData);
const STORIES = rows<Mission>(storyData);
const ENEMY_NAMES = new Set(rows<{ name: string }>(enemiesData).map((e) => e.name));

const byFamily: Record<MissionFamily, Mission[]> = { hunt: HUNTS, mystery: MYSTERIES, storyline: STORIES };
const arc = (family: MissionFamily, id: string): Mission => {
  const m = byFamily[family].find((x) => x.id === id);
  if (!m) throw new Error(`no such arc: ${family}/${id}`);
  return m;
};
const stageAt = (family: MissionFamily, id: string, i: number): Stage => {
  const s = arc(family, id).stages?.[i];
  if (!s) throw new Error(`no such stage: ${family}/${id}#${i}`);
  return s;
};
const lastBossIndex = (m: Mission): number => {
  let last = -1;
  (m.stages ?? []).forEach((s, i) => { if (s.checkKind === 'boss') last = i; });
  return last;
};

/* ⚠⚠⚠ THE MANIFEST IS THE CONTRACT, and every column of it is load-bearing.
 *
 * `promise` is the exact clause from the stage's own narration that names
 * bodies and puts the player in front of them. It is quoted here so the gate
 * can bind the sentence to the spawn: rewrite the promise away and the row
 * stops matching, which is a prompt to re-classify the beat rather than a
 * licence to drop the encounter quietly. `why` records how the identity was
 * chosen, in the audit's own order of evidence (creature named by the prose,
 * then the arc's own use, then the implied brood/sworn/drones, then the
 * catalogue, then the sibling template slot).
 *
 * ⚠⚠ THE COUNTS ARE THE PROSE'S WHERE THE PROSE GIVES ONE ("Two more"), and
 * the slot's established precedent (3) where it does not. Nothing here is
 * inflated to make a beat harder. */
interface Row {
  family: MissionFamily;
  id: string;
  stage: number;
  promise: string;
  enemyName: string;
  count: number;
  ambush: boolean;
  why: string;
}

const MANIFEST: readonly Row[] = [
  {
    family: 'hunt', id: 'hunt_servants_doubter', stage: 3,
    promise: 'Two more Tartarian Raiders strike from cover at the half-mile mark',
    enemyName: 'Tartarian Raider', count: 2, ambush: true,
    why: 'Named by the prose, and the same body this arc already stands up at #1. The count is stated: "Two more".',
  },
  {
    family: 'hunt', id: 'hunt_mud_siren_drakova', stage: 5,
    promise: 'three Drowned Aetherkin coming up under the hull',
    enemyName: 'Drowned Aetherkin', count: 3, ambush: true,
    why: '"the ones it has already taken" is the catalogue\'s Drowned Aetherkin by its own flavour; hunt_sludge_behemoth #3 already uses this body for the same phrase class.',
  },
  {
    family: 'hunt', id: 'hunt_mud_harpy_cradle', stage: 5,
    promise: 'three Mud Harpies of the brood, half-grown and screaming',
    enemyName: 'Mud Harpy', count: 3, ambush: true,
    why: 'The brood of a Mud Harpy is Mud Harpies. Same-species-under-its-own-apex is the mud_siren_queen pattern; the apex is scaleHuntBoss\'s, the brood is scaleHuntEscort\'s.',
  },
  {
    family: 'hunt', id: 'hunt_plague_moth_enclave', stage: 3,
    promise: 'three lesser Plague Moths throwing themselves into your torch',
    enemyName: 'Plague Moth', count: 3, ambush: true,
    why: 'Her drones are moths; the catalogue\'s Plague Moth flavour is literally "the swarm follows the dying", and the prose says "swarm".',
  },
  {
    family: 'hunt', id: 'hunt_mud_hound_alpha_yuldra', stage: 3,
    promise: 'three Bog Hounds pouring in expecting easy meat',
    enemyName: 'Bog Hound', count: 3, ambush: false,
    why: 'The pack an Alpha leads. Bog Hound "hunts in coordinated packs" by its own flavour. No ambush: the player turns the trap and walks the canyon on their own terms.',
  },
  {
    family: 'hunt', id: 'hunt_apparition_red_tower', stage: 5,
    promise: 'three Aetheric Ghosts wearing the dead scholars\' faces',
    enemyName: 'Aetheric Ghost', count: 3, ambush: true,
    why: 'Spirits of named dead. Aetheric Ghost is the catalogue\'s ghost-of-a-person, and it is a different body from the Shifting Shade this arc already uses at #3.',
  },
  {
    family: 'storyline', id: 'story_reclaimer_highest_bidder', stage: 4,
    promise: 'three Black Cloak Agents, Order and Dynasty pay both',
    enemyName: 'Black Cloak Agent', count: 3, ambush: false,
    why: 'THE ABSTRACTION IS DELIBERATE AND IS WRITTEN INTO THE PROSE. `spawn` carries ONE enemyName and one count, so the schema cannot express Order-vs-Dynasty-vs-player; the engine has no three-way combat and Package A does not build one. Black Cloak Agent is the roster\'s Rare human blade-for-hire ("order agent", "enforcer", "assassin" are its own aliases), so one hostile group of paid blades in two liveries is the smallest truthful thing that puts the promised opposition on the floor.',
  },
  {
    family: 'storyline', id: 'story_monarch_silence', stage: 6,
    promise: 'a Black Cloak Agent gone rogue',
    enemyName: 'Black Cloak Agent', count: 1, ambush: false,
    why: 'One man, named by the arc as Kincaid\'s own former assistant — an agent of an operation that deals in quiet removals. No ambush: "He expects you."',
  },
];

/* ⚠⚠⚠ THE NINTH — PROVEN, AND DELIBERATELY NOT REPAIRED HERE.
 *
 * `hunt_salamander_voronov` #3 is the same class as the eight above: its prose
 * names lesser fire-things lunging from every vent and the player burns through
 * them, and it carries no spawn. Placing them was written, measured, and then
 * REVERTED, because it fails a ratchet this repository already keeps:
 *
 *   OTA-1601 — "no hunt fight-stage stands on its predecessor's tile, ever
 *   again". That rule counts a stage as a fight-ground when it is a `boss` OR
 *   carries a `spawn`. Stage 2 (investigation) and stage 3 (gauntlet) are BOTH
 *   authored at Voronov, so giving #3 a spawn puts a fight on the tile the
 *   player is already standing on, and the beat stops being somewhere you go.
 *
 * ⚠⚠ THE RATCHET IS RIGHT AND THE CONTENT IS WHAT IS OFF. The repair is not a
 * spawn — it is a ground for the junction, or a re-homing of the apex, and
 * either is a world-design decision rather than the missing-encounter repair
 * this package was scoped to. Recorded here so the finding cannot be lost, and
 * asserted so that a future ground change has to come back through this file. */
const BLOCKED = {
  family: 'hunt' as MissionFamily, id: 'hunt_salamander_voronov', stage: 3,
  reason: 'OTA-1601 ratchet: its predecessor #2 stands on the same tile (Voronov)',
};

/* ⚠ THE OTHER SIDE OF THE CONTRACT. These beats were examined by the same audit
 * and UPHELD as intentional narrative abstraction. They must keep passing with
 * no spawn, or the gate has started outlawing good writing. */
const ABSTRACTIONS: ReadonlyArray<{ family: MissionFamily; id: string; stage: number; kind: string }> = [
  { family: 'hunt', id: 'hunt_shade_endless_stair', stage: 5, kind: 'an environment — the Stair folding light, false landings' },
  { family: 'hunt', id: 'hunt_dust_fiend_plains', stage: 5, kind: 'weather — the plain\'s grit thrown at you at once' },
  { family: 'hunt', id: 'hunt_mud_golem_thametan', stage: 5, kind: 'the hunt\'s own target throwing the building; it is fought properly at the apex' },
  { family: 'hunt', id: 'hunt_mud_titan', stage: 5, kind: 'a cast/engineering beat — "Wire it. Set it. Don\'t drop it."' },
  { family: 'storyline', id: 'story_tartarian_ascension', stage: 6, kind: 'a non-lethal ceremonial duel; a spawn here would make it lethal' },
  { family: 'storyline', id: 'story_truetart_descent_karoksa', stage: 5, kind: 'the Karok-Sa judgment — the epilogue resolves it, a fight would contradict it' },
  { family: 'mystery', id: 'mystery_red_tower', stage: 3, kind: 'a mystery\'s confirm-what-you-have close' },
];

// ───────────────────────────────────────────────────────────── §A the contract

describe('Package A §A — the manifest binds promise, spawn, identity and verb', () => {
  it('⚠⚠⚠ the manifest is the eight repaired, and nothing has silently left it', () => {
    expect(MANIFEST.length).toBe(8);
    expect(MANIFEST.map((r) => `${r.family}/${r.id}#${r.stage}`)).toEqual([
      'hunt/hunt_servants_doubter#3',
      'hunt/hunt_mud_siren_drakova#5',
      'hunt/hunt_mud_harpy_cradle#5',
      'hunt/hunt_plague_moth_enclave#3',
      'hunt/hunt_mud_hound_alpha_yuldra#3',
      'hunt/hunt_apparition_red_tower#5',
      'storyline/story_reclaimer_highest_bidder#4',
      'storyline/story_monarch_silence#6',
    ]);
  });

  it('⚠⚠⚠ AND THE NINTH IS STILL UNREPAIRED, ON THE RECORD, FOR THE REASON GIVEN', () => {
    // Not a pass mark — a receipt. The beat is a proven mismatch; placing its
    // bodies is blocked by the OTA-1601 adjacency ratchet, whose own test
    // guards the other half of this. If someone gives the junction a ground of
    // its own, this assertion is what sends them back here to finish the row.
    const s = stageAt(BLOCKED.family, BLOCKED.id, BLOCKED.stage);
    expect({ at: `${BLOCKED.id}#${BLOCKED.stage}`, spawn: s.spawn ?? null, kind: s.checkKind })
      .toEqual({ at: `${BLOCKED.id}#${BLOCKED.stage}`, spawn: null, kind: 'attack_provoke' });
    // The ratchet's own premise: predecessor and stage share a tile.
    const prev = stageAt(BLOCKED.family, BLOCKED.id, BLOCKED.stage - 1);
    expect(prev.locationName).toBe(s.locationName);
  });

  it('⚠⚠⚠ EVERY ROW\'S PROMISE IS STILL IN THE STAGE\'S OWN PROSE', () => {
    // Rewriting the promise out of the narration is a legitimate thing to want
    // to do — it is how a beat gets RE-CLASSIFIED as abstraction. It is not a
    // way to drop the encounter quietly, so it lands here by name.
    const drifted = MANIFEST
      .filter((r) => !stageAt(r.family, r.id, r.stage).narration.includes(r.promise))
      .map((r) => `${r.id}#${r.stage}`);
    expect(drifted).toEqual([]);
  });

  it('⚠⚠⚠ AND EVERY ROW\'S STAGE CARRIES EXACTLY THAT ENCOUNTER', () => {
    // This is the half that catches the regression the package exists to close:
    // an author removing a required spawn.
    for (const r of MANIFEST) {
      const s = stageAt(r.family, r.id, r.stage);
      const want = r.ambush
        ? { enemyName: r.enemyName, count: r.count, ambush: true }
        : { enemyName: r.enemyName, count: r.count };
      expect({ at: `${r.id}#${r.stage}`, spawn: s.spawn }).toEqual({ at: `${r.id}#${r.stage}`, spawn: want });
    }
  });

  it('⚠⚠ every identity is one the catalogue actually has', () => {
    for (const r of MANIFEST) {
      expect({ at: r.id, known: ENEMY_NAMES.has(r.enemyName) }).toEqual({ at: r.id, known: true });
    }
  });

  it('⚠⚠⚠ THE CLASS IS "THE PLAYER IS TOLD TO FIGHT" — every row is paid by ATTACK', () => {
    // The manifest is not "stages we felt like giving a spawn". Each one is a
    // beat whose own checkKind already asks the player to start a fight; the
    // defect was that nothing was there when they did.
    for (const r of MANIFEST) {
      const s = stageAt(r.family, r.id, r.stage);
      expect({ at: `${r.id}#${r.stage}`, intent: payingIntent(r.family, s) })
        .toEqual({ at: `${r.id}#${r.stage}`, intent: 'attack' });
    }
  });

  it('⚠⚠⚠ AND NO ROW IS ITS ARC\'S LAST BOSS — the apex path is untouched', () => {
    // A hunt apex is stood up by scaleHuntBoss from the hunt's own
    // targetEnemyName. Putting a stage spawn on one would SUPPRESS the boss
    // (that is what the false-summit override is for) and materialize lesser
    // bodies where the target belongs. None of the nine is an apex.
    for (const r of MANIFEST) {
      const m = arc(r.family, r.id);
      expect({ at: `${r.id}#${r.stage}`, isApex: r.stage === lastBossIndex(m) })
        .toEqual({ at: `${r.id}#${r.stage}`, isApex: false });
    }
  });
});

// ───────────────────────────────────────────── §B the scope, stated as a test

describe('Package A §B — legitimate abstraction is still legal', () => {
  it('⚠⚠⚠ THE UPHELD BEATS CARRY NO SPAWN AND THE GATE DOES NOT ASK THEM TO', () => {
    const manifestKeys = new Set(MANIFEST.map((r) => `${r.family}/${r.id}#${r.stage}`));
    for (const a of ABSTRACTIONS) {
      const s = stageAt(a.family, a.id, a.stage);
      expect({ at: `${a.id}#${a.stage}`, spawn: s.spawn ?? null, inManifest: manifestKeys.has(`${a.family}/${a.id}#${a.stage}`) })
        .toEqual({ at: `${a.id}#${a.stage}`, spawn: null, inManifest: false });
    }
  });

  it('⚠⚠ the gate\'s reach IS the manifest — the corpus keeps its 252 spawn-less stages', () => {
    // Said as a number so that a future "every fight-ish stage needs a spawn"
    // rule cannot be slipped in under this suite's name. 281 authored stages,
    // 29 with an encounter (21 before this package, 8 added); the rest are
    // prose, and that is correct.
    const all = [...HUNTS, ...MYSTERIES, ...STORIES];
    const stages = all.reduce((n, m) => n + (m.stages ?? []).length, 0);
    const withSpawn = all.reduce((n, m) => n + (m.stages ?? []).filter((s) => s.spawn).length, 0);
    // ⚠ 281 -> 287: ENDING batch 1 added six trailing `checkKind: null` epilogue
    // beats (3 mysteries, 3 storylines). `withSpawn` is what this assertion actually
    // guards and it is UNCHANGED — no ending stands a body up.
    expect({ stages, withSpawn }).toEqual({ stages: 287, withSpawn: 29 });
  });
});

// ─────────────────────────────────────────────────── §C behaviour: the hunts

const store = useGameStore;
const get = () => store.getState();
const set = (fn: (s: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>) => store.setState(fn as never);

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) await new Promise((r) => setTimeout(r, 15));
}

const huntStage = (id: string) => (get().player?.activeHunts ?? []).find((h) => h.id === id)?.stage;
const storyStage = (id: string) => (get().player?.activeStorylines ?? []).find((s) => s.id === id)?.stage;

const questItem = (name: string) =>
  ({ id: `pkga_${name.replace(/\W+/g, '_')}`, name, kind: 'misc', quantity: 1, tags: ['quest', 'mission'] } as never);

/** Put the player on a manifest row's own ground, on that stage, holding what
 *  the stage requires — the state a player reaches by walking the arc. */
function seed(r: Row, opts: { locationId: string; indoors?: 'hub' | 'building' | null; holdRequirement?: boolean } ) {
  const s = stageAt(r.family, r.id, r.stage);
  const p = get().player!;
  const need = opts.holdRequirement === false ? [] : (s.requires ? [questItem(s.requires.item)] : []);
  store.setState({
    player: {
      ...p,
      ...placedAt(opts.locationId),
      hubRoomId: opts.indoors === 'hub' ? 'outpost_gate' : null,
      hp: 900, hpMax: 900, stamina: 100,
      travelTarget: undefined,
      whisperCourse: null,
      inventory: [...p.inventory.filter((i) => !(i.tags ?? []).includes('mission')), ...need],
      activeHunts: r.family === 'hunt' ? [{ id: r.id, stage: r.stage, tracked: true } as never] : [],
      activeStorylines: r.family === 'storyline' ? [{ id: r.id, stage: r.stage, tracked: true } as never] : [],
    } as never,
    activeBuildingId: opts.indoors === 'building' ? 'market' : null,
    missionFleeHoldCell: null,
  });
  set((sx) => (sx.currentScene
    ? { currentScene: { ...sx.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null } }
    : sx));
}

/** Drop every body on the field the way the real kill path does, then run the
 *  clear the engine routes through. */
function clearTheField() {
  const scene = get().currentScene!;
  const first = scene.enemies[0]!;
  set((s) => ({ currentScene: { ...s.currentScene!, enemyHps: scene.enemies.map(() => 0) } }));
  resolveStageEscortClear(store.getState, store.setState as never, get().player!, first, 0);
}

const row = (id: string): Row => MANIFEST.find((r) => r.id === id)!;

describe('Package A §C — the hunt door: arriving is enough, and the beat holds', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Package A', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ THE GAUNTLET IS A GAUNTLET NOW — two raiders, and stage 3 does not move', () => {
    const r = row('hunt_servants_doubter');
    seed(r, { locationId: 'raiders_ridge' });
    get().advanceHunt(r.id);
    expect((get().currentScene?.enemies ?? []).map((e) => e.name)).toEqual(['Tartarian Raider', 'Tartarian Raider']);
    expect(huntStage(r.id)).toBe(3);
  });

  it('⚠⚠⚠ and clearing them advances EXACTLY ONCE', () => {
    const r = row('hunt_servants_doubter');
    seed(r, { locationId: 'raiders_ridge' });
    get().advanceHunt(r.id);
    const body = get().currentScene!.enemies[0]!;
    clearTheField();
    expect(huntStage(r.id)).toBe(4);
    // ⚠ A second clear with the same body — the shape a double-fire of the kill
    // path would produce — must not walk the record a second time.
    resolveStageEscortClear(store.getState, store.setState as never, get().player!, body, 0);
    expect(huntStage(r.id)).toBe(4);
  });

  it('⚠⚠⚠ THE STAGE SPAWN DOES NOT MATERIALIZE THE APEX EARLY — brood first, boss after', () => {
    // hunt_mud_harpy_cradle's target IS a Mud Harpy, so this is the sharpest
    // case: the escort at #5 and the apex at #6 share a species and must not
    // share a scale or a slot.
    const r = row('hunt_mud_harpy_cradle');
    seed(r, { locationId: 'cradle_of_dusk' });
    get().advanceHunt(r.id);
    const brood = get().currentScene?.enemies ?? [];
    expect(brood.length).toBe(3);
    expect(brood.every((e) => e.name === 'Mud Harpy')).toBe(true);
    expect(brood.every((e) => !/hunted/i.test(e.name))).toBe(true); // not the apex body
    expect(huntStage(r.id)).toBe(5);

    clearTheField();
    expect(huntStage(r.id)).toBe(6);
    get().advanceHunt(r.id); // the apex — scaleHuntBoss, from the hunt's own target
    const apex = get().currentScene?.enemies ?? [];
    expect(apex.length).toBe(1);
    expect(apex[0]!.name).toContain('Mud Harpy');
    expect(huntStage(r.id)).toBe(6); // frozen for the kill
  });

  it('⚠⚠ every stood-up body carries the stage\'s key, so the existing clear/flee machinery owns it', () => {
    // Nothing new governs these fights. The key is what lets the clear tell the
    // stage's ravens from a wandering one, and what the flee ledger counts.
    const r = row('hunt_apparition_red_tower');
    seed(r, { locationId: 'red_tower_of_nimari' });
    get().advanceHunt(r.id);
    const up = get().currentScene?.enemies ?? [];
    expect(up.map((e) => e.name)).toEqual(['Aetheric Ghost', 'Aetheric Ghost', 'Aetheric Ghost']);
    expect(up.every((e) => (e as { stageKey?: string }).stageKey === `hunt:${r.id}:${r.stage}`)).toBe(true);
  });

  it('⚠⚠ and the pack is still gated on what the stage requires', () => {
    // A stage that wants an item in hand must not stand bodies up for a player
    // who has not got it — the encounter is not a way around the chain.
    const r = row('hunt_plague_moth_enclave');
    seed(r, { locationId: 'tartarian_enclave', holdRequirement: false });
    void get().submitPlayerAction('provoke it');
    expect((get().currentScene?.enemies ?? []).length).toBe(0);
    expect(huntStage(r.id)).toBe(3);
  });
});

// ──────────────────────────────────── §D behaviour: the storylines + the roof

describe('Package A §D — the storyline door, and the roof guard it needed', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Package A story', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ THE PARLEY GROUND — the one name that raises a hand now raises one', () => {
    const r = row('story_monarch_silence');
    seed(r, { locationId: 'parley_ground' });
    get().advanceStoryline(r.id);
    expect((get().currentScene?.enemies ?? []).map((e) => e.name)).toEqual(['Black Cloak Agent']);
    expect(storyStage(r.id)).toBe(6);
    clearTheField();
    expect(storyStage(r.id)).toBe(7);
  });

  /* ⚠⚠⚠ WHY THE GUARD HAD TO EXIST BEFORE THE HIDDEN MARKET SPAWN COULD MEAN
   * ANYTHING. OTA-508 auto-enters the market building the moment the player
   * arrives at `hidden_market` — `activeBuildingId` is the DEFAULT state on
   * that tile, not an edge case. `spawnStageEscort`'s OTA-1598 belt refuses to
   * write bodies under a roof, and advanceStoryline had no door-refusal ahead
   * of it, so the spawn would have returned false and execution would have
   * fallen straight through to the advance: stage closed, item granted, no
   * fight. The authored encounter would have read green in the data and been
   * dead on the normal player path. */
  it('⚠⚠⚠ the tile auto-enters its building, so "inside" is the default state there', () => {
    const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(STORE).toContain("scene.location.id === 'hidden_market' && !get().activeBuildingId");
    expect(STORE).toContain("get().enterBuilding('market')");
  });

  it('⚠⚠⚠ INSIDE THE MARKET — the chapter refuses, names the way out, and does NOT advance', () => {
    const r = row('story_reclaimer_highest_bidder');
    seed(r, { locationId: 'hidden_market', indoors: 'building' });
    get().advanceStoryline(r.id);
    expect((get().currentScene?.enemies ?? []).length).toBe(0);
    expect(storyStage(r.id)).toBe(4); // did not move
    const lines = get().gameLog.slice(-4).map((e) => e.text).join('\n');
    expect(lines).toContain('take it outside');
    expect(lines).toContain('EXIT');
    // ⚠ and it refuses AHEAD of the prose, so the fight text is not spent on a
    // press that did nothing and then reprinted outside.
    expect(lines).not.toContain('Black Cloak Agents');
  });

  it('⚠⚠⚠ OUTSIDE ON THE SAME CELL — the burning floor materializes, and the chapter holds for it', () => {
    const r = row('story_reclaimer_highest_bidder');
    seed(r, { locationId: 'hidden_market', indoors: null });
    get().advanceStoryline(r.id);
    const up = get().currentScene?.enemies ?? [];
    expect(up.map((e) => e.name)).toEqual(['Black Cloak Agent', 'Black Cloak Agent', 'Black Cloak Agent']);
    expect(up.every((e) => (e as { stageKey?: string }).stageKey === `storyline:${r.id}:${r.stage}`)).toBe(true);
    expect(storyStage(r.id)).toBe(4); // frozen for the kill
  });

  it('⚠⚠⚠ and clearing the floor advances EXACTLY ONCE, onto the broker\'s beat', () => {
    const r = row('story_reclaimer_highest_bidder');
    seed(r, { locationId: 'hidden_market', indoors: null });
    get().advanceStoryline(r.id);
    clearTheField();
    expect(storyStage(r.id)).toBe(5);
    expect((get().player?.inventory ?? []).some((i) => i.name === 'The Floor, Broken Clear')).toBe(true);
  });

  it('⚠ the guard is scoped to a stage that draws blades — a prose beat still closes under a roof', () => {
    // The refusal must not become a general "storylines do not advance indoors"
    // rule: that would wedge every hand-in beat inside an outpost.
    const r = row('story_monarch_silence');
    seed(r, { locationId: 'parley_ground', indoors: 'hub' });
    set((s) => ({
      player: { ...s.player!, activeStorylines: [{ id: r.id, stage: 1, tracked: true } as never] } as never,
    }));
    get().advanceStoryline(r.id); // stage 1 — diplomacy, no spawn
    expect(storyStage(r.id)).toBe(2);
  });

  it('⚠⚠ the storyline spawn that already existed still delivers, unchanged by the guard', () => {
    // story_truetart_descent_karoksa #3 stands on Karok-Sa, a wilderness anchor
    // cell where sceneBuilding is null by construction — so it was never
    // exposed to the missing guard, and the guard does not get in its way now.
    const p = get().player!;
    store.setState({
      player: {
        ...p,
        ...placedAt('karok_sa'),
        hubRoomId: null, hp: 900, hpMax: 900,
        travelTarget: undefined, whisperCourse: null,
        inventory: [...p.inventory.filter((i) => !(i.tags ?? []).includes('mission')), questItem('The Holding Seam')],
        activeHunts: [],
        activeStorylines: [{ id: 'story_truetart_descent_karoksa', stage: 3, tracked: true } as never],
      } as never,
      activeBuildingId: null,
      missionFleeHoldCell: null,
    });
    set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null } } : s));
    get().advanceStoryline('story_truetart_descent_karoksa');
    expect((get().currentScene?.enemies ?? []).map((e) => e.name)).toEqual(['Shifting Shade']);
    expect(storyStage('story_truetart_descent_karoksa')).toBe(3);
  });
});

// ────────────────────────────────────────────────── §E the guard, in the source

describe('Package A §E — the guard is the one advanceHunt already had', () => {
  const QSL = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');

  it('⚠⚠⚠ advanceStoryline refuses ABOVE its narration, like advanceHunt does', () => {
    const guard = QSL.indexOf('storyDrawsBlades && (player.hubRoomId || get().activeBuildingId)');
    expect(guard).toBeGreaterThan(-1);
    // The storyline handler's own narration write, found from the guard forward.
    const narrate = QSL.indexOf("appendLog('world', stageDef.narration)", guard);
    expect(narrate).toBeGreaterThan(guard);
  });

  it('⚠⚠ it reuses the blades test the arrival line already uses for a non-hunt family', () => {
    // missionTrace: `family === 'hunt' ? (...) : !!st.spawn`. One spelling, so
    // the line the player reads on the ground and the door the verb hits cannot
    // disagree about whether this beat draws blades.
    expect(QSL).toContain('const storyDrawsBlades = !!stageDef.spawn;');
    const TRACE = readFileSync(join(__dirname, '..', 'app', 'engine', 'missionTrace.ts'), 'utf8');
    expect(TRACE).toContain(': !!st.spawn;');
  });

  it('⚠ and nothing new stands bodies up — still one writer, three callers', () => {
    expect(QSL.match(/spawnStageEscort\(/g)?.length).toBe(4); // 1 definition + 3 call sites
  });
});
