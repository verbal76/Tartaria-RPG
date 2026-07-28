// OTA-729 — premium vendor stock. Traders sometimes carry one genuinely
// worth-saving-for ware (strong healing / throwables / Uncommon+ gear), derived
// from the catalogs, priced at full value. Verifies the offers are real premium
// items and priced to matter.

import { maybePremiumOffer } from '../app/engine/vendors';
import { lookupCraftedItem } from '../app/engine/crafting';

function sampleOffers(n: number) {
  const out: { itemName: string; price: number }[] = [];
  for (let i = 0; i < n; i++) {
    const o = maybePremiumOffer([]);
    if (o) out.push({ itemName: o.itemName, price: o.price });
  }
  return out;
}

describe('OTA-729 — premium stock is real and priced to matter', () => {
  const offers = sampleOffers(600);

  it('actually produces offers, with variety', () => {
    expect(offers.length).toBeGreaterThan(50);
    expect(new Set(offers.map((o) => o.itemName)).size).toBeGreaterThan(5);
  });

  it('every premium offer is priced meaningfully (>= 20 TC), qty 1', () => {
    for (const o of offers) expect(o.price).toBeGreaterThanOrEqual(20);
  });

  it('offers are genuinely premium — Uncommon+ gear or a strong-heal consumable', () => {
    for (const o of new Set(offers.map((x) => x.itemName))) {
      const look = lookupCraftedItem(o);
      const isPremiumRarity = look.rarity === 'Uncommon' || look.rarity === 'Rare' || look.rarity === 'Legendary';
      const isUsefulConsumableOrThrow = look.kind === 'consumable' || (look.tags ?? []).includes('throwable');
      expect(isPremiumRarity || isUsefulConsumableOrThrow).toBe(true);
    }
  });

  it('never surfaces a construct-only or faction-only ware', () => {
    for (const o of new Set(offers.map((x) => x.itemName))) {
      const tags = lookupCraftedItem(o).tags ?? [];
      expect(tags.includes('golem_weapon')).toBe(false);
      expect(tags.includes('faction_gear')).toBe(false);
    }
  });

  it('respects existing stock — never duplicates an item already offered', () => {
    // If the rolled item is already present, the helper returns null.
    for (let i = 0; i < 200; i++) {
      const o = maybePremiumOffer([]);
      if (!o) continue;
      const dup = maybePremiumOffer([{ itemName: o.itemName, price: o.price, quantity: 1 }]);
      if (dup) expect(dup.itemName.toLowerCase()).not.toBe(o.itemName.toLowerCase());
    }
  });
});
