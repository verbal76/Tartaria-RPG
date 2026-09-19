/* ⚠⚠⚠ STOCHASTIC DEBT #54 — A FIXED SEED IS NOT A REPLAYABLE ONE.
 *
 * The harness has seeded `Math.random` since OTA-1831 and reseeds before every
 * test. That made runs REPEATABLE. It never made a failure REPLAYABLE, and the
 * difference is the whole debt:
 *
 *   · the seed was a hardcoded constant with no override, so it could not be
 *     varied for a multi-seed invariant, could not be printed in a failure, and
 *     could not be typed back to reproduce one;
 *   · `playerWalkerSim` builds ONE world in `beforeAll` and every scenario
 *     inherits what the scenarios before it left, while the per-test reseed
 *     restarts only the DICE. So a scenario's walk is a function of its PREFIX,
 *     not of the seed alone.
 *
 * ⚠ MEASURED AT c94e3ebc, BEFORE THIS PASS, not reasoned about.
 * `whisper:nessa_fungus`, same hardcoded seed, two different walks:
 *
 *     full run              Nessa camps 4 tiles away (3 south, 1 EAST) · 60 taps
 *     PLAYER_WALKER_ONLY    Nessa camps 4 tiles away (3 south, 1 WEST) · 34 taps
 *
 * Both are legitimate walks of that mission. Only one of them is the walk that
 * would have broken, and before this repair the harness pointed a reader at the
 * other one.
 *
 * ⚠ AND THE SEED WAS ONLY THE FIRST OF FOUR. Closing it exposed the next, and
 * each of those was invisible until the one above it was shut:
 *
 *     §A  the seed was not addressable — nothing to print, nothing to type back
 *     §H  the WORLD was positioned by the tree's BYTES: `beforeAll` runs before
 *         any `beforeEach`, so it drew from wherever module import left the
 *         cursor (1,029 / 1,106 / 1,254 taps for the same scenario, by cursor)
 *     §I  the world then advanced on the WALL CLOCK: hydrate arms a 5-second
 *         interval that fires ~200 times across a catalogue walk
 *     §J  and `settle()` DECIDED on a clock deadline, so the same command gave
 *         1,060 taps and then 785 — a coin toss whose coin was the CPU
 *
 * With all four shut, three consecutive prefix replays are byte-identical and
 * the prefix replay reproduces the full run byte for byte — measured over the
 * first six scenarios of an 89-scenario run that walked clean, and again over
 * the twenty scenarios preceding a deliberately planted break, whose printed
 * command reproduced both the walk and the break.
 *
 * ⚠⚠⚠ THE RESIDUAL, NAMED RATHER THAN HIDDEN — HEAVY CONCURRENT LOAD.
 *
 * PRODUCTION reads the wall clock by design, and the walker inherits it. Six
 * gates decide product behaviour by elapsed real time: the vendor warm settle
 * (2.5 s), the flourish generation cooldown (45 s), the burst window (5 s), the
 * stealth-hint minimum (120 s), the tutorial nudge quiet period (6 s), and the
 * per-location hours-since-last-visit. On a quiet machine the per-tap timings
 * are reproducible enough that all six land in the same places — that is what
 * the byte-identical replays above are measuring. Under heavy concurrent load
 * they do not: a full run deliberately competed against six jest workers and
 * three typechecks diverged from the quiet baseline in 77 of 89 scenarios,
 * starting at the exact scenario where the load began.
 *
 * ⚠ THAT IS NOT REPAIRED HERE, and the reason is the firewall. Freezing those
 * gates from the harness would delete the behaviour the walker exists to walk.
 * The complete fix is a harness-level deterministic clock — `Date.now` advanced
 * by a fixed amount per tap — which changes what EVERY time-gated product path
 * sees, so it belongs to its own pass with an owner ruling behind it, not to a
 * reproducibility repair that was asked to leave production alone.
 *
 * ⚠ WHAT WAS NOT DONE, AND WHY. Isolating every scenario onto a fresh world
 * would make replay trivial and would delete what the walker is for — walking
 * the catalogue the way a player accumulates it. The exact state is reproduced
 * by replaying the same ordered PREFIX under the same seed
 * (`PLAYER_WALKER_UPTO`), which changes nothing about how the full run behaves.
 * Production randomness is untouched: no probability, no distribution, no draw
 * count in `app/` moved for this. */
