// engine_Dev — Phase 2b proof: an uploaded item table reaches the AMBIENT/LOOT,
// EQUIP, SALVAGE, TAKEABLE-SPAWN and VENDOR paths (not just crafting find*ByName).
// These were reading the built-in JSON constants directly until they were routed
// through resolveTable() at call time.

import { findCatalogItem, findArmorByName } from '../app/engine/crafting';
import { isSalvageMaterial } from '../app/engine/salvagePools';
import { pickTakeableGearForScene, _gearCounts } from '../app/engine/takeableGearSpawns';
import { rollOfferQuantity } from '../app/engine/vendors';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('engine_Dev — uploads reach loot / equip / salvage / spawns / vendors', () => {
  afterEach(() => clearAllOverrides());

  it('ambient loot (findCatalogItem) resolves uploaded weapons and drops the old catalog', () => {
    expect(findCatalogItem('Plasma Carbine')).toBeNull(); // not in built-in Tartaria
    setTableOverride('weapons', [
      { name: 'Plasma Carbine', weaponKind: 'ranged', damageType: 'aetheric', damageDice: '1d12', stat: 'intelligence', rarity: 'Uncommon', tags: ['weapon'], description: 'x' },
    ]);
    const hit = findCatalogItem('Plasma Carbine');
    expect(hit).not.toBeNull();
    expect(hit!.kind).toBe('weapon');
    // The old Tartaria weapon no longer resolves as a catalog pickup (replaced).
    expect(findCatalogItem('Rusted Blade')).toBeNull();
  });

  it('armor equip lookup (findArmorByName) resolves uploaded armor', () => {
    setTableOverride('armor', [
      { name: 'Flak Vest', slot: 'torso', ac: 2, rarity: 'Common', tags: ['armor'], baseDurability: 30, description: 'x' },
    ]);
    expect(findArmorByName('Flak Vest')).not.toBeNull();
  });

  it('salvage (isSalvageMaterial) honors an uploaded materials table', () => {
    expect(isSalvageMaterial('Scrap Steel')).toBe(false);
    setTableOverride('materials', [{ name: 'Scrap Steel', rarity: 'Common', tags: ['material'], description: 'x' }]);
    expect(isSalvageMaterial('Scrap Steel')).toBe(true);
  });

  it('takeable scene gear spawns only from the uploaded weapons/armor', () => {
    setTableOverride('weapons', [
      { name: 'Combat Knife', weaponKind: 'melee', damageType: 'slashing', damageDice: '1d4', stat: 'dexterity', rarity: 'Common', tags: ['weapon'], description: 'x' },
    ]);
    setTableOverride('armor', [
      { name: 'Flak Vest', slot: 'torso', ac: 2, rarity: 'Common', tags: ['armor'], description: 'x' },
    ]);
    expect(_gearCounts.common).toBeGreaterThan(0);
    const picks = pickTakeableGearForScene('room-override-1');
    expect(picks.length).toBeGreaterThan(0);
    const allowed = new Set(['Combat Knife', 'Flak Vest']);
    for (const p of picks) expect(allowed.has(p)).toBe(true);
  });

  it('vendor stock-quantity rules honor uploaded materials + food gear', () => {
    setTableOverride('materials', [{ name: 'Scrap Steel', rarity: 'Common', tags: ['material'], description: 'x' }]);
    setTableOverride('gear', [{ name: 'Ration Pack', kind: 'consumable', rarity: 'Common', tags: ['food'], description: 'x' }]);
    for (let i = 0; i < 20; i++) {
      const mat = rollOfferQuantity('Scrap Steel');
      expect(mat).toBeGreaterThanOrEqual(1);
      expect(mat).toBeLessThanOrEqual(10);
      const food = rollOfferQuantity('Ration Pack');
      expect(food).toBeGreaterThanOrEqual(1);
      expect(food).toBeLessThanOrEqual(5);
    }
    expect(rollOfferQuantity('Some Unstocked Relic')).toBe(1);
  });
});
