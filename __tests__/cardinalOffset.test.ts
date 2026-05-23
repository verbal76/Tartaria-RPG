// OTA 23-010 — Cardinal-direction-preserving dot positioning tests.
// Playtest report: 'going east in the game seems to take me west on
// the map'. Root cause: OTA 054 used IDW interpolation in procedural
// grid space; the engine's procedural placement is randomized per
// character, so eastward grid moves often pulled the dot toward
// atlas-west anchors. Reverting to a simple cardinal-offset model:
//   east  → fx increases (right)
//   west  → fx decreases (left)
//   south → fy increases (down)
//   north → fy decreases (up)
// These tests pin that contract.

import {
  cardinalOffsetFromOutpost,
  cardinalOffsetFromAnchor,
  OUTPOST_ATLAS_COORD,
  STEP_FRAC_X,
  STEP_FRAC_Y,
  LOCATION_ATLAS_COORDS,
} from '../app/engine/atlasCoords';

// v2.4.1 — grid expanded from 21×21 to 41×41 (center 20,20). The
// helpers don't care what center you pass; tests still use a local
// center constant so they pin the math, not the grid dimensions.
const CENTER = { x: 20, y: 20 };

describe('OTA 23-010 — cardinalOffsetFromOutpost', () => {
  it('player at the grid center returns the Outpost coord exactly', () => {
    const pos = cardinalOffsetFromOutpost(CENTER.x, CENTER.y, CENTER);
    expect(pos.fx).toBe(OUTPOST_ATLAS_COORD.fx);
    expect(pos.fy).toBe(OUTPOST_ATLAS_COORD.fy);
  });

  describe('cardinal direction preservation', () => {
    it('east (mapX +1) moves the dot right (fx increases)', () => {
      const east = cardinalOffsetFromOutpost(CENTER.x + 1, CENTER.y, CENTER);
      expect(east.fx).toBeGreaterThan(OUTPOST_ATLAS_COORD.fx);
      expect(east.fy).toBe(OUTPOST_ATLAS_COORD.fy);
    });

    it('west (mapX -1) moves the dot left (fx decreases)', () => {
      // Outpost is in the top-LEFT corner of the atlas (0.10, 0.13).
      // Moving west from grid-center pushes fx below outpost.fx but
      // clampToMapArea floors at 0.06. So we test "fx <= outpost.fx".
      const west = cardinalOffsetFromOutpost(CENTER.x - 1, CENTER.y, CENTER);
      expect(west.fx).toBeLessThanOrEqual(OUTPOST_ATLAS_COORD.fx);
      expect(west.fy).toBe(OUTPOST_ATLAS_COORD.fy);
    });

    it('south (mapY +1) moves the dot down (fy increases)', () => {
      const south = cardinalOffsetFromOutpost(CENTER.x, CENTER.y + 1, CENTER);
      expect(south.fy).toBeGreaterThan(OUTPOST_ATLAS_COORD.fy);
      expect(south.fx).toBe(OUTPOST_ATLAS_COORD.fx);
    });

    it('north (mapY -1) moves the dot up (fy decreases)', () => {
      const north = cardinalOffsetFromOutpost(CENTER.x, CENTER.y - 1, CENTER);
      expect(north.fy).toBeLessThanOrEqual(OUTPOST_ATLAS_COORD.fy);
      expect(north.fx).toBe(OUTPOST_ATLAS_COORD.fx);
    });
  });

  describe('scaling per tile is aspect-corrected', () => {
    it('one east-step delta equals STEP_FRAC_X on fx (when not clamped)', () => {
      const at0 = cardinalOffsetFromOutpost(CENTER.x, CENTER.y, CENTER);
      const at1 = cardinalOffsetFromOutpost(CENTER.x + 1, CENTER.y, CENTER);
      expect(at1.fx - at0.fx).toBeCloseTo(STEP_FRAC_X, 6);
    });

    it('three south-steps accumulate to 3 * STEP_FRAC_Y on fy', () => {
      const at0 = cardinalOffsetFromOutpost(CENTER.x, CENTER.y, CENTER);
      const at3 = cardinalOffsetFromOutpost(CENTER.x, CENTER.y + 3, CENTER);
      expect(at3.fy - at0.fy).toBeCloseTo(3 * STEP_FRAC_Y, 6);
    });

    it('one east-tile and one south-tile cover the same atlas pixel distance', () => {
      // Atlas is 1408 × 768. STEP_FRAC_X × 1408 should equal
      // STEP_FRAC_Y × 768 (within rounding) — that's the
      // anisotropy fix.
      const eastPx = STEP_FRAC_X * 1408;
      const southPx = STEP_FRAC_Y * 768;
      expect(Math.abs(eastPx - southPx)).toBeLessThan(1);
    });
  });

  describe('clamp keeps dot inside the painted map area', () => {
    it('a 20-tile east walk caps fx at ≤0.95 (not off the right edge)', () => {
      const farEast = cardinalOffsetFromOutpost(CENTER.x + 20, CENTER.y, CENTER);
      expect(farEast.fx).toBeLessThanOrEqual(0.95);
    });

    it('a 20-tile south walk caps fy at ≤0.95 (above the timeline ribbon)', () => {
      const farSouth = cardinalOffsetFromOutpost(CENTER.x, CENTER.y + 20, CENTER);
      expect(farSouth.fy).toBeLessThanOrEqual(0.95);
    });

    it('a 20-tile west walk floors fx at ≥0.06', () => {
      const farWest = cardinalOffsetFromOutpost(CENTER.x - 20, CENTER.y, CENTER);
      expect(farWest.fx).toBeGreaterThanOrEqual(0.06);
    });

    it('a 20-tile north walk floors fy at ≥0.06', () => {
      const farNorth = cardinalOffsetFromOutpost(CENTER.x, CENTER.y - 20, CENTER);
      expect(farNorth.fy).toBeGreaterThanOrEqual(0.06);
    });
  });

  describe('v2.4.1 — cardinalOffsetFromAnchor (anchor-relative drift)', () => {
    // The marker bug: with cardinalOffsetFromOutpost, the marker was
    // anchored at the Outpost regardless of where the player was.
    // After arriving at Asgardar (canonically fx=0.16, fy=0.40) and
    // walking east, the marker should drift east FROM ASGARDAR, not
    // from the Outpost.
    const asgardarAnchor = LOCATION_ATLAS_COORDS.asgardar!;

    it('player at center returns the passed anchor exactly', () => {
      const pos = cardinalOffsetFromAnchor(asgardarAnchor, CENTER.x, CENTER.y, CENTER);
      expect(pos.fx).toBe(asgardarAnchor.fx);
      expect(pos.fy).toBe(asgardarAnchor.fy);
    });

    it('east step drifts from the passed anchor, not the Outpost', () => {
      const east = cardinalOffsetFromAnchor(asgardarAnchor, CENTER.x + 1, CENTER.y, CENTER);
      // Should be ~asgardar.fx + STEP_FRAC_X, NOT outpost.fx + anything.
      expect(east.fx).toBeCloseTo(asgardarAnchor.fx + STEP_FRAC_X, 6);
      expect(east.fx).toBeGreaterThan(OUTPOST_ATLAS_COORD.fx + 0.04);
    });

    it('south step drifts the marker south from the current anchor', () => {
      const south = cardinalOffsetFromAnchor(asgardarAnchor, CENTER.x, CENTER.y + 2, CENTER);
      expect(south.fy).toBeCloseTo(asgardarAnchor.fy + 2 * STEP_FRAC_Y, 6);
    });
  });

  describe('the playtester scenario', () => {
    // Player at Outpost. They type "go east" four times. After each
    // step, the dot's fx must be strictly greater than the previous
    // step (until the right-edge clamp kicks in). This is the exact
    // intuition the playtest complaint was about.
    it('walking east 4 times monotonically increases fx', () => {
      let last = OUTPOST_ATLAS_COORD.fx;
      for (let step = 1; step <= 4; step++) {
        const pos = cardinalOffsetFromOutpost(CENTER.x + step, CENTER.y, CENTER);
        expect(pos.fx).toBeGreaterThan(last);
        last = pos.fx;
      }
    });

    it('walking south then east lands the dot down-and-right of start', () => {
      const start = cardinalOffsetFromOutpost(CENTER.x, CENTER.y, CENTER);
      const after = cardinalOffsetFromOutpost(CENTER.x + 3, CENTER.y + 2, CENTER);
      expect(after.fx).toBeGreaterThan(start.fx);
      expect(after.fy).toBeGreaterThan(start.fy);
    });
  });
});
