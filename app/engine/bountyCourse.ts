// OTA-1164 — WHAT THE "SET COURSE" CONTROL ON A HELD BOUNTY SHOULD SAY.
//
// Owner: "once you accept a bounty there's a separate block that asks you to auto
// route. it changes colors cuz it registers your choice but it doesn't actually auto
// route… you should have the set auto route on both pages in case they miss it and
// have it disappear once they do it."
//
// ⚠ THE COLOUR WAS NEVER CONFIRMATION. `activeOpacity` dims any TouchableOpacity on
// any tap, so the control looked identical whether it set a course, refused silently,
// or set one that instantly completed. Nothing on the card ever changed. The faction
// MISSION card two screens over already solved this — it swaps the ROUTE button for
// "▸ Auto-routing — objective: X" once routed, and "▸ You're at X" when you arrive.
// This is that same three-state treatment for bounties.
//
// ⚠ IT LIVES IN THE ENGINE BECAUSE TWO SCREENS RENDER IT. WorldScreen and
// ContractsScreen carried byte-identical copies of the button, which is exactly how
// the two drift: fix one, ship, and the other still lies. One source, both callers.

export type BountyCourseState =
  /** Standing on the quarry's outpost. There is no road to set — this is the state
   *  the owner hit, and the one that used to render an inviting button that did
   *  nothing at all. */
  | { kind: 'arrived'; locationName: string }
  /** A course to THIS bounty's outpost is running. The control becomes a status line
   *  — "have it disappear once they do it". */
  | { kind: 'routed'; locationName: string; tilesLeft?: number }
  /** A course is running, but to somewhere else (another contract, or a manual
   *  destination). Offering a second course would silently yank the first. */
  | { kind: 'busy'; locationName: string; otherName: string }
  /** No course running and not there yet — offer it. */
  | { kind: 'offer'; locationName: string };

export interface CoursePlayerView {
  currentLocationId?: string;
  travelTarget?: { locationId: string; distanceRemaining?: number } | null;
  whisperCourse?: { label?: string } | null;
}

/** Decide which of the four states a held bounty's course control is in.
 *  Pure, so both screens and the tests agree by construction.
 *
 *  ⚠ `atTargetOverride` exists because "am I standing on it" is a GRID-CELL question
 *  (`playerGridCell` vs `canonicalCellOf`), not a `currentLocationId` string compare —
 *  you can be paces off a location in open ground and still read its id. The screens
 *  pass the real answer in; the id compare below is only the fallback. */
export function bountyCourseState(
  player: CoursePlayerView | null | undefined,
  targetLocationId: string,
  targetLocationName: string,
  nameOf: (id: string) => string,
  atTargetOverride?: boolean,
): BountyCourseState {
  const name = targetLocationName;
  if (!player) return { kind: 'offer', locationName: name };

  const atTarget = atTargetOverride ?? (player.currentLocationId === targetLocationId);
  if (atTarget) return { kind: 'arrived', locationName: name };

  const tt = player.travelTarget;
  if (tt?.locationId === targetLocationId) {
    return { kind: 'routed', locationName: name, tilesLeft: tt.distanceRemaining };
  }
  if (tt) {
    return { kind: 'busy', locationName: name, otherName: nameOf(tt.locationId) };
  }
  if (player.whisperCourse) {
    return { kind: 'busy', locationName: name, otherName: player.whisperCourse.label ?? 'a course already set' };
  }
  return { kind: 'offer', locationName: name };
}

/** The line or button label for a state. Kept beside the state machine so a new
 *  state cannot be added without someone deciding what it says. */
export function bountyCourseLabel(s: BountyCourseState): string {
  switch (s.kind) {
    case 'arrived':
      // ⚠ Not a button. You are here; the contract is worked by KILLING, not by
      // arriving — and kills count anywhere regardless (see engine/bountyPrimer).
      return `▸ You're at ${s.locationName} — hunt them here.`;
    case 'routed':
      return s.tilesLeft === undefined
        ? `▸ Auto-routing to ${s.locationName} — keep tapping → on the travel row.`
        : `▸ Auto-routing to ${s.locationName} — ${s.tilesLeft} tile${s.tilesLeft === 1 ? '' : 's'} to go.`;
    case 'busy':
      return `▸ Already routed to ${s.otherName}. Finish or stop that course to set this one.`;
    case 'offer':
      return `SET COURSE TO ${s.locationName.toUpperCase()} ›`;
  }
}

/** Only the 'offer' state is tappable. The other three are status text — which is the
 *  "have it disappear once they do it" the owner asked for. */
export function bountyCourseIsButton(s: BountyCourseState): boolean {
  return s.kind === 'offer';
}
