// sceneIntroRefusals — OTA-1571.
//
// ⚠⚠⚠ THIS IS OTA-1465'S BUG, ONE SLOT OVER, and that is the finding. The
// homework tick has two slots: scene intros first, item descriptions second.
// OTA-1465 fixed the item slot after the owner's log showed "Smooth Stone"
// discarded three times and *no other item described after it entered his
// inventory* — because the scan takes the FIRST eligible name, so one
// permanently-failing entry does not merely waste its own generation, it
// OCCUPIES THE SLOT and starves everything behind it. Its own comment: *"The
// waste was the visible half; the blockage was the expensive one."*
//
// ⚠⚠⚠ THE SCENE-INTRO SLOT NEVER GOT THE SAME GUARD, and it picks its target the
// identical way — `.find(l => bank(l.id).length < INTRO_BANK_PER_LOC)`, the first
// location with a hungry bank. From the owner's 2026-08-30 log:
//
//   narration:scene_intro_fill n12 · ⚠2unusable · ✂8/57.9s
//   homework: scene_intro "Builders' Survey Camp" ∅  ×5 in a row
//
// Twelve generations for ONE location, eight discarded, 57.9 seconds thrown
// away — and while that ran, no other location banked anything. The device's own
// accounting put the session total at `WASTED 14 calls / 87.6s` and climbing.
//
// ⚠⚠ AND THE COST IS NOT ONLY BATTERY. Each of those is 8–10 seconds holding the
// native ML lock on a device whose last four process deaths all carry a
// `native:*` phase (OTA-1567). The owner's own action feedback queued behind one
// of these and arrived FIVE SECONDS LATE, in a room he had already left. This is
// the most expensive idle work in the game.
//
// ⚠⚠ THREE STRIKES, NOT ONE — and that is the one place this deliberately
// differs from the item ledger. An item description is a pure function of a
// name, so a single refusal is decisive. A scene intro's prompt carries world
// state that moves under it, and the log shows a location that failed four times
// and then SUCCEEDED on the fifth. One strike would forbid that; unlimited
// strikes is what we have now. Three caps the waste at ~27s per location instead
// of an open loop, and still lets a location that is merely unlucky come good.
//
// ⚠ NOT PERSISTED, for OTA-1465's reason exactly: a miss is a fact about THIS
// BUILD's prompt and validator, both of which change under the player between
// sessions. On disk it would keep a location broken until someone cleared
// storage. In memory it costs three attempts per launch and self-heals the
// moment a build lands that can write the place.

/** Misses before a location gives its slot up for the rest of the session. */
export const INTRO_FILL_STRIKES = 3;

/** ⚠ Bounded like the item ledger, and for the same reason: a long session that
 *  walks a hundred locations should not grow this without limit. Oldest-in wins
 *  eviction, because Map preserves insertion order. */
const MAX_TRACKED = 256;

const MISSES = new Map<string, number>();

/** Record that a bank fill for this location produced nothing usable. */
export function noteIntroFillMiss(locationId: string): void {
  if (!locationId) return;
  const k = locationId.toLowerCase();
  MISSES.set(k, (MISSES.get(k) ?? 0) + 1);
  if (MISSES.size > MAX_TRACKED) {
    const oldest = MISSES.keys().next().value as string | undefined;
    if (oldest !== undefined) MISSES.delete(oldest);
  }
}

/** Has this location spent its strikes? Such a location is skipped by the
 *  homework scan, so the slot moves on instead of being held. */
export function introFillExhausted(locationId: string): boolean {
  if (!locationId) return false;
  return (MISSES.get(locationId.toLowerCase()) ?? 0) >= INTRO_FILL_STRIKES;
}

/** ⚠ A SUCCESS CLEARS THE COUNT, mirroring `clearSynthRefusal`. A location that
 *  banks a line is not a location with two strikes against it, and leaving the
 *  count standing would retire it on its next two unlucky rolls despite having
 *  proved it can be written. Two records of the same fact are how they come to
 *  disagree. */
export function noteIntroFillHit(locationId: string): void {
  if (!locationId) return;
  MISSES.delete(locationId.toLowerCase());
}

/** Test seam — module state, so a suite that fills it must be able to empty it. */
export function _resetIntroFillMissesForTest(): void {
  MISSES.clear();
}

/** How many misses this location has on file. Exposed for the debug line, so a
 *  device log can show the strike count rather than only the outcome. */
export function introFillMissCount(locationId: string): number {
  return MISSES.get((locationId ?? '').toLowerCase()) ?? 0;
}
