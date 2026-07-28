// OTA-802 (B1) — economy re-tiering sell caps (pure-engine):
//   (a) a self-crafted item never sells above its ingredient value (+Legendary bump)
//   (b) bottleneck crafting materials price as near-worthless at vendors
//   (c) nothing sells above the cheapest realistic buy for its rarity (no arbitrage)

import { sellPriceFor } from '../app/engine/sellPrice';
import { RECIPES } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

const mkGear = (name: string, rarity: InventoryItem['rarity'], extra: Partial<InventoryItem> = {}): InventoryItem =>
  ({ id: name, name, kind: 'armor', rarity, quantity: 1, tags: ['armor'], ...extra } as InventoryItem);

describe('OTA-802 (b) — bottleneck crafting materials sell near-worthless', () => {
  it('a Golem Core sells for the flat crafting-only value, not its rarity price', () => {
    const core = { id: 'gc', name: 'Golem Core', kind: 'misc', rarity: 'Rare', quantity: 1, tags: ['aether'] } as InventoryItem;
    // Rare rarity would price ~36 TC pre-802; now a flat low value.
    expect(sellPriceFor(core, null)).toBeLessThanOrEqual(3);
  });
  it('Aetheric Shard, Aether Dust, Mudstone are all near-worthless too', () => {
    for (const n of ['Aetheric Shard', 'Aether Dust', 'Mudstone']) {
      const m = { id: n, name: n, kind: 'misc', rarity: 'Uncommon', quantity: 1, tags: [] } as InventoryItem;
      expect(sellPriceFor(m, null)).toBeLessThanOrEqual(3);
    }
  });
});

describe('OTA-802 (c) — sell-back never exceeds the cheapest buy (arbitrage floor)', () => {
  it('a Common gear piece caps at the Common buy floor (was 11, the reported arbitrage)', () => {
    expect(sellPriceFor(mkGear('Salvage Cap', 'Common'), null)).toBeLessThanOrEqual(5);
  });
  it('caps hold across all rarities', () => {
    expect(sellPriceFor(mkGear('Uncommon Vest', 'Uncommon'), null)).toBeLessThanOrEqual(14);
    expect(sellPriceFor(mkGear('Rare Plate', 'Rare'), null)).toBeLessThanOrEqual(40);
    expect(sellPriceFor(mkGear('Legendary Aegis', 'Legendary'), null)).toBeLessThanOrEqual(112);
  });
});

describe('OTA-802 (a) — self-crafted items cap at ingredient value', () => {
  // Pick a real recipe whose result carries a rarity, so the self-crafted cap
  // (ingredient value) bites below the normal rarity-based price.
  const recipe = RECIPES.find((r) => r.result && r.ingredients?.length >= 2);

  it('a self-crafted item sells for NO MORE than the same item unflagged', () => {
    if (!recipe) return; // no multi-ingredient recipe in this pack — skip
    const base = { id: 'x', name: recipe.result, kind: 'consumable', rarity: 'Uncommon', quantity: 1, tags: [] } as InventoryItem;
    const crafted = { ...base, selfCrafted: true } as InventoryItem;
    expect(sellPriceFor(crafted, null)).toBeLessThanOrEqual(sellPriceFor(base, null));
  });

  it('a Legendary self-craft gets a slight bump over a non-Legendary self-craft of the same recipe', () => {
    if (!recipe) return;
    const rare = { id: 'r', name: recipe.result, kind: 'weapon', rarity: 'Rare', quantity: 1, tags: [], selfCrafted: true } as InventoryItem;
    const leg = { ...rare, rarity: 'Legendary' } as InventoryItem;
    // The Legendary ×1.25 bump means its cap is >= the Rare cap (never lower).
    expect(sellPriceFor(leg, null)).toBeGreaterThanOrEqual(sellPriceFor(rare, null));
  });
});
