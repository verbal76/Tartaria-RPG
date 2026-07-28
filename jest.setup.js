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
// at the start of every test file (setupFiles runs per file). Every run is then
// byte-identical, so one green run means green forever — the tail can't surprise
// a merge. This does NOT weaken coverage: tests still drive real code paths with
// real pseudo-random inputs (a full non-repeating sequence, not a constant), and
// the statistical bands are still asserted — they're just reproducible. Tests
// that need a specific value still override Math.random locally (jest.spyOn /
// direct assignment); that wins within their scope and restores to this seeded
// baseline afterward. Product code is untouched.
const __SEED = 0x74617274; // "tart" — stable across runs and all three OTA lines
let __s = __SEED >>> 0;
Math.random = function seededRandom() {
  __s |= 0;
  __s = (__s + 0x6d2b79f5) | 0;
  let t = Math.imul(__s ^ (__s >>> 15), 1 | __s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
if (typeof beforeEach === 'function') {
  // Re-seed before each test so ordering within a file is also reproducible and
  // one test's draws never bleed into the next test's asserted distribution.
  beforeEach(() => { __s = __SEED >>> 0; });
}
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
