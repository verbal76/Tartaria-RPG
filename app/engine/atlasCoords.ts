// OTA 053 — Atlas dot calibration for the redrawn world map.
// OTA 052 hit 20/21 coverage on the redrawn landscape atlas; this
// revision adds the previously-missing Obsidian Pillars icon (now
// drawn with the Tartarian observatory alongside it). Full coverage:
// every one of the 21 named locations resolves to a canonical icon
// position.
//
// Image: assets/world-atlas.png — 1408 × 768 pixels, landscape.
// Fractional coordinates measured against that pixel canvas.
//
// The new map is geographic (locations placed by lore canon) rather
// than concentric (the old map's danger rings around a central
// Outpost). The Outpost sits in the upper-left at (0.10, 0.13).
// For the player's procedural-grid offset fallback, the dot still
// anchors at the Outpost icon and walks outward by mapX/mapY
// offsets — east-of-Outpost moves the dot right, south moves it
// down, etc. The dot is clamped to the visible image area so it
// can never drift into the insets or off-screen.

export interface AtlasCoord {
  /** X position as a fraction of image width (0..1). */
  fx: number;
  /** Y position as a fraction of image height (0..1). */
  fy: number;
}

// The Outpost icon — also the anchor for the grid-offset fallback.
export const OUTPOST_ATLAS_COORD: AtlasCoord = { fx: 0.10, fy: 0.13 };

// Per-tile marker drift on the atlas. Atlas is 1408×768 (1.83:1
// landscape), so a single DOT_TILE_FRAC applied to both axes would
// make 1 east tile cover 1.83× more pixels than 1 south tile. We
// split the constants and aspect-correct so 1 east step and 1 south
// step drift the marker the same pixel distance.
//
// v2.4.1 (OTA 028) — halved from the OTA 019 calibration. The 0.06
// was too aggressive in play: 17 south tiles crossed the entire
// atlas height and the marker overshot canonical anchors quickly.
//
// STEP_FRAC_Y = 0.03 — height fraction. 28 tiles (max D5 radius)
//   covers ~84% of atlas height, which feels proportional to "across
//   2-3 states" without overshooting destinations.
// STEP_FRAC_X = STEP_FRAC_Y × (ATLAS_H/ATLAS_W) = 0.03 × 0.5455
//   ≈ 0.0164 — width fraction picked so 1 east tile = 1 south tile
//   in pixels (~23 px each).
export const STEP_FRAC_Y = 0.03;
export const STEP_FRAC_X = 0.0164;
// Back-compat alias for tests that still reference the old name.
// Equal to STEP_FRAC_Y because the prior axis-uniform constant was
// effectively the height fraction.
export const DOT_TILE_FRAC = STEP_FRAC_Y;

// Locations the new atlas depicts as labeled icons. Coordinates
// are measured against each icon's visual center.
//
// v2.4.1 (OTA 029) — recalibrated against the 140×78 grid overlay
// (10-px cells on the 1408×768 canvas). Largest shifts: asgardar +
// drakova + giant_vault + etheric_chamber + mud_flood_nexus all
// nudged south/east a few percent to match the actual icon centers.
// Smaller (~1-2%) adjustments to the upper band as well.
export const LOCATION_ATLAS_COORDS: Record<string, AtlasCoord> = {
  // The Outpost / Outskirts cluster
  tartarian_outskirts: { fx: 0.10, fy: 0.13 },

  // Northern band — surface ruins and weather lines
  sinking_cathedral: { fx: 0.36, fy: 0.12 },
  cradle_of_dusk: { fx: 0.62, fy: 0.17 },
  buried_cities: { fx: 0.31, fy: 0.22 },
  great_tartary_plains: { fx: 0.48, fy: 0.20 },
  mud_seas: { fx: 0.71, fy: 0.22 },
  obsidian_pillars: { fx: 0.38, fy: 0.33 },
  zharaks_teeth: { fx: 0.53, fy: 0.29 },

  // Lost Capitals band — left of compass
  asgardar: { fx: 0.16, fy: 0.47 },
  grand_spire_of_etheria: { fx: 0.16, fy: 0.53 },
  samarran: { fx: 0.28, fy: 0.48 },
  thametans_tower: { fx: 0.33, fy: 0.57 },

  // Center & east — capitals + buried cities
  nimari: { fx: 0.50, fy: 0.50 },
  red_tower_of_nimari: { fx: 0.52, fy: 0.60 },
  drakova: { fx: 0.77, fy: 0.47 },
  voronov: { fx: 0.78, fy: 0.56 },

  // Southern arc — Forgotten Order stronghold + deep frontier
  varakush: { fx: 0.28, fy: 0.74 },
  endless_stair: { fx: 0.59, fy: 0.76 },

  // The Deep — Aetherstone-tier sites at the map's bottom
  giant_vault: { fx: 0.78, fy: 0.86 },
  etheric_chamber: { fx: 0.88, fy: 0.87 },
  mud_flood_nexus: { fx: 0.84, fy: 0.94 },
};

