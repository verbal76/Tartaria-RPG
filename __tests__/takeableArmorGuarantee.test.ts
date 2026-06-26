// engine_Dev — the take list always offers at least ONE armor piece. Takes skew
// weapon-heavy (the weapon catalog dwarfs armor), and the drop economy runs on
// cheap kit the player sells/scraps for coin + materials, so armor was under-
// supplied. pickTakeableGearForScene now guarantees one low-tier armor name in
// the scene's takeable nouns — listed like any other take item, not a hidden
// post-take bonus. Seeded per room key, so it stays stable per tile (not farmable).

import { pickTakeableGearForScene } from '../app/engine/takeableGearSpawns';
import { findArmorByName } from '../app/engine/crafting';

const isArmor = (name: string) => findArmorByName(name) !== null;

describe('engine_Dev — take list always includes armor', () => {
  it('every scene surfaces at least one armor piece on the take list', () => {
    for (let i = 0; i < 200; i++) {
      const gear = pickTakeableGearForScene(`armorsweep:${i}:${i * 13}:`);
      expect(gear.length).toBeGreaterThanOrEqual(1);
      expect(gear.some(isArmor)).toBe(true);
    }
  });

  it('stays within the 1–3 item cap even after folding armor in', () => {
    for (let i = 0; i < 200; i++) {
      const gear = pickTakeableGearForScene(`capsweep:${i}:${i * 5}:`);
      expect(gear.length).toBeGreaterThanOrEqual(1);
      expect(gear.length).toBeLessThanOrEqual(3);
      expect(new Set(gear).size).toBe(gear.length); // no dupes
    }
  });

  it('is deterministic per seed (no leave-and-return farming of the armor)', () => {
    expect(pickTakeableGearForScene('tile:3:4:')).toEqual(pickTakeableGearForScene('tile:3:4:'));
  });
});
