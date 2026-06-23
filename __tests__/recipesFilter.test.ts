// OTA-059 — Crafting screen 3-tab split + recipe filtering.
//
// CRAFT tab (kindFilter='non-consumable') must show every weapon /
// armor / relic / gear blueprint. RECIPES tab (kindFilter='consumable')
// must show only food / tonic / elixir blueprints. The two lists must
// be disjoint and their union must equal the full RECIPES catalog
// (no recipes dropped on the floor).
//
// This is a data-shape test against the engine. UI rendering is a
// thin wrapper over this filtering logic — if the filter is correct
// here, the screen renders the right rows.

import { RECIPES, lookupCraftedItem } from '../app/engine/crafting';
import { isGolemWeapon } from '../app/engine/golems';

describe('OTA-059 — RecipesView kindFilter', () => {
  it('every recipe resolves to a kind via lookupCraftedItem', () => {
    for (const r of RECIPES) {
      const cat = lookupCraftedItem(r.result);
      expect(cat.kind).toBeDefined();
      expect(['weapon', 'armor', 'consumable', 'relic', 'misc', 'dog_armor']).toContain(cat.kind);
    }
  });

  it('consumable filter catches every food / tonic / elixir', () => {
    const consumables = RECIPES.filter((r) => lookupCraftedItem(r.result).kind === 'consumable');
    const names = consumables.map((r) => r.result);
    // Known food/elixir results from the recipes.json catalog.
    expect(names).toContain("Forager's Stew");
    expect(names).toContain('Hearty Stew');
    expect(names).toContain('Mushroom Stew');
    expect(names).toContain('Red Cap Tincture');
    expect(names).toContain('Blue Cap Draught');
    expect(names).toContain('Violet Cap Distillate');
    expect(names).toContain('Orange Sporecap Brew');
    expect(names).toContain('Many-Colored Tonic');
    // And NOTHING gear-like sneaks in.
    expect(names).not.toContain('Iron Spear');
    expect(names).not.toContain('Aetheric Vest');
    expect(names).not.toContain('Climbing Rope');
  });

  it('non-consumable filter catches gear / weapons / relics, never food', () => {
    const gear = RECIPES.filter((r) => lookupCraftedItem(r.result).kind !== 'consumable');
    const names = gear.map((r) => r.result);
    expect(names).toContain('Iron Spear');
    expect(names).toContain('Aetheric Vest');
    expect(names).toContain('Climbing Rope');
    expect(names).toContain('Aetheric Torch');
    // And NOTHING consumable sneaks in.
    expect(names).not.toContain("Forager's Stew");
    expect(names).not.toContain('Hearty Stew');
    expect(names).not.toContain('Red Cap Tincture');
  });

  it('CRAFT + RECIPES partition the full RECIPES catalog with no overlap', () => {
    const consumable = new Set(
      RECIPES.filter((r) => lookupCraftedItem(r.result).kind === 'consumable').map((r) => r.result),
    );
    const nonConsumable = new Set(
      RECIPES.filter((r) => lookupCraftedItem(r.result).kind !== 'consumable').map((r) => r.result),
    );
    // No overlap.
    for (const name of consumable) {
      expect(nonConsumable.has(name)).toBe(false);
    }
    // Union covers every recipe — no orphans.
    expect(consumable.size + nonConsumable.size).toBe(RECIPES.length);
  });

  it('at least 5 consumable recipes and at least 20 non-consumable recipes', () => {
    // Sanity: the catalog should have enough on each side that the
    // tabs feel non-empty. As of OTA-059 the split is ~8 / ~30.
    const consumable = RECIPES.filter((r) => lookupCraftedItem(r.result).kind === 'consumable');
    const nonConsumable = RECIPES.filter((r) => lookupCraftedItem(r.result).kind !== 'consumable');
    expect(consumable.length).toBeGreaterThanOrEqual(5);
    expect(nonConsumable.length).toBeGreaterThanOrEqual(20);
  });
});

// engine_Dev — sidekick armaments (golem_weapon recipes) split OFF the Craft tab
// and onto the Magic tab, mirroring RecipesView's kindFilter logic exactly.
describe('engine_Dev — sidekick armaments live on the Magic tab', () => {
  const isSidekick = (result: string) => isGolemWeapon(lookupCraftedItem(result).tags);

  it('recognizes the golem_weapon recipes as sidekick armaments', () => {
    const arms = RECIPES.filter((r) => isSidekick(r.result)).map((r) => r.result);
    expect(arms.length).toBeGreaterThanOrEqual(3);
    expect(arms).toContain('Golem Sledge');
    expect(isSidekick('Iron Spear')).toBe(false); // a normal weapon is NOT a sidekick arm
  });

  it("the Craft tab ('non-consumable') EXCLUDES sidekick armaments", () => {
    const craft = RECIPES.filter((r) => {
      const c = lookupCraftedItem(r.result);
      return c.kind !== 'consumable' && !isGolemWeapon(c.tags);
    }).map((r) => r.result);
    expect(craft).toContain('Iron Spear');       // normal gear stays on Craft
    expect(craft).not.toContain('Golem Sledge');  // sidekick arm moved to Magic
  });

  it("the Magic tab ('sidekick-weapon') catches exactly the golem_weapon recipes", () => {
    const arms = RECIPES.filter((r) => isSidekick(r.result)).map((r) => r.result);
    expect(arms).toEqual(expect.arrayContaining(['Golem Sledge', 'Golem Greatsword', 'Golem Pike']));
    expect(arms).not.toContain('Iron Spear');
    expect(arms).not.toContain("Forager's Stew");
  });
});
