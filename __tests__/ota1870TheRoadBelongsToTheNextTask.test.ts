// ⚠⚠⚠ OTA-1870 — THE ROAD BELONGS TO THE NEXT TASK.
//
// A trailing `checkKind: null` aftermath is narration the advance loop consumes
// in the SAME tick that resolves the gated stage before it. It is not a place
// the player has to go. Both advance paths used to ask "where is stage N+1?" —
// the next stage BY INDEX — so a cross-ground aftermath was mistaken for the
// next objective: the engine armed a real travel course to its ground, printed
// "You set course for X … Tap the → X button to press on" and an auto-routing
// line, cleared `hubRoomId` the way travel setup does — and THEN consumed the
// beat, leaving the player holding a course to a stage that no longer existed.
//
// ⚠⚠ THIS WAS ALREADY SHIPPED. 12 of the 14 trailing epilogues live in the game
// today are cross-ground, and the three reproduced below are production content,
// not fixtures. The Phase 2A ending batch exposed the class; it did not create it.
//
// The repair is the question, asked correctly: `nextActionableStage` — already
// exported by questStage.ts, already imported here, already used by the escort
// path — returns the first stage that will STILL BE THERE once the consume loop
// has run. Its skip rule (`while checkKind === null`) is byte-for-byte the rule
// the consume loops use, which is why it cannot drift away from them.
//
// ⚠ THE CONTRACT IS NOT "never route". §CASE 5 pins the other side: an ordinary
// actionable cross-ground next stage must still arm travel and still say so.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: { createAsync: jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })) },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { HUNTS } from '../app/engine/hunts';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { nextActionableStage } from '../app/engine/questStage';

jest.setTimeout(60000);

type Stage = { checkKind: string | null; narration: string; locationName?: string; npcName?: string; grants?: unknown; requires?: unknown; spawn?: unknown; stinger?: unknown };
type Arc = { id: string; title: string; stages: Stage[] };

const ALL: Array<{ family: string; arc: Arc }> = [
  ...(MYSTERIES as unknown as Arc[]).map((arc) => ({ family: 'mystery', arc })),
  ...(STORYLINES as unknown as Arc[]).map((arc) => ({ family: 'storyline', arc })),
  ...(HUNTS as unknown as Arc[]).map((arc) => ({ family: 'hunt', arc })),
];
const byId = (id: string): Arc => {
  const hit = ALL.find((x) => x.arc.id === id);
  if (!hit) throw new Error(`arc not found: ${id}`);
  return hit.arc;
};
const lastGatedIndex = (arc: Arc): number => {
  let i = arc.stages.length - 1;
  while (i > 0 && arc.stages[i]!.checkKind === null) i -= 1;
  return i;
};

/** The player's real position. If an aftermath re-homes anybody, one of these moves. */
type Pos = { loc: string | undefined; x: number | undefined; y: number | undefined; room: string | null | undefined; scene: string | null };
const posOf = (): Pos => {
  const s = useGameStore.getState();
  const p = s.player!;
  return {
    loc: p.currentLocationId, x: p.mapX, y: p.mapY, room: p.hubRoomId,
    scene: s.currentScene?.location?.name ?? null,
  };
};

/** ⚠ The false-travel vocabulary, as the player actually reads it. */
const SET_COURSE = /You set course for/i;
const PRESS_ON = /Tap the → .* button on the travel row to press on/i;
const DISTANCE = /\d+ tiles — about/i;
const AUTO_ROUTE = /Auto-routing to the next (stage|chapter)/i;

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

/** Seat the record on `stage` and resolve it, returning everything the beat did.
 *  ⚠ The log is read WHOLE, not by index slice: storyline logging coalesces
 *  entries, and an index slice silently misses appended lines (an investigation
 *  probe was fooled by exactly that and briefly reported a phantom regression). */
async function resolveAt(id: string, family: 'mystery' | 'storyline', stage: number, who: string) {
  const store = await boot(who);
  const arc = byId(id);
  const rec = { id, stage, postedByFaction: null, acceptedAt: 0 };
  store.setState((s) => ({
    player: { ...s.player!, ...(family === 'mystery' ? { activeMysteries: [rec] } : { activeStorylines: [rec] }) },
  }));
  const before = posOf();
  if (family === 'mystery') store.getState().advanceMystery(id);
  else store.getState().advanceStoryline(id);
  const after = posOf();
  const log = store.getState().gameLog.map((l) => l.text).join('\n');
  const recAfter = (family === 'mystery'
    ? store.getState().player!.activeMysteries
    : store.getState().player!.activeStorylines)!.find((x) => x.id === id);
  return { store, arc, before, after, log, recAfter, travel: store.getState().player!.travelTarget };
}

