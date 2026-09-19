// Jest global setup — determinism guards for a BLOCKING test gate.
//
// Deterministic PRNG.
// -------------------
// The game leans on Math.random() everywhere (loot rolls, narration variety,
// encounter picks, weather, crit dice…). Most suites are robust, but a long tail
// of statistical/variety checks ("≥60% of 100 travel lines are unique", "hook
// outcomes ≈ 37.5%") sit close enough to their thresholds that a bad roll flakes
// them ~once per full run — a different test each time. For a gate that BLOCKS
// merges that intermittent red is disqualifying, and chasing each tail case by
// hand never provably converges.
//
// Fix: seed Math.random with a fixed, well-distributed PRNG (mulberry32), reset
// at the start of every test file (setupFiles runs per file) AND before every
// test (OTA-1831, registered from jest.teardown.js — see the block below for why
// it could never be registered from here, and what that cost). Every run is then
// byte-identical, so one green run means green forever — the tail can't surprise
// a merge. This does NOT weaken coverage: tests still drive real code paths with
// real pseudo-random inputs (a full non-repeating sequence, not a constant), and
// the statistical bands are still asserted — they're just reproducible. Tests
// that need a specific value still override Math.random locally (jest.spyOn /
// direct assignment); that wins within their scope and restores to this seeded
// baseline afterward. Product code is untouched.
// ⚠⚠⚠ DEBT #54 — THE SEED IS NOW ADDRESSABLE, AND THAT IS THE WHOLE REPAIR.
//
// The constant below has always been the harness's dice. What it never was is
// SELECTABLE: no override, no parameter, nothing to print in a failure and
// nothing to type to replay one. A simulator whose failures cannot be replayed
// is not reproducible no matter how fixed its seed is, which is the defect this
// closes — see __tests__/walkerReplaySeed.test.ts for the proof. (No OTA: this
// change is harness-only and ships nothing to a device.)
//
// ⚠ THE DEFAULT IS UNCHANGED AND THAT IS LOAD-BEARING. With no override the
// seed is still 0x74617274, so every existing suite draws the exact sequence it
// drew before this change and no baseline moves. The override exists for
// replaying a captured failure and for asking an invariant across many seeds;
// it is read once, here, and it never reaches product code.
//
// ⚠ PRODUCT RANDOMNESS IS UNTOUCHED. This file is `setupFiles` — it exists only
// inside jest. Nothing here ships, no probability is altered, and the game's own
// Math.random on a device is the platform's.
const __DEFAULT_SEED = 0x74617274; // "tart" — stable across runs and all three OTA lines
/** Accept `0x…` or decimal; anything unparseable falls back to the default. */
function __tartariaParseSeed(raw) {
  if (typeof raw !== 'string') return __DEFAULT_SEED;
  const t = raw.trim();
  if (t === '') return __DEFAULT_SEED;
  const n = /^0x/i.test(t) ? Number.parseInt(t.slice(2), 16) : Number.parseInt(t, 10);
  return Number.isFinite(n) ? n >>> 0 : __DEFAULT_SEED;
}
const __SEED = __tartariaParseSeed(process.env.TARTARIA_TEST_SEED);
// Published so a harness can PRINT the seed it actually ran on. A failure that
// does not name its seed cannot be replayed, which was half of debt #54.
globalThis.__TARTARIA_TEST_SEED__ = __SEED;
globalThis.__TARTARIA_DEFAULT_TEST_SEED__ = __DEFAULT_SEED;
// The parser itself, so its contract is TESTED rather than described. A seed
// reader that silently turns junk into 0 would make every "replayed with the
// seed from the failure" claim a lie.
globalThis.__TARTARIA_PARSE_TEST_SEED__ = __tartariaParseSeed;
/**
 * ⚠ TEST-ONLY, AND THE REASON IT EXISTS IS §9's MULTI-SEED INVARIANTS.
 * `__TARTARIA_RESEED_RANDOM__` restores THE run's seed, which is what every test
 * needs by default. Asking whether an invariant holds across MANY seeds needs a
 * way to say which one, and a test that reaches for its own `Math.random =` to
 * do that loses the reproducible baseline for everything after it. This sets the
 * cursor and nothing else; the reseed hook still returns the run to its own seed
 * before the next test.
 */
