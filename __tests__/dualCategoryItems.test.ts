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