/** The shared assertion for "this beat was aftermath, not a destination". */
function expectNoFalseTravel(r: Awaited<ReturnType<typeof resolveAt>>) {
  expect(r.travel).toBeUndefined();
  expect(r.log).not.toMatch(SET_COURSE);
  expect(r.log).not.toMatch(PRESS_ON);
  expect(r.log).not.toMatch(AUTO_ROUTE);
  // interior and ground state are untouched — nothing was "travel setup"
  expect(r.after).toEqual(r.before);
}

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

// ── the corpus this OTA is about ──────────────────────────────────────────────
describe('OTA-1870 — the shipped aftermath corpus', () => {
  const trailingNull = (arc: Arc) => arc.stages[arc.stages.length - 1]!.checkKind === null;

  it('every null stage in the game is a TRAILING, mechanically inert aftermath', () => {
    let total = 0; let trailing = 0; const mid: string[] = []; const mech: string[] = [];
    for (const { arc } of ALL) {
      arc.stages.forEach((s, i) => {
        if (s.checkKind !== null) return;
        total += 1;
        if (i === arc.stages.length - 1) trailing += 1; else mid.push(`${arc.id}#${i}`);
        for (const k of ['grants', 'requires', 'spawn', 'stinger'] as const) {
          if (s[k] !== undefined) mech.push(`${arc.id}#${i}.${k}`);
        }
      });
    }
    expect({ total, trailing, mid, mech }).toEqual({ total: 14, trailing: 14, mid: [], mech: [] });
  });

  // ⚠ This is the number that makes OTA-1870 a repair of LIVE behaviour rather
  // than groundwork for unreleased content. If it ever drops, the claim in the
  // commit message has stopped being true.
  it('⚠⚠ 12 of the 14 shipped epilogues are CROSS-GROUND — this defect was live', () => {
    const ending = ALL.filter((x) => trailingNull(x.arc));
    const cross = ending.filter(({ arc }) => {
      const epi = arc.stages[arc.stages.length - 1]!;
      const prev = arc.stages[arc.stages.length - 2]!;
      return epi.locationName !== prev.locationName;
    });
    expect({ ending: ending.length, cross: cross.length }).toEqual({ ending: 14, cross: 12 });
  });

  it('no hunt carries a trailing aftermath — the hunt kill path is a separate question', () => {
    expect((HUNTS as unknown as Arc[]).filter(trailingNull).map((h) => h.id)).toEqual([]);
  });
});

// ── CASE 1 / 2 / 3 — shipped cross-ground aftermaths, both families ───────────
describe('OTA-1870 — shipped cross-ground aftermath does not become a destination', () => {
  const CASES: Array<{ id: string; family: 'mystery' | 'storyline'; from: string; to: string }> = [
    { id: 'mystery_ashen_codex', family: 'mystery', from: 'Nimari', to: 'Varakush' },
    { id: 'mystery_drowned_bell_samarran', family: 'mystery', from: 'Samarran', to: 'Ostragar' },
    { id: 'story_dynasty_purge_asgardar', family: 'storyline', from: 'Asgardar', to: 'Dynasty Border Post' },
  ];

  for (const c of CASES) {
    describe(`${c.id} (${c.from} -> ${c.to})`, () => {
      it('the topology is still the one under test', () => {
        const arc = byId(c.id);
        const epi = arc.stages[arc.stages.length - 1]!;
        const climax = arc.stages[arc.stages.length - 2]!;
        expect(epi.checkKind).toBeNull();
        expect(climax.locationName).toBe(c.from);
        expect(epi.locationName).toBe(c.to);
      });

      it('⚠⚠ the aftermath narrates once, the arc completes, and NO travel is armed', async () => {
        const arc = byId(c.id);
        const epi = arc.stages[arc.stages.length - 1]!.narration;
        const r = await resolveAt(c.id, c.family, lastGatedIndex(arc), `C_${c.id}`.slice(0, 20));

        // the beat reached the player, exactly once
        expect(r.log).toContain(epi);
        expect(r.log.split(epi).length - 1).toBe(1);
        // the chain is complete, so turn-in opens
        expect(r.recAfter!.stage).toBe(arc.stages.length);
        // and nothing tried to send the player to its ground
        expectNoFalseTravel(r);
      });
    });
  }
});

// ── CASE 4 — same-ground controls, which were always correct ──────────────────
describe('OTA-1870 — same-ground aftermath is unchanged', () => {
  for (const id of ['story_dynasty_blood_aetherborn', 'story_builders_scripture_in_stone']) {
    it(`${id}: narrates once, completes, never routed before and still does not`, async () => {
      const arc = byId(id);
      const epi = arc.stages[arc.stages.length - 1]!.narration;
      const r = await resolveAt(id, 'storyline', lastGatedIndex(arc), `S_${id}`.slice(0, 20));
      expect(r.log).toContain(epi);
      expect(r.recAfter!.stage).toBe(arc.stages.length);
      expectNoFalseTravel(r);
    });
  }
});

