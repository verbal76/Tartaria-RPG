/**
 * app/state/humanActivity.ts — THE PLAYER IS HERE, WHICH IS NOT THE SAME AS
 * THE PLAYER TOOK A TURN.
 *
 * ⚠⚠⚠ OTA-1807 (Baker item 13) — THE FALSE-IDLE ADMISSION. Two authorities
 * decide whether optional background work may start:
 *
 *   `lastPlayerActionAt`  — when the player last did anything. Read by
 *     `introFillTick` (bootSlice) against a 6–20 s floor, and by
 *     `playerActionIsSettling` (ai/narration) against a 1.5 s settle window.
 *   `uiIdleSince`         — stamped only by STATIONARY SCREENS (the pack).
 *     Read by the item-synthesis requester and the homework tick.
 *
 * Both are written in exactly ONE place today: `submitPlayerAction`, "the one
 * door every action passes through" (OTA-1126 / OTA-1129). That sentence is
 * true of TYPED and chip-driven input and false of the Gather sheet: a direct
 * Take is a store mutation (`takeAmbientNoun`), never a submit. MEASURED on
 * e7eea2e3, with the item actually granted:
 *
 *   submitPlayerAction('look')  → uiIdleSince cleared, lastPlayerActionAt set
 *   takeAmbientNoun('rope')     → item granted, and NEITHER moved
 *
 * So a player standing in a room clearing it by hand — tap, tap, tap — was
 * invisible to every one of those gates. Past the 6 s floor the scene-intro
 * bank starts a full narration-sized generation on top of somebody who is
 * plainly still playing. That is the defect, and it is all this file fixes.
 *
 * ⚠⚠ WHY THIS IS NOT `submitPlayerAction`, AND MUST NOT BECOME IT. Routing a
 * Take through the action pipeline to borrow its bookkeeping would buy the
 * bookkeeping with a gameplay turn: the parser, the stamina table, the roll
 * queue, the epoch bump, the breadcrumb, the deferred Qwen warm. A Take is a
 * direct mutation and stays one. This function therefore carries the SMALLEST
 * honest subset — the two activity stamps — and nothing else.
 *
 * ⚠⚠ AND IT DELIBERATELY DOES NOT FEED `notePlayerActionForSprint`. That door
 * stopped being pure activity accounting at OTA-1472: it calls
 * `preemptHomeworkForPlayer` before anything else, and it feeds the sprint
 * detector that governs whether a scene intro may START AT ALL. Both are
 * scheduling decisions about gameplay turns, and a Take is not one — three
 * Takes in four seconds are not a speed-run, they are a player picking up three
 * things. Homework preemption (J2) is a separate question with its own
 * evidence, and is left open on purpose rather than smuggled in through here.
 *
 * ⚠ NO IMPORT FROM THE STORE'S OWN GRAPH. gameStore does not import this file,
 * so the screen-layer call sites cannot cycle. The store is at its ceiling
 * (check:storeceiling, 36,945 with no headroom and the standing ruling
 * "EXTRACT, DO NOT JUST RAISE IT"), which is the other reason the authority
 * lives out here rather than as a store action.
 */
import { useGameStore } from './gameStore';

/**
 * A genuine direct human interaction happened — one that mutates the game but
 * never passes through `submitPlayerAction`.
 *
 * ⚠ THE uiIdleSince CLEAR IS GUARDED AND, IN THIS FAMILY, A NO-OP. Nothing on
 * the Exploration screen stamps that field — only the pack does — so today this
 * branch never fires for a Take. It is here because the field's MEANING is
 * "the player is not touching anything", and a function named for human
 * activity that left a stale idle stamp standing would be lying on the day some
 * future direct control appears on a stationary screen. Idempotent, exactly as
 * `submitPlayerAction`'s own copy is.
 *
 * ⚠ `now` is injectable so a test can prove the genuine-idle threshold still
 * arrives without sleeping through it.
 */
export function noteHumanInteraction(now: number = Date.now()): void {
  const st = useGameStore.getState();
  if (st.uiIdleSince !== null) useGameStore.setState({ uiIdleSince: null });
  useGameStore.setState({ lastPlayerActionAt: now });
}
