// ⚠⚠ OTA-1365 — WHERE THE PLAYER IS DRAWN, AS A FRACTION OF THE ART. ONE COPY.
//
// This function lived inside MapScreen as a private `markerFraction`, which was
// fine while the Atlas was the only thing that drew a marker. The corner
// mini-map is the second, and the whole point of it is that the player can
// glance at it and then open the Atlas and see the SAME position — so two
// implementations of "where is he on the picture" is the one thing that must
// not happen. The Atlas now imports this too; there is no second copy to drift.
//
// ⚠ Never used for distance, routing or adjacency. A named cell snaps to its
// nudged silhouette (`atlasVisualFraction`) so the pin sits on the painted
// place rather than on the raw grid square it occupies; an unnamed cell — free
// wandering between locations — falls back to the plain cell→fraction map.
// Mixing those two coordinate systems is what OTA-1344 had to unpick.

import { LOCATION_ATLAS_COORDS } from './atlasCoords';
import { atlasVisualFraction } from './atlasLabels';
import { cellToAtlasFraction, canonicalCellFor } from './worldMap';

export interface MapFrac { fx: number; fy: number }

/** Grid cell → the location painted there, if any. Built once. */
const CELL_TO_LOCATION: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const id of Object.keys(LOCATION_ATLAS_COORDS)) {
    const c = canonicalCellFor(id);
    m[`${c.x},${c.y}`] = id;
  }
  return m;
})();

/** Where a marker at this cell should be DRAWN on the world atlas. */
export function worldMarkerFraction(x: number, y: number): MapFrac {
  const id = CELL_TO_LOCATION[`${x},${y}`];
  if (id) {
    const a = LOCATION_ATLAS_COORDS[id]!;
    return atlasVisualFraction(id, a.fx, a.fy);
  }
  return cellToAtlasFraction(x, y);
}

/** ⚠ The viewport translate, and the only geometry the mini-map needs.
 *
 *  The tile is drawn LARGER than the window and slid so the player's fraction
 *  lands dead centre — the same solve the Atlas's `centerOnPlayer` does, minus
 *  the animation:
 *
 *      screen = t + frac · rendered      and we want screen = window / 2
 *      ⇒       t = window / 2 − frac · rendered
 *
 *  Then CLAMPED, because a marker near an edge would otherwise drag empty space
 *  into frame — the map stops sliding and the marker walks off-centre instead,
 *  which is what every mini-map in every game does and what reads as correct.
 *  Returns the offsets in the same units the caller passes in. */
export function viewportOffset(
  frac: MapFrac,
  renderedW: number,
  renderedH: number,
  windowW: number,
  windowH: number,
): { left: number; top: number } {
  const clamp = (v: number, rendered: number, win: number): number => {
    // Art smaller than the window (cannot happen at the zooms we use, but a
    // caller is free to ask): centre it and stop.
    if (rendered <= win) return (win - rendered) / 2;
    return Math.min(0, Math.max(win - rendered, v));
  };
  return {
    left: clamp(windowW / 2 - frac.fx * renderedW, renderedW, windowW),
    top: clamp(windowH / 2 - frac.fy * renderedH, renderedH, windowH),
  };
}
