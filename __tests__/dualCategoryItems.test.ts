// arb109 — a crafting MATERIAL that's also a deliberate thrown WEAPON (the
// `throwable` tag) lists under BOTH Weapons and Materials as the SAME underlying
// stack (shared quantity). Improvised `thrown` junk (rocks) stays Materials-only.

import { categoriesForItem, groupInventoryByCategory } from '../app/components/InventoryCategorize';
import type { InventoryItem } from '../app/engine/types';

const mk = (name: string, tags: string[], kind = 'misc', quantity = 1): InventoryItem =>
  ({ id: `${name}-id`, name, kind, rarity: 'Common', quantity, tags } as InventoryItem);

describe('dual-category items (weapon + material)', () => {
  it('Disease Sample (material + throwable) lists under BOTH weapon and material', () => {
    expect(categoriesForItem(mk('Disease Sample', ['organic', 'alchemy', 'throwable']))).toEqual(['weapon', 'material']);
  });

  it('Sentinel Core Plate (salvage + throwable) is dual too', () => {
    expect(categoriesForItem(mk('Sentinel Core Plate', ['tech', 'salvage', 'throwable']))).toEqual(['weapon', 'material']);
  });

  it('rocks (thrown, not throwable) stay material-only', () => {
    expect(categoriesForItem(mk('Small Rock', ['thrown', 'stone', 'improvised']))).toEqual(['material']);
    expect(categoriesForItem(mk('Big Rock', ['thrown', 'stone', 'improvised', 'heavy']))).toEqual(['material']);
  });

  it('a plain catalog weapon name is weapon-only', () => {
    expect(categoriesForItem(mk('Shrike Claw', []))).toEqual(['weapon']);
  });

  it('grouping lists the SAME item object (same id + quantity) in both sections — not double the count', () => {
    const sample = mk('Disease Sample', ['organic', 'throwable'], 'misc', 4);
    const groups = groupInventoryByCategory([sample]);
    expect(groups.weapon).toHaveLength(1);
    expect(groups.material).toHaveLength(1);
    // Same underlying object → same id and the same shared quantity (4), not 8.
    expect(groups.weapon[0]!.id).toBe(sample.id);
    expect(groups.material[0]!.id).toBe(sample.id);
    expect(groups.weapon[0]!.quantity).toBe(4);
    expect(groups.material[0]!.quantity).toBe(4);
    expect(groups.weapon[0]).toBe(groups.material[0]); // literally the same reference
  });
});

describe('weapon coatings get their own Coatings section', () => {
  it('a weapon_coating item categorizes as coating, not consumable', () => {
    expect(categoriesForItem(mk('Poison Vial', ['weapon_coating', 'consumable']))).toEqual(['coating']);
    expect(categoriesForItem(mk('Acid Flask', ['weapon_coating']))).toEqual(['coating']);
    // a custom author-defined coating lands there too — driven purely off the tag.
    expect(categoriesForItem(mk('Frostbite Oil', ['weapon_coating', 'cold']))).toEqual(['coating']);
  });

  it('ordinary food/potions stay in Consumables', () => {
    expect(categoriesForItem(mk('Trail Rations', ['food', 'ration'], 'consumable'))).toEqual(['consumable']);
    expect(categoriesForItem(mk('Healing Draught', ['potion', 'healing'], 'consumable'))).toEqual(['consumable']);
  });

  it('grouping buckets coatings under coating and keeps food under consumable', () => {
    const groups = groupInventoryByCategory([
      mk('Poison Vial', ['weapon_coating'], 'consumable', 3),
      mk('Trail Rations', ['food'], 'consumable', 2),
    ]);
    expect(groups.coating).toHaveLength(1);
    expect(groups.coating[0]!.name).toBe('Poison Vial');
    expect(groups.consumable).toHaveLength(1);
    expect(groups.consumable[0]!.name).toBe('Trail Rations');
  });
});
