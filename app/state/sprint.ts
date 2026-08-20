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
 */

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
let sprintActionTimes: number[] = [];
export function notePlayerActionForSprint(now: number = Date.now()): void {
  sprintActionTimes = sprintActionTimes.filter((t) => now - t < SPRINT_WINDOW_MS);
  sprintActionTimes.push(now);
}
export function playerIsSprinting(now: number = Date.now()): boolean {
  return sprintActionTimes.filter((t) => now - t < SPRINT_WINDOW_MS).length >= SPRINT_ACTIONS;
}
export function _resetSprintForTest(): void { sprintActionTimes = []; }
