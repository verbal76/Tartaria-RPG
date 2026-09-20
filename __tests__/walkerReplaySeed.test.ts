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
 * With all four shut, three consecutive prefix replays were byte-identical and
 * the prefix replay reproduced the full run byte for byte — measured over the
 * first six scenarios of an 89-scenario run that walked clean, and again over
 * the twenty scenarios preceding a deliberately planted break, whose printed
 * command reproduced both the walk and the break.
 *
 * ⚠⚠⚠ SECOND PASS, AND THE FIRST THING IT HAD TO DO WAS UN-CLAIM THAT.
 *
 * Re-measured on current authority, on an otherwise idle box: the identical
 * prefix command, three times, `hunt:hunt_mud_titan` taps 1,122 · 785 · 1,122.
 * Runs one and three agree to the byte across all six scenarios; run two is a
 * different walk. The FIRST scenario is identical in all three every time — the
 * divergence starts at the second, which is the signature §J already records.
 *
 * ⚠ AND IT IS NOT AN EDIT. The same three runs on the tree BEFORE this pass
 * touched anything gave the same two outcomes, tap for tap, so the repair below
 * preserves the walk exactly and the bistability is inherited, not introduced.
 * What the first pass measured was true of the box it measured on; it was never
 * a property of the harness, and "three green runs" is precisely the evidence
 * that cannot tell those two apart. So the claim is narrowed to what §W can
 * PROVE BY EXECUTION — the WORLD is reconstructed exactly, every time — and the
 * replay block now PRINTS the limit on the walk instead of implying none.
 *
 * ⚠⚠⚠ THE RESIDUAL, NAMED RATHER THAN HIDDEN — PRODUCTION'S WALL CLOCK.
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
  walkOrder, walkerSelection, REPLAY_SEED_VAR, REPLAY_PREFIX_VAR, REPLAY_ISOLATE_VAR,
  ALL_MISSIONS, ALL_FACTION_QUESTS, ALL_WHISPER_CHAINS,
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

  /* ⚠⚠⚠ THE BLOCK MUST NOT OVERSELL ITSELF. Measured on this tree, the printed
   * command reconstructs the WORLD exactly (§W) and reproduces the WALK on most
   * runs but not all — production decides several things by elapsed real time
   * and the walker inherits them (debt #173). A replay instruction that reads as
   * exact when it is not is the same defect as one that points at the wrong run,
   * so the limit is printed where the reader is standing. */
  test('D7 the block prints its own limit — the WORLD is exact, the WALK may not be', () => {
    const b = replayBlock('whisper', 'nessa_fungus').join('\n');
    expect(b).toContain('run it more than once');
    expect(b).toMatch(/WORLD is reconstructed exactly/);
    expect(b).toMatch(/elapsed real time/);
    expect(b).toContain('#173');
    // …and it is on a BREAK report, where the reader actually meets it.
    expect(formatReport(broken)).toContain('run it more than once');
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
describe('debt #54 §E — the printed command is EXECUTED against the real selector', () => {
  /* ⚠⚠⚠ THE SECOND-PASS REPAIR, AND WHAT IT REPLACED.
   *
   * This section used to be four regexes over `playerWalkerSim.test.ts`: that it
   * contained `const ORDER`, that the three family names appeared in the right
   * order inside it, that the text `ORDER.indexOf(key) <= UPTO_INDEX` was
   * present. Meanwhile `replayBlock()` composed `PLAYER_WALKER_UPTO=…` from its
   * own private string literal in a different file. Two source-text claims about
   * two independent spellings, and NOTHING executing the relationship between
   * them.
   *
   * ⚠ MEASURED AS A NEGATIVE CONTROL, not reasoned about: rename the variable
   * the suite reads to `process.env.PLAYER_WALKER_PREFIX` and every assertion in
   * the old §E — and every assertion in §D — stayed GREEN, while the command a
   * break prints selected nothing and ran the entire 89-scenario catalogue
   * instead of the prefix. That is the c94e3ebc defect with a receipt stapled to
   * it: a reader typing the printed command gets a DIFFERENT run and is told it
   * is a replay.
   *
   * So the tests below take the printed text, parse the environment out of it
   * WITHOUT knowing any variable's name, hand that environment to the selector
   * the suite actually uses, and ask what it selected. */
  const TARGET = 'whisper:nessa_fungus';

  const envFromPrintedCommand = (block: string): Record<string, string | undefined> => {
    const line = block.split('\n').find((l) => l.includes('replay:'));
    expect(line).toBeDefined();
    const cmd = line!.slice(line!.indexOf('replay:') + 'replay:'.length).trim();
    const env: Record<string, string | undefined> = {};
    for (const m of cmd.matchAll(/(?:^|\s)([A-Z][A-Z0-9_]*)=(\S+)/g)) env[m[1]!] = m[2]!;
    return env;
  };

  test('E1 the order is the three families, in blocks, each scenario exactly once', () => {
    const order = walkOrder();
    expect(new Set(order).size).toBe(order.length);
    const missions = ALL_MISSIONS.map(({ family, def }) => `${family}:${def.id}`);
    const factions = ALL_FACTION_QUESTS.map((q) => `faction:${q.id}`);
    const whispers = ALL_WHISPER_CHAINS.map((c) => `whisper:${c.id}`);
    for (const k of [...missions, ...factions, ...whispers]) expect(order).toContain(k);
    expect(order).toHaveLength(missions.length + factions.length + whispers.length);
    // Blocks, in registration order — anything else is not the prefix the walk walked.
    const last = (ks: string[]) => Math.max(...ks.map((k) => order.indexOf(k)));
    const first = (ks: string[]) => Math.min(...ks.map((k) => order.indexOf(k)));
    expect(last(missions)).toBeLessThan(first(factions));
    expect(last(factions)).toBeLessThan(first(whispers));
  });

  test('E2 ⚠⚠⚠ THE CONTRACT: the command a break prints selects the ordered PREFIX', () => {
    const selection = walkerSelection(envFromPrintedCommand(replayBlock('whisper', 'nessa_fungus').join('\n')));
    const order = walkOrder();
    const i = order.indexOf(TARGET);
    expect(i).toBeGreaterThan(0); // a real prefix — the target is not the first scenario
    expect(selection.mode).toBe('prefix');
    expect(selection.targetFound).toBe(true);
    expect(selection.keys).toEqual(order.slice(0, i + 1));
    expect(selection.keys[selection.keys.length - 1]).toBe(TARGET);
    /* ⚠ AND NOT THE WHOLE CATALOGUE. This is the line a decorative rename trips:
     * an environment the selector does not recognise falls through to `full`,
     * which reads as "the replay ran" while walking 89 scenarios instead of 85. */
    expect(selection.keys.length).toBeLessThan(order.length);
  });

  test('E3 the seed the command carries is the seed this run actually used', () => {
    const env = envFromPrintedCommand(replayBlock('whisper', 'nessa_fungus').join('\n'));
    expect(env[REPLAY_SEED_VAR]).toBeDefined();
    expect(H.__TARTARIA_PARSE_TEST_SEED__!(env[REPLAY_SEED_VAR])).toBe(walkerBaseSeed());
  });

  /* ⚠ A replay that walks NOTHING reads as green, which is worse than one that
   * fails. A target that does not resolve selects nothing AND says so. */
  test('E4 a mistyped target selects nothing and reports it, rather than everything', () => {
    const selection = walkerSelection({ [REPLAY_PREFIX_VAR]: `${TARGET}_TYPO` });
    expect(selection.mode).toBe('prefix');
    expect(selection.targetFound).toBe(false);
    expect(selection.keys).toEqual([]);
    // …and the suite turns that into a failing `it` instead of an empty green run.
    expect(SIM_CODE).toMatch(/SELECTION\.mode === 'prefix'/);
    expect(SIM_CODE).toMatch(/SELECTION\.targetFound/);
    expect(SIM_CODE).toMatch(/PLAYER_WALKER_UPTO target resolves to a real scenario/);
  });

  test('E5 ⚠⚠ the suite carries NO selection logic of its own — one implementation', () => {
    // The durable form of the claim: not "the right text is present" but "there
    // is no second copy to drift". A private re-implementation is exactly how
    // the printed command and the selected scenarios came apart.
    expect(SIM_CODE).toMatch(/walkerSelection\(\)/);
    for (const forbidden of [
      /process\.env\.PLAYER_WALKER_UPTO/,
      /process\.env\.PLAYER_WALKER_ONLY/,
      /ORDER\.indexOf/,
      /UPTO_INDEX/,
    ]) {
      expect(SIM_CODE).not.toMatch(forbidden);
    }
  });

  test('E6 the isolating door still isolates, and an unset environment walks it all', () => {
    const order = walkOrder();
    const whispers = order.filter((k) => k.startsWith('whisper:'));
    const byFamily = walkerSelection({ [REPLAY_ISOLATE_VAR]: 'whisper' });
    expect(byFamily.mode).toBe('isolated');
    expect(byFamily.keys).toEqual(whispers);
    const byKey = walkerSelection({ [REPLAY_ISOLATE_VAR]: TARGET });
    expect(byKey.keys).toEqual([TARGET]);
    const full = walkerSelection({});
    expect(full.mode).toBe('full');
    expect(full.keys).toEqual(order);
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
  /* ⚠⚠ SECOND PASS — THE WORLD BUILD MOVED INTO A FUNCTION so §W below can run
   * it instead of reading it. These two keep the ORDERING claim, which §W cannot
   * see from outside: a reconstruction that re-seeded after drawing its grounds
   * would still be self-consistent and still be wrong. */
  test('H1 the world builder re-seeds as the FIRST thing it does, and the suite delegates', () => {
    expect(WALKER_CODE).toMatch(
      /export async function buildWalkerWorld\(\): Promise<void> \{\s*\(globalThis as \{[^}]*\}\)\.__TARTARIA_RESEED_RANDOM__\?\.\(\);/,
    );
    // …and the suite's beforeAll builds the world ONLY by calling it.
    expect(SIM_CODE).toMatch(/beforeAll\([\s\S]{0,400}?await buildWalkerWorld\(\);\s*\}\);/);
    for (const call of ['hydrate()', 'startNewGame(', 'skipTutorial']) {
      expect(SIM_CODE).not.toContain(call);
    }
  });

  /* Re-seeding AFTER the world is built buys nothing — the grounds, the weather,
   * the first encounters and the roster are already drawn. Order is the claim. */
  test('H2 the re-seed precedes every call that builds the world', () => {
    const seedAt = WALKER_CODE.indexOf('__TARTARIA_RESEED_RANDOM__');
    expect(seedAt).toBeGreaterThan(-1);
    for (const call of ['get().hydrate()', 'get().startNewGame(', 'get().skipTutorial']) {
      expect(WALKER_CODE.indexOf(call)).toBeGreaterThan(seedAt);
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
  /* ⚠⚠ SECOND PASS — THE DISARM MOVED WITH THE WORLD BUILD into
   * `buildWalkerWorld()`, and §W5 now EXECUTES it: reconstruct the world, then
   * ask the store whether the tick is installed. These two keep the ordering
   * claim, which the execution cannot see. */
  test('I1 the world builder disarms the homework interval before the walk starts', () => {
    expect(WALKER_CODE).toMatch(/setHomeworkTick\(null\)/);
    expect(WALKER_CODE).toMatch(/import \{[^}]*setHomeworkTick[^}]*\} from '\.\.\/app\/state\/gameStore'/);
  });

  /* Disarming it before `hydrate()` would do nothing at all — hydrate is what
   * arms it — and disarming it after the first walk would leave that walk on the
   * clock. The order is the claim. */
  test('I2 the disarm sits after hydrate and before the build returns', () => {
    const build = WALKER_CODE.slice(WALKER_CODE.indexOf('export async function buildWalkerWorld'));
    const hydrateAt = build.indexOf('get().hydrate()');
    const disarmAt = build.indexOf('setHomeworkTick(null)');
    expect(hydrateAt).toBeGreaterThan(-1);
    expect(disarmAt).toBeGreaterThan(hydrateAt);
    // …and the suite walks only after the build it awaits has returned.
    expect(SIM_CODE.indexOf('await buildWalkerWorld()')).toBeLessThan(SIM_CODE.indexOf('playMission('));
  });

  test('I3 the disarm uses the product door that already exists', () => {
    const storeCode = codeOnly(read('app/state/gameStore.ts'));
    expect(storeCode).toMatch(/export function setHomeworkTick\(fn: \(\(\) => void\) \| null\): void/);
    expect(storeCode).toMatch(/export function _homeworkTickForTest\(\): void/);
    // jest.teardown.js already calls the same door — this suite invented nothing.
    expect(codeOnly(read('jest.teardown.js'))).toMatch(/setHomeworkTick\(null\)/);
  });

  test('I4 the harness never re-arms it, and never installs a tick of its own', () => {
    // ⚠ The claim is about the ARGUMENT, not about the name. The disarm now
    // lives in the walker helper, so "the helper must not mention it" would be
    // false; "neither file may ever pass anything but null" is what was meant.
    for (const code of [SIM_CODE, WALKER_CODE]) {
      expect(code).not.toMatch(/setHomeworkTick\(\s*(?!null\s*\))/);
    }
    expect((WALKER_CODE.match(/setHomeworkTick\(/g) ?? []).length).toBe(1);
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

  /* ⚠ SECOND PASS — BOTH SETTLES NOW LIVE IN THE WALKER HELPER. The suite's own
   * copy went with the world build into `buildWalkerWorld()`, which is why this
   * counts two poll-budgeted helpers in one file instead of one in each, and
   * requires the suite to have none of its own left to drift. */
  test('J2 every settle is spent on a poll budget derived from the old deadline', () => {
    expect(WALKER_CODE).toMatch(/const SETTLE_POLL_MS = \d+;/);
    expect(WALKER_CODE).toMatch(/const WORLD_SETTLE_POLL_MS = \d+;/);
    const budgets = WALKER_CODE.match(/Math\.max\(1, Math\.ceil\(deadlineMs \/ [A-Z_]*SETTLE_POLL_MS\)\)/g) ?? [];
    expect(budgets).toHaveLength(2);
    expect(SIM_CODE).not.toMatch(/SETTLE_POLL_MS/);
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
describe('debt #54 §W — the replay RECONSTRUCTS THE WORLD, and this executes it', () => {
  /* ⚠⚠⚠ THE CLAIM THE FIRST PASS COULD ONLY MAKE IN PROSE.
   *
   * §A–§J prove the four inputs are shut: the seed is addressable, the world is
   * re-seeded before it is dealt, the homework interval is disarmed, no wait
   * consults a clock. Every one of those was asserted by reading source text —
   * which is exactly the shape of test that lets a replay token go decorative
   * while the world underneath it drifts. The question the debt actually asks is
   * *does replaying it produce the same world?*, and only running it can answer.
   *
   * So each test below RECONSTRUCTS the world `playerWalkerSim` walks its 89
   * scenarios in — the real `buildWalkerWorld()`, in a fresh module registry,
   * which is what a replay process does minus the process — and compares the
   * worlds that come back. The fingerprint covers the scene the player stands
   * in, the world memory behind it, the rolled character and every line the
   * build wrote to the feed.
   *
   * ⚠ NOTHING IS PINNED TO A STORED VALUE. Two reconstructions made in the same
   * process are compared against each other, so an edit anywhere in the game
   * moves both sides and the claim survives without a golden file to re-bless —
   * the opposite of the giant snapshot this repair was told not to introduce.
   *
   * ⚠ MEASURED ON THIS TREE. Exactly one field differs between two independent
   * reconstructions: `player.mapSeed`, `name|race|faction|<Date.now()>`, which
   * is the SAVE SYSTEM'S character key and not world state — `generateWorldMap`
   * opens by voiding it, because positions are canon. Masking that one epoch,
   * scene, world memory, the rolled character and all 30-odd feed lines are
   * byte-identical. */
  jest.setTimeout(120_000);

  /** One reconstruction, in its own module registry.
   *
   *  · `burn` stands in for whatever the loaded tree happened to draw at import,
   *    which is the §H defect's actual mechanism.
   *  · `seed` swaps the RE-SEED HOOK, not the cursor — because that is what a
   *    `TARTARIA_TEST_SEED=…` process does. jest.setup.js's hook restores that
   *    process's `__SEED`, so setting the cursor beforehand and letting the
   *    build re-seed over it would prove nothing except that the build re-seeds.
   *  · `reseed: false` removes the hook entirely, so the build cannot anchor
   *    itself and the burn is free to decide the world. */
  const reconstruct = async (
    opts: { burn?: number; seed?: number; reseed?: boolean } = {},
  ): Promise<string> => {
    let fingerprint = '';
    const hook = H.__TARTARIA_RESEED_RANDOM__;
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const w = require('../test-utils/playerWalker') as typeof import('../test-utils/playerWalker');
      for (let i = 0; i < (opts.burn ?? 0); i++) Math.random();
      if (opts.reseed === false) delete H.__TARTARIA_RESEED_RANDOM__;
      else if (opts.seed !== undefined) {
        H.__TARTARIA_RESEED_RANDOM__ = () => H.__TARTARIA_SET_RANDOM_SEED_FOR_TEST__!(opts.seed!);
      }
      const [log, warn, error] = [console.log, console.warn, console.error];
      console.log = () => {}; console.warn = () => {}; console.error = () => {};
      try {
        await w.buildWalkerWorld();
        fingerprint = w.walkerWorldDigest();
      } finally {
        console.log = log; console.warn = warn; console.error = error;
        H.__TARTARIA_RESEED_RANDOM__ = hook;
      }
    });
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
    return fingerprint;
  };

  test('W1 ⚠⚠⚠ two reconstructions of the walker world are the SAME WORLD', async () => {
    expect(await reconstruct()).toBe(await reconstruct());
  });

  test('W2 ⚠⚠⚠ and 250,000 draws burned beforehand change nothing — the world is a function of the SEED, not of the tree', async () => {
    // The §H defect stated as an experiment on the world itself rather than on
    // `Math.random`: a replay token anchored to the byte layout of the loaded
    // files expires the moment anybody edits anything.
    expect(await reconstruct({ burn: 250_000 })).toBe(await reconstruct());
  });

  test('W3 ⚠⚠ without the re-seed that same burn DOES change the world — W1/W2 are not vacuous', async () => {
    // The other half. Without this, W1 and W2 would both pass on a harness that
    // had quietly stopped drawing at all, or on a fingerprint that saw nothing.
    expect(await reconstruct({ burn: 250_000, reseed: false })).not.toBe(await reconstruct());
  });

  test('W4 ⚠⚠⚠ a different seed reconstructs a different world — the seed is not decorative', async () => {
    // The seed is printed in every replay block and typed back by whoever reads
    // one. If it did not govern the world, that block would be an instruction to
    // reproduce something else.
    expect(await reconstruct({ seed: 0x1234abcd })).not.toBe(await reconstruct());
  });

  test('W5 ⚠⚠ the reconstruction leaves the homework interval DISARMED', async () => {
    let installed: boolean | null = null;
    await jest.isolateModulesAsync(async () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const w = require('../test-utils/playerWalker') as typeof import('../test-utils/playerWalker');
      const gs = require('../app/state/gameStore') as typeof import('../app/state/gameStore');
      const [log, warn, error] = [console.log, console.warn, console.error];
      console.log = () => {}; console.warn = () => {}; console.error = () => {};
      try {
        await w.buildWalkerWorld();
        installed = gs._homeworkInstalled();
      } finally { console.log = log; console.warn = warn; console.error = error; }
    });
    // hydrate() arms it; the build is what takes it back off. §I5 proves the
    // door works — this proves the build walked through it.
    expect(installed).toBe(false);
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
