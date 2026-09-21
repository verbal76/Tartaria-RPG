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


// ⚠⚠⚠ OTA-1859 — THE BEAT THAT IS PAID BY LEAVING. Package 3 of the mechanical-integrity
// program: can every authored stage advance, block and complete through the correct
// mechanical path, exactly once, from the correct state?
//
// MOST OF IT WAS ALREADY TRUE, and §A/§B pin it so it cannot rot. Across 50 arcs /
// 281 stages: every stage has at least one supported closing door (zero orphans);
// all 14 null stages are TRAILING epilogues that the auto-consume loops walk past, so
// nothing can be parked on a verbless beat; the nine consecutive same-verb-AND-same-
// tile pairs are paid one at a time; the final transition fires exactly once and
// repeated input on a finished arc is a no-op; and a body stamped for stage N cannot
// close stage N+1 (the OTA-1703 stageKey is compared against the record's CURRENT
// stage, which is stage-instance identity, not "advance whatever is current now").
//
// ⚠⚠ WHAT WAS NOT TRUE — ONE checkKind, LOOKED FOR IN THE WRONG FAMILY. `escape` is the
// only authored checkKind whose action does not exist outside a fight. Five stages
// author it, ALL storylines. Two runtime readers carved `escape` out of their combat
// gate and BOTH wrote `family === 'hunt'` — and hunts author zero escape stages.
// Measured on the pre-repair tree at The Sunken Enclave, holding The Founder's Case:
//
//   · IN COMBAT  — the authored action — stage 3 -> 3, and the Arbiter said
//     "That is the right move for The Drowned Library — but not with something on
//     you. Put this down first." to a player who was fleeing.
//   · OUT OF COMBAT — fleeing nothing — stage 3 -> 4.
//
// Exactly inverted. See questStage.stageClosesOnEscape for the full record.
//
// ⚠ WHAT THIS FILE DELIBERATELY DOES NOT CLAIM. It does not require an escape stage to
// be UNREACHABLE out of combat: that path is live behaviour a save may be sitting on and
// the only floor under a stage whose ground never happens to produce a fight, and §D
// asserts it stays legal on purpose. It does not ban unusual stage shapes — §B asserts
// the null epilogue and the spawn-frozen stage both still pass. It parses no prose.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { stageLocationId, payingIntent, stageClosesOnEscape } from '../app/engine/questStage';
import { contractAnchorId, huntAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { findStorylineById } from '../app/engine/factionStorylines';
import { findMysteryById } from '../app/engine/mysteries';
import { stalledInCombat } from '../app/engine/missionTrace';
import { closeEscapeBeatOnFlee } from '../app/state/stageArrival';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';
import huntsRaw from '../app/data/quests/hunts.json';
import mysteriesRaw from '../app/data/quests/mysteries.json';
import storylinesRaw from '../app/data/quests/faction-storylines.json';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();

type Stage = { checkKind?: string | null; npcName?: string; spawn?: { enemyName: string }; requires?: { item: string } };
type Arc = { fam: 'hunt' | 'mystery' | 'storyline'; def: { id: string; stages: Stage[] } };
const pick = (d: unknown): never[] => (Array.isArray(d) ? d : Object.values(d as object).find(Array.isArray)) as never;
const ARCS: Arc[] = [
  ...pick(huntsRaw).map((a) => ({ fam: 'hunt' as const, def: a as never })),
  ...pick(mysteriesRaw).map((a) => ({ fam: 'mystery' as const, def: a as never })),
  ...pick(storylinesRaw).map((a) => ({ fam: 'storyline' as const, def: a as never })),
];
const anchorOf = (a: Arc) => (a.fam === 'hunt' ? huntAnchorId(a.def as never) : contractAnchorId(a.def as never)) as string;
const groundOf = (a: Arc, i: number) => stageLocationId(a.def.stages[i] as never, anchorOf(a), resolvePosterLocation);

/** ⚠ THE FIVE, PINNED IN DATA. A rename, a re-home or a sixth escape beat has to come
 *  back through this list — which is the point: the repair is keyed on a checkKind, and
 *  the checkKind is only interesting because these five stages carry it. */
const ESCAPE_BEATS = [
  { arc: 'story_tartarian_ascension', at: 1, item: "Korash's Trial-Token" },
  { arc: 'story_tartarian_ascension', at: 5, item: 'Night-Watch Tally' },
  { arc: 'story_dynasty_blood_aetherborn', at: 2, item: "The Drowned Party's Seal" },
  { arc: 'story_builders_scripture_in_stone', at: 3, item: 'The True Glyph' },
  { arc: 'story_order_drowned_library', at: 3, item: 'The Founder’s Case'.replace('’', "'") },
] as const;

const missionCopy = (name: string, id = 'q1') =>
  ({ id, name, kind: 'misc', quantity: 1, tags: ['quest', 'mission'], description: 'Carried for a mission.' } as never);
const settle = async (p: () => boolean, n = 200) => { for (let i = 0; i < n; i++) { if (p()) return; await new Promise((r) => setTimeout(r, 25)); } };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 30)); };
const settleRolls = async () => {
  let guard = 0;
  while (get().pendingRolls) {
    if (guard++ > 60) throw new Error('roll-step loop did not terminate');
    const pr = get().pendingRolls as never as { steps: Array<{ count?: number; sides?: number }>; currentStep: number };
    const step = pr.steps[pr.currentStep]!;
    get().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => step.sides ?? 20));
    await flush();
  }
  await flush();
};

