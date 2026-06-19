// engine_Dev — Phase 2 proof: a developer-uploaded table actually CHANGES the
// engine's central item lookups (crafting.ts find*ByName / lookupCraftedItem),
// at runtime, with no reload. With no override they return the built-in Tartaria
// rows; with an override loaded they return the uploaded rows.

import {
  findWeaponByName,
  findMaterialByName,
  lookupCraftedItem,
} from '../app/engine/crafting';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('engine_Dev — uploaded tables drive the engine lookups', () => {
  afterEach(() => clearAllOverrides());

  it('weapons lookup falls back to the built-in Tartaria catalog by default', () => {
    expect(findWeaponByName('Rusted Blade')).not.toBeNull();
    // A made-up Philadelphia weapon is NOT in the built-in catalog (and doesn't
    // read like a weapon, so inference won't promote it).
    expect(findWeaponByName('USS Eldridge Logbook')).toBeNull();
  });

  it('an uploaded weapons table replaces the catalog at lookup time', () => {
    // Before: Rusted Blade is a genuine CATALOG weapon (lookupCraftedItem has no
    // name-inference, so its kind reflects the actual table).
    expect(lookupCraftedItem('Rusted Blade').kind).toBe('weapon');

    setTableOverride('weapons', [
      { name: 'Service Revolver', weaponKind: 'ranged', damageType: 'piercing', damageDice: '1d10', stat: 'dexterity', rarity: 'Uncommon', tags: ['weapon', 'gun', 'ranged'], description: 'A 1943 sidearm.' },
    ]);
    // The new weapon resolves from the uploaded table...
    const rev = findWeaponByName('Service Revolver');
    expect(rev).not.toBeNull();
    expect(rev!.damageDice).toBe('1d10');
    expect(lookupCraftedItem('Service Revolver').kind).toBe('weapon');
    // ...and the old Tartaria weapon is GONE from the (replaced) catalog: with no
    // catalog row and no inference, lookupCraftedItem falls back to misc.
    expect(lookupCraftedItem('Rusted Blade').kind).toBe('misc');
  });

  it('an uploaded materials table drives the material lookup', () => {
    setTableOverride('materials', [
      { name: 'Copper Wire', rarity: 'Common', tags: ['material', 'metal', 'salvage'], description: 'Stripped from the field coils.' },
    ]);
    expect(findMaterialByName('Copper Wire')).not.toBeNull();
    expect(lookupCraftedItem('Copper Wire').kind).toBe('misc');
  });

  it('clearing the override restores the built-in catalog', () => {
    setTableOverride('weapons', [{ name: 'Service Revolver', rarity: 'Common', tags: ['weapon'], damageDice: '1d6', weaponKind: 'ranged', damageType: 'piercing', stat: 'dexterity', description: 'x' }]);
    clearAllOverrides();
    expect(findWeaponByName('Rusted Blade')).not.toBeNull();
    expect(findWeaponByName('Service Revolver')).toBeNull();
  });
});
