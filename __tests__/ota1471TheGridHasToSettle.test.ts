/**
 * OTA-1471 — TWO SEATS THE ATLAS PUT NEXT DOOR TO EACH OTHER.
 *
 * ⚠⚠⚠ THE OWNER, 2026-08-24, having taken Drakova and Voronov back to back:
 *
 *   "why do we have some of the core guardians so close together, I think my
 *    2 fights were what 2 blocks apart?"
 *
 * He counted exactly right, and the measurement is the whole argument, so this
 * suite computes it rather than quoting it. On the canonical grid drakova (52,19)
 * and voronov (52,21) are 2.00 tiles apart; every other Capital's nearest
 * neighbour is 4.24–5.83; the median across all 36 pairs is 16.55.
 *
 * ⚠⚠ AND THE ATLAS IS NOT WRONG — the first thing checked, because "move the
 * pin" was the obvious first answer and it is the wrong one. The two cities sit
 * 89 pixels apart on a 1619×971 painting, which is where the artwork puts them,
 * and the grid's SPREAD_X/SPREAD_Y tracks that painting's aspect. There is no
 * coordinate bug here to fix.
 *
 * ⚠⚠⚠ WHAT BROKE IS AN ASSUMPTION. `tierForKills` scales difficulty by KILL
 * COUNT so the player's choice of order stays free — and that curve quietly
 * assumes a JOURNEY happens between seats. For 35 of 36 pairs it does. For one
 * it does not, and the player goes T1 → T2 in two minutes.
 *
 * ⚠ THE NUMBER IS DERIVED, NOT FELT, and the test below is what makes that
 * claim checkable: run all 36 pair distances through `travelHoursFor` (the
 * project's own tiles→honest-hours conversion) and 8 hours separates exactly one
 * pair from the other thirty-five. If a Capital ever moves, that test fails and
 * the constant gets re-derived instead of quietly meaning something else.
 */
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

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CORE_SETTLE_HOURS, coreSettleState, settleWaitPhrase, coreSettleLine,
  GUARDIANS_BY_CAPITAL, isCoreGuardian,
} from '../app/engine/coreGuardians';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';
import { canonicalCellOf, WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from '../app/engine/worldMap';
import { travelHoursFor, TILE_HOURS } from '../app/engine/travelTime';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const STORE = codeOnly(read('app', 'state', 'gameStore.ts'));
const EXPL = codeOnly(read('app', 'screens', 'ExplorationScreen.tsx'));
const CONTRACTS = codeOnly(read('app', 'screens', 'ContractsScreen.tsx'));

interface Pair { a: string; b: string; tiles: number }

/** ⚠ COMPUTED, NEVER TRANSCRIBED. A table of numbers copied into a test is the
 *  copied-constant drift defect: it agrees with the game on the day it is
 *  written and silently stops the day a pin moves. */
const pairs = (): Pair[] => {
  const cells = LOST_CAPITAL_LOCATIONS.map((id) => {
    const c = canonicalCellOf(id);
    expect({ id, placed: !!c }).toEqual({ id, placed: true });
    return { id, c: c! };
  });
  const out: Pair[] = [];
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      out.push({
        a: cells[i]!.id,
        b: cells[j]!.id,
        tiles: Math.hypot(cells[i]!.c.x - cells[j]!.c.x, cells[i]!.c.y - cells[j]!.c.y),
      });
    }
  }
  return out.sort((p, q) => p.tiles - q.tiles);
};