/**
 * Look up the atlas coordinate for a location id.
 * Returns null when the location has no depicted icon on the atlas
 * (caller should fall back to the grid-offset model).
 */
export function atlasCoordForLocation(locationId: string | null | undefined): AtlasCoord | null {
  if (!locationId) return null;
  return LOCATION_ATLAS_COORDS[locationId] ?? null;
}

/**
 * The set of location ids the atlas depicts as icons.
 */
export function depictedLocationIds(): string[] {
  return Object.keys(LOCATION_ATLAS_COORDS);
}

// Cardinal-direction-preserving dot offset from an arbitrary anchor.
// East increases fx (dot moves right), south increases fy (down) —
// matches keyboard intuition. Anisotropy fixed: separate X/Y step
// fractions so 1 east tile and 1 south tile cover the same pixel
// distance on a 1.83:1 landscape atlas.
//
// The earlier `cardinalOffsetFromOutpost` hardcoded the Outpost as
// the base. With per-character procedural maps that regenerate on
// every travelTo (worldMap.ts:7221), mapX/mapY is local to the
// CURRENT location — not the Outpost — so the base anchor must be
// the current location's canonical atlas position. Pass it in.
export function cardinalOffsetFromAnchor(
  anchor: AtlasCoord,
  mapX: number,
  mapY: number,
  gridCenter: { x: number; y: number },
): AtlasCoord {
  return clampToMapArea({
    fx: anchor.fx + (mapX - gridCenter.x) * STEP_FRAC_X,
    fy: anchor.fy + (mapY - gridCenter.y) * STEP_FRAC_Y,
  });
}

// Back-compat shim. Old callers (cardinalOffset.test.ts) anchored at
// the Outpost; the new helper takes any anchor.
export function cardinalOffsetFromOutpost(
  mapX: number,
  mapY: number,
  gridCenter: { x: number; y: number },
): AtlasCoord {
  return cardinalOffsetFromAnchor(OUTPOST_ATLAS_COORD, mapX, mapY, gridCenter);
}

// v2.4.1 (OTA 029) — landmass / no-go zones on the atlas.
//
// Player request: "you cannot head to the edges of the map you can
// only travel on the big landmass." The atlas image has three big
// chrome regions that aren't landmass — the legend boxes top-right,
// the Outpost interior minimap bottom-left, and the historical
// timeline ribbon at the very bottom. Plus the corner blanks. The
// marker should stay on the painted continent.
//
// Approach: define the OFF-LIMITS zones as fractional-coord
// rectangles. After the basic outer clamp, if a point falls inside
// any of these rects, push it out to the nearest edge of that rect.
// This keeps the math cheap (no polygon test) while still keeping
// the marker on real landmass for normal play.
//
// Coordinates measured from the 140×78 grid overlay (10-px cells
// on 1408×768). Slightly generous bounds so the marker doesn't sit
// right on a legend's edge.
interface OffLimitsRect {
  fxMin: number; fyMin: number; fxMax: number; fyMax: number;
}

const OFF_LIMITS_RECTS: readonly OffLimitsRect[] = [
  // Top-right legend block (start-icon key + scale ladder)
  { fxMin: 0.84, fyMin: 0.00, fxMax: 1.00, fyMax: 0.30 },
  // Bottom-left Reclaimers' Outpost interior minimap
  { fxMin: 0.00, fyMin: 0.75, fxMax: 0.22, fyMax: 1.00 },
  // Bottom historical-timeline ribbon (whole bottom strip)
  { fxMin: 0.00, fyMin: 0.96, fxMax: 1.00, fyMax: 1.00 },
];

function pushOutOfRect(c: AtlasCoord, r: OffLimitsRect): AtlasCoord {
  // Only push if the point is actually inside the rect.
  if (c.fx < r.fxMin || c.fx > r.fxMax || c.fy < r.fyMin || c.fy > r.fyMax) {
    return c;
  }
  // Distance to each of the four rect edges.
  const dWest = c.fx - r.fxMin;
  const dEast = r.fxMax - c.fx;
  const dNorth = c.fy - r.fyMin;
  const dSouth = r.fyMax - c.fy;
  const minD = Math.min(dWest, dEast, dNorth, dSouth);
  // Push out toward the closest edge with a tiny epsilon so we're
  // outside the rect (not exactly on the boundary).
  const eps = 0.001;
  if (minD === dWest)  return { fx: r.fxMin - eps, fy: c.fy };
  if (minD === dEast)  return { fx: r.fxMax + eps, fy: c.fy };
  if (minD === dNorth) return { fx: c.fx, fy: r.fyMin - eps };
  return { fx: c.fx, fy: r.fyMax + eps };
}

