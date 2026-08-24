/**
 * app/state/sprint.ts — THE SPRINT DETECTOR.
 *
 * OTA-1398 (slice 7 of the gameStore split). Three player actions inside four
 * seconds means the player is not reading, and a 15-second model generation
 * aimed at someone not reading is pure cost.
 *
 * ⚠⚠ IT MOVED DOWN, NOT SIDEWAYS, AND THAT IS THE WHOLE REASON THIS FILE EXISTS.
 * The narration path (`app/ai/narration.ts`) asks whether the player is
 * sprinting, and so does gameStore — the vendor-voice warm and the action
 * pipeline both read it. Shared mutable state cannot travel with either owner:
 * whichever module it left would be assigning to an imported binding, which is
 * a compile error. So the `let` moves DOWN to a module neither owns, and both
 * reach it through the two functions below. Same answer `saveLimits.ts` gave
 * for the log cap and `runtimePressureWatch.ts` gave for the memory latches.
 *
 * ⚠ NOTHING HERE CHANGED. Same window, same threshold, same filter. ota1358
 * covers it and passes unchanged.
 *
 * ⚠⚠ OTA-1472 — AND IT IS NOW ALSO THE PREEMPTION SIGNAL. The sprint numbers are
 * still untouched; what was added is one call at the top of
 * `notePlayerActionForSprint`, because this function is already the single
 * canonical "the player did something" feed and the thing being fixed is a hook
 * that was wired to too few doors. See the comment there.
 *
 * ⚠ `app/ai/nativeMlLock` imports nothing at all — it is a pure leaf — so this
 * dependency cannot cycle.
 */
import { preemptHomeworkForPlayer } from '../ai/nativeMlLock';

// ⚠⚠ OTA-1358 — THE SPRINT DETECTOR. Owner: "people will turn this into a speed
// run clicker" — and his own fourth-freeze receipt showed what that costs today:
// 14 generations wasted, 191 seconds of native model compute in four and a half
// minutes of fast play, ~93% of scene intros thrown away as
// `cancelled:player-acted-again`, per-token cost degrading 1.8→31.1ms right up
// to the process death. A player landing 3+ actions inside 4 seconds is
// SPRINTING: they will not read a 15-second generation, so none should START.
// Template lines carry fast play; the model waits for a reader. The window is
// deliberately short — one thoughtful pause (>4s) and the Arbiter is back.
const SPRINT_WINDOW_MS = 4_000;
const SPRINT_ACTIONS = 3;
/** ⚠⚠ OTA-1405 — ONE PLAYER ACTION COUNTS ONCE, HOWEVER MANY DOORS IT PASSES.
 *
 *  This exists because the fix below had to widen the feed. Until now the only
 *  caller was `submitPlayerAction`, so the detector could only ever see TYPED and
 *  chip-driven input — and the actions that begin a scene (travelling, entering a
 *  building, changing rooms, continuing a journey) are separate store actions
 *  that never pass through that door. A player crossing the map by button was
 *  invisible to it: `playerIsSprinting()` stayed false through the entire burst,
 *  and the scene-intro gate it guards therefore never fired for the single most
 *  repeated interaction in the game.
 *
 *  ⚠ Feeding it from `beginScene` as well fixes that, and introduces the reason
 *  for this window: one typed action can BOTH submit and begin a scene, and
 *  counting it twice would trip a 3-action gate on two real actions. So notes
 *  inside this window coalesce. It is far shorter than any human double-tap
 *  (measured at ~180-250ms in the device logs), so it collapses one action's
 *  several doors without ever collapsing two genuine taps. */
const SPRINT_COALESCE_MS = 120;
let sprintActionTimes: number[] = [];
export function notePlayerActionForSprint(now: number = Date.now()): void {
  // ⚠⚠⚠ OTA-1472 — AND THE PLAYER ACTING CUTS HOMEWORK SHORT.
  //
  // Owner's device log: a 3150 ms LOGIC STALL during a flee, right after an
  // 8.2 s `ambient_fill`. The freeze watch samples every 5000 ms and reports
  // `now - lastSample - 5000`, so 3150 means the sampler fired 8150 ms late —
  // within 50 ms of that fill's own runtime. The flee landed inside it.
  //
  // ⚠⚠ OTA-1123 built the cure and hung it on the wrong trigger: homework's
  // `onPreempt` hook fires only when ANOTHER native-ML call is enqueued. A flee
  // needs no model, and neither does a move, or a chip tap — so for most actions
  // the mechanism written to stop exactly this was never asked. The sprint gate
  // below is the near miss: it governs what STARTS, needs three actions to trip,
  // and (OTA-1405) "the first generation of a burst is always already running by
  // then". Nothing looked at what was ALREADY RUNNING for a single action.
  //
  // ⚠ THIS FUNCTION IS THE RIGHT PLACE PRECISELY BECAUSE OF THE HEADER ABOVE:
  // it is already the ONE canonical "the player did something" feed, widened by
  // OTA-1405 to cover the button paths `submitPlayerAction` never saw. A second
  // door would be the many-doors mistake on the very fix that exists because a
  // signal was wired to too few doors.
  //
  // ⚠ Called BEFORE the coalesce return, so the FIRST door of an action cuts —
  // waiting for the door that happens to survive coalescing would delay the cut
  // by nothing useful. It is idempotent: the hook is cleared when it fires.
  preemptHomeworkForPlayer();
  const last = sprintActionTimes[sprintActionTimes.length - 1];
  if (last !== undefined && now - last < SPRINT_COALESCE_MS) return;
  sprintActionTimes = sprintActionTimes.filter((t) => now - t < SPRINT_WINDOW_MS);
  sprintActionTimes.push(now);
}
export function playerIsSprinting(now: number = Date.now()): boolean {
  return sprintActionTimes.filter((t) => now - t < SPRINT_WINDOW_MS).length >= SPRINT_ACTIONS;
}
export function _resetSprintForTest(): void { sprintActionTimes = []; }
