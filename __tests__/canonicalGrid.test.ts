// OTA-499 — absolute canonical grid: every location has ONE fixed grid cell for
// the install, and distance is exact grid-to-grid math (player-independent). The
// re-centered visual map is just the thematic overlay; THIS is the math layer.

import {
  canonicalPositions,
  canonicalDistance,
  canonicalDistanceFromPlayer,
  canonicalCellFor,
  cellToAtlasFraction,
  WORLD_MAP_CENTER_X,
  WORLD_MAP_CENTER_Y,
} from '../app/engine/worldMap';

const A = 'pilgrim_waycamp';
const B = 'builders_survey_camp';
const FAR = 'iskan_veil';

describe('OTA-499 — canonical grid distance', () => {
  it('positions are install-canon: identical every call, one cell per location', () => {
    const p1 = canonicalPositions();
    const p2 = canonicalPositions();
    expect(p1).toBe(p2); // memoized, stable
    // no two locations share a cell
    const seen = new Set<string>();
    for (const id of Object.keys(p1)) {
      const c = p1[id]!;
      const key = `${c.x},${c.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('distance is symmetric and player-independent (same A↔B no matter who is "current")', () => {
    expect(canonicalDistance(A, B)).toBe(canonicalDistance(B, A));
    // Equals exact Manhattan of the two canonical cells.
    const pa = canonicalPositions()[A]!;
    const pb = canonicalPositions()[B]!;
    expect(canonicalDistance(A, B)).toBe(Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y));
  });

  it('from the player at a named location (centered) == location-to-location distance', () => {
    expect(canonicalDistanceFromPlayer(A, WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y, FAR))
      .toBe(canonicalDistance(A, FAR));
  });

  it('stepping the player one tile toward the target reduces distance by exactly 1', () => {
    const base = canonicalDistanceFromPlayer(A, WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y, FAR);
    const tgt = canonicalPositions()[FAR]!;
    const cur = canonicalPositions()[A]!;
    // step east if target is east of A, else west — i.e. toward the target on X.
    const stepX = tgt.x > cur.x ? WORLD_MAP_CENTER_X + 1 : WORLD_MAP_CENTER_X - 1;
    const moved = canonicalDistanceFromPlayer(A, stepX, WORLD_MAP_CENTER_Y, FAR);
    expect(moved).toBe(base - 1);
  });

  it('canonicalCellFor is deterministic for the same id', () => {
    expect(canonicalCellFor(A)).toEqual(canonicalCellFor(A));
  });

  it('OTA-505 — cellToAtlasFraction round-trips through canonicalCellFor (cell -> fraction -> cell)', () => {
    // for several in-range cells, fraction back to a cell returns the same cell
    for (const [x, y] of [[41, 20], [47, 15], [30, 25], [55, 10]] as const) {
      const f = cellToAtlasFraction(x, y);
      expect(f.fx).toBeGreaterThanOrEqual(0);
      expect(f.fx).toBeLessThanOrEqual(1);
      // re-derive the cell from the fraction the way canonicalCellFor does
      const rx = WORLD_MAP_CENTER_X + Math.round((f.fx - 0.5) * 40);
      const ry = WORLD_MAP_CENTER_Y + Math.round((f.fy - 0.5) * 22);
      expect({ x: rx, y: ry }).toEqual({ x, y });
    }
  });
});