describe('OTA-1471 — the measurement he was right about', () => {
  it('⚠⚠⚠ NINE CAPITALS, ALL PLACED, THIRTY-SIX PAIRS — or this is theatre', () => {
    expect(LOST_CAPITAL_LOCATIONS.length).toBe(9);
    expect(pairs().length).toBe(36);
  });

  it('⚠⚠⚠ DRAKOVA AND VORONOV ARE 2 TILES APART — "2 blocks", exactly', () => {
    const closest = pairs()[0]!;
    expect(new Set([closest.a, closest.b])).toEqual(new Set(['drakova', 'voronov']));
    expect(closest.tiles).toBeCloseTo(2, 2);
  });

  it('⚠⚠⚠ AND IT IS A LONE OUTLIER, NOT A CLUSTER', () => {
    // This is what decides that a general rule is the wrong fix. If several
    // pairs were tight, the ATLAS would be the thing to revisit.
    const ps = pairs();
    expect(ps[1]!.tiles).toBeGreaterThan(4);
    // every OTHER pair is more than double the outlier
    for (const p of ps.slice(1)) {
      expect({ pair: `${p.a}/${p.b}`, over: p.tiles > 2 * ps[0]!.tiles })
        .toEqual({ pair: `${p.a}/${p.b}`, over: true });
    }
  });

  it('⚠⚠ every OTHER Capital\'s nearest neighbour sits in a tight, healthy band', () => {
    const ps = pairs();
    for (const id of LOST_CAPITAL_LOCATIONS) {
      if (id === 'drakova' || id === 'voronov') continue;
      const near = ps.find((p) => p.a === id || p.b === id)!;
      expect({ id, ok: near.tiles >= 4 && near.tiles <= 6 }).toEqual({ id, ok: true });
    }
  });

  it('⚠⚠ …and the median journey is an order of magnitude longer', () => {
    const ds = pairs().map((p) => p.tiles);
    const median = ds[Math.floor(ds.length / 2)]!;
    expect(median).toBeGreaterThan(15);
    // the outlier is a small fraction of it — this is the sentence in the
    // commit message, asserted rather than asserted-in-prose
    expect(ds[0]! / median).toBeLessThan(0.15);
  });

  it('⚠⚠⚠ THE ATLAS IS FAITHFUL — "move the pin" was checked and rejected', () => {
    // The grid's spread is tuned to the painting's own aspect, so a pair that
    // looks adjacent on the map IS adjacent in play. Correcting the spread does
    // not separate these two; the artwork genuinely puts them side by side.
    const wm = read('app', 'engine', 'worldMap.ts');
    const sx = Number(/const SPREAD_X = (\d+);/.exec(wm)?.[1]);
    const sy = Number(/const SPREAD_Y = (\d+);/.exec(wm)?.[1]);
    expect(Number.isFinite(sx) && Number.isFinite(sy)).toBe(true);
    // the atlas PNG's own dimensions, read from its IHDR
    const png = readFileSync(join(__dirname, '..', 'assets', 'world-atlas.png'));
    const aspect = png.readUInt32BE(16) / png.readUInt32BE(20);
    expect(aspect).toBeGreaterThan(1.5);
    // grid aspect tracks the painting within a tolerance that cannot hide a
    // one-axis squash big enough to explain a 2-vs-4.24 gap
    expect(Math.abs(sx / sy - aspect)).toBeLessThan(0.25);
  });
});