describe('OTA-1859 §A — the corpus every door has to serve', () => {
  it('⚠ the census is what the repair was measured against', () => {
    const stages = ARCS.reduce((n, a) => n + a.def.stages.length, 0);
    expect({ arcs: ARCS.length, stages }).toEqual({ arcs: 50, stages: 281 });
  });

  it('⚠⚠⚠ EVERY authored stage has at least one supported closing door', () => {
    const orphans: string[] = [];
    for (const a of ARCS) {
      let lastBoss = -1;
      a.def.stages.forEach((s, i) => { if (s.checkKind === 'boss') lastBoss = i; });
      a.def.stages.forEach((s, i) => {
        const doors: string[] = [];
        if (payingIntent(a.fam, s as never) !== null) doors.push('verb');   // typed verb / card PROCEED
        if (s.spawn) doors.push('clear');                                   // resolveStageEscortClear
        if (a.fam === 'hunt' && (s.spawn || (s.checkKind === 'boss' && i === lastBoss))) doors.push('arrival');
        if (s.checkKind === null) doors.push('auto');                       // the auto-consume loops
        if (stageClosesOnEscape(s as never)) doors.push('flee');            // OTA-1859's door
        if (doors.length === 0) orphans.push(`${a.fam} ${a.def.id}#${i}`);
      });
    }
    expect(orphans).toEqual([]);
  });

  it('⚠⚠ no stage can be PARKED on a verbless beat — every null stage is a trailing epilogue', () => {
    const midChainNulls = ARCS.flatMap((a) =>
      a.def.stages.map((s, i) => ({ a, s, i }))
        .filter((r) => r.s.checkKind === null && r.i !== r.a.def.stages.length - 1)
        .map((r) => `${r.a.fam} ${r.a.def.id}#${r.i}`));
    expect(midChainNulls).toEqual([]);
    // …and there really are some, so the assertion above is not vacuous.
    expect(ARCS.flatMap((a) => a.def.stages.filter((s) => s.checkKind === null)).length).toBe(14);
  });

  it('⚠ the ENCOUNTER CARD still cannot arm on a stage that stands bodies up (OTA-1590 holds)', () => {
    // The card's FIGHT branch hands off to the family's own advance. Zero stages carry
    // both a person and a spawn, so that branch stays latent — recorded, not "fixed".
    expect(ARCS.flatMap((a) => a.def.stages.filter((s) => s.spawn && s.npcName)).length).toBe(0);
  });
});

