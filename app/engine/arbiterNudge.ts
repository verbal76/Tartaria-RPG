// OTA-1459 — THE ARBITER STOPS SAYING THE SAME THING ALL DAY.
//
// Owner's device log, one session:
//
//   "There's coin on the board for a willing blade," the Arbiter says. "Read the World."
//   ... × 7, of which the near-duplicate guard suppressed 5.
//
// ⚠⚠ THE DEDUP GUARD WAS NOT THE FIX AND WAS NEVER MEANT TO BE. It suppresses an
// EXACT repeat of the immediately-preceding line. That makes the feed survivable;
// it does nothing about the Arbiter having one thought all day. A companion whose
// only defence against repetition is "don't say it twice in a row" reads as a
// notification engine, which is exactly the note an outside review gave: the
// vendors have voices (Nalren on what the cold kills first, Halem on being paid in
// doors) and the Arbiter has a loop.
//
// ⚠⚠⚠ AND THE ROOT CAUSE IS THAT THIS LINE NEVER JOINED THE CHOKE POINT.
// `narration.ts` has one — `speakArbiterFlavor`, and its own comment says why:
// "a rule applied at three of the four call sites would have left the fifth to
// ramble." The bounty nudge is that fifth. It calls `appendLog('arbiter', …)`
// directly from the world-event tick, so no budget ever saw it.
//
// ⚠⚠ WHY A SEPARATE COOLDOWN RATHER THAN REUSING THE FLAVOUR BUDGET. The flavour
// budget is per TILE with a 25-second wall-clock gap — right for "remark on this
// room", wrong for this. This is a WORLD-STATE nudge: a bounty has been posted
// somewhere, and it stays true for as long as the bounty stands. Wall-clock is the
// wrong axis too, because the trigger is the world tick and the world ticks when
// TIME passes — and the player advances time in eight-hour blocks by resting. In
// the owner's log he rested fifteen times, which is fifteen chances to be told the
// same thing, in about four minutes of real time. So the cooldown is measured in
// GAME HOURS, the same clock the trigger runs on.

/** In-game hours the Arbiter must stay quiet about the board after mentioning it.
 *  ⚠ Two full days: long enough that it reads as news rather than nagging, short
 *  enough that a player who has genuinely been away for a week hears it again. */
export const BOUNTY_NUDGE_COOLDOWN_HOURS = 48;

/** ⚠ Module state, mirroring how `narration.ts` holds the flavour budget. It resets
 *  on reload, which is correct and deliberate: hearing the board mentioned once on
 *  a fresh launch is orientation, not nagging, and persisting it would mean a save
 *  migration for a cosmetic cooldown. */
let lastBountyNudgeAtHour: number | null = null;

/**
 * May the Arbiter mention the bounty board right now? Consumes the cooldown when it
 * says yes, so callers cannot forget to.
 *
 * ⚠ A NON-FINITE hour reads as "yes, and do not record it". The world tick is the
 * only caller and it always has a real hour, but a NaN slipping in must not latch
 * the Arbiter into permanent silence — a companion that goes quiet forever is a
 * worse bug than one that repeats.
 */
export function takeBountyNudge(nowHour: number): boolean {
  if (!Number.isFinite(nowHour)) return true;
  if (lastBountyNudgeAtHour !== null
      && nowHour - lastBountyNudgeAtHour < BOUNTY_NUDGE_COOLDOWN_HOURS) {
    // ⚠ Also covers the clock going BACKWARDS (a restore from backup): a negative
    // gap is smaller than the cooldown, so it holds rather than firing on every
    // tick until the clock catches up.
    return false;
  }
  lastBountyNudgeAtHour = nowHour;
  return true;
}

/** Tests only — module state. */
export function _resetBountyNudge(): void {
  lastBountyNudgeAtHour = null;
}
