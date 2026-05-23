import { generateWorldMap, stepInDirection, senseDirection, surveyAll, MAP_DIM } from '../app/engine/worldMap';

describe('worldMap', () => {
  it('places the start at the center', () => {
    const map = generateWorldMap('test-seed', 'tartarian_outskirts');
    expect(map.positions['tartarian_outskirts']).toEqual({ x: MAP_DIM.centerX, y: MAP_DIM.centerY });
  });

  it('places every other location somewhere', () => {
    const map = generateWorldMap('another-seed', 'tartarian_outskirts');
    expect(Object.keys(map.positions).length).toBeGreaterThan(5);
  });

  it('different seeds give different layouts', () => {
    const a = generateWorldMap('alice', 'tartarian_outskirts');
    const b = generateWorldMap('bob', 'tartarian_outskirts');
    // Find a location that's in both but at different positions.
    const ids = Object.keys(a.positions).filter((id) => id in b.positions);
    const diffs = ids.filter((id) => a.positions[id]!.x !== b.positions[id]!.x || a.positions[id]!.y !== b.positions[id]!.y);
    expect(diffs.length).toBeGreaterThan(0);
  });

  it('same seed reproduces same layout', () => {
    const a = generateWorldMap('repeat-seed', 'tartarian_outskirts');
    const b = generateWorldMap('repeat-seed', 'tartarian_outskirts');
    expect(a.positions).toEqual(b.positions);
  });

  it('stepInDirection clamps to grid bounds', () => {
    const map = generateWorldMap('test-seed', 'tartarian_outskirts');
    const step = stepInDirection(map, 0, 0, 'north');
    expect(step.x).toBe(0);
    expect(step.y).toBe(0);
  });

  it('senseDirection finds locations across enough seeds', () => {
    // Cardinal-direction surveys may miss any given seed if no location
    // lies exactly N/E/S/W of center within range. Across many seeds,
    // the cumulative hit rate should be high.
    //
    // v2.4.1 — bumped range to grid-width so the survey actually
    // reaches the farthest danger-5 placements (up to 28 tiles out
    // on the 41×41 grid). With the canonical-bearing placement, every
    // seed should now find SOMETHING east of Outpost (since multiple
    // locations are canonically east on the atlas).
    let hitSeeds = 0;
    for (let i = 0; i < 30; i++) {
      const map = generateWorldMap(`seed-${i}`, 'tartarian_outskirts');
      const survey = surveyAll(map, MAP_DIM.centerX, MAP_DIM.centerY, MAP_DIM.width);
      if (Object.values(survey).some((s) => s !== null)) hitSeeds++;
    }
    expect(hitSeeds).toBeGreaterThan(5);
  });

  it('v2.4.1 — procedural placement respects canonical atlas bearing', () => {
    // For each non-starting location with a canonical atlas anchor,
    // the procedural (x, y) offset from center should point into the
    // SAME quadrant as the atlas (fx, fy) offset from the starting
    // location's anchor. This is what kills the "walking east in the
    // engine takes you to atlas-west" pathology.
    //
    // Tolerance: a few placements may land on the wrong side of an
    // axis if the canonical bearing is near-horizontal/vertical AND
    // the collision-avoidance jiggle pushes them across. We require
    // ≥80% of placeable locations to honour the canonical quadrant
    // (allowing for collision-avoidance edge cases).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LOCATION_ATLAS_COORDS } = require('../app/engine/atlasCoords');
    const startId = 'tartarian_outskirts';
    const startAtlas = LOCATION_ATLAS_COORDS[startId];
    const map = generateWorldMap('bearing-test-seed', startId);
    let checked = 0;
    let onCanon = 0;
    for (const [locId, locAtlas] of Object.entries(LOCATION_ATLAS_COORDS) as Array<[string, { fx: number; fy: number }]>) {
      if (locId === startId) continue;
      const gridPos = map.positions[locId];
      if (!gridPos) continue;
      const dxAtlas = locAtlas.fx - startAtlas.fx;
      const dyAtlas = locAtlas.fy - startAtlas.fy;
      const dxGrid = gridPos.x - MAP_DIM.centerX;
      const dyGrid = gridPos.y - MAP_DIM.centerY;
      // Quadrant agreement: same sign on each axis (allowing exact
      // 0 alignment when the canonical bearing IS perfectly axial).
      const xOk = Math.sign(dxAtlas) === Math.sign(dxGrid) || dxAtlas === 0 || dxGrid === 0;
      const yOk = Math.sign(dyAtlas) === Math.sign(dyGrid) || dyAtlas === 0 || dyGrid === 0;
      checked++;
      if (xOk && yOk) onCanon++;
    }
    expect(checked).toBeGreaterThan(10);
    // 80%+ on canonical bearing. The miss cases are locations with
    // near-axial canonical bearings (canonical |dy| < 0.05) — when
    // jitter crosses the tiny canonical axis, the location lands on
    // the wrong side of it but is still primarily in the right
    // direction (e.g., barely-east-and-slightly-south becomes
    // barely-east-and-slightly-north). Player intuition still holds.
    expect(onCanon / checked).toBeGreaterThanOrEqual(0.8);
  });

  it('senseDirection returns null when nothing is within range', () => {
    const map = generateWorldMap('empty-seed', 'tartarian_outskirts');
    // Walk to a corner — most directions from a corner head into the wall.
    const r = senseDirection(map, 0, 0, 'north', 1);
    expect(r).toBeNull();
  });
});
