// OTA-718 — "cool rare recipes" are locked until you find them. The
// rare/legendary-result recipes are discoverable-only (player.knownRecipes);
// basic recipes stay always-craftable. Discovery: reading recipe/blueprint
// notes + rare loot. Grandfathered by owned result so no save loses access.

import {
  isDiscoverableRecipe,
  recipeIsUnlockedFor,
  unknownDiscoverableRecipes,
  grandfatheredKnownRecipes,
  pickRecipeToLearn,
  RECIPE_NOTE_RE,
} from '../app/engine/recipeDiscovery';
import { RECIPES, lookupCraftedItem } from '../app/engine/crafting';

function seq(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++]! : values[values.length - 1]!);
}

describe('OTA-718 — isDiscoverableRecipe (rare/legendary results are locked)', () => {
  it('true for a Legendary-result recipe, false for a Common one', () => {
    expect(isDiscoverableRecipe({ result: 'Aetheric Spear (Legendary)' })).toBe(true); // Legendary
    expect(isDiscoverableRecipe({ result: 'Mudstone' })).toBe(true);                    // Rare (normal loot recipe)
    expect(isDiscoverableRecipe({ result: 'Iron Spear' })).toBe(false);                // Common
    expect(isDiscoverableRecipe({ result: 'First Aid Kit' })).toBe(false);             // basic consumable
  });
});

describe('OTA-720 — golem weapon tiers: Common granted, Rare/Legendary found', () => {
  it('the COMMON tier of each type is NOT discoverable (auto-granted at unlock)', () => {
    for (const n of ['Crude Golem Sledge', 'Crude Golem Greatsword', 'Crude Golem Pike']) {
      expect(lookupCraftedItem(n).rarity).toBe('Common');
      expect(isDiscoverableRecipe({ result: n })).toBe(false);
      expect(recipeIsUnlockedFor({ result: n }, [])).toBe(true); // available once the gate lifts
    }
  });
  it('the RARE + LEGENDARY tiers ARE discoverable (found in the world)', () => {
    for (const n of ['Golem Sledge', 'Elder Golem Sledge', 'Golem Greatsword', 'Elder Golem Pike']) {
      expect(isDiscoverableRecipe({ result: n })).toBe(true);
      expect(recipeIsUnlockedFor({ result: n }, [])).toBe(false);      // locked until found
      expect(recipeIsUnlockedFor({ result: n }, [n])).toBe(true);      // learned → unlocked
    }
  });
  it('a hard-won reward can teach a Rare/Legendary golem armament, never a Common one', () => {
    const pool = unknownDiscoverableRecipes(RECIPES, []);
    expect(pool.some((n) => n.startsWith('Golem ') || n.startsWith('Elder Golem '))).toBe(true);
    expect(pool.some((n) => n.startsWith('Crude Golem '))).toBe(false);
  });
});

describe('OTA-718 — recipeIsUnlockedFor', () => {
  it('basic recipes are always unlocked', () => {
    expect(recipeIsUnlockedFor({ result: 'Iron Spear' }, undefined)).toBe(true);
    expect(recipeIsUnlockedFor({ result: 'Climbing Rope' }, [])).toBe(true);
  });
  it('a discoverable recipe is locked until learned', () => {
    expect(recipeIsUnlockedFor({ result: 'Mudstone' }, [])).toBe(false);
    expect(recipeIsUnlockedFor({ result: 'Mudstone' }, ['Mudstone'])).toBe(true);
  });
});

describe('OTA-718 — grandfather + unknown set', () => {
  it('marks an owned discoverable result as known (no retroactive loss)', () => {
    const known = grandfatheredKnownRecipes(RECIPES, ['Mudstone', 'Scrap Metal'], undefined);
    expect(known).toContain('Mudstone');
    // A basic result you own does NOT get added (it was never gated).
    expect(known).not.toContain('Iron Spear');
    // A Rare golem armament you already own IS grandfathered (it's discoverable now).
    const known2 = grandfatheredKnownRecipes(RECIPES, ['Golem Greatsword'], undefined);
    expect(known2).toContain('Golem Greatsword');
    // ...but the Common tier is never a discovery, so owning it adds nothing.
    const known3 = grandfatheredKnownRecipes(RECIPES, ['Crude Golem Pike'], undefined);
    expect(known3).not.toContain('Crude Golem Pike');
  });
  it('unknownDiscoverableRecipes shrinks as you learn', () => {
    const allUnknown = unknownDiscoverableRecipes(RECIPES, []);
    expect(allUnknown.length).toBeGreaterThan(0);
    const one = allUnknown[0]!;
    const after = unknownDiscoverableRecipes(RECIPES, [one]);
    expect(after).not.toContain(one);
    expect(after.length).toBe(allUnknown.length - 1);
  });
});

describe('OTA-718 — pickRecipeToLearn', () => {
  it('returns an unknown discoverable recipe, weighted toward Rare', () => {
    // rng: first roll < 0.8 → prefer a Rare-tier recipe; second → index 0.
    const learned = pickRecipeToLearn(RECIPES, [], seq([0.1, 0]));
    expect(learned).toBeTruthy();
    expect(isDiscoverableRecipe({ result: learned! })).toBe(true);
    expect(lookupCraftedItem(learned!).rarity).toBe('Rare');
  });
  it('returns null once every discoverable recipe is known', () => {
    const all = unknownDiscoverableRecipes(RECIPES, []);
    expect(pickRecipeToLearn(RECIPES, all)).toBeNull();
  });
});

describe('OTA-718 — RECIPE_NOTE_RE', () => {
  it('matches the reading nouns', () => {
    for (const n of ['recipe', 'blueprint', 'schematic', 'formula', 'notes', 'plans', 'a faded recipe']) {
      expect(RECIPE_NOTE_RE.test(n)).toBe(true);
    }
    expect(RECIPE_NOTE_RE.test('rusted pulley')).toBe(false);
  });
});
