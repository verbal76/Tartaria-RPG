// OTA-686 — the vendor BUY / SELL lists are now grouped into the same collapsible
// categories as the inventory. SELL rows are real InventoryItems (categorizeItem
// direct); BUY offers are just names, so the screen resolves each name's catalog
// kind + tags via findCatalogItem, then categorizeItem files it. This locks that
// name→category resolution (the logic behind the BUY sections) and confirms it
// agrees with how the same item sits in the pack.

import { findCatalogItem } from '../app/engine/crafting';
import { categorizeItem, CATEGORY_ORDER } from '../app/components/InventoryCategorize';
import type { InventoryItem } from '../app/engine/types';

// Mirror of VendorScreen.categorizeOfferName.
function categorizeOfferName(name: string) {
  const cat = findCatalogItem(name);
  return categorizeItem({
    id: '', name, quantity: 1,
    kind: (cat?.kind ?? 'misc') as InventoryItem['kind'],
    rarity: cat?.rarity,
    tags: cat?.tags ?? [],
  } as InventoryItem);
}

describe('vendor buy-offer categorization (OTA-686)', () => {
  it('a weapon name files under Weapons', () => {
    expect(categorizeOfferName('Iron Spear')).toBe('weapon');
  });

  it('a food name files under Consumables', () => {
    expect(categorizeOfferName('Trail Rations')).toBe('consumable');
  });

  it('every resolved category is a real section in CATEGORY_ORDER', () => {
    for (const n of ['Iron Spear', 'Trail Rations', 'First Aid Kit', 'Aetheric Torch', 'Pry Bar', 'Scrap Metal']) {
      expect(CATEGORY_ORDER).toContain(categorizeOfferName(n));
    }
  });

  it('the offer categorizer agrees with the item categorizer for a real pack item', () => {
    // What the SELL side (categorizeItem) and BUY side (categorizeOfferName) do
    // for the same catalog weapon must match, so buy/sell group it the same way.
    const asItem: InventoryItem = {
      id: 'x', name: 'Iron Spear', kind: 'weapon', quantity: 1, tags: ['weapon', 'spear'],
    } as InventoryItem;
    expect(categorizeOfferName('Iron Spear')).toBe(categorizeItem(asItem));
  });

  it('an unknown/inferred name still resolves to a valid section (no crash)', () => {
    expect(CATEGORY_ORDER).toContain(categorizeOfferName('Gnarled Whistling Thing'));
  });
});
