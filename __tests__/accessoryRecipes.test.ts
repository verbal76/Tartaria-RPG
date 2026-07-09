// OTA-730 — new craftable rings + amulets (Rare/Legendary), so their recipes feed
// the discovery + vendor-sale gold sink. Some are DEFENSIVE (+AC) — safe, because a
// natural-20 enemy attack always hits regardless of AC (no unhittable builds).

import { RECIPES, lookupCraftedItem, findRingByName, findAmuletByName } from '../app/engine/crafting';
import { isDiscoverableRecipe } from '../app/engine/recipeDiscovery';
import { getItemPreview } from '../app/components/itemPreview';

const NEW_RINGS = ['Aetherstone Signet', "Titan's Iron Band", 'Ring of the Deep Current'];
const NEW_AMULETS = ['Amulet of the Silt Warden', "Reclaimer's Aegis Pendant", 'Heart of the Aetherstorm'];
const DEFENSIVE = ["Titan's Iron Band", 'Ring of the Deep Current', "Reclaimer's Aegis Pendant", 'Heart of the Aetherstorm'];

describe('OTA-730 — new accessories are craftable + discoverable (vendor-sellable)', () => {
  it('each has a recipe and resolves as a Rare/Legendary relic', () => {
    for (const n of [...NEW_RINGS, ...NEW_AMULETS]) {
      expect(RECIPES.some((r) => r.result === n)).toBe(true);
      const look = lookupCraftedItem(n);
      expect(look.kind).toBe('relic');
      expect(['Rare', 'Legendary']).toContain(look.rarity);
      // Rare/Legendary → in the discovery pool → sellable at vendors.
      expect(isDiscoverableRecipe({ result: n })).toBe(true);
    }
  });

  it('rings resolve as rings, amulets as amulets (so they equip to the right slot)', () => {
    for (const n of NEW_RINGS) expect(findRingByName(n)).toBeTruthy();
    for (const n of NEW_AMULETS) expect(findAmuletByName(n)).toBeTruthy();
  });
});

describe('OTA-730 — defensive accessories carry AC', () => {
  it('the defensive set grants a flat acBonus; the pure-stat ones do not', () => {
    for (const n of DEFENSIVE) {
      const acc = (findRingByName(n) ?? findAmuletByName(n))!;
      expect(acc.acBonus).toBeGreaterThanOrEqual(1);
    }
    // a modest bonus — not a runaway (nat-20 floor keeps it safe either way)
    for (const n of DEFENSIVE) {
      const acc = (findRingByName(n) ?? findAmuletByName(n))!;
      expect(acc.acBonus!).toBeLessThanOrEqual(2);
    }
    // pure-stat accessories have no AC
    expect(findRingByName('Aetherstone Signet')!.acBonus).toBeFalsy();
    expect(findAmuletByName('Amulet of the Silt Warden')!.acBonus).toBeFalsy();
  });

  it('the item preview surfaces the AC line', () => {
    expect(getItemPreview("Titan's Iron Band").stats.some((s) => /^AC \+\d/.test(s))).toBe(true);
    expect(getItemPreview('Heart of the Aetherstorm').stats.some((s) => /^AC \+\d/.test(s))).toBe(true);
  });
});