/* ⚠ The same native mocks `playerWalkerSim` carries. This file imports the
 * walker helpers, which reach the store, which reaches AsyncStorage — importing
 * them without these is a suite that fails to load rather than a suite that
 * disagrees. */
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

import fs from 'fs';
import path from 'path';
import {
  walkerBaseSeed, walkerDefaultSeed, walkerRunMode, walkerSeedToken, replayBlock, formatReport,
  type WalkReport,
} from '../test-utils/playerWalker';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** OTA-1847's rule: a comment that QUOTES code must not satisfy a code claim. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const SETUP = read('jest.setup.js');
const SETUP_CODE = codeOnly(SETUP);
const SIM_CODE = codeOnly(read('__tests__/playerWalkerSim.test.ts'));
const WALKER_CODE = codeOnly(read('test-utils/playerWalker.ts'));
const RNG_CODE = codeOnly(read('app/engine/rng.ts'));

type Harness = {
  __TARTARIA_TEST_SEED__?: number;
  __TARTARIA_DEFAULT_TEST_SEED__?: number;
  __TARTARIA_PARSE_TEST_SEED__?: (raw: unknown) => number;
  __TARTARIA_RESEED_RANDOM__?: () => void;
  __TARTARIA_SET_RANDOM_SEED_FOR_TEST__?: (seed: number | string) => void;
};
const H = globalThis as Harness;

const draws = (n: number): number[] => Array.from({ length: n }, () => Math.random());

/** Restore the run's own seed after any test that moved the cursor. */
afterEach(() => { H.__TARTARIA_RESEED_RANDOM__?.(); });

