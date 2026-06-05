// take = gear loop (arb60). The spawned gear names MUST resolve to a catalog
// item (the take handler grants via findCatalogItem) and MUST be portable
// (the TakeModal filters out oversized), or the loop is still dead.

import { pickTakeableGearForScene, _gearCounts } from '../app/engine/takeableGearSpawns';
import { findCatalogItem } from '../app/engine/crafting';
import { isOversized } from '../app/engine/portability';

describe('takeable gear spawns', () => {
  it('has a real common-gear pool to draw from', () => {
    expect(_gearCounts.common).toBeGreaterThan(50);
  });

  it('spawns 1–3 gear names per scene', () => {
    for (const seed of ['samarran:1:2:', 'drakova:5:5:hall', 'x', 'tile:9:9:']) {
      const gear = pickTakeableGearForScene(seed);
      expect(gear.length).toBeGreaterThanOrEqual(1);
      expect(gear.length).toBeLessThanOrEqual(3);
      expect(new Set(gear).size).toBe(gear.length); // no dupes
    }
  });

  it('is deterministic per seed (no leave-and-return farming)', () => {
    expect(pickTakeableGearForScene('samarran:3:4:')).toEqual(pickTakeableGearForScene('samarran:3:4:'));
    // different tiles generally differ
    const a = pickTakeableGearForScene('a:1:1:');
    const b = pickTakeableGearForScene('z:9:9:');
    expect(a).not.toEqual(b);
  });

  it('EVERY spawned name resolves to a catalog item AND is portable', () => {
    // sweep many seeds so the pick distribution is covered
    for (let i = 0; i < 200; i++) {
      const gear = pickTakeableGearForScene(`sweep:${i}:${i * 7}:`);
      for (const name of gear) {
        expect(findCatalogItem(name)).not.toBeNull(); // take handler can grant it
        expect(isOversized(name)).toBe(false);         // TakeModal won't filter it out
      }
    }
  });
});
