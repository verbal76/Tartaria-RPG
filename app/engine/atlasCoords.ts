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
  sinking_cathedral: { fx: 0.40, fy: 0.10 },
  cradle_of_dusk: { fx: 0.66, fy: 0.16 },
  buried_cities: { fx: 0.28, fy: 0.20 },
  great_tartary_plains: { fx: 0.50, fy: 0.21 },
  mud_seas: { fx: 0.70, fy: 0.22 },
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
 * Used by the grid-offset fallback so a far-flung player never lands
 * the dot on the Vertical Strata diagram or the Outpost Interior
 * inset.
 */
export function clampToMapArea(c: AtlasCoord): AtlasCoord {
  return {
    fx: Math.max(0.06, Math.min(0.92, c.fx)),
    fy: Math.max(0.06, Math.min(0.85, c.fy)),
  };
}