/* ══════════════════════════════════════════════════════════════════════════ */
describe('debt #54 §A — the seed is addressable, and its default has not moved', () => {
  test('A1 the harness publishes the seed it actually ran on', () => {
    expect(typeof H.__TARTARIA_TEST_SEED__).toBe('number');
    expect(typeof H.__TARTARIA_DEFAULT_TEST_SEED__).toBe('number');
    expect(walkerBaseSeed()).toBe(H.__TARTARIA_TEST_SEED__);
  });

  /* ⚠ THE BACKWARD-COMPATIBILITY PIN. Every other suite in this repo draws its
   * sequence from this constant. If the default moves, thousands of seeded
   * expectations move with it — so the number is asserted, not assumed. */
  test('A2 the default seed is still 0x74617274', () => {
    expect(walkerDefaultSeed()).toBe(0x74617274);
  });

  test('A3 with no override the run uses the default — unchanged behaviour', () => {
    if (process.env.TARTARIA_TEST_SEED) {
      // This file is itself running under an override; then the contract is the
      // opposite one, and it is still a contract.
      expect(walkerBaseSeed()).toBe(H.__TARTARIA_PARSE_TEST_SEED__!(process.env.TARTARIA_TEST_SEED));
      return;
    }
    expect(walkerBaseSeed()).toBe(walkerDefaultSeed());
  });

  test('A4 the override is read from the environment, with the default as fallback', () => {
    expect(SETUP_CODE).toMatch(/process\.env\.TARTARIA_TEST_SEED/);
    expect(SETUP_CODE).toMatch(/__DEFAULT_SEED\s*=\s*0x74617274/);
  });

  /* ⚠ A PARSER THAT TURNS JUNK INTO 0 WOULD MAKE EVERY "replayed with the seed
   * from the failure" CLAIM A LIE — it would silently replay a different run. */
  test.each([
    ['0x1234abcd', 0x1234abcd],
    ['0X1234ABCD', 0x1234abcd],
    ['305441741', 305441741],
    ['  0xff  ', 0xff],
  ])('A5 parses %s', (raw, want) => {
    expect(H.__TARTARIA_PARSE_TEST_SEED__!(raw)).toBe(want >>> 0);
  });

  test.each([[''], ['   '], ['not-a-seed'], [undefined], [null], [{}]])(
    'A6 unparseable input %p falls back to the default rather than to zero',
    (raw) => {
      expect(H.__TARTARIA_PARSE_TEST_SEED__!(raw)).toBe(0x74617274);
    },
  );

  test('A7 the token a failure prints is round-trippable', () => {
    expect(walkerSeedToken(0x74617274)).toBe('0x74617274');
    expect(H.__TARTARIA_PARSE_TEST_SEED__!(walkerSeedToken(0x1234abcd))).toBe(0x1234abcd);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('debt #54 §B — same seed same dice, different seed may diverge', () => {
  test('B1 the same seed replays the same sequence', () => {
    H.__TARTARIA_SET_RANDOM_SEED_FOR_TEST__!(0x74617274);
    const first = draws(64);
    H.__TARTARIA_SET_RANDOM_SEED_FOR_TEST__!(0x74617274);
    expect(draws(64)).toEqual(first);
  });

  test('B2 a different seed is ALLOWED to diverge — and does', () => {
    H.__TARTARIA_SET_RANDOM_SEED_FOR_TEST__!(0x74617274);
    const a = draws(64);
    H.__TARTARIA_SET_RANDOM_SEED_FOR_TEST__!(0x1234abcd);
    const b = draws(64);
    expect(b).not.toEqual(a);
  });

  /* ⚠ AN INVARIANT ACROSS MANY SEEDS, which is the shape §8 asks for: not "this
   * random outcome happens" but "whatever the dice say, this stays true". */
  test('B3 across 32 seeds every draw stays in [0,1) and the stream never repeats itself', () => {
    for (let s = 1; s <= 32; s++) {
      H.__TARTARIA_SET_RANDOM_SEED_FOR_TEST__!(s * 0x9e3779b1);
      const seq = draws(256);
      expect(seq.every((v) => v >= 0 && v < 1)).toBe(true);
      // A constant generator would satisfy "same seed same result" and prove
      // nothing; a real stream does not stand still.
      expect(new Set(seq).size).toBeGreaterThan(200);
    }
  });

  test('B4 the reseed hook returns the cursor to THIS run’s seed, not to a literal', () => {
    H.__TARTARIA_SET_RANDOM_SEED_FOR_TEST__!(0x0badc0de);
    H.__TARTARIA_RESEED_RANDOM__!();
    const afterReseed = draws(8);
    H.__TARTARIA_SET_RANDOM_SEED_FOR_TEST__!(walkerBaseSeed());
    expect(draws(8)).toEqual(afterReseed);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('debt #54 §C — replay does not leak between tests', () => {
  /* Two tests, the same claim. The per-test reseed is what makes the second one
   * start where the first one did; without it, ordering would be an input. */
  const FIRST_EIGHT: number[] = [];
  test('C1 records the first draws of a test', () => {
    FIRST_EIGHT.push(...draws(8));
    expect(FIRST_EIGHT).toHaveLength(8);
    // burn the cursor well past where the next test will start
    draws(5_000);
  });

  test('C2 the next test starts from the same place despite C1 burning 5,000 draws', () => {
    expect(draws(8)).toEqual(FIRST_EIGHT);
  });

  test('C3 the reseed is registered where hooks exist, not in setupFiles', () => {
    expect(codeOnly(read('jest.teardown.js'))).toMatch(/__TARTARIA_RESEED_RANDOM__/);
    expect(SETUP_CODE).toMatch(/globalThis\.__TARTARIA_RESEED_RANDOM__\s*=/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('debt #54 §D — a break prints one command that reproduces it', () => {
  const broken: WalkReport = {
    family: 'whisper', id: 'nessa_fungus', title: "Nessa's Cold Light",
    outcome: 'broken', breaks: ['the dice roller never closed'], allowances: [], stages: [], taps: 3,
  };
  const clean: WalkReport = { ...broken, outcome: 'complete', breaks: [] };

  test('D1 the block names the seed, the scenario, the mode and the command', () => {
    const b = replayBlock('whisper', 'nessa_fungus').join('\n');
    expect(b).toContain(walkerSeedToken());
    expect(b).toContain('whisper:nessa_fungus');
    expect(b).toMatch(/mode:\s+(full|prefix|isolated)/);
    expect(b).toMatch(/replay:\s+TARTARIA_TEST_SEED=/);
  });

  /* ⚠ THE COMMAND MUST BE UPTO, NEVER ONLY. ONLY reproduces the MISSION against
   * a fresh world; UPTO reproduces the WALK. Printing ONLY would hand a reader
   * a different run and call it a replay — the defect this whole file closes. */
  test('D2 the replay command uses the prefix door, not the isolating one', () => {
    const b = replayBlock('whisper', 'nessa_fungus').join('\n');
    expect(b).toMatch(/PLAYER_WALKER_UPTO=whisper:nessa_fungus/);
    expect(b).not.toMatch(/replay:.*PLAYER_WALKER_ONLY/);
  });

  test('D3 a BROKEN report carries the replay block', () => {
    expect(formatReport(broken)).toContain('── replay ──');
    expect(formatReport(broken)).toContain('PLAYER_WALKER_UPTO=whisper:nessa_fungus');
  });

  test('D4 a CLEAN report does not — 89 green walks must not bury the one break', () => {
    expect(formatReport(clean)).not.toContain('── replay ──');
  });

  test.each([
    [{ PLAYER_WALKER_UPTO: 'whisper:nessa_fungus' }, 'prefix'],
    [{ PLAYER_WALKER_ONLY: 'whisper:nessa_fungus' }, 'isolated'],
    [{}, 'full'],
  ])('D5 the mode reported for %p is %s', (env, want) => {
    const upto = process.env.PLAYER_WALKER_UPTO;
    const only = process.env.PLAYER_WALKER_ONLY;
    try {
      delete process.env.PLAYER_WALKER_UPTO;
      delete process.env.PLAYER_WALKER_ONLY;
      Object.assign(process.env, env);
      expect(walkerRunMode()).toBe(want);
    } finally {
      delete process.env.PLAYER_WALKER_UPTO;
      delete process.env.PLAYER_WALKER_ONLY;
      if (upto !== undefined) process.env.PLAYER_WALKER_UPTO = upto;
      if (only !== undefined) process.env.PLAYER_WALKER_ONLY = only;
    }
  });

  test('D6 a sequence-dependent walk SAYS so, so ONLY is not mistaken for a replay', () => {
    const upto = process.env.PLAYER_WALKER_UPTO;
    const only = process.env.PLAYER_WALKER_ONLY;
    try {
      delete process.env.PLAYER_WALKER_UPTO;
      delete process.env.PLAYER_WALKER_ONLY;
      const b = replayBlock('whisper', 'nessa_fungus').join('\n');
      expect(b).toContain('sequence-dependent');
      expect(b).toContain('PLAYER_WALKER_ONLY reproduces the MISSION, not this WALK');
    } finally {
      if (upto !== undefined) process.env.PLAYER_WALKER_UPTO = upto;
      if (only !== undefined) process.env.PLAYER_WALKER_ONLY = only;
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('debt #54 §E — the prefix door is wired, and a mistyped target is loud', () => {
  test('E1 the suite builds its order from the three families in registration order', () => {
    const i = SIM_CODE.indexOf('const ORDER');
    expect(i).toBeGreaterThan(-1);
    const block = SIM_CODE.slice(i, i + 400);
    expect(block.indexOf('ALL_MISSIONS')).toBeGreaterThan(-1);
    expect(block.indexOf('ALL_MISSIONS')).toBeLessThan(block.indexOf('ALL_FACTION_QUESTS'));
    expect(block.indexOf('ALL_FACTION_QUESTS')).toBeLessThan(block.indexOf('ALL_WHISPER_CHAINS'));
  });

  test('E2 UPTO selects the prefix — every scenario at or before the target', () => {
    expect(SIM_CODE).toMatch(/ORDER\.indexOf\(key\)\s*<=\s*UPTO_INDEX/);
  });

  /* ⚠ A replay that walks NOTHING reads as green, which is worse than one that
   * fails. A target that does not resolve registers its own failing test. */
  test('E3 a mistyped UPTO target fails loudly instead of walking zero scenarios', () => {
    expect(SIM_CODE).toMatch(/UPTO_INDEX\s*>=\s*0/);
    expect(SIM_CODE).toMatch(/PLAYER_WALKER_UPTO target resolves to a real scenario/);
  });

  test('E4 all three families route through the one selector', () => {
    expect((SIM_CODE.match(/selected\(`/g) ?? []).length).toBe(3);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('debt #54 §F — the rotation cursors, ruled with evidence rather than reset', () => {
  /* ⚠⚠⚠ THE RULING, AND IT IS A REFUSAL TO CHANGE ANYTHING.
   *
   * `app/engine/rng.ts` keeps module-level `rotatingPick` cursors that the
   * per-test reseed does not touch, and `resetRotationCursors()` is called by no
   * walker harness. That looked like a fourth nondeterminism source. It is not
   * one worth resetting, for two measured reasons:
   *
   *   1. every production caller feeds a PROSE pool — Arbiter remarks,
   *      investigation flavour, voice lines. No cursor picks a ground, a
   *      distance, an arrival hour, an enemy or a drop.
   *   2. prefix replay reproduces them EXACTLY anyway: the same ordered prefix
   *      makes the same calls in the same order, so the cursors arrive at the
   *      same place. They are reproduced state, not uncontrolled state.
   *
   * Resetting them per test would CHANGE which sentences 89 existing walks print
   * — a behavioural edit to a green suite, bought for no reproducibility. So the
   * cursors are left exactly as they are, and this section pins the reasoning so
   * the next pass does not "fix" it. */
  test('F1 rotatingPick feeds prose pools only — no cursor decides a walk', () => {
    const callers = new Set<string>();
    for (const f of ['app/engine/narrativeGenerator.ts', 'app/engine/investigationTable.ts',
      'app/engine/voicePools.ts', 'app/state/gameStore.ts']) {
      if (/rotatingPick\(/.test(codeOnly(read(f)))) callers.add(f);
    }
    expect(callers.size).toBeGreaterThan(0);
    // The authorities a walk actually turns on must not consult a cursor.
    for (const f of ['app/engine/encounter.ts', 'app/engine/worldLadder.ts', 'app/engine/bonusDrops.ts']) {
      expect(codeOnly(read(f))).not.toMatch(/rotatingPick\(/);
    }
  });

  test('F2 the cursors are deterministic given the same call sequence', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { rotatingPick, resetRotationCursors } = require('../app/engine/rng');
    const pool = ['a', 'b', 'c', 'd'];
    resetRotationCursors();
    const first = Array.from({ length: 12 }, () => rotatingPick(pool, 'debt54.probe'));
    resetRotationCursors();
    expect(Array.from({ length: 12 }, () => rotatingPick(pool, 'debt54.probe'))).toEqual(first);
  });

  test('F3 the walker harness deliberately does NOT reset them', () => {
    expect(SIM_CODE).not.toMatch(/resetRotationCursors/);
    expect(WALKER_CODE).not.toMatch(/resetRotationCursors/);
    expect(SETUP_CODE).not.toMatch(/resetRotationCursors/);
    // and the production reset still exists for the suites that do want it
    expect(RNG_CODE).toMatch(/export function resetRotationCursors/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('debt #54 §H — the world starts from the seed, not from the byte layout', () => {
  /* ⚠⚠⚠ THE SECOND HALF OF THE OTA-1831 LANDMINE, AND THE REASON A REPLAY TOKEN
   * IS WORTH ANYTHING.
   *
   * OTA-1831 moved the re-seed into a `beforeEach` so a TEST's dice stopped
   * depending on how many times the loaded modules drew at import. `beforeAll`
   * runs BEFORE any `beforeEach`, so the one world the walker builds there kept
   * drawing from wherever import left the cursor — and that position is a
   * function of the source-map shape of the loaded tree.
   *
   * ⚠ MEASURED ON THIS TREE, replaying `hunt:hunt_bog_dragon` under the identical
   * seed, taps to completion:
   *
   *     cursor moved before beforeAll   reseed absent   reseed present
   *     ─────────────────────────────   ─────────────   ──────────────
   *     none                                 1,029           1,254
   *     1,000 draws                          1,106           1,254
   *     250,000 draws                          —             1,254
   *
   * and merely ADDING the three control lines to the suite moved the no-reseed
   * number from 1,180 to 1,029 while the reseeded number did not move at all.
   * Repeats of any one command were bit-stable, so the walk was never flaky: it
   * was anchored to the tree's BYTES instead of to the seed. A replay token that
   * expires the moment anybody edits anything is not reproducibility.
   *
   * The two tests below are that control experiment, reduced to the mechanism. */
  test('H1 the walker re-seeds as the FIRST thing its beforeAll does', () => {
    expect(SIM_CODE).toMatch(
      /beforeAll\(\s*async\s*\(\s*\)\s*=>\s*\{\s*\(globalThis as \{[^}]*\}\)\.__TARTARIA_RESEED_RANDOM__\?\.\(\);/,
    );
  });

  /* Re-seeding AFTER the world is built buys nothing — the grounds, the weather,
   * the first encounters and the roster are already drawn. Order is the claim. */
  test('H2 the re-seed precedes every call that builds the world', () => {
    const seedAt = SIM_CODE.indexOf('__TARTARIA_RESEED_RANDOM__');
    expect(seedAt).toBeGreaterThan(-1);
    for (const call of ['hydrate()', 'startNewGame(', 'skipTutorial']) {
      expect(SIM_CODE.indexOf(call)).toBeGreaterThan(seedAt);
    }
  });

  test('H3 with the re-seed, a moved cursor changes nothing that follows', () => {
    H.__TARTARIA_RESEED_RANDOM__!();
    const clean = draws(64);
    draws(250_000); // stands in for whatever module import happened to draw
    H.__TARTARIA_RESEED_RANDOM__!();
    expect(draws(64)).toEqual(clean);
  });

  /* ⚠ THE OTHER HALF. Without this test H3 would pass on a harness that had
   * quietly stopped drawing at all. The cursor really does decide the world; the
   * re-seed is what stops it deciding. */
  test('H4 without the re-seed, the same moved cursor changes everything after it', () => {
    H.__TARTARIA_RESEED_RANDOM__!();
    const clean = draws(64);
    H.__TARTARIA_RESEED_RANDOM__!();
    draws(250_000);
    expect(draws(64)).not.toEqual(clean);
  });

  test('H5 the re-seed hook is published by the harness, not by the suite', () => {
    expect(typeof H.__TARTARIA_RESEED_RANDOM__).toBe('function');
    expect(SETUP_CODE).toMatch(/globalThis\.__TARTARIA_RESEED_RANDOM__\s*=\s*function/);
    expect(SIM_CODE).not.toMatch(/__TARTARIA_RESEED_RANDOM__\s*=/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('debt #54 §I — the world does not advance on the wall clock', () => {
  /* ⚠⚠⚠ THE THIRD INPUT, AND THE ONE NO SEED COULD EVER CARRY.
   *
   * `hydrate()` installs the homework tick, which arms a 5-second setInterval in
   * gameStore. Across an 18-minute catalogue walk it fires ~200 times, and where
   * each firing lands between two taps is decided by how fast the machine ran.
   *
   * ⚠ MEASURED. With the seed anchored (§H) the prefix replay reproduced the
   * full run's FIRST scenario byte for byte and then drifted — `hunt_mud_titan`
   * 785 taps in the full run against 1,060 in the replay. The only structural
   * difference between those two processes is one extra, trivial `it` (the UPTO
   * target-resolver), so a single short test moved the interval's phase far
   * enough to move ticks across tap boundaries. Two repeats of either command
   * were always bit-stable, so this was never flakiness. Suppressing that one
   * `it` restored five scenarios to byte-identical; disarming the interval made
   * the with-`it` and without-`it` runs identical on their own.
   *
   * ⚠ AND IT IS A DISARM, NOT A REWRITE. `setHomeworkTick(null)` is the
   * product's own stop path, already called this way from jest.teardown.js. The
   * suites that actually test homework drive it by hand through
   * `_homeworkTickForTest()`, so nothing loses coverage and no product code,
   * timer or probability changes. */
  test('I1 the walker disarms the homework interval before it walks', () => {
    expect(SIM_CODE).toMatch(/setHomeworkTick\(null\)/);
    expect(SIM_CODE).toMatch(/import \{[^}]*setHomeworkTick[^}]*\} from '\.\.\/app\/state\/gameStore'/);
  });

  /* Disarming it before `hydrate()` would do nothing at all — hydrate is what
   * arms it — and disarming it after the first walk would leave that walk on the
   * clock. The order is the claim. */
  test('I2 the disarm sits after hydrate and before the first scenario', () => {
    const hydrateAt = SIM_CODE.indexOf('hydrate()');
    const disarmAt = SIM_CODE.indexOf('setHomeworkTick(null)');
    const firstWalkAt = SIM_CODE.indexOf('playMission(');
    expect(hydrateAt).toBeGreaterThan(-1);
    expect(disarmAt).toBeGreaterThan(hydrateAt);
    expect(firstWalkAt).toBeGreaterThan(disarmAt);
  });

  test('I3 the disarm uses the product door that already exists', () => {
    const storeCode = codeOnly(read('app/state/gameStore.ts'));
    expect(storeCode).toMatch(/export function setHomeworkTick\(fn: \(\(\) => void\) \| null\): void/);
    expect(storeCode).toMatch(/export function _homeworkTickForTest\(\): void/);
    // jest.teardown.js already calls the same door — this suite invented nothing.
    expect(codeOnly(read('jest.teardown.js'))).toMatch(/setHomeworkTick\(null\)/);
  });

  test('I4 the walker never re-arms it, and never installs a tick of its own', () => {
    expect(SIM_CODE).not.toMatch(/setHomeworkTick\(\s*(?!null)/);
    expect(WALKER_CODE).not.toMatch(/setHomeworkTick/);
  });

  /* ⚠ A DISARM THAT DID NOT DISARM WOULD SATISFY EVERY CLAIM ABOVE. This one
   * arms the real interval and then stops it through the same door. */
  test('I5 the door really stops the interval', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gs = require('../app/state/gameStore');
    let ticks = 0;
    gs.setHomeworkTick(() => { ticks += 1; });
    expect(gs._homeworkInstalled()).toBe(true);
    gs._homeworkTickForTest();
    expect(ticks).toBe(1);
    gs.setHomeworkTick(null);
    expect(gs._homeworkInstalled()).toBe(false);
    gs._homeworkTickForTest();
    expect(ticks).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('debt #54 §J — the walker does not read the clock', () => {
  /* ⚠⚠⚠ THE LAST INPUT, AND THE ONE THAT MADE THE REPLAY A COIN TOSS.
   *
   * `settle(pred, deadlineMs)` used to be `while (!pred() && Date.now() - t0 <
   * deadlineMs)`. Its RETURN VALUE is load-bearing — `const moved = await
   * settle(...)` at the road fork takes another branch when it comes back false
   * — so a machine that hiccuped sent the walker down another road.
   *
   * ⚠ MEASURED. With the seed anchored (§H) and the homework interval disarmed
   * (§I), the SAME prefix command run twice still gave `hunt_mud_titan` 1,060
   * taps and then 785. The walk was not wrong either time; it was a coin toss,
   * and the coin was how fast this box happened to be. Counting POLLS instead of
   * milliseconds made three consecutive runs of that command byte-identical.
   *
   * Each poll still yields to the event loop, so the engine's promises and
   * timers get exactly as many turns as before; the budget is the old deadline
   * at the old poll interval, so no wait got shorter. A slow machine now waits
   * longer in real time instead of giving up earlier — which is the whole point.
   *
   * ⚠ The invariant below is the enforceable half: the walker may not consult a
   * clock at all. Anything reintroducing one fails here rather than three months
   * later as an unattributable flake. */
  const WALKER_SRC = read('test-utils/playerWalker.ts');
  const SIM_SRC = read('__tests__/playerWalkerSim.test.ts');

  test.each([
    ['test-utils/playerWalker.ts', WALKER_CODE],
    ['__tests__/playerWalkerSim.test.ts', SIM_CODE],
  ])('J1 %s reads no clock', (_name, code) => {
    expect(code).not.toMatch(/Date\.now\(/);
    expect(code).not.toMatch(/performance\.now\(/);
    expect(code).not.toMatch(/new Date\(/);
  });

  test.each([
    ['test-utils/playerWalker.ts', WALKER_CODE],
    ['__tests__/playerWalkerSim.test.ts', SIM_CODE],
  ])('J2 %s settles on a poll budget derived from the old deadline', (_name, code) => {
    expect(code).toMatch(/const SETTLE_POLL_MS = \d+;/);
    expect(code).toMatch(/Math\.max\(1, Math\.ceil\(deadlineMs \/ SETTLE_POLL_MS\)\)/);
  });

  /* ⚠ NO WAIT MAY GET SHORTER. The budget is the caller's own deadline at the
   * poll interval, so every settle still looks at least as long as it used to —
   * a "reproducible" walker bought by waiting less would just be a faster liar. */
  test('J3 every caller keeps at least its old number of looks', () => {
    const POLL = 12;
    const deadlines = [...WALKER_SRC.matchAll(/settle\([^\n]*?,\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
    expect(deadlines.length).toBeGreaterThan(5);
    for (const d of deadlines) {
      expect(Math.max(1, Math.ceil(d / POLL)) * POLL).toBeGreaterThanOrEqual(d);
    }
  });

  /* The pattern itself: a loop budgeted in turns runs the same number of turns
   * however long each one takes, which is exactly what a clock-budgeted loop
   * cannot promise. */
  test('J4 a poll budget is spent in turns, not in milliseconds', async () => {
    const run = async (extraWorkPerTurn: number) => {
      let polls = 0;
      const budget = Math.max(1, Math.ceil(60 / 12));
      for (let i = 0; i < budget; i++) {
        polls += 1;
        for (let k = 0; k < extraWorkPerTurn; k++) Math.sqrt(k);
        await new Promise((r) => setTimeout(r, 0));
      }
      return polls;
    };
    expect(await run(0)).toBe(await run(2_000_000));
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('debt #54 §G — production randomness was not touched', () => {
  /* The firewall, asserted rather than promised. The repair lives in the two
   * harness files and the walker helper; if it ever reaches a probability, this
   * is where that shows up. */
  test('G1 the seed override exists only in the jest harness, never in app/', () => {
    for (const f of ['app/engine/rng.ts', 'app/engine/encounter.ts', 'app/state/gameStore.ts']) {
      expect(read(f)).not.toContain('TARTARIA_TEST_SEED');
      expect(read(f)).not.toContain('__TARTARIA_SET_RANDOM_SEED_FOR_TEST__');
    }
  });

  test('G2 the walker still pins its dice to 18 rather than biasing the roller', () => {
    expect(WALKER_CODE).toMatch(/resolveRollStep\(Array\.from\(\{ length: step\.count \?\? 1 \}, \(\) => 18\)\)/);
  });

  test('G3 rng.ts still draws from Math.random — no injected generator was added', () => {
    expect(RNG_CODE).toMatch(/Math\.random\(\)/);
    expect(RNG_CODE).not.toMatch(/TARTARIA_TEST_SEED|setRng|injectRng/);
  });
});
