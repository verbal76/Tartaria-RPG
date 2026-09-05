// OTA-1694 — THE DICE CLOCK. The owner: "I am talking specifically about lag
// during combat." The 09-05 log put the attack→dice gap at a 5.4s median with
// a tenth of a second when nothing sat between the two, and could not say
// where the seconds went: the roll modal had no clock. Every combat step is
// four moments — the store OPENS the step (pendingRolls set), the modal SHOWS
// it (React commit), the player TAPS ROLL, and the hold SETTLES into
// resolveRollStep — and each gap names a different culprit: open→shown is the
// render (a starved JS thread paints late), shown→tap is the player (or a tap
// the screen did not take), tap→settle is the 800ms hold (anything past it is
// the setTimeout firing late — the JS thread was busy). One `debug` line per
// step, so the next log reads the split instead of the sum.
//
// The hold constant lives here (moved from DiceRoller) so the store can name
// the lateness without importing a component.

export const AUTO_RESOLVE_HOLD_MS = 800;

/** A hold that fires this much past AUTO_RESOLVE_HOLD_MS is called late. */
export const HOLD_LATE_MS = 100;

/** Stamped by the DiceRoller: when the step's card committed (shownAt) and
 *  when ROLL was pressed (tappedAt). Both are Date.now() values. */
export interface RollTapTiming {
  shownAt: number;
  tappedAt: number;
}

const ms = (n: number) => `${Math.max(0, Math.round(n))}ms`;

/**
 * The one line. `openedAt` comes from the store's pendingRolls; `timing` from
 * the modal. Null when either half is missing (an internal roll, an old
 * caller) — the instrument never invents a number.
 *
 *   dice⏱ attack: shown +12ms, tapped +3400ms, settled +820ms = 4232ms
 *   dice⏱ damage: shown +5ms, tapped +900ms, settled +2100ms (hold late 1300ms) = 3005ms
 */
export function rollTimingLine(
  stepId: string,
  openedAt: number | undefined,
  timing: RollTapTiming | undefined,
  now: number = Date.now(),
  holdMs: number = AUTO_RESOLVE_HOLD_MS,
): string | null {
  if (!openedAt || !timing || !(timing.tappedAt > 0)) return null;
  // A stale shownAt (the commit effect did not run for this step) predates the
  // open; then the tap is measured from the open and the render gap is unknown.
  const shownKnown = timing.shownAt >= openedAt;
  const shownFrom = shownKnown ? timing.shownAt : openedAt;
  const shown = shownKnown ? `shown +${ms(timing.shownAt - openedAt)}` : 'shown ?';
  const tapped = `tapped +${ms(timing.tappedAt - shownFrom)}`;
  const settleMs = now - timing.tappedAt;
  const late = settleMs - holdMs;
  const settled = `settled +${ms(settleMs)}${late >= HOLD_LATE_MS ? ` (hold late ${ms(late)})` : ''}`;
  return `dice⏱ ${stepId}: ${shown}, ${tapped}, ${settled} = ${ms(now - openedAt)}`;
}