globalThis.__TARTARIA_SET_RANDOM_SEED_FOR_TEST__ = function setRandomSeedForTest(seed) {
  __s = (typeof seed === 'number' ? seed >>> 0 : __tartariaParseSeed(String(seed))) >>> 0;
};
let __s = __SEED >>> 0;
Math.random = function seededRandom() {
  __s |= 0;
  __s = (__s + 0x6d2b79f5) | 0;
  let t = Math.imul(__s ^ (__s >>> 15), 1 | __s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// ⚠⚠⚠ OTA-1831 — THE RE-SEED THAT NEVER REGISTERED, AND WHAT IT COST.
//
// This was `if (typeof beforeEach === 'function') { beforeEach(() => { __s =
// __SEED; }); }`. `setupFiles` runs BEFORE the test framework is installed, so
// `beforeEach` is undefined here and the guard was ALWAYS false — the per-test
// re-seed the header above promised has never once happened. jest.teardown.js
// recorded the dead guard and left it; this is the correction, because the
// consequence turned out to be far worse than "ordering within a file is not
// reproducible".
//
// ⚠⚠ WHAT THE SHARED STREAM WAS REALLY TRACKING. With only the per-FILE seed,
// every test in a file draws from one continuous stream, so a test's starting
// position is the sum of every draw before it — INCLUDING at module import.
// Importing app/state/gameStore.ts draws ~270,000 times, and stack-bucketing
// says >99.98% of those come from `randomIntInRange` inside the `source-map`
// package's randomized quicksort: JEST'S OWN SOURCE-MAP MACHINERY, not product
// code. The count is therefore a function of the SOURCE-MAP SHAPE of the loaded
// modules. Measured on one tree, three runs: 265,813 draws every time; with four
// lines of an unrelated appendLog call joined into one, 269,967. A 4,154-draw
// shift out of an edit that rolls nothing.
//
// ⚠ SO EDITING ANY LOADED FILE MOVED EVERY SEEDED VALUE IN THE SUITE. Six suites
// went red on a change that added no RNG call at all. Two controls proved it was
// the layout and not the change: making the new content unreachable left all six
// red, and a tree with NO new content that only REFORMATTED four lines went red
// on its own. That is a landmine under every future edit, and the suite that
// fails is never the one that moved.
//
// A hook has to live where hooks exist, so the re-seed is published here and
// registered from jest.teardown.js (`setupFilesAfterEnv`, which runs after the
// framework). Every test then starts at __SEED whatever was imported, and the
// byte layout of the tree stops being an input to the game's dice.
globalThis.__TARTARIA_RESEED_RANDOM__ = function reseedRandom() {
  __s = __SEED >>> 0;
};
//
// Incidental weather determinism.
// -------------------------------
// The world assigns a random weather to every generated scene via
// encounter.pickWeather(), and gameStore's per-action loop rolls that weather's
// effect (tickWeather) on EVERY submitPlayerAction — a stray glass-hail /
// ash-storm / silent-blizzard tick can nick 1 HP or drain 1 stamina at random.
// That is correct product behaviour, but it makes any test that asserts an
// EXACT post-action HP/stamina value silently flaky (~1 test per full run,
// a different one each time). For a gate that BLOCKS merges, that intermittent
// red is unacceptable.
//
// Fix: pin *incidental* scene weather to Eerie Calm (a prob-0, zero-effect
// weather) by mocking pickWeather. Tests that specifically exercise weather set
// currentScene.weather explicitly via setState — that bypasses pickWeather and
// still drives the real tickWeather effects, so the dedicated weather tests are
// unaffected. weatherEffects.test.ts calls tickWeather directly and is likewise
// untouched. This changes only the TEST harness; product weather is unchanged.
jest.mock('./app/engine/encounter', () => {
  const actual = jest.requireActual('./app/engine/encounter');
  const calm = () => ({
    id: 'calm',
    name: 'Eerie Calm',
    description: 'Not even wind.',
    visibility: 0,
    travelPenalty: 0,
    corruptionChance: 0,
    tags: ['calm'],
    source: 'test-harness',
  });
  return { ...actual, pickWeather: calm };
});