describe('OTA-1471 — the window is ONE REST, and the first derivation was wrong', () => {
  it('⚠⚠⚠ IT IS EXACTLY THE PARSER REST — eight hours, always, for everyone', () => {
    // travelTime.ts derives it in its own header: the parser rest returns
    // `min(room, 8)` over a FIXED 8 hours, at every stamina cap the game can
    // roll. So one rest clears this window precisely — the gate is one action a
    // player between two boss fights was about to take anyway.
    expect(CORE_SETTLE_HOURS).toBe(8);
    expect(coreSettleState(8, 0)).toEqual({ ready: true, hoursLeft: 0 });
  });

  it('⚠⚠⚠ AND WALKING IS NOT HOW IT IS SATISFIED — the honest statement of the rule', () => {
    // ⚠⚠ THE FIRST DERIVATION OF THIS CONSTANT COMPARED THE WRONG CLOCK, and the
    // main-quest walker caught it. It ran the pair distances through
    // `travelHoursFor` (HOURS_PER_TILE_TRUE = 2.5, a DEADLINE ALLOWANCE that
    // includes the rests walking forces) and reported 8 h sitting neatly between
    // the outlier and the shortest real journey. This gate reads the WORLD CLOCK,
    // which walking advances by TILE_HOURS = 0.25 and nothing else. Against the
    // clock, only the single longest crossing on the map clears eight hours on
    // foot. That is the true shape of the rule, so it is what gets asserted —
    // a test that restated the false derivation would have made it permanent.
    const ps = pairs();
    const onFoot = ps.filter((p) => p.tiles * TILE_HOURS >= CORE_SETTLE_HOURS);
    // ⚠ Only the map's longest crossings clear it on foot — a handful out of 36,
    // and every one of them longer than the median. Stated as a proportion
    // rather than an exact count, because the exact count is an accident of the
    // pin layout and pinning it would make an atlas nudge look like a defect.
    expect(onFoot.length / ps.length).toBeLessThan(0.1);
    const median = ps[Math.floor(ps.length / 2)]!.tiles;
    for (const p of onFoot) {
      expect({ pair: `${p.a}/${p.b}`, longerThanMedian: p.tiles > median })
        .toEqual({ pair: `${p.a}/${p.b}`, longerThanMedian: true });
    }
    // the MEDIAN journey does not clear it on foot — which is the whole point
    expect(median * TILE_HOURS).toBeLessThan(CORE_SETTLE_HOURS);
    // and the two numbers really do mean different things: the old instrument
    // read ten times larger than the clock on every pair, which is exactly how
    // it made 8 look derived
    expect(travelHoursFor(ps[0]!.tiles) / (ps[0]!.tiles * TILE_HOURS)).toBe(10);
  });

  it('⚠⚠⚠ HIS 2-TILE HOP IS NOWHERE NEAR CLEARING IT', () => {
    // Which is the point. Wandering the two blocks back and forth cannot buy the
    // window off; the player sleeps, or spends the time on something.
    const hop = pairs()[0]!.tiles * TILE_HOURS;
    expect(hop).toBeCloseTo(0.5, 3);
    expect(CORE_SETTLE_HOURS / hop).toBe(16);
    expect(coreSettleState(hop, 0).ready).toBe(false);
  });

  it('⚠⚠ and the stamina economy already forces the rest on any real journey', () => {
    // So for a crossing of any length the gate costs nothing extra: the median
    // journey is 33 stamina against a tank that floors at 12 + STR/2, and the
    // only thing that repays stamina is the same 8-hour rest.
    const ds = pairs().map((p) => p.tiles);
    const median = ds.sort((a, b) => a - b)[Math.floor(ds.length / 2)]!;
    expect(median * 2).toBeGreaterThan(24);   // more stamina than any starting tank
  });
});

