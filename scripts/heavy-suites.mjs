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
 * ⚠⚠⚠ 2026-09-10 CLOSEOUT — THE OWNER MADE THAT CALL, BY INVARIANT. Eight of the
 * ten were promoted to blocking after three green passes each on the closeout tree:
 * dogGolemCombatStress (NaN HP / stalls / status flips), movementStress (crashes,
 * travel rate), domesticStress (inventory dupes and loss), playerInputChaosSim
 * (parser honesty and refusal), crossSystemRegressionStress (cross-system
 * violations), and the three long sims — thousandDayStressSim (uncaught
 * exceptions, 28–30s), stressMode_craftALot (inventory corruption, 53–54s),
 * twoYearChaosSim (crashes, 55–64s) — "the approximately three additional minutes
 * is acceptable for invariants of this severity." Two stay exempt on purpose:
 * dogSystemPerfSmoke measures TIMING, and combatBalanceProbe observes counts
 * rather than enforcing a release-blocking invariant.
 *
 * ⚠⚠ THE FOUR RED SUITES were classified the same day, and nothing in production
 * changed for them: engineStateChaosSim and completionistOutcomeSweep were TEST
 * DEFECTS (a stale room-key shape and a stale legacy range field), repaired and
 * green; yearSimulation was a BUDGET defect (passes in ~430–580s under a 15-minute
 * budget; its own timeout was 120s), reconciled; interactionStress was a stale
 * absolute floor, reconciled to the invariant it stood for. They stay in this list
 * until the owner rules on promoting them — being green is not being promoted.
 */

/** Non-blocking suites, by exact basename, with the measured reason. */
export const HEAVY_SUITES = [
  // ── over the 200s ceiling: genuinely expensive, promote nothing here ──
  'combatStress.test.ts',            // >200s
  'completionistSpineSweep.test.ts', // >200s — walks every quest spine
  'ota1699ContraryWalkerSweep.test.ts', // >200s — every contrary road of every family
  'playerWalkerSim.test.ts',         // >200s

  // ── formerly RED, repaired 2026-09-10 (test defects and budgets; production
  //    untouched). Green, and still here until the owner rules on promotion. ──
  'engineStateChaosSim.ts',          //  13s · green since 2026-09-10 (room key, roll queue)
  'completionistOutcomeSweep.test.ts', //  47s · green since 2026-09-10 (bullseye band)
  'interactionStress.test.ts',       // ~150s · green since 2026-09-10 (floor reconciled)
  'yearSimulation.test.ts',          // ~430–580s · green since 2026-09-10 (15-minute budget)

  // ── exempt by what they are, not how long they take (owner ruling 2026-09-10) ──
  'dogSystemPerfSmoke.test.ts',      //  11s · 3 tests — measures TIMING, not correctness
  'combatBalanceProbe.test.ts',      //  28s · 1 test — measures numbers, not behaviour
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
