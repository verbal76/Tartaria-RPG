// OTA-722 — every armor SLOT now has a craftable recipe at Rare AND Legendary
// (the Aetherforged rare set + Titanforged legendary set filled legs/hands/feet/
// cloak, plus a Legendary chest). They're Rare/Legendary results, so they enter
// the discovery pool as FOUND recipes (locked until uncovered) — not auto-granted.

import { RECIPES, lookupCraftedItem } from '../app/engine/crafting';
import { isDiscoverableRecipe } from '../app/engine/recipeDiscovery';

const ARMOR_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet', 'cloak'] as const;

// slot → set of rarities that have at least one craftable recipe
function craftableRaritiesBySlot(): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const r of RECIPES) {
    const look = lookupCraftedItem(r.result);
    if (look.kind !== 'armor') continue;
    // slot lives on the catalog row, not lookupCraftedItem — read via tags
    // (every armor row tags its slot) so we stay data-driven.
    const slot = ARMOR_SLOTS.find((s) => (look.tags ?? []).includes(s));
    if (!slot) continue;
    (out[slot] ??= new Set()).add(look.rarity);
  }
  return out;
}

describe('OTA-722 — every armor slot is craftable at Rare + Legendary', () => {
  const bySlot = craftableRaritiesBySlot();
  for (const slot of ARMOR_SLOTS) {
    it(`${slot}: has a Rare and a Legendary recipe`, () => {
      expect(bySlot[slot]?.has('Rare')).toBe(true);
      expect(bySlot[slot]?.has('Legendary')).toBe(true);
    });
  }
});

describe('OTA-722 — the new Aetherforged/Titanforged set', () => {
  const RARE = ['Aetherforged Greaves', 'Aetherforged Gauntlets', 'Aetherforged Treads', 'Aetherforged Mantle'];
  const LEG = ['Titanforged Cuirass', 'Titanforged Greaves', 'Titanforged Gauntlets', 'Titanforged Treads', 'Titanforged Mantle'];

  it('all nine are armor, with the expected rarity, and have a recipe', () => {
    for (const n of RARE) {
      expect(lookupCraftedItem(n).kind).toBe('armor');
      expect(lookupCraftedItem(n).rarity).toBe('Rare');
      expect(RECIPES.some((r) => r.result === n)).toBe(true);
    }
    for (const n of LEG) {
      expect(lookupCraftedItem(n).kind).toBe('armor');
      expect(lookupCraftedItem(n).rarity).toBe('Legendary');
      expect(RECIPES.some((r) => r.result === n)).toBe(true);
    }
  });

  it('all nine are FOUND recipes (discoverable, not auto-granted)', () => {
    for (const n of [...RARE, ...LEG]) {
      expect(isDiscoverableRecipe({ result: n })).toBe(true);
    }
  });

  it('the Legendary pieces each require a boss-drop heart material', () => {
    const HEARTS = ['Behemoth Heart', 'Mud-Iron Heart', 'Iron Core', 'Aetherstone Heart', 'Throne Shard'];
    for (const n of LEG) {
      const recipe = RECIPES.find((r) => r.result === n)!;
      const names = recipe.ingredients.map((i) => i.name);
      expect(names.some((m) => HEARTS.includes(m))).toBe(true);
    }
  });
});
