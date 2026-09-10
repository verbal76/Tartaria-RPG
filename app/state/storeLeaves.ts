// ⚠⚠⚠ OTA-1796 — THE STORE'S LEAVES: values the store's INITIAL STATE reads, kept
// in a module with no imports so they exist before `create()` runs.
//
// `useGameStore = create(...)` evaluates its initialiser DURING gameStore's
// module evaluation, and that initialiser hands the slices a deps object. Two
// of those deps were module-level bindings declared 25,000 lines BELOW the
// `create(` call:
//
//   • FRESH_ENEMY_ARRAYS (a const). On web, Metro keeps `const`, so reading it
//     before its declaration is a TDZ error — "Cannot access
//     'FRESH_ENEMY_ARRAYS' before initialization" — and the web line could not
//     boot (found by OTA-1756, worked around with a harness stub). On native
//     and under jest the RN Babel preset downlevels `const` to `var`, so the
//     SAME read returned `undefined` silently: questSlice's two wholesale
//     roster writes (`...deps.FRESH_ENEMY_ARRAYS`) spread nothing, and the
//     OTA-1140 reset they were built to carry never ran there.
//
//   • _chainRouting (a `let`). Passed to the slice BY VALUE (false), while the
//     store's setTravelCourse read the module binding. questSlice wrote
//     `deps._chainRouting = true` — a property on the deps object nobody read
//     — so ROUTE TO on a faction contract set `routedMission` and the very next
//     line dropped it as a "manual diversion". Measured 2026-09-10: three
//     starter contracts routed, `routedMission: null` after each.
//
// The fix is the same for both: the value lives HERE, the store and the slice
// import it, and a flag that two modules must share is a property on an object
// they both hold, not a binding one of them copied.

/** ⚠ OTA-1140 (pressure test) — EVERY per-enemy parallel array, reset in one
 *  place. Three agents independently converged on the same defect class: sites
 *  that replace or clear the `enemies` roster wholesale reset SOME of the
 *  parallel arrays and leave the rest — so a hunt boss spawned into a scene
 *  that held an acid-shredded enemy was born at reduced AC, a fled Guardian's
 *  ground-off armor was BANKED for the re-summon (the ":20271 flee can't chip
 *  them down" promise held for HP and silently failed for AC), and a stagger
 *  latched on a non-boss survived into the next roster. Spread this FIRST in
 *  any wholesale roster write; explicit per-site resets after it still win. */
export const FRESH_ENEMY_ARRAYS = {
  enemyStatuses: undefined,
  enemyArmorShred: undefined,
  enemyCorruptionStacks: undefined,
  enemyStaggered: undefined,
  enemyKnockedOut: undefined,
  enemyAmbushUsed: undefined,
  // ⚠ OTA-1678 — the failed-break count belongs to the bodies it was earned against.
  fleeAttempts: undefined,
} as const;

/** MISSION ROUTE CHAIN. When the player taps ROUTE TO on a contract,
 *  `player.routedMission` is set and the engine courses to the objective, then —
 *  once the work is done — auto-courses to the turn-in. `chainRouting.active`
 *  lets the engine's own setTravelCourse calls bypass the "player diverted, drop
 *  the chain" guard in setTravelCourse. One object, held by the store AND the
 *  quest slice, so a write from either side is the read on the other. */
export const chainRouting = { active: false };
