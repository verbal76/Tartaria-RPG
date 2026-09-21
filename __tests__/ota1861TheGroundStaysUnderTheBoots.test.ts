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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1861 — THE GROUND STAYS UNDER THE BOOTS. Package 5 of the mechanical-
// integrity program asks a fifth question: when an authored stage expects the player
// to travel to, arrive at, stand on, leave or re-enter a particular place, does the
// runtime recognise the correct transition, at the correct time, for the correct
// stage — do authored geography and runtime geography AGREE?
//
// MOST OF IT WAS ALREADY TRUE, and §A/§C pin it. Across 50 arcs / 281 stages every
// stage names its own ground (zero fall back to the arc anchor), all 54 distinct
// grounds resolve through the location index, all 54 are real canon locations, and no
// two of them share a canon cell. At runtime the doors agree on one question — the
// canon GRID CELL (OTA-1597/1637), not the sticky `currentLocationId` label: travel
// lands on the cell, the wrong ground pays nothing, the right NAMED PLACE two tiles
// off its cell pays nothing, a roof shuts the arm and stepping out opens it,
// leaving and returning keeps the beat reachable, a ground four arcs are armed on
// stands up exactly ONE fight stamped for the arc that owns it, and an arrival
// re-delivered after the record has advanced arms nothing.
//
// ⚠⚠ WHAT WAS NOT TRUE — THE TABLE THE WHOLE THING RESOLVES AGAINST COULD MOVE.
// `worldMap.canonicalPositions` is that table, and it was built over
// `allKnownLocations()` — the static world PLUS every place the save has canonized
// since — in one id-sorted pass where `findFreeTile` gives a tile to whoever the sort
// reaches first. Setting a whisper course canonizes its objective tile as
// `mention_<slug>` carrying an EXPLICIT cell, and `mention_` sorts ahead of 28 of the
// 54 authored mission grounds. When the two cells met, THE GROUND MOVED — permanently,
// because canonLocations is saved and re-pushed on load, and silently, because every
// reader agreed with the new table. See worldMap.canonicalPositions for the
// measurement. §B is that measurement, kept.
//
// ⚠ WHAT THIS FILE DELIBERATELY DOES NOT CLAIM. It does not require a mention to keep
// its own requested cell — a canonized pin has always been bumped when it collides
// with a location sorting ahead of it, and §B asserts the whisper's own reader
// (its event gx/gy) is what the marker and the arrival resolution use, so nothing the
// player follows depends on the pin's table cell. It does not touch authored geography.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import {
  canonicalCellOf, canonicalLocationAtCell, canonicalPositions, setCanonExtraLocations,
} from '../app/engine/worldMap';
import { standingAtLocation } from '../app/engine/standingAt';
import { stageLocationId } from '../app/engine/questStage';
import { huntAnchorId, contractAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { findHuntById } from '../app/engine/hunts';
import { missionFightUnderfoot } from '../app/engine/missionTrace';
import { questionMarkerPlaces } from '../app/engine/questionMarkers';
import { armSpawnStagesAtArrival, checkStandingGround } from '../app/state/stageArrival';
import { placedAt } from '../test-utils/placePlayer';
import huntsRaw from '../app/data/quests/hunts.json';
import mysteriesRaw from '../app/data/quests/mysteries.json';
import storylinesRaw from '../app/data/quests/faction-storylines.json';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const setFn = ((fn: never) => store.setState(fn as never)) as never;
const getFn = get as never;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 30)); };
const settle = async (p: () => boolean, n = 200) => { for (let i = 0; i < n; i++) { if (p()) return; await new Promise((r) => setTimeout(r, 25)); } };

