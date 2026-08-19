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
  atlasCoordForLocation,
  depictedLocationIds,
} from '../app/engine/atlasCoords';
import locationsData from '../app/data/locations/locations.json';
import type { Location } from '../app/engine/types';
import { isHiddenLocation } from '../app/engine/hiddenLocations';

// OTA-498 — hidden locations (the Hidden Market) are deliberately NOT painted on
// the atlas and carry no LOCATION_ATLAS_COORDS entry (their "?" overlay coord
// lives on the hidden-location record instead), so they're exempt from the
// "every location is depicted" / dot-path coverage checks below.
const LOCATIONS = (locationsData as Location[]).filter((l) => !isHiddenLocation(l.id));
const LOC_BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));

describe('OTA 051 — atlas coordinate calibration', () => {
  describe('table shape', () => {
    it('every depicted id resolves to a real Location entry in locations.json', () => {
      for (const id of depictedLocationIds()) {
        expect(LOC_BY_ID.has(id)).toBe(true);
      }
    });

    it('all coords are inside the image painted area', () => {
      // The painted world spans fx ∈ [0.08, 0.92] and fy ∈ [0.08,
      // 0.95] on the redrawn atlas (Outpost top-left, Mud Flood
      // Nexus bottom-right). Bounds catch typos that would land a
      // dot on the TARTARIA title, the Vertical Strata inset, the
      // legend, or the Reclaimers' Outpost Interior inset.
      // INSET locations are drawn in their own panels, NOT on the main painted
      // world — the Reclaimers' Outpost Interior inset (outpost_*) and the
      // buried sub-surface levels (buried_*), which legitimately sit at the
      // edges/below the main image. The main-world bounds only apply to the
      // overworld dots (those are what could wrongly land on the title/legend).
      const isInset = (id: string) => id.startsWith('outpost_') || id.startsWith('buried_');
      for (const [id, c] of Object.entries(LOCATION_ATLAS_COORDS)) {
        expect(id.length).toBeGreaterThan(0);
        if (isInset(id)) continue;
        expect(c.fx).toBeGreaterThanOrEqual(0);
        expect(c.fx).toBeLessThanOrEqual(1);
        expect(c.fy).toBeGreaterThanOrEqual(0);
        expect(c.fy).toBeLessThanOrEqual(1);
        expect(c.fx).toBeGreaterThan(0.05);
        expect(c.fx).toBeLessThan(0.95);
        expect(c.fy).toBeGreaterThan(0.05);
        expect(c.fy).toBeLessThan(0.97);
      }
    });

    it('OUTPOST_ATLAS_COORD matches the tartarian_outskirts entry', () => {
      const outskirts = LOCATION_ATLAS_COORDS.tartarian_outskirts!;
      expect(outskirts.fx).toBe(OUTPOST_ATLAS_COORD.fx);
      expect(outskirts.fy).toBe(OUTPOST_ATLAS_COORD.fy);
    });

  });

  describe('lore-region adjacency', () => {
    // OTA 052 — the redrawn atlas draws containment pairs as
    // adjacent-but-separate labels rather than co-located icons.
    // Asgardar + Grand Spire and Samarran + Thametan's Tower are
    // drawn within ~10% of each other on both axes (matching the
    // lore-canon 'tower inside city' relationship). The dot will
    // shift slightly between them on travel, which is honest given
    // the visual separation in the artwork.
    const within = (a: { fx: number; fy: number }, b: { fx: number; fy: number }, max: number) =>
      Math.abs(a.fx - b.fx) < max && Math.abs(a.fy - b.fy) < max;

    // ⚠⚠ OTA-1334 — this used to pair Asgardar with the Grand Spire of ETHERIA, on the
    // "tower inside city" reading. That reading was the whole confusion: the tower standing
    // on Asgardar's skyline is the Grand Spire of ASGARDAR, and the Etheria spire is a
    // different structure that now lies on the floor of the Black Reach, most of a world
    // south-east. The city/tower adjacency rule is unchanged and still worth pinning — it is
    // simply pinned to the right pair of places now.
    it('Asgardar and Grand Spire of Asgardar are drawn within 10% of each other', () => {
      const a = LOCATION_ATLAS_COORDS.asgardar!;
      const s = LOCATION_ATLAS_COORDS.grand_spire_of_asgardar!;
      expect(within(a, s, 0.10)).toBe(true);
    });

    it('the Grand Spire of Etheria is drawn beside the Black Reach, NOT beside Asgardar', () => {
      // The negative half matters as much as the positive one: if someone ever "restores"
      // the old adjacency, this is the assertion that says the two spires have been folded
      // back together.
      const etheria = LOCATION_ATLAS_COORDS.grand_spire_of_etheria!;
      const reach = LOCATION_ATLAS_COORDS.black_reach!;
      const asgardar = LOCATION_ATLAS_COORDS.asgardar!;
      expect(within(etheria, reach, 0.10)).toBe(true);
      expect(within(etheria, asgardar, 0.10)).toBe(false);
    });

    it('Samarran and Thametan\'s Tower are drawn within 10% of each other', () => {
      const s = LOCATION_ATLAS_COORDS.samarran!;
      const t = LOCATION_ATLAS_COORDS.thametans_tower!;
      expect(within(s, t, 0.10)).toBe(true);
    });

    it('Nimari and Red Tower of Nimari are drawn within 15% of each other', () => {
      const n = LOCATION_ATLAS_COORDS.nimari!;
      const r = LOCATION_ATLAS_COORDS.red_tower_of_nimari!;
      expect(within(n, r, 0.15)).toBe(true);
    });
  });

  describe('atlasCoordForLocation', () => {
    it('returns the coord for every depicted location', () => {
      for (const id of depictedLocationIds()) {
        expect(atlasCoordForLocation(id)).not.toBeNull();
      }
    });

    // OTA 053 — every named location is depicted on the redrawn
    // atlas. The not-depicted bucket is empty. We keep the
    // grid-offset fallback wired in case the artwork is ever
    // revised with fewer icons, but no current location needs it.
    it('every named location resolves to a coord (no fallbacks needed)', () => {
      for (const loc of LOCATIONS) {
        expect(atlasCoordForLocation(loc.id)).not.toBeNull();
      }
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
        // Depicted — coord must be inside the painted map area.
        expect(coord.fx).toBeGreaterThan(0.05);
        expect(coord.fx).toBeLessThan(0.95);
        expect(coord.fy).toBeGreaterThan(0.05);
        expect(coord.fy).toBeLessThan(0.97);
      } else {
        // Non-depicted — confirm by lookup that the table doesn't
        // accidentally hide a real location.
        expect(LOCATION_ATLAS_COORDS[id]).toBeUndefined();
      }
    });
  });

  describe('coverage report', () => {
    // OTA 053 — the redrawn atlas now depicts ALL 21 locations.
    // Any future redraw that drops coverage will fail this test
    // rather than silently degrade the map.
    it('all 21 locations are depicted', () => {
      const depicted = depictedLocationIds().length;
      expect(depicted).toBe(LOCATIONS.length);
      expect(depicted).toBeGreaterThanOrEqual(21);
    });

    // OTA 052 — the Outpost is now in the upper-left, so most
    // depicted locations are east and south of it. The atlas still
    // needs spread on both axes, so we just assert that depicted
    // x-coords span a wide range and y-coords span a wide range.
    it('depicted locations spread across at least 60% of the map width', () => {
      const depicted = Object.values(LOCATION_ATLAS_COORDS);
      const xs = depicted.map((c) => c.fx);
      const span = Math.max(...xs) - Math.min(...xs);
      expect(span).toBeGreaterThan(0.6);
    });
    it('depicted locations spread across at least 60% of the map height', () => {
      const depicted = Object.values(LOCATION_ATLAS_COORDS);
      const ys = depicted.map((c) => c.fy);
      const span = Math.max(...ys) - Math.min(...ys);
      expect(span).toBeGreaterThan(0.6);
    });
  });

  // ⚠ OTA-1333 SCRUB — the DOT_TILE_FRAC and clampToMapArea suites died with the code they
  // pinned: the per-tile drift constants and the off-limits clamp existed for a player
  // marker removed at OTA-182, and the clamp's rectangles were traced from the ORIGINAL
  // art's legend boxes — on the current atlas they covered plain terrain (one sat exactly
  // over Yuldra-Tul). A test pinning dead code is not protection, it is embalming.
});
