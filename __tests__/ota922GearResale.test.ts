// OTA-922 — armor resale is grounded per-item in the piece's own catalog value.
// RARITY_BUY_FLOOR is the cheapest buy of a BONUS-LESS item, so it clamped every
// Uncommon+ armor to the same scrap price as raw materials (the intended
// GEAR_RARITY_BASE resale was dead code). Now armor caps at 0.8 × its OWN tcBuy —
// sells for its worth, but never above its own cheapest buy (no arbitrage).

import { sellPriceFor } from '../app/engine/sellPrice';
import armorData from '../app/data/items/armor.json';
import type { InventoryItem } from '../app/engine/types';

const ARMOR = ((armorData as { armor: Array<Record<string, unknown>> }).armor);
const inv = (name: string, rarity: string, kind = 'armor'): InventoryItem =>
  ({ id: 'x', name, kind, rarity, quantity: 1 } as unknown as InventoryItem);

describe('OTA-922 — armor resale ≤ its own 0.8×tcBuy (no cross-stall arbitrage)', () => {
  it('no catalogued armor ever sells above 0.8 × its own tcBuy', () => {
    let checked = 0;
    for (const a of ARMOR) {
      const rarity = a.rarity as string | undefined;
      const tcBuy = a.tcBuy as number | undefined;
      const tags = (a.tags as string[] | undefined) ?? [];
      if (!rarity || typeof tcBuy !== 'number' || tcBuy <= 0 || tags.includes('collect_only')) continue;
      const price = sellPriceFor(inv(a.name as string, rarity), null, 0);
      expect(price).toBeLessThanOrEqual(Math.round(tcBuy * 0.8)); // capped at its own cheapest realistic buy
      expect(price).toBeLessThan(tcBuy); // strictly a loss vs buying it — anti-churn preserved
      checked++;
    }
    expect(checked).toBeGreaterThan(100); // actually swept the catalog
  });
});

describe('OTA-922 — Uncommon/Rare armor clears the old scrap floor', () => {
  it('a Rare armor now reaches its intended GEAR resale (was clamped to 40)', () => {
    const rare = ARMOR.find((a) => a.rarity === 'Rare' && (a.tcBuy as number) >= 110
      && !((a.tags as string[] | undefined) ?? []).includes('collect_only'))!;
    // GEAR_RARITY_BASE Rare 150 × 0.4 = 60, and 0.8×tcBuy(>=110)=88+ doesn't bind → 60 > old 40
    expect(sellPriceFor(inv(rare.name as string, 'Rare'), null, 0)).toBe(60);
  });

  it('an Uncommon armor clears the old 14 floor', () => {
    const unc = ARMOR.find((a) => a.rarity === 'Uncommon' && (a.tcBuy as number) >= 40
      && !((a.tags as string[] | undefined) ?? []).includes('collect_only'))!;
    // GEAR Uncommon 65×0.4 = 26; 0.8×tcBuy(>=40)=32+ doesn't bind → 26 > old 14
    expect(sellPriceFor(inv(unc.name as string, 'Uncommon'), null, 0)).toBeGreaterThan(14);
  });
});

describe('OTA-922/1335 — weapons price against their own catalog tc; unresolved gear keeps the flat floor', () => {
  it('⚠ OTA-1335 — a Common weapon caps at 0.8 × its OWN tc, not the flat 5', () => {
    // This used to assert the flat 5 TC clamp — the exact defect the owner
    // reported ("I sold 11 items. I got 81 TC"). A Cudgel lists at tc 25, so its
    // cheapest realistic buy is 20, and its resale caps there rather than at the
    // bonus-less floor. The no-arbitrage invariant is asserted per-piece above.
    const price = sellPriceFor(inv('Cudgel', 'Common', 'weapon'), null, 0);
    expect(price).toBeGreaterThan(5);
    expect(price).toBeLessThanOrEqual(20); // 0.8 × tc 25
  });

  it('a fused/renamed armor not in the catalog falls back to the flat floor', () => {
    // a name that resolves to no catalog tcBuy -> armorBuyFloor undefined -> RARITY_BUY_FLOOR
    expect(sellPriceFor(inv('Zzyx Nonexistent Plate', 'Rare'), null, 0)).toBeLessThanOrEqual(40);
  });
});
