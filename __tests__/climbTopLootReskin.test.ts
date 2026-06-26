// engine_Dev — climb-top loot is content-agnostic. The built-in CLIMB_TOP_LOOT
// pool is Tartaria names (Aetheric Shard, Aether Crystal, …); in a re-skin those
// don't exist in the uploaded catalog, so cresting a climb handed the player an
// inert "improvised" item. With a re-skin active the drop is a real MATERIAL from
// the game's own materials catalog.

import { rollClimbTopLoot } from '../app/engine/climbHeight';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

const TARTARIA = new Set([
  'Aetheric Locket', 'Aetheric Shard', 'Speckled Egg', 'Bioluminescent Fungus',
  'First Aid Kit', 'Aether Crystal', 'Drone Core', 'Aetheric Cloth', "Reclaimer's Rope",
]);

describe('engine_Dev — climb-top loot is content-agnostic under a re-skin', () => {
  afterEach(() => clearAllOverrides());

  it('drops ONLY materials from the uploaded catalog, never Tartaria names', () => {
    setTableOverride('enemies', [{ name: 'Drowned Kriegsmarine', type: 'Undead', hp: 20 }]); // flips isReskinActive
    setTableOverride('materials', [
      { name: 'Scrap Steel', rarity: 'Common', tags: ['material', 'metal'], description: 'x' },
      { name: 'Vril Dust', rarity: 'Rare', tags: ['material'], description: 'x' },
      { name: 'Magnetic Sand', rarity: 'Uncommon', tags: ['material'], description: 'x' },
    ]);
    const pack = new Set(['Scrap Steel', 'Vril Dust', 'Magnetic Sand']);
    let drops = 0;
    for (let i = 0; i < 3000; i++) {
      const d = rollClimbTopLoot(5);
      if (!d) continue;
      drops++;
      expect(TARTARIA.has(d.name)).toBe(false);
      expect(pack.has(d.name)).toBe(true);
    }
    expect(drops).toBeGreaterThan(0); // the drop branch fired
  });

  it('without a re-skin the built-in Tartaria pool is unchanged', () => {
    let sawTartaria = false;
    for (let i = 0; i < 3000; i++) {
      const d = rollClimbTopLoot(5);
      if (d && TARTARIA.has(d.name)) { sawTartaria = true; break; }
    }
    expect(sawTartaria).toBe(true);
  });

  it('a re-skin with no materials drops nothing (no Tartaria fallback)', () => {
    setTableOverride('enemies', [{ name: 'X', type: 'Undead', hp: 20 }]);
    setTableOverride('materials', []); // empty
    for (let i = 0; i < 500; i++) {
      const d = rollClimbTopLoot(5);
      if (d) expect(TARTARIA.has(d.name)).toBe(false);
    }
  });
});
