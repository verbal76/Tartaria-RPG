/**
 * OTA-1723 — THE KITCHEN OPENS.
 *
 * Owner, twice — once to me and once typed into the game itself, which is where
 * it counts: *"Why is food and health crafting so rare now?"* and *"let's add
 * maybe five more basic food recipes utilizing what we already have as
 * ingredients, and let's fix the spawn rate of the water bottle… and yes, unlock
 * Hearty Stew."*
 *
 * ⚠⚠⚠ WHAT THE MEASUREMENT SAID, before anything was written. The game has
 * TWENTY-SIX food items and THREE recipes. All three are stews, and all three
 * need a filled Water Bottle — which never drops. What drops is the EMPTY, at
 * weight 4 of 270 (1.5%), which you then carry to a water source and fill on a
 * per-room cooldown. So the entire cooked-food economy hung off the rarest
 * object in the forage pool, and the filled bottle is ALSO the drink you heal
 * with, so cooking competed with survival for the same item.
 *
 * ⚠⚠ AND THE PANTRY WAS ALREADY FULL. Wild Oats, Wild Lettuce, Rhubarb Stalk,
 * Orange Sporecap, Blueberries, Raspberries, Speckled Egg — all in the ground,
 * all droppable, not one of them named by a recipe. His own log shows it: he
 * scrapes the silt, pulls up Raspberries and a Speckled Egg, and the cookbook
 * asks him for onions. The five new dishes are built on what the ground actually
 * gives, and THREE OF THEM NEED NO WATER AT ALL — which is the real unblock.
 *
 * ⚠ HEARTY STEW was the only Rare-result food, so it was the only dish locked
 * behind a random recipe note: you could hold every ingredient and be told
 * nothing, with no way to learn that cooking was the reason. Fixed as a RULE —
 * food is never discovery-locked, the same carve-out materials already have —
 * rather than by dropping its rarity, because its rarity is what the stew is
 * WORTH and changing that to dodge a gate nerfs the dish to fix the door.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { RECIPES, lookupCraftedItem, missingIngredientsList } from '../app/engine/crafting';
import { recipeIsUnlockedFor, isDiscoverableRecipe } from '../app/engine/recipeDiscovery';
import type { InventoryItem } from '../app/engine/types';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const NEW = ['Berry Mash', 'Green Fold', 'Oat Cake', "Forager's Skillet", 'Sporecap Skewer'];
const recipeFor = (n: string) => RECIPES.find((r) => r.result === n)!;
const held = (names: string[]): InventoryItem[] => names.map((n, i) => ({
  id: `i${i}`, name: n, kind: 'consumable', rarity: 'Common', quantity: 5, tags: [],
} as unknown as InventoryItem));

describe('OTA-1723 — ⚠⚠⚠ five dishes, made of what the ground gives', () => {
  it('all five exist, as recipes and as real catalog items', () => {
    for (const n of NEW) {
      const r = recipeFor(n);
      expect({ n, hasRecipe: !!r }).toEqual({ n, hasRecipe: true });
      const item = lookupCraftedItem(n);
      expect({ n, kind: item.kind, food: item.tags.includes('food') })
        .toEqual({ n, kind: 'consumable', food: true });
    }
  });

  it('⚠⚠ every ingredient is something the world ALREADY drops', () => {
    // "utilizing what we already have as ingredients" — so not one new material,
    // and every input has to be a row the forage or dig table can actually hand
    // you. A recipe whose ingredient does not drop is the defect being fixed,
    // reissued.
    const forage = src('app', 'engine', 'areaSearch.ts') + src('app', 'engine', 'digging.ts');
    for (const n of NEW) {
      for (const ing of recipeFor(n).ingredients) {
        expect({ dish: n, ing: ing.name, dropsSomewhere: forage.includes(`'${ing.name}'`) })
          .toEqual({ dish: n, ing: ing.name, dropsSomewhere: true });
      }
    }
  });

  it('⚠⚠⚠ THREE OF THE FIVE NEED NO WATER — the actual unblock', () => {
    // The bottle is the shared bottleneck. Adding five more recipes that all
    // needed one would have been five more things he cannot cook.
    const waterless = NEW.filter((n) => !recipeFor(n).ingredients.some((i) => /Water Bottle/.test(i.name)));
    expect(waterless.length).toBeGreaterThanOrEqual(3);
    // And two need no fire either, so they can be made anywhere, on any day.
    const noFire = waterless.filter((n) => !recipeFor(n).ingredients.some((i) => i.name === 'Firewood'));
    expect(noFire.sort()).toEqual(['Berry Mash', 'Green Fold']);
  });

  it('⚠ and none of them needs the bottle at all', () => {
    for (const n of NEW) {
      const uses = recipeFor(n).ingredients.map((i) => i.name);
      expect({ n, water: uses.filter((u) => /Water Bottle/.test(u)) }).toEqual({ n, water: [] });
    }
  });

  it('a player holding the listed ingredients can actually make each one', () => {
    // The end-to-end claim, through the engine's own ingredient check rather
    // than by reading the JSON back to myself.
    for (const n of NEW) {
      const r = recipeFor(n);
      const missing = missingIngredientsList(r.ingredients, held(r.ingredients.map((i) => i.name)));
      expect({ n, missing }).toEqual({ n, missing: [] });
    }
  });
});

describe('OTA-1723 — ⚠⚠ cooking is not a lottery', () => {
  it('HEARTY STEW is craftable without finding a recipe note', () => {
    const stew = recipeFor('Hearty Stew');
    expect(stew).toBeTruthy();
    expect(isDiscoverableRecipe(stew)).toBe(false);
    expect(recipeIsUnlockedFor(stew, [])).toBe(true);
    expect(recipeIsUnlockedFor(stew, undefined)).toBe(true);
  });

  it('⚠ and its RARITY is untouched — the door was fixed, not the dish', () => {
    // Dropping it to Uncommon would have unlocked it and quietly nerfed what the
    // stew is worth. The rule changed instead.
    expect(lookupCraftedItem('Hearty Stew').rarity).toBe('Rare');
  });

  it('⚠⚠ no food recipe anywhere is discovery-locked', () => {
    const locked = RECIPES
      .filter((r) => (lookupCraftedItem(r.result).tags ?? []).includes('food'))
      .filter((r) => isDiscoverableRecipe(r))
      .map((r) => r.result);
    expect(locked).toEqual([]);
  });

  it('and NON-food rares are still locked — the carve-out is food-shaped', () => {
    // A carve-out that quietly unlocked everything would be a different feature
    // wearing this one's name.
    //
    // ⚠ MEASURED, not assumed: my first cut asserted that EVERY non-food rare
    // stays locked and it failed on one — Mudstone, which is a Rare-rarity
    // MATERIAL and is unlocked by OTA-731's carve-out ("crafting intermediates,
    // never lock them behind discovery, otherwise the refine chain soft-blocks
    // everything downstream"). That is the same argument this OTA makes for
    // food, made three years earlier for materials, and it was already right.
    // The claim is therefore about food-and-material, not food alone.
    const unlockedRares = RECIPES.filter((r) => {
      const l = lookupCraftedItem(r.result);
      return (l.rarity === 'Rare' || l.rarity === 'Legendary') && !isDiscoverableRecipe(r);
    }).map((r) => r.result);
    const food = unlockedRares.filter((n) => (lookupCraftedItem(n).tags ?? []).includes('food'));
    const material = unlockedRares.filter((n) => !(lookupCraftedItem(n).tags ?? []).includes('food'));
    expect(food).toEqual(['Hearty Stew']);
    expect(material).toEqual(['Mudstone']);
    // …and plenty of other rares ARE still locked, so the gate still exists.
    const lockedRares = RECIPES.filter((r) => {
      const l = lookupCraftedItem(r.result);
      return (l.rarity === 'Rare' || l.rarity === 'Legendary') && isDiscoverableRecipe(r);
    });
    expect(lockedRares.length).toBeGreaterThan(10);
  });
});

describe('OTA-1723 — ⚠ the bottle', () => {
  it('the empty bottle went from 1.5% of a forage to 4.3%', () => {
    const a = src('app', 'engine', 'areaSearch.ts');
    expect(a.includes("{ name: 'Empty Water Bottle', rarity: 'Common', weight: 12 },")).toBe(true);
    const d = src('app', 'engine', 'digging.ts');
    expect(d.includes("{ name: 'Empty Water Bottle', rarity: 'Common', baseWeight: 12 },")).toBe(true);
  });

  it('⚠ BOTH tables moved, because the owner forages by digging', () => {
    // His log shows "investigate the ground" as his most-used action by a wide
    // margin, which routes to the dig pool. A bottle made common only in the
    // forage table would have been common everywhere except where he plays.
    for (const f of [['app', 'engine', 'areaSearch.ts'], ['app', 'engine', 'digging.ts']]) {
      expect(src(...f).includes('OTA-1723')).toBe(true);
    }
  });

  it('the three original stews still ask for it — supply moved, not the recipes', () => {
    for (const stew of ["Forager's Stew", 'Hearty Stew', 'Mushroom Stew']) {
      expect(recipeFor(stew).ingredients.some((i) => i.name === 'Water Bottle')).toBe(true);
    }
  });
});