// ── CASE 5 — THE OTHER SIDE OF THE CONTRACT ──────────────────────────────────
// ⚠⚠⚠ Without this, OTA-1870 could be "never route after advancement", which
// would be a far worse defect than the one it fixes.
describe('OTA-1870 — legitimate cross-ground routing still happens', () => {
  it('⚠⚠ an ACTIONABLE cross-ground next stage still arms travel and still says so', async () => {
    const arc = byId('mystery_ashen_codex');
    // stage 0 (Varakush, diplomacy) -> stage 1 (Nimari, investigate): a real objective.
    expect(arc.stages[0]!.locationName).toBe('Varakush');
    expect(arc.stages[1]!.locationName).toBe('Nimari');
    expect(arc.stages[1]!.checkKind).not.toBeNull();

    const r = await resolveAt('mystery_ashen_codex', 'mystery', 0, 'ActionableRoute');

    // the player IS being sent somewhere, and is told
    expect(r.travel).toBeDefined();
    expect(r.travel!.locationId).toBe('nimari');
    expect(r.log).toMatch(SET_COURSE);
    expect(r.log).toMatch(DISTANCE);
    // and the record moved to that actionable stage, not past it
    expect(r.recAfter!.stage).toBe(1);
  });
});

// ── CASE 6 — null aftermath followed by an actionable stage ───────────────────
describe('OTA-1870 — a consumed beat never becomes the destination, wherever it sits', () => {
  // ⚠ HONEST SCOPE: this topology does NOT exist in the shipped corpus — all 14
  // null stages are trailing, proven above. So there is no production claim to
  // make here. What IS provable is the rule the repair delegates to, which is
  // what would decide the answer the day such an arc is authored.
  it('the corpus contains no mid-chain null stage, so this shape is unauthored today', () => {
    const mid = ALL.flatMap(({ arc }) =>
      arc.stages.slice(0, -1).map((s, i) => (s.checkKind === null ? `${arc.id}#${i}` : null)).filter(Boolean));
    expect(mid).toEqual([]);
  });

  it('⚠ the routing selector skips consumable beats and lands on the actionable one', () => {
    const shape = [
      { checkKind: 'diplomacy' },  // 0 — A, the gated stage
      { checkKind: null },         // 1 — B, auto-consumed narration
      { checkKind: null },         // 2 — a second consumed beat
      { checkKind: 'investigate' },// 3 — C, the real objective
    ];
    expect(nextActionableStage(shape, 1)).toBe(3);
    // and when only aftermath remains, it reports "there is nothing left to route to"
    expect(nextActionableStage([{ checkKind: 'boss' }, { checkKind: null }], 1)).toBe(2);
  });

  it('⚠ the selector uses the SAME skip rule the consume loops use — verb alone', () => {
    // A null stage that names a person is still consumed mid-chain by the advance
    // loops (OTA-1583 settled this), so the router must agree and skip it too.
    expect(nextActionableStage([{ checkKind: 'boss' }, { checkKind: null, npcName: 'Vesryn' }, { checkKind: 'investigate' }], 1)).toBe(2);
  });
});

// ── CASE 7 — save / load ──────────────────────────────────────────────────────
describe('OTA-1870 — persistence', () => {
  it('⚠⚠ the aftermath does not replay and no stale course appears after reload', async () => {
    const arc = byId('mystery_ashen_codex');
    const epi = arc.stages[arc.stages.length - 1]!.narration;
    const r = await resolveAt('mystery_ashen_codex', 'mystery', lastGatedIndex(arc), 'PersistCase');

    const countEpi = () => r.store.getState().gameLog.filter((l) => l.text.includes(epi)).length;
    const seen = countEpi();
    expect(seen).toBe(1);

    await r.store.getState().persist();
    await r.store.getState().hydrate();

    // the hydration heal walks a record FORWARD past trailing nulls; this record
    // is already at stages.length, so that walk is a no-op and they agree.
    const rec = r.store.getState().player!.activeMysteries!.find((m) => m.id === 'mystery_ashen_codex');
    if (rec) expect(rec.stage).toBe(arc.stages.length);
    expect(countEpi()).toBe(seen);
    expect(r.store.getState().player!.travelTarget).toBeUndefined();
  });
});

// ── CASE 8 — an ordinary arc with no aftermath at all ─────────────────────────
describe('OTA-1870 — an ordinary mission is untouched', () => {
  it('an arc with no trailing aftermath completes exactly as before', async () => {
    const arc = byId('mystery_pale_signal');
    expect(arc.stages[arc.stages.length - 1]!.checkKind).not.toBeNull();
    const climax = arc.stages[arc.stages.length - 1]!.narration;

    const r = await resolveAt('mystery_pale_signal', 'mystery', arc.stages.length - 1, 'NoEpilogue');
    expect(r.log).toContain(climax);
    expect(r.recAfter!.stage).toBe(arc.stages.length);
    expect(r.log).toMatch(/Return to a posting agent to turn/i);
    // nothing follows, so nothing is routed to
    expect(r.travel).toBeUndefined();
  });
});