/**
 * Clamp a fractional coordinate to the visible map area, away from
 * the insets at the corners and the timeline ribbon at the bottom.
 * After the outer rectangle clamp, push the point out of any of
 * the off-limits rects so the marker stays on real landmass.
 */
export function clampToMapArea(c: AtlasCoord): AtlasCoord {
  let pt: AtlasCoord = {
    fx: Math.max(0.06, Math.min(0.96, c.fx)),
    fy: Math.max(0.04, Math.min(0.95, c.fy)),
  };
  for (const rect of OFF_LIMITS_RECTS) {
    pt = pushOutOfRect(pt, rect);
  }
  return pt;
}

// ─────────────────────────────────────────────────────────────────
// OTA 054 — Inverse-distance-weighted (IDW) dot plotting.
//
// Solves the user's "the dot must always be plotted accurately even
// when I wander off-path" requirement. The engine's world map is
// procedurally generated per character — Asgardar might sit 14 tiles
// SE on one save and 11 tiles NW on another — so the OLD model
// (grid-offset from the Outpost using a single global tile-fraction
// scale) drifts the dot away from canonical reality the further the
// player walks from the Outpost.
//
// The IDW model fixes that:
//   1. Every named location has a known procedural grid position
//      (worldMap.positions[id]) AND a known canonical atlas position
//      (LOCATION_ATLAS_COORDS[id]).
//   2. For the player at procedural grid (X, Y), compute weight per
//      location i as w_i = 1 / (gridDist_i² + epsilon).
//   3. Player's atlas position = Σ(atlas_i × w_i) / Σ(w_i).
//
// Properties this gets us for free:
//   - Snap-to-anchor: if the player is AT a named tile, that
//     location's weight dominates (1/epsilon² → huge) and the dot
//     lands exactly on its canonical drawing.
//   - Per-pair scaling: if A and B are 26 tiles apart procedurally
//     and 2 inches apart visually, a player halfway between them
//     procedurally lands halfway between them visually — the
//     "divide visual by grid distance" math the player asked for
//     falls out of the linear interpolation naturally.
//   - Always plotted: there's no fallback branch; every grid
//     position resolves to an atlas position.
//   - Smooth: as the player walks one tile at a time, the dot
//     glides between anchors rather than jumping when crossing
//     into a named tile.

// Tight epsilon so the snap-to-anchor weight (1/0.01 = 100) outguns
// 20 distant anchors at average weight ~0.018 by a clean ~5000× —
// the dot lands on the canonical icon, not the centroid of a
// scattered procedural cluster.
const IDW_EPSILON = 0.1;
const IDW_POWER = 2;

export interface GridPos {
  x: number;
  y: number;
}

/**
 * Compute the player's atlas-fraction position by IDW interpolation
 * over all named-location anchors. Each anchor contributes weight
 * inverse to the Manhattan grid distance from the player to that
 * anchor's procedural tile.
 *
 * worldMapPositions: locationId → { x, y } as stored in the live
 *   character's worldMap.positions (this is procedural per save).
 *
 * Locations that have a worldMap position but no atlas coord (and
 * vice versa) are simply skipped — they don't contribute to the
 * weighted average.
 *
 * If no anchors are usable (empty worldMapPositions or the lookup
 * table is unbuilt), falls back to the Outpost coord — a safe
 * degenerate case.
 */
export function interpolateAtlasPosition(
  playerX: number,
  playerY: number,
  worldMapPositions: Record<string, GridPos>,
): AtlasCoord {
  let weightedFx = 0;
  let weightedFy = 0;
  let totalWeight = 0;

  for (const [locId, atlasCoord] of Object.entries(LOCATION_ATLAS_COORDS)) {
    const gridPos = worldMapPositions[locId];
    if (!gridPos) continue;
    const dx = gridPos.x - playerX;
    const dy = gridPos.y - playerY;
    const manhattan = Math.abs(dx) + Math.abs(dy);
    // Inverse-square weight with an epsilon floor so a player
    // standing exactly on an anchor tile (manhattan=0) doesn't
    // explode the weight to infinity — the anchor still wins by
    // ~4 orders of magnitude.
    const w = 1 / Math.pow(manhattan + IDW_EPSILON, IDW_POWER);
    weightedFx += atlasCoord.fx * w;
    weightedFy += atlasCoord.fy * w;
    totalWeight += w;
  }

  if (totalWeight === 0) {
    return OUTPOST_ATLAS_COORD;
  }
  return clampToMapArea({
    fx: weightedFx / totalWeight,
    fy: weightedFy / totalWeight,
  });
}
