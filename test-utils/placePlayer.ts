// OTA-1484 — PLACING A PLAYER IN A FIXTURE, WITHOUT INVENTING A STATE THE GAME
// CANNOT PRODUCE.
//
// ⚠⚠ WHY THIS EXISTS. During OTA-1480, two suites (ota1471, coreGuardianTravelGate)
// went red because their fixtures set `currentLocationId` and the VISUAL frame
// (`mapX/mapY`) while leaving the AUTHORITATIVE cell (`gridX/gridY`) wherever the
// character was born. No real path in the game produces that state — creation,
// `travelTo` and `stepDirection` write both, and the save loader DERIVES the
// frame from the cell via `gridToVisual` — but a hand-built fixture can, and 44
// fixtures across __tests__ set `currentLocationId` with no `gridX` in sight.
// They pass today because they never override the location away from the
// character's start, so creation's write already agrees. That is luck, and one
// of them stops being lucky every time a position predicate moves to the
// authoritative cell (which is the direction everything is moving — OTA-1347,
// OTA-1398, OTA-1458, OTA-1480).
//
// ⚠ THE INVARIANT, in one sentence: whenever a fixture sets `currentLocationId`,
// `gridX/gridY` must be that location's canon cell (plus any deliberate offset)
// and `mapX/mapY` must be `gridToVisual` of that cell. This helper is the one
// place that invariant is spelled; new fixtures should spread it instead of
// hand-writing coordinates.

import { canonicalCellOf, gridToVisual } from '../app/engine/worldMap';

/**
 * Coordinate-consistent placement fields for a fixture player.
 *
 *   store.setState({ player: { ...p, ...placedAt('voronov') } });          // ON the seat
 *   store.setState({ player: { ...p, ...placedAt('voronov', { dx: 3 }) } }); // 3 east, in the open
 *
 * ⚠ Returns ONLY position fields. Quest state, hubRoomId and travelTarget stay
 * the caller's business — a helper that quietly wrote those too would be a
 * fixture nobody can read.
 */
export function placedAt(
  locationId: string,
  offset: { dx?: number; dy?: number } = {},
): { currentLocationId: string; gridX: number; gridY: number; mapX: number; mapY: number } {
  const cell = canonicalCellOf(locationId);
  const gridX = cell.x + (offset.dx ?? 0);
  const gridY = cell.y + (offset.dy ?? 0);
  const vis = gridToVisual(gridX, gridY, locationId);
  return { currentLocationId: locationId, gridX, gridY, mapX: vis.mapX, mapY: vis.mapY };
}