describe('OTA-1859 §B — the five escape beats, pinned in data', () => {
  it('⚠⚠⚠ exactly these five stages carry `escape`, and all five are storylines', () => {
    const found = ARCS.flatMap((a) => a.def.stages.map((s, i) => ({ a, s, i }))
      .filter((r) => stageClosesOnEscape(r.s as never))
      .map((r) => ({ fam: r.a.fam, arc: r.a.def.id, at: r.i })));
    expect(found).toEqual(ESCAPE_BEATS.map((b) => ({ fam: 'storyline', arc: b.arc, at: b.at })));
  });

  it('⚠⚠ each one is MID-ARC and gated on an object it is carrying out', () => {
    for (const b of ESCAPE_BEATS) {
      const def = findStorylineById(b.arc)!;
      const st = def.stages[b.at] as Stage;
      expect({ arc: b.arc, last: b.at === def.stages.length - 1, needs: st.requires?.item })
        .toEqual({ arc: b.arc, last: false, needs: b.item });
    }
  });

  it('⚠⚠⚠ hunts author NONE — which is why a `family === "hunt"` carve-out reached nothing', () => {
    expect(ARCS.filter((a) => a.fam === 'hunt')
      .flatMap((a) => a.def.stages.filter((s) => stageClosesOnEscape(s as never))).length).toBe(0);
  });

  it('⚠ and the authority is keyed on the STAGE, not the family', () => {
    expect(stageClosesOnEscape({ checkKind: 'escape' })).toBe(true);
    expect(stageClosesOnEscape({ checkKind: 'boss' })).toBe(false);
    expect(stageClosesOnEscape({ checkKind: null })).toBe(false);
    expect(stageClosesOnEscape(undefined)).toBe(false);
  });
});

describe('OTA-1859 §C — the beat is paid by leaving', () => {
  const ID = 'story_order_drowned_library';
  const AT = 3;
  const at = () => ((get().player?.activeStorylines ?? [])
    .find((s) => (s as unknown as { id: string }).id === ID) as unknown as { stage: number }).stage;

  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await get().hydrate();
    await get().startNewGame({ name: 'Runner', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    get().skipTutorial?.();
    await settle(() => !!get().currentScene);
  });

  /** On the stage's own ground, carrying what it asks for, nothing else tracked. */
  const seat = (inv: unknown[]) => {
    const def = findStorylineById(ID)!;
    const where = stageLocationId(def.stages[AT] as never, contractAnchorId(def as never), resolvePosterLocation)!;
    const p = get().player!;
    store.setState(({
      player: {
        ...p, ...placedAt(where), hubRoomId: null, travelTarget: undefined, whisperCourse: null,
        inventory: inv as never[], activeHunts: [], activeMysteries: [],
        activeStorylines: [{ id: ID, stage: AT, tracked: true } as never],
      },
      activeBuildingId: null, gameLog: [] as never,
      currentScene: { ...(get().currentScene as unknown as Record<string, unknown>), enemies: [], enemyHps: [] } as never,
    }) as never);
  };
  const putABodyOnTheField = () => {
    store.setState(({
      currentScene: {
        ...(get().currentScene as unknown as Record<string, unknown>),
        enemies: [{ name: 'Bog Hound', hp: 10, maxHp: 10, power: 3, damage: 2, ac: 10 }],
        enemyHps: [10], activeEnemyIdx: 0, range: 'close',
      } as never,
    }) as never);
  };

  it('⚠⚠⚠ IN COMBAT, ON ITS GROUND, CARRYING IT — getting out closes the beat', async () => {
    seat([missionCopy("The Founder's Case", 'fc')]);
    putABodyOnTheField();
    expect(at()).toBe(AT);
    await get().submitPlayerAction('flee');
    await settleRolls();
    expect(at()).toBe(AT + 1);
    // and the close is a real close: the next beat's object is in the pack.
    expect(get().gameLog.some((e) => /mission item/.test(e.text))).toBe(true);
  });

  it('⚠⚠⚠ THE DOOR ITSELF CHECKS THE PACK — an empty pack pays nothing', () => {
    // Called directly, because the INTEGRATION path cannot express "on this ground
    // without the object": Package 2's catch-up heal (checkStandingGround →
    // healStageDebtsAtArrival) hands over anything an earlier stage of the arc
    // promised BEFORE the action resolves, and every requirement in the corpus has
    // an earlier in-arc grant. Measured: seating an empty pack and typing `flee`
    // advances, because by then the pack is no longer empty. That is the Package 2
    // contract working, not this door leaking — so the gate is proven where it lives.
    seat([]);
    putABodyOnTheField();
    closeEscapeBeatOnFlee(get as never, ((fn: never) => store.setState(fn as never)) as never);
    expect(at()).toBe(AT);
    // …and the same call, same ground, same body, with the object: it pays.
    seat([missionCopy("The Founder's Case", 'fc')]);
    putABodyOnTheField();
    closeEscapeBeatOnFlee(get as never, ((fn: never) => store.setState(fn as never)) as never);
    expect(at()).toBe(AT + 1);
  });

  it('⚠⚠ OFF ITS GROUND, carrying it — leaving some other fight pays nothing', async () => {
    seat([missionCopy("The Founder's Case", 'fc')]);
    const p = get().player!;
    const elsewhere = stageLocationId(
      findMysteryById('mystery_red_tower')!.stages[0] as never,
      contractAnchorId(findMysteryById('mystery_red_tower') as never), resolvePosterLocation)!;
    store.setState({ player: { ...p, ...placedAt(elsewhere) } });
    putABodyOnTheField();
    await get().submitPlayerAction('flee');
    await settleRolls();
    expect(at()).toBe(AT);
  });

  it('⚠⚠⚠ and the Arbiter no longer tells a fleeing player to stand and fight', () => {
    seat([missionCopy("The Founder's Case", 'fc')]);
    putABodyOnTheField();
    // stalledInCombat is what printed "…but not with something on you. Put this down
    // first." on the pre-repair tree, for this exact stage, on this exact ground.
    expect(stalledInCombat(get().player, 'escape')).toBeNull();
  });

  it('⚠ the control still stalls: a DIPLOMACY beat mid-fight is a real stall, and still says so', () => {
    const def = findStorylineById('story_monarch_silence')!;
    const idx = def.stages.findIndex((s: Stage) => s.checkKind === 'diplomacy' && !s.spawn);
    expect(idx).toBeGreaterThanOrEqual(0);
    const where = stageLocationId(def.stages[idx] as never, contractAnchorId(def as never), resolvePosterLocation)!;
    const p = get().player!;
    store.setState(({
      player: { ...p, ...placedAt(where), hubRoomId: null, travelTarget: undefined, whisperCourse: null,
        activeHunts: [], activeMysteries: [],
        activeStorylines: [{ id: def.id, stage: idx, tracked: true } as never] },
      activeBuildingId: null,
    }) as never);
    expect(stalledInCombat(get().player, 'diplomacy')?.title).toBe(def.title);
  });
});