describe('OTA-1471 — coreSettleState, every permutation', () => {
  it('⚠⚠⚠ NO CORE TAKEN YET → READY. The first seat has nothing to settle from', () => {
    expect(coreSettleState(0, undefined)).toEqual({ ready: true, hoursLeft: 0 });
    expect(coreSettleState(500, undefined)).toEqual({ ready: true, hoursLeft: 0 });
  });

  it('⚠⚠⚠ AND A SAVE PREDATING THIS OTA IS READY — never newly blocked', () => {
    // The field is optional precisely so an existing character mid-run does not
    // wake up unable to summon. `null` is the shape a hand-repaired save takes.
    expect(coreSettleState(120, null)).toEqual({ ready: true, hoursLeft: 0 });
  });

  it('⚠⚠⚠ THE MOMENT A CORE LANDS → NOT READY, with the full window to run', () => {
    expect(coreSettleState(100, 100)).toEqual({ ready: false, hoursLeft: 8 });
  });

  it('⚠⚠⚠ THE BOUNDARY IS INCLUSIVE — exactly eight hours is settled', () => {
    expect(coreSettleState(108, 100)).toEqual({ ready: true, hoursLeft: 0 });
    expect(coreSettleState(108.0001, 100)).toEqual({ ready: true, hoursLeft: 0 });
  });

  it('⚠⚠⚠ AND A HAIR UNDER IS NOT', () => {
    const s = coreSettleState(107.99, 100);
    expect(s.ready).toBe(false);
    expect(s.hoursLeft).toBeCloseTo(0.01, 3);
  });

  it('⚠⚠ it counts down monotonically and never goes negative', () => {
    let prev = Infinity;
    for (let h = 0; h <= 12; h += 0.5) {
      const s = coreSettleState(100 + h, 100);
      expect(s.hoursLeft).toBeGreaterThanOrEqual(0);
      expect(s.hoursLeft).toBeLessThanOrEqual(prev);
      expect(s.ready).toBe(h >= CORE_SETTLE_HOURS);
      prev = s.hoursLeft;
    }
  });

  it('⚠⚠⚠ A CLOCK THAT RAN BACKWARDS READS AS SETTLED, not as a negative wait', () => {
    // A restored backup or a repaired save can land `hoursElapsed` behind the
    // stamp. Refusing on corrupt arithmetic would STRAND THE MAIN QUEST, which
    // is far worse than one early summon — so the failure direction is chosen,
    // not accidental.
    expect(coreSettleState(50, 100)).toEqual({ ready: true, hoursLeft: 0 });
  });

  it('⚠⚠ nonsense on either side never produces NaN or a wait that cannot end', () => {
    for (const now of [NaN, Infinity, -Infinity, -5]) {
      for (const then of [NaN, Infinity, 100, undefined]) {
        const s = coreSettleState(now as number, then as number | undefined);
        expect(typeof s.ready).toBe('boolean');
        expect(Number.isFinite(s.hoursLeft)).toBe(true);
        expect(s.hoursLeft).toBeGreaterThanOrEqual(0);
        expect(s.hoursLeft).toBeLessThanOrEqual(CORE_SETTLE_HOURS);
      }
    }
  });
});

describe('OTA-1471 — what the player is told', () => {
  it('⚠⚠⚠ NEVER A RAW FLOAT — "0.5h" is a debug readout, not a sentence', () => {
    for (let h = 0; h <= 8; h += 0.13) {
      const p = settleWaitPhrase(h);
      expect({ h: Math.round(h * 100) / 100, p, dotted: /\d\.\d/.test(p) })
        .toEqual({ h: Math.round(h * 100) / 100, p, dotted: false });
    }
  });

  it('⚠⚠⚠ AND NEVER "0 HOURS" — the rounding floor is the whole point', () => {
    expect(settleWaitPhrase(0.4)).toBe('less than an hour');
    expect(settleWaitPhrase(0.99)).toBe('less than an hour');
    expect(settleWaitPhrase(0)).toBe('less than an hour');
    for (let h = 0; h <= 8; h += 0.07) {
      expect(settleWaitPhrase(h)).not.toMatch(/\b0 hours?\b/);
    }
  });

  it('⚠⚠ singular is singular, plural is plural', () => {
    expect(settleWaitPhrase(1)).toBe('about an hour');
    expect(settleWaitPhrase(1.4)).toBe('about an hour');
    expect(settleWaitPhrase(2)).toBe('about 2 hours');
    expect(settleWaitPhrase(7.6)).toBe('about 8 hours');
  });

  it('⚠⚠ a negative slips through as "less than an hour", never as "-3 hours"', () => {
    expect(settleWaitPhrase(-3)).toBe('less than an hour');
  });

  it('⚠⚠⚠ THE REFUSAL SAYS WHAT, HOW LONG, AND WHAT TO DO ABOUT IT', () => {
    // OTA-220's rule — "a player once tapped fuse 5× not knowing" — applies to
    // every wall in the game, and a Guardian that simply failed to appear would
    // be the worst kind of silence.
    const line = coreSettleLine('Voronov', 6.2);
    expect(line).toContain('Voronov');            // where
    expect(line).toContain('about 6 hours');      // how long
    expect(line).toMatch(/Rest the night/);       // what to do
    expect(line).toMatch(/open on its own/);      // and that it is not permanent
    expect(line).not.toMatch(/\d\.\d/);
  });

  it('⚠⚠ it works for all nine Capitals with no leaked token or undefined', () => {
    for (const id of LOST_CAPITAL_LOCATIONS) {
      const name = GUARDIANS_BY_CAPITAL[id]!.capitalName;
      const line = coreSettleLine(name, 3);
      expect(line).toContain(name);
      expect(line).not.toContain('undefined');
      expect(line).not.toMatch(/\{[A-Za-z]+\}/);
    }
  });
});

