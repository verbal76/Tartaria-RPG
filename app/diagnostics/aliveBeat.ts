import { AppState } from 'react-native';
import { stampAliveBeat } from '../engine/saveSystem';

/* ⚠⚠⚠ LAG-3 — THE ALIVE BEAT BELONGS TO THE APP, NOT TO ONE SCREEN.
 *
 * F7 DISPROVED the reading that the repeated "died ~1 second into the process"
 * records prove OTA-specific crashes, and named the cause: the beat that dates a
 * death (`stampBreadcrumbPhase('rendered')`) is stamped by ExplorationScreen's
 * render effect and by nothing else. Hydration lands on the TITLE screen. A
 * process that boots fine, sits on the title for twenty minutes and is then
 * reclaimed by Android therefore has one and only one sign of life — the boot
 * itself — so the record reads "died 1s into the process, alive 0ms after
 * boot:qwen:deferred". F7 found that same signature on 14 of 27 cold boots.
 *
 * ⚠ SO THIS IS AN INSTRUMENT REPAIR, AND ONLY THAT. Nothing about the OTA path,
 * the model lifecycle or the teardown changes. What changes is that the app
 * keeps saying "still here" from wherever it actually is, so a reported death
 * age is a real observation instead of an artefact of which screen was open.
 *
 * ⚠⚠ WHAT IT COSTS, DELIBERATELY BOUNDED:
 *   - it runs only while the app is ACTIVE. A backgrounded process must not keep
 *     writing, both because it would burn wakeups and because the transition
 *     itself is already stamped and carries the orderly-exit flag that OTA-1413
 *     uses to tell a reclaim from a crash;
 *   - one storage write per beat, at the same key and through the same throttled
 *     heartbeat path ExplorationScreen already used;
 *   - it touches NO store state, so it can never cause a render. That was the
 *     other half of the brief: "do not create unnecessary store/render churn."
 */

/** Slow on purpose. The beat's job is to date a death to the nearest few
 *  seconds, not to sample anything; a death is separated from its last beat by
 *  at most this, which is the entire precision the record needs. */
export const ALIVE_BEAT_MS = 3_000;

let timer: ReturnType<typeof setInterval> | null = null;
let sub: { remove: () => void } | null = null;
/** How the beat names where the app is. Set by the navigation layer so the
 *  crumb carries the screen even on surfaces that render nothing else. */
let screenOf: (() => string | undefined) | null = null;
let stageOf: (() => string | undefined) | null = null;
let beats = 0;

/** Tell the beat how to name the current screen and boot stage. Both are
 *  read at beat time, never held, so a stale closure cannot mislabel a death. */
export function setAliveBeatContext(
  screen: (() => string | undefined) | null,
  stage?: (() => string | undefined) | null,
): void {
  screenOf = screen;
  stageOf = stage ?? null;
}

function beat(): void {
  try {
    stampAliveBeat({
      screen: screenOf?.(),
      appState: AppState.currentState ?? 'active',
      stage: stageOf?.(),
    });
    beats += 1;
  } catch { /* an instrument may never break the app it observes */ }
}

/** Start the beat. Idempotent — a second call is a no-op, so a remount cannot
 *  stack two intervals writing the same key. */
export function startAliveBeat(): void {
  if (timer !== null) return;
  beat(); // one immediately, so a process that dies before the first tick still has a beat
  timer = setInterval(beat, ALIVE_BEAT_MS);
  try {
    sub = AppState.addEventListener('change', (next) => {
      // ⚠ The beat stops at the door and resumes at the door. A backgrounded
      // process that Android reclaims is dated at its last active beat, which
      // is exactly the fact OTA-1413 wants: it was alive, then it went away.
      if (next === 'active') {
        beat();
        if (timer === null) timer = setInterval(beat, ALIVE_BEAT_MS);
      } else if (timer !== null) {
        clearInterval(timer);
        timer = null;
        beat(); // one last stamp naming the state it left in
      }
    }) as unknown as { remove: () => void } | null;
  } catch { /* older RN shapes return void — the interval still runs */ }
}

export function stopAliveBeat(): void {
  if (timer !== null) { clearInterval(timer); timer = null; }
  try { sub?.remove(); } catch { /* ignore */ }
  sub = null;
}

/** Tests only. */
export function _aliveBeatState(): { running: boolean; beats: number } {
  return { running: timer !== null, beats };
}
/** Tests only. */
export function _resetAliveBeatForTest(): void {
  stopAliveBeat();
  beats = 0;
  screenOf = null;
  stageOf = null;
}