describe('OTA-1859 §D — what the repair deliberately leaves alone', () => {
  const ID = 'story_order_drowned_library';
  const AT = 3;
  const at = () => ((get().player?.activeStorylines ?? [])
    .find((s) => (s as unknown as { id: string }).id === ID) as unknown as { stage: number }).stage;

  it('⚠⚠ OUT OF COMBAT the verb still pays it — the anti-brick floor stays legal ON PURPOSE', async () => {
    const def = findStorylineById(ID)!;
    const where = stageLocationId(def.stages[AT] as never, contractAnchorId(def as never), resolvePosterLocation)!;
    const p = get().player!;
    store.setState(({
      player: { ...p, ...placedAt(where), hubRoomId: null, travelTarget: undefined, whisperCourse: null,
        inventory: [missionCopy("The Founder's Case", 'fc')] as never[],
        activeHunts: [], activeMysteries: [],
        activeStorylines: [{ id: ID, stage: AT, tracked: true } as never] },
      activeBuildingId: null, gameLog: [] as never,
      currentScene: { ...(get().currentScene as unknown as Record<string, unknown>), enemies: [], enemyHps: [] } as never,
    }) as never);
    await get().submitPlayerAction('flee');
    await settleRolls();
    // A stage whose ground never produces a fight must still be finishable. Trading a
    // wrong-state close for an unreachable one is the softlock P19's heal exists to avoid.
    expect(at()).toBe(AT + 1);
  });
});