type Stage = { locationName?: string; checkKind?: string | null; spawn?: { enemyName: string; count?: number }; requires?: { item: string } };
type Def = { id: string; title: string; targetLocationName?: string | null; biomeTag?: string; factionId?: string | null; stages: Stage[] };
const pick = (d: unknown): Def[] => (Array.isArray(d) ? d : Object.values(d as object).find(Array.isArray)) as Def[];
const ARCS: Array<{ fam: 'hunt' | 'mystery' | 'storyline'; def: Def }> = [
  ...pick(huntsRaw).map((d) => ({ fam: 'hunt' as const, def: d })),
  ...pick(mysteriesRaw).map((d) => ({ fam: 'mystery' as const, def: d })),
  ...pick(storylinesRaw).map((d) => ({ fam: 'storyline' as const, def: d })),
];
const anchorOf = (a: { fam: string; def: Def }) =>
  (a.fam === 'hunt' ? huntAnchorId(a.def as never) : contractAnchorId(a.def as never)) as string;
const groundOfArc = (a: { fam: string; def: Def }, i: number) =>
  stageLocationId(a.def.stages[i] as never, anchorOf(a), resolvePosterLocation);
const GROUNDS = [...new Set(ARCS.flatMap((a) => a.def.stages.map((_, i) => groundOfArc(a, i))))].sort();
const groundOf = (huntId: string, i: number) => {
  const d = findHuntById(huntId)!;
  return stageLocationId(d.stages[i] as never, huntAnchorId(d as never), resolvePosterLocation)!;
};

/** The id a whisper course canonizes its objective under (gameStore.setWhisperCourse). */
const MENTION = 'mention_a_salt_cart';

describe('OTA-1861 §A — authored geography resolves, once, to real cells', () => {
  it('⚠ the census the repair was measured against', () => {
    expect({ arcs: ARCS.length, stages: ARCS.reduce((n, a) => n + a.def.stages.length, 0), grounds: GROUNDS.length })
      .toEqual({ arcs: 50, stages: 281, grounds: 54 });
  });

  it('⚠⚠ EVERY stage names its own place, and every name resolves — nothing falls back to the arc anchor', () => {
    const unnamed = ARCS.flatMap((a) => a.def.stages.map((s, i) => ({ a, s, i })).filter((r) => !r.s.locationName)
      .map((r) => `${r.a.def.id}#${r.i}`));
    const unresolved = ARCS.flatMap((a) => a.def.stages.map((s, i) => ({ a, s, i }))
      .filter((r) => r.s.locationName && !resolvePosterLocation(r.s.locationName))
      .map((r) => `${r.a.def.id}#${r.i} ${r.s.locationName}`));
    expect({ unnamed, unresolved }).toEqual({ unnamed: [], unresolved: [] });
  });

  it('⚠⚠ every authored ground is a REAL canon location, and no two share a cell', () => {
    const table = canonicalPositions();
    expect(GROUNDS.filter((g) => !table[g])).toEqual([]);
    const byCell = new Map<string, string[]>();
    for (const g of GROUNDS) {
      const c = canonicalCellOf(g);
      const k = `${c.x},${c.y}`;
      byCell.set(k, [...(byCell.get(k) ?? []), g]);
    }
    expect([...byCell.values()].filter((v) => v.length > 1)).toEqual([]);
  });

  it('⚠ the grounds are CROWDED — 39 of the 54 host more than one arc, so routing matters', () => {
    const arcsPer = new Map<string, Set<string>>();
    for (const a of ARCS) for (let i = 0; i < a.def.stages.length; i++) {
      const g = groundOfArc(a, i);
      if (!arcsPer.has(g)) arcsPer.set(g, new Set());
      arcsPer.get(g)!.add(a.def.id);
    }
    expect([...arcsPer.values()].filter((s) => s.size > 1).length).toBe(39);
  });
});

