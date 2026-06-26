// engine_Dev — area-search loot must be content-agnostic. The built-in pools
// (SMALL_FINDS / RARE_FINDS) are full of Tartaria names (Aether Mud, Trail
// Rations, Pocket Knife, Empty Water Bottle, Aetheric Locket…). In a re-skin
// those don't exist in the uploaded catalogs, so a search handed the player inert
// "improvised" junk. With a re-skin active, the material outcome must draw ONLY
// from the uploaded catalogs.

import { rollAreaSearch } from '../app/engine/areaSearch';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

// Built-in Tartaria names that must NEVER surface once a re-skin is active.
const TARTARIA_NAMES = new Set([
  'Aether Mud', 'Aether Dust', 'Mudstone', 'Small Rock', 'Big Rock', 'Stick',
  'Trail Rations', 'Pocket Knife', 'Empty Water Bottle', 'Aetheric Locket',
  'Aether Crystal', 'Aetheric Shard', 'Cudgel', 'Stone Spear', 'Wild Onion',
]);

function makeReskin() {
  // Override enemies → isReskinActive() flips true. Override materials + gear so
  // the pack-sourced pools have real rows to draw from.
  setTableOverride('enemies', [{ name: 'Drowned Kriegsmarine', type: 'Undead', hp: 20 }]);
  setTableOverride('materials', [
    { name: 'Scrap Steel', rarity: 'Common', tags: ['material', 'metal'], description: 'x' },
    { name: 'Bakelite Fragments', rarity: 'Common', tags: ['material'], description: 'x' },
    { name: 'Green Fog Condensate', rarity: 'Rare', tags: ['material', 'anomalous'], description: 'x' },
    { name: 'Surgical Steel', rarity: 'Uncommon', tags: ['material', 'metal'], description: 'x' },
  ]);
  setTableOverride('gear', [
    { name: 'C-Ration (Meat & Beans)', kind: 'consumable', rarity: 'Common', tags: ['food'], description: 'x' },
  ]);
}

describe('engine_Dev — area-search loot is content-agnostic under a re-skin', () => {
  afterEach(() => clearAllOverrides());

  it('material finds come ONLY from the uploaded catalogs, never Tartaria names', () => {
    makeReskin();
    const packNames = new Set(['Scrap Steel', 'Bakelite Fragments', 'Green Fog Condensate', 'Surgical Steel', 'C-Ration (Meat & Beans)']);
    let materialHits = 0;
    for (let i = 0; i < 4000; i++) {
      // Mix of search + investigate to exercise both SMALL_FINDS and RARE_FINDS paths.
      const out = rollAreaSearch('the rubble', { intent: i % 2 === 0 ? 'search' : 'investigate', rareLootBias: 0.2 });
      if (out.kind === 'material') {
        materialHits++;
        expect(TARTARIA_NAMES.has(out.itemName)).toBe(false);
        expect(packNames.has(out.itemName)).toBe(true);
      }
    }
    expect(materialHits).toBeGreaterThan(0); // the material branch did fire
  });

  it('without a re-skin the built-in Tartaria pool is unchanged', () => {
    let sawTartaria = false;
    for (let i = 0; i < 4000; i++) {
      const out = rollAreaSearch('the rubble', { intent: 'search', rareLootBias: 0.2 });
      if (out.kind === 'material' && TARTARIA_NAMES.has(out.itemName)) { sawTartaria = true; break; }
    }
    expect(sawTartaria).toBe(true);
  });
});
