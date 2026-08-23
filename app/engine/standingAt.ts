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