describe('OTA-1861 §B — a canonized mention cannot move the world', () => {
  afterEach(() => setCanonExtraLocations([]));

  /** The grounds that were EXPOSED: the ones `mention_` sorts ahead of. */
  const exposed = GROUNDS.filter((g) => g.localeCompare('mention_') > 0);

  it('⚠⚠⚠ the exposure is real and large — `mention_` sorts ahead of 28 of the 54 grounds', () => {
    expect(exposed.length).toBe(28);
    expect(exposed).toContain('mud_seas');
    expect(exposed).toContain('varakush');
    expect(exposed).toContain('voronov');
  });

  it('⚠⚠⚠ canonizing a mention ON a ground\'s own cell leaves that ground exactly where it was', () => {
    const before = Object.fromEntries(GROUNDS.map((g) => [g, canonicalCellOf(g)]));
    // One mention per ground would be 27 tables; three of the exposed ones is the
    // measurement, and the sweep below covers the rest in one pass.
    for (const g of ['mud_seas', 'varakush', 'karok_sa']) {
      setCanonExtraLocations([{ id: MENTION, name: 'A Salt Cart', gx: before[g]!.x, gy: before[g]!.y }]);
      const after = canonicalCellOf(g);
      expect({ g, x: after.x, y: after.y }).toEqual({ g, x: before[g]!.x, y: before[g]!.y });
      setCanonExtraLocations([]);
    }
  });

  it('⚠⚠⚠ …and NOTHING else in the table moves either, for any of the 28 exposed grounds', () => {
    const before = Object.fromEntries(GROUNDS.map((g) => [g, canonicalCellOf(g)]));
    const moved: string[] = [];
    for (const target of exposed) {
      setCanonExtraLocations([{ id: MENTION, name: 'A Salt Cart', gx: before[target]!.x, gy: before[target]!.y }]);
      for (const g of GROUNDS) {
        const c = canonicalCellOf(g);
        if (c.x !== before[g]!.x || c.y !== before[g]!.y) moved.push(`${target} moved ${g}`);
      }
      setCanonExtraLocations([]);
    }
    expect(moved).toEqual([]);
  });

  it('⚠⚠ the cell still ANSWERS the location — the mention does not take the name of the tile', () => {
    const c = canonicalCellOf('mud_seas');
    setCanonExtraLocations([{ id: MENTION, name: 'A Salt Cart', gx: c.x, gy: c.y }]);
    expect(canonicalLocationAtCell(c.x, c.y)?.locationId).toBe('mud_seas');
  });

  it('⚠ the mention is still PLACED (it takes a free tile), and its own marker keeps its true cell', () => {
    const c = canonicalCellOf('mud_seas');
    setCanonExtraLocations([{ id: MENTION, name: 'A Salt Cart', gx: c.x, gy: c.y }]);
    const mine = canonicalPositions()[MENTION];
    expect(mine).toBeDefined();
    expect(`${mine!.x},${mine!.y}`).not.toBe(`${c.x},${c.y}`);
    // ⚠ The "?" the player actually follows reads the EVENT's own cell, not the table,
    // which is why bumping the pin costs the whisper nothing.
    const marks = questionMarkerPlaces({
      discoveredLocationIds: [],
      canonLocations: [{ id: MENTION, name: 'A Salt Cart', gx: c.x, gy: c.y, marker: 'pending' } as never],
    } as never);
    expect(marks.find((m) => m.id === MENTION)).toEqual({ id: MENTION, x: c.x, y: c.y });
  });

  it('⚠ with nothing canonized the table is untouched — this repair moved no cell at rest', () => {
    // The repair only reorders STATIC-vs-DYNAMIC. Every static cell is still the cell
    // its own derivation asks for, or the first free tile from it, in id order.
    const table = canonicalPositions();
    expect(Object.keys(table).length).toBeGreaterThan(50);
    for (const g of GROUNDS) {
      const c = canonicalCellOf(g);
      expect({ g, x: c.x, y: c.y }).toEqual({ g, x: table[g]!.x, y: table[g]!.y });
    }
  });
});

