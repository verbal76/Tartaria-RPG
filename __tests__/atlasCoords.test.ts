// OTA 051 — Verifies the atlas coordinate lookup. Three parallel
// agents measured the world-atlas.png and reported per-location
// fractional positions; the table in engine/atlasCoords.ts is the
// reconciled result. These tests pin the table's shape against:
//   1. The locations.json canon (every depicted location id must
//      resolve to a real Location entry).
//   2. Fractional bounds (0..1) — no off-image dots.
//   3. The Outpost anchor stays at the Outskirts.
//   4. Shared-icon pairs (Asgardar + Grand Spire) land on the same
//      coord — otherwise the dot would flicker between them.
//   5. Non-depicted locations correctly return null (so the screen
//      falls back to the grid-offset model).

import {
  LOCATION_ATLAS_COORDS,
  OUTPOST_ATLAS_COORD,
  DOT_TILE_FRAC,
  atlasCoordForLocation,
  depictedLocationIds,
} from '../app/engine/atlasCoords';
import locationsData from '../app/data/locations/locations.json';
import type { Location } from '../app/engine/types';

const LOCATIONS = locationsData as Location[];
const LOC_BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));

describe('OTA 051 — atlas coordinate calibration', () => {
  describe('table shape', () => {
    it('every depicted id resolves to a real Location entry in locations.json', () => {
      for (const id of depictedLocationIds()) {
        expect(LOC_BY_ID.has(id)).toBe(true);
      }
    });

    it('all coords are inside the image (fx, fy in [0, 1])', () => {
      for (const [id, c] of Object.entries(LOCATION_ATLAS_COORDS)) {
        expect(c.fx).toBeGreaterThanOrEqual(0);
        expect(c.fx).toBeLessThanOrEqual(1);
        expect(c.fy).toBeGreaterThanOrEqual(0);
        expect(c.fy).toBeLessThanOrEqual(1);
        // Catch typos that would put a dot in the title bar or the
        // timeline ribbon: every depicted icon sits in the central
        // ring band (roughly 15%-70% from the top of the image).
        expect(c.fy).toBeGreaterThan(0.10);
        expect(c.fy).toBeLessThan(0.75);
        // Sanity check for the noun spread — the icon should not
        // straddle the extreme left/right gutter either.
        expect(c.fx).toBeGreaterThan(0.05);
        expect(c.fx).toBeLessThan(0.95);
        // ESLint complains about unused destructure parts without this:
        expect(id.length).toBeGreaterThan(0);
      }
    });

    it('OUTPOST_ATLAS_COORD matches the tartarian_outskirts entry', () => {
      const outskirts = LOCATION_ATLAS_COORDS.tartarian_outskirts!;
      expect(outskirts.fx).toBe(OUTPOST_ATLAS_COORD.fx);
      expect(outskirts.fy).toBe(OUTPOST_ATLAS_COORD.fy);
    });

    it('DOT_TILE_FRAC is positive and small (a tile is ~2% of image height)', () => {
      expect(DOT_TILE_FRAC).toBeGreaterThan(0);
      expect(DOT_TILE_FRAC).toBeLessThan(0.05);
    });
  });

  describe('shared-icon containment', () => {
    // The Grand Spire of Etheria is inside Asgardar — both anchor to
    // the same tower icon at top-right. Same for Thametan's Tower
    // inside Samarran.
    it('Asgardar and Grand Spire of Etheria share an anchor', () => {
      const a = LOCATION_ATLAS_COORDS.asgardar!;
      const s = LOCATION_ATLAS_COORDS.grand_spire_of_etheria!;
      expect(s.fx).toBe(a.fx);
      expect(s.fy).toBe(a.fy);
    });

    it('Samarran and Thametan\'s Tower share an anchor', () => {
      const s = LOCATION_ATLAS_COORDS.samarran!;
      const t = LOCATION_ATLAS_COORDS.thametans_tower!;
      expect(t.fx).toBe(s.fx);
      expect(t.fy).toBe(s.fy);
    });
  });

  describe('atlasCoordForLocation', () => {
    it('returns the coord for every depicted location', () => {
      for (const id of depictedLocationIds()) {
        expect(atlasCoordForLocation(id)).not.toBeNull();
      }
    });

    // The atlas only draws ~12 of the 21 named locations. The rest
    // (Drakova, Endless Stair, Cradle of Dusk, Sinking Cathedral,
    // The Giant Vault, Etheric Chamber, Nimari, Red Tower of Nimari,
    // The Buried Cities) live in the legend only and must fall back
    // to the grid-offset model — i.e., atlasCoordForLocation returns
    // null so MapScreen takes the fallback branch.
    const NOT_DEPICTED = [
      'drakova',
      'endless_stair',
      'cradle_of_dusk',
      'sinking_cathedral',
      'giant_vault',
      'etheric_chamber',
      'nimari',
      'red_tower_of_nimari',
      'buried_cities',
    ];
    it.each(NOT_DEPICTED)('%s correctly returns null (falls back to grid-offset)', (id) => {
      expect(atlasCoordForLocation(id)).toBeNull();
      // But the location should still be a real entry in locations.json —
      // it just isn't drawn on the atlas image.
      expect(LOC_BY_ID.has(id)).toBe(true);
    });

    it('returns null for nullish input', () => {
      expect(atlasCoordForLocation(null)).toBeNull();
      expect(atlasCoordForLocation(undefined)).toBeNull();
      expect(atlasCoordForLocation('')).toBeNull();
    });

    it('returns null for unknown location ids', () => {
      expect(atlasCoordForLocation('this_place_does_not_exist')).toBeNull();
    });
  });

  describe('travel simulation — every location lands the dot somewhere sane', () => {
    // For each location in the full 21, compute what the MapScreen
    // dot would look like. Depicted locations should resolve to a
    // coord in [0.10, 0.75] for y (the ring band). Non-depicted
    // locations should resolve to null (fallback path).
    it.each(LOCATIONS.map((l) => l.id))('travel to %s yields a well-formed dot path', (id) => {
      const coord = atlasCoordForLocation(id);
      if (coord) {
        // Depicted — coord must point to a valid pixel-fraction
        // inside the ring band.
        expect(coord.fx).toBeGreaterThan(0.05);
        expect(coord.fx).toBeLessThan(0.95);
        expect(coord.fy).toBeGreaterThan(0.10);
        expect(coord.fy).toBeLessThan(0.75);
      } else {
        // Non-depicted — confirm by lookup that the table doesn't
        // accidentally hide a real location.
        expect(LOCATION_ATLAS_COORDS[id]).toBeUndefined();
      }
    });
  });

  describe('coverage report', () => {
    // Soft-pin: at least half the named locations should be depicted
    // so the player has a meaningful canonical map. If the atlas is
    // ever redrawn with fewer icons, this will fail and force the
    // table to grow.
    it('at least 10 of the 21 locations are depicted', () => {
      const depicted = depictedLocationIds().length;
      expect(depicted).toBeGreaterThanOrEqual(10);
    });

    // Verify each lore-region has at least one depicted anchor so
    // the player always has SOMETHING they can visually navigate to
    // in each part of the world.
    it('every cardinal quadrant has at least one depicted location', () => {
      const depicted = Object.values(LOCATION_ATLAS_COORDS);
      const north = depicted.filter((c) => c.fy < OUTPOST_ATLAS_COORD.fy);
      const south = depicted.filter((c) => c.fy > OUTPOST_ATLAS_COORD.fy);
      const west = depicted.filter((c) => c.fx < OUTPOST_ATLAS_COORD.fx);
      const east = depicted.filter((c) => c.fx > OUTPOST_ATLAS_COORD.fx);
      expect(north.length).toBeGreaterThan(0);
      expect(south.length).toBeGreaterThan(0);
      expect(west.length).toBeGreaterThan(0);
      expect(east.length).toBeGreaterThan(0);
    });
  });
});
