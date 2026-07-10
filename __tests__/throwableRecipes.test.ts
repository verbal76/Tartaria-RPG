// OTA-967 — craftable throwables. Throwable weapons were loot/vendor-only, so the
// bandolier had no crafting supply line (a playtester's only throwable was a
// looted Disease Sample). Five throwable weapons are now craftable. This locks the
// data contract: each new recipe's output resolves to a real catalog item that is
// (a) tagged throwable and (b) bandolier-eligible (not a too-long spear/javelin),
// and every ingredient resolves — so the whole "gather → craft → rack it" loop holds.

import { RECIPES, findCatalogItem } from '../app/engine/crafting';
import { itemIsThrowable, isBandolierEligible } from '../app/engine/bandolierEligibility';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const NEW_THROWABLE_RECIPES = [
  'Throwing Knife',
  'Tartarian Hand Axe (Throw)',
  'Mud Throwing Knife',
  'Bone Throwing Axe',
  // OTA-754 — Shaped Aetheric Shard removed: it is obtained via the SHAPE
  // Aethercraft power (Aetheric tab), not a Craft-tab recipe. The 'shape stone'
  // discipline binds an Aetheric Shard to a Small Rock; there is no recipe row.
];

function bareInvItem(name: string): InventoryItem {
  const cat = findCatalogItem(name)!;
  return { id: `test_${name}`, name: cat.name, kind: cat.kind, rarity: cat.rarity, tags: cat.tags, quantity: 1 } as unknown as InventoryItem;
}
const emptyPlayer = { equipped: {}, inventory: [] } as unknown as PlayerCharacter;

describe('craftable throwables feed the bandolier (OTA-967)', () => {
  it('each new recipe exists and its output resolves to a throwable catalog item', () => {
    for (const name of NEW_THROWABLE_RECIPES) {
      const recipe = RECIPES.find((r) => r.result === name);
      expect(recipe).toBeTruthy();
      const cat = findCatalogItem(name);
      expect(cat).toBeTruthy();
      expect(itemIsThrowable(bareInvItem(name))).toBe(true);
    }
  });

  it('each crafted throwable is bandolier-eligible (not a too-long spear/javelin)', () => {
    for (const name of NEW_THROWABLE_RECIPES) {
      const elig = isBandolierEligible(bareInvItem(name), emptyPlayer);
      expect(elig.eligible).toBe(true);
      expect(elig.reason).toBe('');
    }
  });

  it('every ingredient of every new recipe resolves to a real catalog item', () => {
    for (const name of NEW_THROWABLE_RECIPES) {
      const recipe = RECIPES.find((r) => r.result === name)!;
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      for (const ing of recipe.ingredients) {
        expect(findCatalogItem(ing.name)).toBeTruthy();
        expect(ing.quantity).toBeGreaterThan(0);
      }
    }
  });
});