describe('OTA-1859 §E — one action, one stage; one arc, one ending', () => {
  const ID = 'mystery_red_tower';
  const at = () => ((get().player?.activeMysteries ?? [])
    .find((m) => (m as unknown as { id: string }).id === ID) as unknown as { stage: number }).stage;
  const seatMystery = (stage: number) => {
    const def = findMysteryById(ID)!;
    const where = stageLocationId(def.stages[stage] as never, contractAnchorId(def as never), resolvePosterLocation)!;
    const inv = def.stages.flatMap((s: Stage, i: number) => (s.requires ? [missionCopy(s.requires.item, `r${i}`)] : []));
    const p = get().player!;
    store.setState(({
      player: { ...p, ...placedAt(where), hubRoomId: null, travelTarget: undefined, whisperCourse: null,
        inventory: inv as never[], activeHunts: [], activeStorylines: [],
        activeMysteries: [{ id: ID, stage, tracked: true } as never] },
      activeBuildingId: null, gameLog: [] as never,
      currentScene: { ...(get().currentScene as unknown as Record<string, unknown>), enemies: [], enemyHps: [] } as never,
    }) as never);
    return def;
  };

  it('⚠⚠⚠ SAME VERB, SAME TILE, CONSECUTIVE — one action advances exactly one stage', async () => {
    const def = seatMystery(2);
    // #2 and #3 are both `investigate` on red_tower_of_nimari: the K&J candidate shape.
    expect(payingIntent('mystery', def.stages[2] as never)).toBe(payingIntent('mystery', def.stages[3] as never));
    expect(groundOf({ fam: 'mystery', def: def as never }, 2)).toBe(groundOf({ fam: 'mystery', def: def as never }, 3));
    await get().submitPlayerAction('investigate');
    await settleRolls();
    expect(at()).toBe(3);
  });

  it('⚠⚠ and two actions fired back-to-back cannot skip a beat between them', async () => {
    seatMystery(2);
    const a = get().submitPlayerAction('investigate');
    const b = get().submitPlayerAction('investigate');
    await a; await b; await settleRolls();
    expect(at()).toBeLessThanOrEqual(3);
  });

  it('⚠⚠⚠ THE FINAL TRANSITION IS EXACTLY ONCE — repeated input cannot re-complete the arc', async () => {
    const d = findMysteryById(ID)!;
    const last = d.stages.length - 1;
    seatMystery(last);
    await get().submitPlayerAction('investigate');
    await settleRolls();
    const after1 = at();
    const closes1 = get().gameLog.filter((e) => /Return to a posting agent/.test(e.text)).length;
    expect(after1).toBe(d.stages.length);
    expect(closes1).toBeGreaterThan(0);
    await get().submitPlayerAction('investigate'); await settleRolls();
    await get().submitPlayerAction('investigate'); await settleRolls();
    expect(at()).toBe(after1);
    expect(get().gameLog.filter((e) => /Return to a posting agent/.test(e.text)).length).toBe(closes1);
  });
});

describe('OTA-1859 §F — the readers move together', () => {
  it('⚠⚠⚠ neither reader carves `escape` out BY FAMILY any more', () => {
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const MT = readFileSync(join(__dirname, '..', 'app', 'engine', 'missionTrace.ts'), 'utf8');
    // The hunt matcher's family-local special case is gone: hunts author none, and a
    // carve-out that reaches nothing is how this defect survived.
    expect(GS).not.toContain("next.checkKind === 'escape' ? true : !inCombat");
    expect(MT).not.toContain("family === 'hunt' && next.checkKind === 'escape'");
    // stalledInCombat asks the shared authority instead.
    expect(MT).toContain('stageClosesOnEscape(next)');
    // …and the boss / attack_provoke carve-outs beside it ARE family-specific and stay so:
    // a mystery's boss is paid by investigate and a storyline's by diplomacy, neither of
    // which is a fight. Removing THOSE would be the opposite mistake.
    expect(MT).toContain("family === 'hunt' && next.checkKind === 'boss'");
    expect(MT).toContain("family === 'hunt' && next.checkKind === 'attack_provoke'");
  });

  it('⚠⚠⚠ the close hangs off the branch that CLEARS THE FIELD, not off the verb', () => {
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const i = GS.indexOf('closeEscapeBeatOnFlee(get, set)');
    expect(i).toBeGreaterThan(0);
    // It sits immediately after the flee's own bookkeeping, inside `if (currentScene.
    // enemies.length > 0)`. A wall-flee that ends in a fatal fall breaks out above this.
    const before = GS.slice(Math.max(0, i - 1200), i);
    expect(before).toContain('noteMissionFlee(get, set, currentScene)');
    expect(before).toContain('currentScene.enemies.length > 0');
    // and it is NOT wired into the per-action / arrival catch-all, which would fire it
    // on any action while standing on the ground — the wrong-state close all over again.
    const SA = readFileSync(join(__dirname, '..', 'app', 'state', 'stageArrival.ts'), 'utf8');
    const cs = SA.slice(SA.indexOf('export function checkStandingGround'));
    expect(cs).not.toContain('closeEscapeBeatOnFlee');
  });
});
