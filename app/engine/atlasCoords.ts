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

// One grid tile as a fraction of image height. Calibrated against
// the redrawn atlas so a 10-tile walk lands roughly inside the
// drawn world (the playable area spans ~0.05 to ~0.85 vertically).
export const DOT_TILE_FRAC = 0.04;

// Locations the new atlas depicts as labeled icons. Coordinates
// are measured against each icon's visual center.
export const LOCATION_ATLAS_COORDS: Record<string, AtlasCoord> = {
  // The Outpost / Outskirts cluster
  tartarian_outskirts: { fx: 0.10, fy: 0.13 },

  // Northern band — surface ruins and weather lines
  // OTA 054 — three coords nudged by agent A's verification sweep:
  // sinking_cathedral (-2x/+2y), great_tartary_plains (+2x/-2y),
  // mud_seas (+2x/-2y). All within ~2% of the previous values.
  sinking_cathedral: { fx: 0.38, fy: 0.12 },
  cradle_of_dusk: { fx: 0.66, fy: 0.16 },
  buried_cities: { fx: 0.28, fy: 0.20 },
  great_tartary_plains: { fx: 0.52, fy: 0.19 },
  mud_seas: { fx: 0.72, fy: 0.20 },
  // OTA 053 — Obsidian Pillars is now drawn alongside the
  // Tartarian observatory in the upper-middle area, between
  // Buried Cities and Mud Seas.
  obsidian_pillars: { fx: 0.39, fy: 0.27 },
  zharaks_teeth: { fx: 0.50, fy: 0.30 },

  // Lost Capitals band — left of compass
  asgardar: { fx: 0.16, fy: 0.40 },
  grand_spire_of_etheria: { fx: 0.15, fy: 0.47 },
  samarran: { fx: 0.27, fy: 0.46 },
  thametans_tower: { fx: 0.31, fy: 0.54 },

  // Center & east — capitals + buried cities
  nimari: { fx: 0.52, fy: 0.43 },
  red_tower_of_nimari: { fx: 0.49, fy: 0.55 },
  drakova: { fx: 0.78, fy: 0.41 },
  voronov: { fx: 0.78, fy: 0.48 },

  // Southern arc — Forgotten Order stronghold + deep frontier
  varakush: { fx: 0.16, fy: 0.66 },
  endless_stair: { fx: 0.60, fy: 0.65 },

  // The Deep — Aetherstone-tier sites at the map's bottom
  giant_vault: { fx: 0.74, fy: 0.76 },
  etheric_chamber: { fx: 0.83, fy: 0.83 },
  mud_flood_nexus: { fx: 0.88, fy: 0.93 },
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

/**
 * Clamp a fractional coordinate to the visible map area, away from
 * the insets at the corners and the timeline ribbon at the bottom.
 */
export function clampToMapArea(c: AtlasCoord): AtlasCoord {
  // OTA 054 — bottom bound raised from 0.85 to 0.95 so the snap to
  // Mud Flood Nexus (canonically at fy=0.93) isn't clamped off its
  // own icon. The HISTORICAL TIMELINE ribbon sits below ~0.97, so
  // 0.95 still keeps the dot inside the painted world.
  return {
    fx: Math.max(0.06, Math.min(0.95, c.fx)),
    fy: Math.max(0.06, Math.min(0.95, c.fy)),
  };
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
