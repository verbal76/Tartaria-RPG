import {
  findRecipeByResult,
  findGearByName,
  findMaterialByName,
  canCraft,
} from '../app/engine/crafting';
import { resolveItemEffect } from '../app/engine/itemEffect';
import type { InventoryItem } from '../app/engine/types';

// OTA-383 — Viper Venom (Mud Viper drop) feeds two poison recipes: a weapon
// coating and an antivenom cure.

describe('Viper Venom recipes', () => {
  it('Viper Venom is a real craftable material (not just a loot string)', () => {
    expect(findMaterialByName('Viper Venom')).toBeTruthy();
  });

  it('crafts a POISON weapon-coating from Viper Venom', () => {
    const r = findRecipeByResult('Viper Venom Vial');
    expect(r).toBeTruthy();
    expect(r!.ingredients.map((i) => i.name)).toContain('Viper Venom');

    const coating = findGearByName('Viper Venom Vial');
    expect(coating).toBeTruthy();
    expect(coating!.tags).toContain('weapon_coating');

    const fx = resolveItemEffect('Viper Venom Vial', [findGearByName]) as
      | { kind: string; coating?: { kind: string; dice: string } }
      | null;
    expect(fx?.kind).toBe('consumable');
    expect(fx?.coating?.kind).toBe('poison');
    expect(fx?.coating?.dice).toBe('1d6');
  });

  it('crafts an Antivenom poison CURE from Viper Venom', () => {
    const r = findRecipeByResult('Antivenom');
    expect(r).toBeTruthy();
    expect(r!.ingredients.map((i) => i.name)).toContain('Viper Venom');

    const fx = resolveItemEffect('Antivenom', [findGearByName]) as
      | { kind: string; curePoison?: boolean; healHP?: number }
      | null;
    expect(fx?.kind).toBe('consumable');
    expect(fx?.curePoison).toBe(true);
  });

  it('both recipes are craftable once the player holds the ingredients', () => {
    const inv: InventoryItem[] = [
      { id: 'a', name: 'Viper Venom', kind: 'misc', quantity: 2, tags: [] },
      { id: 'b', name: 'Violet Cap Mushroom', kind: 'consumable', quantity: 1, tags: [] },
      { id: 'c', name: 'Orange Sporecap', kind: 'consumable', quantity: 1, tags: [] },
    ];
    expect(canCraft(findRecipeByResult('Viper Venom Vial')!, inv)).toBe(true);
    expect(canCraft(findRecipeByResult('Antivenom')!, inv)).toBe(true);
  });
});
