/**
 * ⚠⚠⚠ WHICH SUITES DO **NOT** BLOCK A SHIP, AND WHY EACH ONE DOESN'T.
 *
 * Before this file, the split was seven bare words matched as SUBSTRINGS against
 * every test path:
 *
 *     jest --testPathIgnorePatterns /node_modules/ Stress stressMode Chaos Probe Smoke Sweep Sim
 *
 * So whether a suite guarded a ship was decided by what someone had NAMED it.
 * Nothing declared "this is a heavy sim"; a file simply had the word in it. Three
 * OTA REGRESSION suites — written to pin shipped, player-facing fixes — were
 * silently outside the gate for that reason alone, and two of them were RED:
 *
 *   · ota1483ThreeFromTheSecondSweep (2s). Its scanner sliced the sweep closure
 *     with `indexOf('step();')`. OTA-1497 changed that call to
 *     `setTimeout(step, SHEET_SETTLE_MS)`, the anchor stopped matching, and the
 *     slice silently swallowed 19,200 characters of unrelated code — then failed
 *     on bare `return;` statements in other functions entirely.
 *   · ota1268InvestigateAllActuallySweeps (5s). It walked the tutorial beat by
 *     beat to reach a testable room; the tutorial moved, the walk stopped
 *     landing, and a live tutorial override made the INVESTIGATE chip submit a
 *     beat instead of opening the search sheet. Its `await tick(0)` also predated
 *     that same OTA-1497 settle delay, so it measured a sweep that had not begun.
 *
 * Both were instrument failures, not game defects — the sweep and the chip both
 * work — but nobody could know that, because nothing ever ran them. They are
 * repaired and BLOCKING now.
 *
 * ⚠⚠ THE RULE IS NOW: BLOCKING BY DEFAULT. A suite is non-blocking only if it is
 * named here, with a reason. Adding a file to `__tests__` puts it in the gate;
 * opting out is a decision someone has to write down. `check:testsplit` fails if
 * a name here no longer exists, so the list cannot rot into a lie.
 *
 * ⚠ WHAT LEGITIMATELY BELONGS HERE: long-run world/persist simulations and
 * balance probes. They exercise the engine's known super-linear world/persist
 * tail growth, so they are memory- and time-sensitive by nature — one of them
 * (ota1699ContraryWalkerSweep) runs over twenty minutes on its own. That tail
 * growth, not the tests, is the thing to fix before this set can be required.
 */

/** Non-blocking suites, by exact basename. Reported in CI, never a merge gate. */
export const HEAVY_SUITES = [
  // ── long-run world / persistence simulations ──────────────────────────
  'craftingInventoryChaosSim.ts',
  'engineStateChaosSim.ts',
  'playerInputChaosSim.ts',
  'playerWalkerSim.test.ts',
  'thousandDayStressSim.test.ts',
  'twoYearChaosSim.test.ts',
  'yearSimulation.test.ts',
  'travelSceneBarChaos.test.ts',
  // ── stress: many actions against one subsystem ────────────────────────
  'combatStress.test.ts',
  'crossSystemRegressionStress.test.ts',
  'dogGolemCombatStress.test.ts',
  'dogHungerTimingChaos.test.ts',
  'domesticStress.test.ts',
  'encounterStress.test.ts',
  'golemStressSweep.test.ts',
  'interactionStress.test.ts',
  'metaNavStress.test.ts',
  'movementStress.test.ts',
  'stressMode_cartographer.test.ts',
  'stressMode_chaos.test.ts',
  'stressMode_collectAll.test.ts',
  'stressMode_craftALot.test.ts',
  'stressMode_drunkSpelling.test.ts',
  // ── balance probes: measure numbers, do not assert pass/fail behaviour ─
  'combatBalanceProbe.test.ts',
  'statGrowthBalanceSim.test.ts',
  'dogSystemPerfSmoke.test.ts',
  'engagementSmoke.test.ts',
  // ── whole-content sweeps: every quest / every surface, minutes each ────
  'completionistOutcomeSweep.test.ts',
  'completionistSpineSweep.test.ts',
  'edgeCaseSweepPostCleanup.test.ts',
  // ⚠ over TWENTY MINUTES on its own — the one suite in this file whose cost is
  // not an estimate. It walks every contrary road of every mission family.
  'ota1699ContraryWalkerSweep.test.ts',
];

/** A jest --testPathIgnorePatterns / --testPathPattern fragment for the list. */
export function heavyPattern() {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `(${HEAVY_SUITES.map(esc).join('|')})$`;
}

// CLI: `node scripts/heavy-suites.mjs --pattern` prints the jest path fragment,
// so package.json passes ONE generated value instead of seven loose words that
// each match by accident.
if (process.argv.includes('--pattern')) process.stdout.write(heavyPattern());
