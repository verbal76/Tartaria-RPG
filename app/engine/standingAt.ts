// OTA-1458 — "AM I STANDING AT X?", ASKED ONCE, ANSWERED THE SAME WAY EVERYWHERE.
//
// Owner, from the device log: *"why does it still think I am in the market, also
// I went 4-5 spaces west of the market and went to autoroute back and the atlas
// said I was still there and wouldn't let me auto route."*
//
// ⚠⚠⚠ AND THIS IS THE THIRD TIME THIS EXACT FACT HAS HAD A READER LEFT BEHIND,
// WHICH IS WHY IT IS A MODULE AND A GATE RATHER THAN A FOURTH ONE-SITE PATCH.
//
//   OTA-1347  fixed the MAP MARKER. Its own comment cites the owner's log:
//             "six taps east from Iskan-Veil and the marker never moved, because
//             free wandering changes the grid cell while currentLocationId still
//             names the origin."
//   bountyCourse.ts  states the rule outright in a doc comment: "am I standing on
//             it is a GRID-CELL question (playerGridCell vs canonicalCellOf), not
//             a currentLocationId string compare — you can be paces off a location
//             in open ground and still read its id."
//   MapScreen  kept comparing the id anyway, in the TRAVEL TO list and the footer.
//
// So the knowledge was written down twice and applied to one reader out of three.
// The marker moved correctly across the map while the list underneath it insisted
// the player had never left — and refused to offer a route home, because a place
// you are already standing at is not somewhere you can travel to.
//
// ⚠⚠ WHY THE ID COMPARE IS WRONG, PRECISELY. `currentLocationId` means "the last
// NAMED place the player stood at". It is not a position. Walking open ground
// between two named locations changes `gridX/gridY` on every step and leaves
// `currentLocationId` alone — by design, because arrival narration, weather and
// the scene bank all key off the place you came from. It is a perfectly good
// field being asked a question it was never able to answer.

import type { PlayerCharacter } from './types';
import { canonicalCellOf } from './worldMap';
import { playerGridCell } from '../state/playerGrid';

/**
 * True when the player's authoritative grid cell IS the location's canon cell.
 *
 * ⚠ Use this for every "am I here?" decision a player can see: whether a place
 * offers a route, whether a contract reads "you're here", what the map footer
 * says. Do NOT use `player.currentLocationId === id` for those — see the header.
 *
 * ⚠ `currentLocationId` remains correct for "which place's rules apply to me" —
 * weather, scene bank, sacred ground, arrival narration. That question really is
 * about the last named place, and this function is not a replacement for it.
 */
export function standingAtLocation(
  player: PlayerCharacter | null | undefined,
  locationId: string | null | undefined,
): boolean {
  if (!player || !locationId) return false;
  const here = playerGridCell(player);
  const there = canonicalCellOf(locationId);
  return here.x === there.x && here.y === there.y;
}

// ---------------------------------------------------------------------------
// OTA-1480 — AND THE FOURTH READER, WHICH ASKED THE SAME QUESTION IN A SECOND
// COORDINATE SYSTEM, IN THREE PLACES.
// ---------------------------------------------------------------------------
//
// ⚠⚠ The header above says this fact has had a reader left behind three times.
// Here is the fourth, and it is worse than a missed reader: it is a whole second
// ANSWER, written independently and then copied twice.
//
//   app/state/gameStore.ts      `function isStationedAtNamedLocation(p)` — private,
//                               so nothing outside the store could call it.
//   app/screens/ExplorationScreen.tsx   a hand-rolled copy, under a comment reading
//                               "Mirror isStationedAtNamedLocation".
//   app/screens/ContractsScreen.tsx     a second hand-rolled copy, under a comment
//                               reading "Mirror isStationedAtNamedLocation".
//
// Both screens knew they were duplicating a rule and wrote the duplicate anyway,
// because the original was not exported. A predicate that is private to one file
// and needed by three is not private, it is copied.
//
// ⚠⚠ AND THE COPIES ASKED THE VISUAL FRAME. All three tested
// `mapX === WORLD_MAP_CENTER_X && mapY === WORLD_MAP_CENTER_Y` — the RE-CENTERED
// display coordinate — while `playerGridCell` (OTA-1398: "ONE source of truth for
// where the player is") and `standingAtLocation` above both use the AUTHORITATIVE
// absolute cell. Two coordinate systems, one question, four sites. They agree
// today, and the suite proves it across a state matrix rather than assuming it;
// they agree because arrival writes both. The moment one write is missed they
// stop agreeing, and that is precisely the class of bug OTA-1347 and OTA-1458
// were written for.
//
// So this reads the authoritative cell, like everything else that asks where the
// player is.

import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from './worldMap';

/**
 * True when the player is REALLY AT the last named place they arrived at —
 * standing on its anchor, or inside one of its buildings — rather than merely
 * carrying its id after wandering off.
 *
 * ⚠ THE DIFFERENCE FROM `standingAtLocation`: that one asks about a location you
 * NAME ("am I at Drakova?"). This one asks about the location the player record
 * already points at ("am I at wherever I last arrived?"), and additionally
 * accepts being indoors there. Both are position questions and both now read the
 * authoritative grid cell; neither is `currentLocationId === id`.
 *
 * ⚠ THE THREE CLAUSES, EACH FOR A REASON:
 *
 *   travelTarget    — mid-journey, the departure city is not "here". Kept from the
 *                     original. Strictly it is belt-and-braces now, since a single
 *                     step off the anchor already fails the cell test below; it
 *                     stays because it also covers the instant between plotting a
 *                     course and taking the first step, and removing it would be a
 *                     behaviour change this OTA has no business making.
 *   hubRoomId       — inside a building AT the location. You are as "here" as it
 *                     is possible to be, and your grid cell is the location's.
 *   the cell test   — the anchor itself.
 */
export function stationedAtNamedLocation(
  player: PlayerCharacter | null | undefined,
): boolean {
  if (!player) return false;
  if (player.travelTarget) return false;
  if (player.hubRoomId != null) return true;
  return standingAtLocation(player, player.currentLocationId);
}

/**
 * ⚠ THE OLD VISUAL-FRAME SPELLING, kept ONLY so the suite can prove the two agree
 * across every state a player can be in. Nothing in the app may call it — the
 * gate enforces that — and it exists to make a claim checkable rather than
 * asserted. Delete it the day the pin that uses it is deleted.
 */
export function _stationedByVisualFrameForTest(
  player: PlayerCharacter | null | undefined,
): boolean {
  if (!player) return false;
  if (player.travelTarget) return false;
  if (player.hubRoomId != null) return true;
  return player.mapX === WORLD_MAP_CENTER_X && player.mapY === WORLD_MAP_CENTER_Y;
}
