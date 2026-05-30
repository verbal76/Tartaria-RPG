import { sellPriceFor, isUnsellable } from '../app/engine/sellPrice';
import type { InventoryItem } from '../app/engine/types';
import type { VendorInstance } from '../app/engine/vendors';

function item(over: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'i1',
    name: 'Test Thing',
    kind: 'misc',
    quantity: 1,
    tags: [],
    ...over,
  } as InventoryItem;
}

function vendor(offers: { itemName: string; price: number }[]): VendorInstance {
  return {
    name: 'Test Vendor',
    title: 'Trader',
    description: '',
    faction: null,
    offers,
  } as VendorInstance;
}

describe('sellPriceFor — rarity tiers', () => {
  it('uses the vendor offer price × 0.4 when the item is in their pack', () => {
    const v = vendor([{ itemName: 'Test Thing', price: 100 }]);
    expect(sellPriceFor(item({}), v)).toBe(40);
  });

  it('falls back to rarity base when the vendor does not carry the item', () => {
    expect(sellPriceFor(item({ rarity: 'Common' }), vendor([]))).toBe(Math.round(12 * 0.4));
    expect(sellPriceFor(item({ rarity: 'Uncommon' }), vendor([]))).toBe(Math.round(35 * 0.4));
    expect(sellPriceFor(item({ rarity: 'Rare' }), vendor([]))).toBe(Math.round(90 * 0.4));
    expect(sellPriceFor(item({ rarity: 'Legendary' }), vendor([]))).toBe(Math.round(240 * 0.4));
  });

  it('falls back to kind value when rarity is missing', () => {
    expect(sellPriceFor(item({ kind: 'consumable' }), vendor([]))).toBe(3);
    expect(sellPriceFor(item({ kind: 'misc' }), vendor([]))).toBe(2);
    expect(sellPriceFor(item({ kind: 'weapon' }), vendor([]))).toBe(1);
  });

  it('handles no vendor at all (catalog pricing)', () => {
    expect(sellPriceFor(item({ rarity: 'Rare' }), null)).toBe(Math.round(90 * 0.4));
  });
});

describe('sellPriceFor — durability scales the price', () => {
  it('full durability → no reduction', () => {
    const i = item({ rarity: 'Rare', durability: { current: 20, max: 20 } });
    expect(sellPriceFor(i, null)).toBe(Math.round(90 * 0.4));
  });

  it('half durability → ~half scaling, floored at 0.4x', () => {
    const i = item({ rarity: 'Rare', durability: { current: 10, max: 20 } });
    // 90 * 0.4 * 0.5 = 18
    expect(sellPriceFor(i, null)).toBe(18);
  });

  it('zero durability → 0.4 floor preserves salvage value', () => {
    const i = item({ rarity: 'Rare', durability: { current: 0, max: 20 } });
    // 90 * 0.4 * 0.4 = 14.4 → 14
    expect(sellPriceFor(i, null)).toBe(14);
  });

  it('never returns below 1 TC', () => {
    const i = item({ rarity: 'Common', durability: { current: 0, max: 100 } });
    expect(sellPriceFor(i, null)).toBeGreaterThanOrEqual(1);
  });
});

describe('isUnsellable', () => {
  it('quest items cannot be sold', () => {
    expect(isUnsellable(item({ tags: ['quest'] }))).toBe(true);
  });

  it('explicit unsellable tag works too', () => {
    expect(isUnsellable(item({ tags: ['unsellable'] }))).toBe(true);
  });

  it('regular items are sellable', () => {
    expect(isUnsellable(item({}))).toBe(false);
    expect(isUnsellable(item({ tags: ['weapon', 'melee'] }))).toBe(false);
  });
});
