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
    expect(isDiscoverableRecipe({ result: 'Golem Greatsword' })).toBe(true);           // Rare
    expect(isDiscoverableRecipe({ result: 'Iron Spear' })).toBe(false);                // Common
    expect(isDiscoverableRecipe({ result: 'First Aid Kit' })).toBe(false);             // basic consumable
  });
});

describe('OTA-718 — recipeIsUnlockedFor', () => {
  it('basic recipes are always unlocked', () => {
    expect(recipeIsUnlockedFor({ result: 'Iron Spear' }, undefined)).toBe(true);
    expect(recipeIsUnlockedFor({ result: 'Climbing Rope' }, [])).toBe(true);
  });
  it('a discoverable recipe is locked until learned', () => {
    expect(recipeIsUnlockedFor({ result: 'Golem Greatsword' }, [])).toBe(false);
    expect(recipeIsUnlockedFor({ result: 'Golem Greatsword' }, ['Golem Greatsword'])).toBe(true);
  });
});

describe('OTA-718 — grandfather + unknown set', () => {
  it('marks an owned discoverable result as known (no retroactive loss)', () => {
    const known = grandfatheredKnownRecipes(RECIPES, ['Golem Greatsword', 'Scrap Metal'], undefined);
    expect(known).toContain('Golem Greatsword');
    // A basic result you own does NOT get added (it was never gated).
    expect(known).not.toContain('Iron Spear');
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
