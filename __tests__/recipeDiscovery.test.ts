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
  HARD_WON_RECIPE_CHANCE,
  LORE_HOOK_RECIPE_CHANCE,
  MISSION_RECIPE_CHANCE,
  LOOT_RECIPE_CHANCE,
  recipeVendorPrice,
  vendorRecipeOffers,
  vendorSeed,
} from '../app/engine/recipeDiscovery';
import { RECIPES, lookupCraftedItem } from '../app/engine/crafting';

function seq(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++]! : values[values.length - 1]!);
}

describe('OTA-718 — isDiscoverableRecipe (rare/legendary results are locked)', () => {
  it('true for a Legendary-result recipe, false for a Common one', () => {
    expect(isDiscoverableRecipe({ result: 'Aetheric Spear (Legendary)' })).toBe(true); // Legendary
    expect(isDiscoverableRecipe({ result: 'Aetheric Vest' })).toBe(true);              // Rare armor (loot recipe)
    expect(isDiscoverableRecipe({ result: 'Iron Spear' })).toBe(false);                // Common
    expect(isDiscoverableRecipe({ result: 'First Aid Kit' })).toBe(false);             // basic consumable
  });
});

describe('OTA-731/734 — base materials always craftable; a flagged upgrade is a found recipe', () => {
  it('base Mudstone stays always-craftable (refine intermediate)', () => {
    // The base material is an ingredient in dozens of downstream recipes —
    // locking it would soft-block the whole tree. Rare rarity, but NOT locked.
    expect(lookupCraftedItem('Mudstone').rarity).toBe('Rare');
    expect(isDiscoverableRecipe({ result: 'Mudstone' })).toBe(false);
    expect(recipeIsUnlockedFor({ result: 'Mudstone' }, [])).toBe(true);
  });
  it('Hardened Mudstone is a FOUND recipe (content-tagged), locked until learned', () => {
    // OTA-734 — the hardened upgrade is tagged 'found-recipe' in materials.json,
    // so it reads as a discovery while base Mudstone stays always-craftable.
    expect(isDiscoverableRecipe({ result: 'Hardened Mudstone' })).toBe(true);
    expect(recipeIsUnlockedFor({ result: 'Hardened Mudstone' }, [])).toBe(false);
    expect(recipeIsUnlockedFor({ result: 'Hardened Mudstone' }, ['Hardened Mudstone'])).toBe(true);
  });
  it('the flagged upgrade is surfaced EARLY — pickRecipeToLearn prioritizes it', () => {
    // Any successful discovery roll teaches the priority recipe first, so the
    // hardened chain never stays walled for long.
    expect(pickRecipeToLearn(RECIPES, [], () => 0)).toBe('Hardened Mudstone');
  });
  it('...but a Rare non-material item (armor/weapon) is still found-only', () => {
    expect(isDiscoverableRecipe({ result: 'Aetheric Vest' })).toBe(true);
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
    expect(recipeIsUnlockedFor({ result: 'Aetheric Vest' }, [])).toBe(false);
    expect(recipeIsUnlockedFor({ result: 'Aetheric Vest' }, ['Aetheric Vest'])).toBe(true);
  });
});

describe('OTA-718 — grandfather + unknown set', () => {
  it('marks an owned discoverable result as known (no retroactive loss)', () => {
    const known = grandfatheredKnownRecipes(RECIPES, ['Aetheric Vest', 'Scrap Metal'], undefined);
    expect(known).toContain('Aetheric Vest');
    // A basic result you own does NOT get added (it was never gated).
    expect(known).not.toContain('Iron Spear');
    // A MATERIAL you own is never grandfathered — materials aren't discoverable.
    expect(grandfatheredKnownRecipes(RECIPES, ['Mudstone'], undefined)).not.toContain('Mudstone');
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

describe('OTA-724 — found-recipe channels', () => {
  it('every discovery channel has a sane 0..1 chance', () => {
    for (const c of [HARD_WON_RECIPE_CHANCE, LORE_HOOK_RECIPE_CHANCE, MISSION_RECIPE_CHANCE, LOOT_RECIPE_CHANCE]) {
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
  it('a finished mission is the best odds; a cracked container the rarest', () => {
    // Milestone (mission) > kills/hooks > frequent container loot.
    expect(MISSION_RECIPE_CHANCE).toBeGreaterThan(HARD_WON_RECIPE_CHANCE);
    expect(LOOT_RECIPE_CHANCE).toBeLessThan(HARD_WON_RECIPE_CHANCE);
  });
});

describe('OTA-726 — vendors sell recipes (gold sink)', () => {
  it('prices by rarity: Rare < Legendary', () => {
    // Mudstone is Rare, Aetheric Spear (Legendary) is Legendary.
    expect(recipeVendorPrice('Mudstone')).toBe(200);
    expect(recipeVendorPrice('Aetheric Spear (Legendary)')).toBe(500);
    expect(recipeVendorPrice('Aetheric Spear (Legendary)')).toBeGreaterThan(recipeVendorPrice('Mudstone'));
  });

  it('offers only UNKNOWN discoverable recipes, and is stable per seed', () => {
    const seed = vendorSeed('Sketchy Stall');
    const offers = vendorRecipeOffers(RECIPES, [], seed);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.length).toBeLessThanOrEqual(3);
    for (const o of offers) {
      expect(isDiscoverableRecipe({ result: o.result })).toBe(true);
      expect(o.price).toBe(recipeVendorPrice(o.result));
    }
    // deterministic: same seed → same stock
    expect(vendorRecipeOffers(RECIPES, [], seed)).toEqual(offers);
    // an already-known result never appears on the menu
    const known = [offers[0]!.result];
    const after = vendorRecipeOffers(RECIPES, known, seed);
    expect(after.some((o) => o.result === offers[0]!.result)).toBe(false);
  });

  it('different vendors show different slices', () => {
    const a = vendorRecipeOffers(RECIPES, [], vendorSeed('Sketchy Stall'));
    const b = vendorRecipeOffers(RECIPES, [], vendorSeed('The Iron Bazaar'));
    // not guaranteed disjoint, but the starting offset should differ
    expect(a.map((o) => o.result).join()).not.toBe('');
    expect(vendorSeed('Sketchy Stall')).not.toBe(vendorSeed('The Iron Bazaar'));
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
