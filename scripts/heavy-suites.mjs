/**
 * ⚠⚠⚠ WHICH SUITES DO **NOT** BLOCK A SHIP, AND WHY EACH ONE DOESN'T.
 *
 * Before OTA-1728 the split was seven bare words matched as SUBSTRINGS against
 * every test path:
 *
 *     jest --testPathIgnorePatterns /node_modules/ Stress stressMode Chaos Probe Smoke Sweep Sim
 *
 * So whether a suite guarded a ship was decided by what someone had NAMED it.
 * Nothing declared "this is a heavy sim"; a file simply had the word in it. Three
 * OTA REGRESSION suites were silently outside the gate for that reason alone, and
 * two of them were RED — ota1483ThreeFromTheSecondSweep (2s) and
 * ota1268InvestigateAllActuallySweeps (5s), both broken instruments rather than
 * broken game, both red since roughly OTA-1497. Nobody could know, because nothing
 * ever ran them.
 *
 * ⚠⚠ THE RULE IS: BLOCKING BY DEFAULT. A suite is non-blocking only if it is named
 * here, with a reason. Adding a file to `__tests__` puts it in the gate; opting out
 * is a decision someone has to write down. `check:testsplit` fails if a name here
 * no longer exists, and refuses package.json if it goes back to splitting by name.
 *
 * ⚠⚠⚠ OTA-1729 — AND THEN THE EXEMPTIONS THEMSELVES WERE AUDITED, because a list
 * nobody has measured is just a longer version of the old guess. Every one of the
 * 30 was TIMED, with a 200s ceiling, and the fast ones were then run THREE TIMES
 * each to prove they were deterministic rather than merely lucky:
 *
 *     ≤10s and green ......... 13 suites, 59 tests, 3/3 green each  → PROMOTED
 *     11–61s and green ....... 10 suites                            → still exempt
 *     red ....................  4 suites                            → still exempt
 *     over the 200s ceiling ..  4 suites                            → still exempt
 *
 * THIRTEEN SUITES CARRYING 59 TESTS WERE COSTING THE GATE ABOUT 57 SECONDS AND
 * WERE EXEMPT ONLY BECAUSE OF THEIR NAMES: statGrowthBalanceSim (2s),
 * stressMode_chaos (3s), stressMode_drunkSpelling (3s), craftingInventoryChaosSim
 * (4s, 15 tests), dogHungerTimingChaos (4s, 11 tests), encounterStress (4s),
 * golemStressSweep (4s), travelSceneBarChaos (4s), stressMode_collectAll (5s),
 * edgeCaseSweepPostCleanup (6s, 17 tests), stressMode_cartographer (6s),
 * engagementSmoke (8s), metaNavStress (8s). They block now.
 *
 * ⚠ NOT EVERYTHING WAS PROMOTED, deliberately. The 11–61s tier is real regression
 * coverage too, but it costs about five more minutes of blocking CI and that is the
 * owner's call rather than mine — the measured cost is written against each one
 * below so the decision can be made from numbers.
 *
 * ⚠⚠ FOUR EXEMPT SUITES ARE CURRENTLY RED, and that is worth knowing rather than
 * hiding: engineStateChaosSim (10s, 2 failing), completionistOutcomeSweep (48s, 5),
 * interactionStress (123s, 1), yearSimulation (124s, 1). All four predate this
 * pass. None can be promoted while red, and each is a separate investigation.
 */

/** Non-blocking suites, by exact basename, with the measured reason. */
export const HEAVY_SUITES = [
  // ── over the 200s ceiling: genuinely expensive, promote nothing here ──
  'combatStress.test.ts',            // >200s
  'completionistSpineSweep.test.ts', // >200s — walks every quest spine
  'ota1699ContraryWalkerSweep.test.ts', // >200s — every contrary road of every family
  'playerWalkerSim.test.ts',         // >200s

  // ── currently RED. Exempt because they fail, not because they are slow.
  //    Each needs its own investigation; none may be promoted while red. ──
  'engineStateChaosSim.ts',          //  10s · 2 failing
  'completionistOutcomeSweep.test.ts', //  48s · 5 failing
  'interactionStress.test.ts',       // 123s · 1 failing
  'yearSimulation.test.ts',          // 124s · 1 failing

  // ── 11–61s and green. Promotable on the owner's word; the cost is the
  //    reason they are still here, roughly five minutes of blocking CI. ──
  'dogSystemPerfSmoke.test.ts',      //  11s · 3 tests
  'dogGolemCombatStress.test.ts',    //  13s · 9 tests
  'movementStress.test.ts',          //  18s · 1 test
  'domesticStress.test.ts',          //  19s · 1 test
  'playerInputChaosSim.ts',          //  22s · 15 tests
  'crossSystemRegressionStress.test.ts', // 23s · 4 tests
  'combatBalanceProbe.test.ts',      //  28s · 1 test — measures numbers, not behaviour
  'thousandDayStressSim.test.ts',    //  48s · 1 test
  'stressMode_craftALot.test.ts',    //  51s · 1 test
  'twoYearChaosSim.test.ts',         //  61s · 1 test
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