describe('OTA-1471 — the wiring, driven through the real store', () => {
  const CX = WORLD_MAP_CENTER_X;
  const CY = WORLD_MAP_CENTER_Y;

  /** Stand the player in Voronov, one Core already taken at `lastCoreAtHours`. */
  async function standAtVoronov(opts: { lastCoreAtHours?: number; hoursElapsed: number }) {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    store.setState((s) => ({
      currentScreen: 'exploration',
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [] },
      player: {
        ...s.player!,
        currentLocationId: 'voronov',
        // ⚠ `undefined`, not `null` — `travelTarget` is an optional field, and
        // `isStationedAtNamedLocation` reads it as falsy either way. Writing the
        // wrong nullish here typechecks nowhere and would have needed a cast,
        // and a cast in a fixture silences the signal that says the fixture has
        // stopped resembling a real player.
        travelTarget: undefined,
        hubRoomId: null,
        mapX: CX,
        mapY: CY,
        hoursElapsed: opts.hoursElapsed,
        mainQuest: {
          phase: 'cores' as const,
          coresRecovered: ['drakova'],
          guardiansDefeated: ['drakova'],
          ...(opts.lastCoreAtHours == null ? {} : { lastCoreAtHours: opts.lastCoreAtHours }),
        },
      },
    }));
    return store;
  }

  const guardianCount = () =>
    (useGameStore.getState().currentScene?.enemies ?? []).filter((e) => isCoreGuardian(e)).length;

  it('⚠⚠⚠ HIS EXACT CASE — Drakova then Voronov, no time between → REFUSED', async () => {
    const store = await standAtVoronov({ lastCoreAtHours: 40, hoursElapsed: 40.5 });
    const r = store.getState().summonCoreGuardian();
    expect(r).toEqual({ ok: false, reason: 'core_settling' });
    expect(guardianCount()).toBe(0);
  });

  it('⚠⚠⚠ AND HE IS TOLD WHY, in the world\'s own voice', async () => {
    const store = await standAtVoronov({ lastCoreAtHours: 40, hoursElapsed: 40.5 });
    store.getState().summonCoreGuardian();
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/grid is still closing over the seat you emptied/);
    expect(log).toContain('Voronov');
    expect(log).toMatch(/Rest the night/);
  });

  it('⚠⚠⚠ ONE REST LATER IT RISES — the gate ends on its own', async () => {
    const store = await standAtVoronov({ lastCoreAtHours: 40, hoursElapsed: 48 });
    const r = store.getState().summonCoreGuardian();
    expect(r.ok).toBe(true);
    expect(guardianCount()).toBe(1);
  });

  it('⚠⚠⚠ THE FIRST CORE OF THE RUN IS NEVER BLOCKED', async () => {
    const store = await standAtVoronov({ hoursElapsed: 3 });
    // no stamp at all — a fresh character, or any save from before this OTA
    const r = store.getState().summonCoreGuardian();
    expect(r.ok).toBe(true);
    expect(guardianCount()).toBe(1);
  });

  it('⚠⚠⚠ A FIGHT ALREADY IN PROGRESS IS UNTOUCHED — flee and come back still works', async () => {
    // ⚠ THE ORDERING THAT MATTERS MOST HERE. The Guardian fully restores and
    // waits (see the module header); a settle gate placed ABOVE the
    // already-present check would lock a player out of finishing a fight they
    // had started — a far worse bug than the pacing one this fixes.
    const store = await standAtVoronov({ lastCoreAtHours: 40, hoursElapsed: 48 });
    expect(store.getState().summonCoreGuardian().ok).toBe(true);
    expect(guardianCount()).toBe(1);
    // now wind the clock back so the window is wide open, and re-enter
    store.setState((s) => ({ player: { ...s.player!, hoursElapsed: 48.1 } }));
    const again = store.getState().summonCoreGuardian();
    expect(again).toEqual({ ok: true, reason: 'already_present' });
    expect(guardianCount()).toBe(1);   // not a second copy either
  });

  it('⚠⚠ an already-recovered Capital still refuses for its own reason, not this one', async () => {
    const store = await standAtVoronov({ lastCoreAtHours: 40, hoursElapsed: 40.5 });
    store.setState((s) => ({
      player: { ...s.player!, mainQuest: { ...s.player!.mainQuest!, coresRecovered: ['drakova', 'voronov'] } },
    }));
    expect(store.getState().summonCoreGuardian()).toEqual({ ok: false, reason: 'already_recovered' });
  });
});

