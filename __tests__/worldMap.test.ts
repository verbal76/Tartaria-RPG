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
    // lies exactly N/E/S/W of center within the default range. Across
    // many seeds, the cumulative hit rate should be high.
    let hitSeeds = 0;
    for (let i = 0; i < 30; i++) {
      const map = generateWorldMap(`seed-${i}`, 'tartarian_outskirts');
      const survey = surveyAll(map, MAP_DIM.centerX, MAP_DIM.centerY);
      if (Object.values(survey).some((s) => s !== null)) hitSeeds++;
    }
    expect(hitSeeds).toBeGreaterThan(5);
  });

  it('senseDirection returns null when nothing is within range', () => {
    const map = generateWorldMap('empty-seed', 'tartarian_outskirts');
    // Walk to a corner — most directions from a corner head into the wall.
    const r = senseDirection(map, 0, 0, 'north', 1);
    expect(r).toBeNull();
  });
});
