// OTA 051 — Atlas dot calibration. Maps known location ids to the
// pixel-fraction position of their drawn icon on assets/world-atlas.png
// (1536 × 2752). The MapScreen uses this to anchor the YOU-ARE-HERE
// dot directly on the location's icon when the player is standing on a
// depicted tile, instead of computing a grid-offset estimate.
//
// Calibration source: three Read-image agents measured the atlas in
// parallel; their reports were reconciled against a manual re-read of
// the rendered atlas to ground-truth the disagreements (Asgardar
// confused with Nimari, Drakova confused with Asgardar's golden
// spire, etc.). Numbers are conservative — within ~3% of the visible
// icon center.
//
// Locations NOT in this table fall back to the grid-offset model
// (mapX/mapY relative to WORLD_MAP_CENTER). That happens because
// roughly half of the engine's 21 named locations don't appear as
// visual icons on the atlas — they live only in the legend.

export interface AtlasCoord {
  /** X position as a fraction of image width (0..1). */
  fx: number;
  /** Y position as a fraction of image height (0..1). */
  fy: number;
}

// The Outpost's center disc — also the canonical anchor for the
// fallback grid-offset model.
export const OUTPOST_ATLAS_COORD: AtlasCoord = { fx: 0.50, fy: 0.36 };

// One grid tile as a fraction of image height. Calibrated so the
// Danger-4 ring (tiles 8-16 from Outpost) falls inside the MIDDLE
// RIM band drawn on the atlas.
export const DOT_TILE_FRAC = 0.02;

// Locations the atlas actually depicts as icons. Keyed by the
// location.id used in locations.json + gameStore. Coordinates are
// measured against the rendered icon's visual center.
export const LOCATION_ATLAS_COORDS: Record<string, AtlasCoord> = {
  // Center disc — the Reclaimers' Outpost lives inside the
  // Tartarian Outskirts macro location.
  tartarian_outskirts: { fx: 0.50, fy: 0.36 },

  // Inner ring labels (just outside the Outpost ring)
  zharaks_teeth: { fx: 0.50, fy: 0.32 },

  // Northern arc (top of the image)
  mud_flood_nexus: { fx: 0.12, fy: 0.22 },
  asgardar: { fx: 0.85, fy: 0.25 },
  // Asgardar is the canonical home of the Grand Spire of Etheria —
  // the spire icon at top-right IS Asgardar's tower, so the two
  // share the dot anchor.
  grand_spire_of_etheria: { fx: 0.85, fy: 0.25 },

  // Western arc
  voronov: { fx: 0.10, fy: 0.42 },

  // Eastern arc
  great_tartary_plains: { fx: 0.83, fy: 0.40 },
  obsidian_pillars: { fx: 0.62, fy: 0.46 },
  varakush: { fx: 0.83, fy: 0.54 },

  // Southern arc
  mud_seas: { fx: 0.50, fy: 0.56 },

  // Bottom — Samarran's ziggurat is the only depicted bottom-quadrant
  // city. Thametan's Tower is canonically inside Samarran, so they
  // share the anchor.
  samarran: { fx: 0.20, fy: 0.66 },
  thametans_tower: { fx: 0.20, fy: 0.66 },
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
 * The set of location ids the atlas depicts as icons. Useful for
 * tests / inventory of coverage.
 */
export function depictedLocationIds(): string[] {
  return Object.keys(LOCATION_ATLAS_COORDS);
}