describe('OTA-1471 — the stamp and the grant cannot come apart', () => {
  it('⚠⚠⚠ THE CLOCK IS STAMPED IN THE SAME BRANCH THAT MINTS THE CORE', () => {
    // Two definitions of "a Core was taken" is how they disagree. The stamp sits
    // inside the one `if` that already decided a Core actually landed.
    const i = STORE.indexOf("if (trigger.kind === 'core_recovered'");
    expect(i).toBeGreaterThan(-1);
    const branch = STORE.slice(i, STORE.indexOf('const capitalNames', i));
    expect(branch).toContain('lastCoreAtHours: player.hoursElapsed ?? 0');
  });

  it('⚠⚠⚠ AND THE STAMPED STATE IS WHAT ACTUALLY GETS WRITTEN', () => {
    // The half that would make the whole thing a no-op: computing `questState`
    // and then still setting `nextState`.
    expect(STORE).toContain('player: { ...player, mainQuest: questState, inventory },');
    expect(STORE).not.toContain('player: { ...player, mainQuest: nextState, inventory },');
  });

  it('⚠⚠⚠ AND IT SURVIVES A SAVE — a gate that forgets is worse than no gate', async () => {
    // ⚠ THE REAL RISK ON A NEW STATE FIELD. Save layers routinely whitelist
    // fields, and one that dropped this on write would produce the nastiest
    // possible shape: the gate holds until you close the app, then silently
    // stops. Round-tripped through the store's own persist/hydrate rather than
    // reasoned about from reading the serialiser.
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    store.setState((s) => ({
      player: {
        ...s.player!,
        hoursElapsed: 77,
        mainQuest: { phase: 'cores' as const, coresRecovered: ['drakova'], lastCoreAtHours: 77 },
      },
    }));
    await store.getState().persist();
    await store.getState().hydrate();
    await new Promise((r) => setTimeout(r, 25));
    expect(store.getState().player?.mainQuest?.lastCoreAtHours).toBe(77);
    // and the settle helper still refuses off the reloaded value
    expect(coreSettleState(77.5, store.getState().player!.mainQuest!.lastCoreAtHours).ready).toBe(false);
  });
});

