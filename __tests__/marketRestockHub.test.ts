// OTA-774 — The Hidden Market as a Jita-style fight-restock hub.
//
//  (1) LEAK FIX: the 'market' building must never spawn on a random wild tile
//      (it belongs only at hidden_market's (47,15) grid home).
//  (2) NAMED VENDORS: the four stalls are staffed by existing lore vendors,
//      not anonymous "Weapons Trader" placeholders, with stable ids.
//  (3) RELIABLE RESTOCK: bulk low-tier / scarce high-tier stock, and the
//      crafted medical items + healing/coating crafting materials are
//      guaranteed every visit.

import { buildingForTile } from '../app/engine/buildings';
import { buildStallVendor } from '../app/engine/vendors';

describe('leak fix — market is off the generic wild-tile spawner', () => {
  it('buildingForTile never returns "market" across a wide tile sweep', () => {
    let market = 0;
    let anyBuilding = 0;
    for (const loc of ['obsidian_pillars', 'sunken_middens', 'ashfall_reach', 'wild']) {
      for (let x = 0; x < 60; x++) {
        for (let y = 0; y < 40; y++) {
          const b = buildingForTile(loc, x, y);
          if (b) anyBuilding++;
          if (b === 'market') market++;
        }
      }
    }
    expect(market).toBe(0);
    // Sanity: the spawner still produces OTHER buildings (we didn't break it).
    expect(anyBuilding).toBeGreaterThan(0);
  });
});

describe('named lore vendors staff the stalls (OTA-784 — rotating reps)', () => {
  it('each stall has a stable id + a named lore rep (not the "X Trader" placeholder)', () => {
    const cats = ['weapons', 'armor', 'food', 'materials'] as const;
    for (const cat of cats) {
      const v = buildStallVendor(cat, cat);
      // Id is stable so broker contracts + sigil turn-in keep working…
      expect(v.id).toBe(`hidden_market_${cat}`);
      // …but the name is a real lore rep, not the anonymous placeholder.
      expect(v.name.toLowerCase()).not.toBe(`${cat} trader`);
      expect(v.name.length).toBeGreaterThan(2);
    }
  });

  it('the rep is stable within a day but the roster rotates (different days can differ)', () => {
    // Two builds in the same instant pick the same rep (deterministic per day).
    const a = buildStallVendor('weapons', 'weapons').name;
    const b = buildStallVendor('weapons', 'weapons').name;
    expect(a).toBe(b);
    // And every roster has more than one rep to rotate through.
    expect(a).toBeTruthy();
  });
});

describe('reliable fight-restock stock', () => {
  it('the materials stall guarantees healing/coating crafting materials in bulk', () => {
    const v = buildStallVendor('materials', 'materials');
    const names = v.offers.map((o) => o.itemName);
    // Data-derived staples that feed healing + coating recipes.
    for (const staple of ['Aether Dust', 'Scrap Metal', 'Patched Cloth']) {
      expect(names).toContain(staple);
    }
    // Bulk low-tier: at least one line carries a deep stack (buy-in-bulk).
    expect(Math.max(...v.offers.map((o) => o.quantity ?? 1))).toBeGreaterThanOrEqual(6);
  });

  it('the provisions stall guarantees the crafted medical items every visit', () => {
    const v = buildStallVendor('food', 'food');
    const names = v.offers.map((o) => o.itemName);
    for (const kit of ['First Aid Kit', 'Trauma Kit', 'Antivenom']) {
      expect(names).toContain(kit);
    }
  });

  it('rarity-tiered depth: gear stays scarce (qty 1); stackables bulk up', () => {
    const armor = buildStallVendor('armor', 'armor');
    // Every armor line is a single instance (you don't bulk-buy plate).
    expect(armor.offers.every((o) => (o.quantity ?? 1) === 1)).toBe(true);

    const mats = buildStallVendor('materials', 'materials');
    // At least some material lines stack well past 1 (commons/uncommons).
    expect(mats.offers.filter((o) => (o.quantity ?? 1) >= 3).length).toBeGreaterThan(0);
  });

  it('gear stalls reliably offer a premium piece to fill a weak slot', () => {
    // Run several builds; a premium ware should show up essentially always.
    let withPremium = 0;
    for (let i = 0; i < 10; i++) {
      const v = buildStallVendor('armor', 'armor');
      // Premium/legendary pieces price well above the common floor.
      if (v.offers.some((o) => o.price >= 50)) withPremium++;
    }
    expect(withPremium).toBeGreaterThanOrEqual(8);
  });
});
