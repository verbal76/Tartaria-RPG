// OTA-1008 — "cool rare recipes" are locked until you find them. The rare/
// legendary-result recipes are discoverable-only (player.knownRecipes); basic
// recipes stay always-craftable. Discovery: reading recipe/blueprint/notes +
// rare loot. Grandfathered by owned result so no save loses access.
//
// engine_Dev is content-pack driven, so this suite derives its sample recipe
// names from the LIVE default table rather than hardcoding names — it stays
// green on any re-skinned content pack.

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

// Sample names pulled from the live table so the suite is content-agnostic.
const A_DISCOVERABLE = RECIPES.find((r) => isDiscoverableRecipe(r))!.result;
const A_COMMON = RECIPES.find((r) => !isDiscoverableRecipe(r))!.result;

describe('OTA-1008 — isDiscoverableRecipe (rare/legendary results are locked)', () => {
  it('there is at least one of each kind in the default table', () => {
    expect(A_DISCOVERABLE).toBeTruthy();
    expect(A_COMMON).toBeTruthy();
  });
  it('true for a rare/legendary-result recipe, false for a basic one', () => {
    expect(isDiscoverableRecipe({ result: A_DISCOVERABLE })).toBe(true);
    expect(['Rare', 'Legendary']).toContain(lookupCraftedItem(A_DISCOVERABLE).rarity);
    expect(isDiscoverableRecipe({ result: A_COMMON })).toBe(false);
  });
});

describe('OTA-1009 — sidekick weapon route is NOT swept into discovery', () => {
  it('sidekick armaments (golem_weapon-tagged) stay non-discoverable', () => {
    // engine_Dev's sidekick weapons are Rare and carry the 'golem_weapon' tag
    // (no coresRequired in the default pack). They have their own MAGIC-tab
    // route, so the discoverable gate must leave them out — else they'd be
    // locked with no discovery path.
    const sk = RECIPES.filter((r) => (lookupCraftedItem(r.result).tags ?? []).includes('golem_weapon'));
    expect(sk.length).toBeGreaterThan(0);
    for (const r of sk) {
      expect(isDiscoverableRecipe(r)).toBe(false);
      expect(recipeIsUnlockedFor(r, [])).toBe(true);
    }
    // ...and none can leak in as a random "learned recipe" reward.
    const pool = unknownDiscoverableRecipes(RECIPES, []);
    expect(pool.some((n) => (lookupCraftedItem(n).tags ?? []).includes('golem_weapon'))).toBe(false);
  });
});

describe('OTA-1008 — recipeIsUnlockedFor', () => {
  it('basic recipes are always unlocked', () => {
    expect(recipeIsUnlockedFor({ result: A_COMMON }, undefined)).toBe(true);
    expect(recipeIsUnlockedFor({ result: A_COMMON }, [])).toBe(true);
  });
  it('a discoverable recipe is locked until learned', () => {
    expect(recipeIsUnlockedFor({ result: A_DISCOVERABLE }, [])).toBe(false);
    expect(recipeIsUnlockedFor({ result: A_DISCOVERABLE }, [A_DISCOVERABLE])).toBe(true);
  });
});

describe('OTA-1008 — grandfather + unknown set', () => {
  it('marks an owned discoverable result as known (no retroactive loss)', () => {
    const known = grandfatheredKnownRecipes(RECIPES, [A_DISCOVERABLE, A_COMMON], undefined);
    expect(known).toContain(A_DISCOVERABLE);
    // A basic result you own does NOT get added (it was never gated).
    expect(known).not.toContain(A_COMMON);
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

describe('OTA-1008 — pickRecipeToLearn', () => {
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

describe('OTA-1008 — RECIPE_NOTE_RE', () => {
  it('matches the reading nouns', () => {
    for (const n of ['recipe', 'blueprint', 'schematic', 'formula', 'notes', 'plans', 'a faded recipe']) {
      expect(RECIPE_NOTE_RE.test(n)).toBe(true);
    }
    expect(RECIPE_NOTE_RE.test('rusted pulley')).toBe(false);
  });
});