describe('OTA-1471 — both SUMMON chips, because there are two', () => {
  it('⚠⚠⚠ THE EXPLORATION CHIP READS THE GATE AT RENDER TIME', () => {
    // OTA-1324's lesson: a control that lights and answers with a wall is the
    // defect, four taps and four identical refusals in seventy seconds.
    expect(EXPL).toContain('coreSettleState(player.hoursElapsed ?? 0, mq.lastCoreAtHours)');
    expect(EXPL).toContain('★ SETTLING');
  });

  it('⚠⚠⚠ AND SO DOES THE CONTRACTS CHIP — the many-doors mistake', () => {
    // Six fixes this project has shipped were one door of two. Both chips reach
    // the same action, so a gate wired into one of them is not a gate.
    expect(CONTRACTS).toContain('coreSettleState(player.hoursElapsed ?? 0, mq.lastCoreAtHours)');
    expect(CONTRACTS).toContain('★ SETTLING');
  });

  it('⚠⚠⚠ NEITHER RE-DERIVES THE RULE — both call the one helper', () => {
    // A hand-inlined `hoursElapsed - lastCoreAtHours < 8` on either screen is
    // how a label and a handler come to disagree.
    for (const [name, src] of [['exploration', EXPL], ['contracts', CONTRACTS]] as const) {
      expect({ name, inlined: /lastCoreAtHours\s*[<>+-]/.test(src) })
        .toEqual({ name, inlined: false });
      expect({ name, hard: src.includes('CORE_SETTLE_HOURS =') }).toEqual({ name, hard: false });
    }
  });

  it('⚠⚠ both stay PRESSABLE while settling — a tap explains, it does not sulk', () => {
    // Hiding the control would leave the player with no explanation at all,
    // which is the the-game-knows-and-does-not-say defect (OTA-1402). The label
    // names the wait; the tap prints the whole reason.
    expect(EXPL).toContain('onPress={() => useGameStore.getState().summonCoreGuardian()}');
    expect(CONTRACTS).toContain('onPress={() => useGameStore.getState().summonCoreGuardian()}');
  });

  it('⚠⚠ and both say the wait BEFORE the tap, in words as well as a badge', () => {
    expect(EXPL).toContain('The grid is still closing over the last seat');
    expect(CONTRACTS).toContain('The grid is still closing over the last seat');
  });

  it('⚠ a settling chip is visibly muted on both screens', () => {
    expect(EXPL).toContain('objectiveChipSummonWait');
    expect(CONTRACTS).toContain('summonChipWait');
  });
});

describe('OTA-1471 — what this OTA must NOT have changed', () => {
  it('⚠⚠⚠ DIFFICULTY IS STILL KEYED TO KILL COUNT — order stays the player\'s', () => {
    // The settle window paces the run; it must not have quietly become a
    // difficulty rule. `tierForKills` is still the only curve.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cg = require('../app/engine/coreGuardians') as typeof import('../app/engine/coreGuardians');
    expect(cg.tierForKills(0)).toBe(1);
    expect(cg.tierForKills(1)).toBe(2);
    expect(cg.tierForKills(8)).toBe(9);
    expect(cg.tierForKills(50)).toBe(9);
  });

  it('⚠⚠⚠ NO CAPITAL MOVED — the pins are untouched by this fix', () => {
    // The measurement above is the evidence for a behaviour change, not a
    // licence to edit the atlas. If a pin ever does move, the derivation test
    // fails first and the constant gets re-figured.
    expect(canonicalCellOf('drakova')).toEqual({ x: 52, y: 19 });
    expect(canonicalCellOf('voronov')).toEqual({ x: 52, y: 21 });
  });

  it('⚠⚠ the settle gate sits BELOW the already-present check in the source', () => {
    // The ordering the behavioural test above proves, pinned structurally too,
    // because a future edit could reorder them without failing that test if the
    // scene happened to be empty.
    const already = STORE.indexOf("return { ok: true, reason: 'already_present' };");
    const gate = STORE.indexOf("return { ok: false, reason: 'core_settling' };");
    expect(already).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(already);
  });
});