describe('OTA-1861 §C — the location contract, at runtime', () => {
  const HUNT = 'hunt_bog_dragon';
  const AT = 5;
  const TOKEN = "Eshren's Name-Token";
  const GROUND = groundOf(HUNT, AT);
  const bodies = () => (get().currentScene?.enemies ?? []).map((e) => ({ n: (e as { name: string }).name, k: (e as { stageKey?: string }).stageKey }));
  const stageOf = (id: string) => ((get().player?.activeHunts ?? [])
    .find((h) => (h as unknown as { id: string }).id === id) as unknown as { stage: number } | undefined)?.stage;
  const mission = (name: string, id: string) =>
    ({ id, name, kind: 'misc', quantity: 1, tags: ['quest', 'mission'], description: 'Carried for a mission.' } as never);

  const seat = (
    where: string,
    recs: ReadonlyArray<{ id: string; at: number; need?: string }>,
    opts: { dx?: number } = {},
  ) => {
    store.setState(({
      player: {
        ...get().player, ...placedAt(where, { dx: opts.dx ?? 0 }),
        hubRoomId: null, travelTarget: undefined, whisperCourse: null,
        inventory: recs.filter((r) => r.need).map((r, i) => mission(r.need!, `q${i}`)) as never[],
        activeHunts: recs.map((r) => ({ id: r.id, stage: r.at, tracked: true })) as never,
        activeMysteries: [] as never, activeStorylines: [] as never,
      },
      activeBuildingId: null, missionFleeHoldCell: null, gameLog: [] as never,
      currentScene: {
        ...(get().currentScene as unknown as Record<string, unknown>),
        enemies: [], enemyHps: [], enemyKnockedOut: [],
      } as never,
    }) as never);
  };
  const clearField = () => store.setState(({
    currentScene: {
      ...(get().currentScene as unknown as Record<string, unknown>),
      enemies: [], enemyHps: [], enemyKnockedOut: [],
    },
  } as never));
  const arm = async () => { armSpawnStagesAtArrival(getFn, setFn); await flush(); };

  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await get().hydrate();
    await get().startNewGame({ name: 'Runner', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    get().skipTutorial?.();
    await settle(() => !!get().currentScene);
  });

  it('⚠⚠ TRAVEL lands on the ground: the destination\'s own canon cell, and the readers agree', async () => {
    seat('drakova', []);
    get().travelTo('voronov');
    await flush();
    const c = canonicalCellOf('voronov');
    expect({
      loc: get().player!.currentLocationId, x: get().player!.gridX, y: get().player!.gridY,
      here: standingAtLocation(get().player, 'voronov'), there: standingAtLocation(get().player, 'drakova'),
    }).toEqual({ loc: 'voronov', x: c.x, y: c.y, here: true, there: false });
  });

  it('⚠⚠⚠ ON the ground, paid up: the stage\'s own fight stands up, stamped for the stage', async () => {
    seat(GROUND, [{ id: HUNT, at: AT, need: TOKEN }]);
    await arm();
    expect(bodies()).toEqual([
      { n: 'Mud Harpy', k: `hunt:${HUNT}:${AT}` },
      { n: 'Mud Harpy', k: `hunt:${HUNT}:${AT}` },
      { n: 'Mud Harpy', k: `hunt:${HUNT}:${AT}` },
    ]);
  });

  it('⚠⚠ THE WRONG GROUND pays nothing, and so does the right NAMED PLACE two tiles off its cell', async () => {
    seat(groundOf('hunt_iron_titan', 0), [{ id: HUNT, at: AT, need: TOKEN }]);
    await arm();
    expect({ where: 'elsewhere', bodies: bodies(), stage: stageOf(HUNT) }).toEqual({ where: 'elsewhere', bodies: [], stage: AT });

    seat(GROUND, [{ id: HUNT, at: AT, need: TOKEN }], { dx: 2 });
    expect({ id: get().player!.currentLocationId, on: standingAtLocation(get().player, GROUND) })
      .toEqual({ id: GROUND, on: false }); // the label says here; the boots do not
    await arm();
    expect({ where: 'off-cell', bodies: bodies(), stage: stageOf(HUNT) }).toEqual({ where: 'off-cell', bodies: [], stage: AT });
  });

  it('⚠⚠ A ROOF shuts the arm — and stepping out under open sky opens it', async () => {
    seat(GROUND, [{ id: HUNT, at: AT, need: TOKEN }]);
    store.setState({ activeBuildingId: 'market' } as never);
    await arm();
    expect(bodies()).toEqual([]);
    store.setState({ activeBuildingId: null } as never);
    store.setState(({ player: { ...get().player, hubRoomId: 'entry' } }) as never);
    await arm();
    expect(bodies()).toEqual([]);
    store.setState(({ player: { ...get().player, hubRoomId: null } }) as never);
    await arm();
    expect(bodies().length).toBe(3);
  });

  it('⚠ LEAVE and RETURN keeps the beat reachable, and nothing follows you off the ground', async () => {
    seat(GROUND, [{ id: HUNT, at: AT, need: TOKEN }]);
    await arm();
    expect(bodies().length).toBe(3);
    store.setState(({ player: { ...get().player, ...placedAt('drakova') } }) as never);
    clearField();
    await arm();
    expect({ away: bodies(), stage: stageOf(HUNT) }).toEqual({ away: [], stage: AT });
    store.setState(({ player: { ...get().player, ...placedAt(GROUND) } }) as never);
    await arm();
    expect({ back: bodies().length, stage: stageOf(HUNT) }).toEqual({ back: 3, stage: AT });
  });

  it('⚠⚠⚠ FOUR ARCS armed on ONE ground: one fight, stamped for the arc that owns it', async () => {
    // The census found seven grounds where more than one arc has an arrival-armed
    // stage. This is the widest: mud_seas carries four.
    const four = [
      { id: 'hunt_bog_dragon', at: 5, need: TOKEN },
      { id: 'hunt_sludge_behemoth', at: 1, need: 'Sealed Coordinate Tube' },
      { id: 'hunt_mud_siren_queen', at: 1, need: "Drifter's South-Spire Poster" },
      { id: 'hunt_mud_siren_drakova', at: 3, need: "Halla's Shallows-Bearing" },
    ];
    for (const f of four) expect(groundOf(f.id, f.at)).toBe(GROUND);
    seat(GROUND, four);
    await arm();
    // exactly one pack, all of it one arc's
    expect(new Set(bodies().map((b) => b.k)).size).toBe(1);
    expect(bodies()[0]!.k).toBe(`hunt:${four[0]!.id}:${four[0]!.at}`);
    // …and the ledger reader names the SAME arc, so a flee is written against the
    // fight that is actually on the field.
    expect(missionFightUnderfoot(get().player)?.stageKey).toBe(`hunt:${four[0]!.id}:${four[0]!.at}`);
    // nobody else's record moved
    expect(four.map((f) => stageOf(f.id))).toEqual(four.map((f) => f.at));
    // arming again with the pack up adds nothing (the stage's own bodies hold the door)
    await arm();
    expect(bodies().length).toBe(3);
  });

  it('⚠⚠ A STALE ARRIVAL re-delivered after the record moved on arms nothing', async () => {
    seat(GROUND, [{ id: HUNT, at: AT, need: TOKEN }]);
    await arm();
    expect(bodies().length).toBe(3);
    // the record legitimately advances to a stage on a DIFFERENT ground…
    expect(groundOf(HUNT, AT + 1)).not.toBe(GROUND);
    store.setState(({ player: { ...get().player, activeHunts: [{ id: HUNT, stage: AT + 1, tracked: true }] as never } }) as never);
    clearField();
    // …and the arrival that armed the old stage is delivered again, from the old ground.
    checkStandingGround(getFn, setFn, ((..._a: unknown[]) => 0) as never);
    await flush();
    expect({ bodies: bodies(), stage: stageOf(HUNT) }).toEqual({ bodies: [], stage: AT + 1 });
  });
});
