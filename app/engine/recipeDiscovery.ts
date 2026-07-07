// recipeDiscovery — "cool rare recipes" are LOCKED until you find them.
//
// Playtest ask: "shouldn't we be giving out cool rare recipes?" Today every
// recipe is always craftable if you own the ingredients, so a recipe is never
// a discovery. This module makes the RARE/LEGENDARY-result recipes (the cool
// weapons, giant crowns, legendary spears) locked-until-learned, tracked on
// player.knownRecipes. Basic recipes (tonics, climbing rope, iron spear, first
// aid — Common/Uncommon results) stay always-craftable, so nothing routine
// changes. The discoverable set is derived from the item CATALOG rarity, so it
// needs no per-recipe data flags and works for any content pack.
//
// Discovery paths (wired in gameStore): investigating a recipe / blueprint /
// schematic / formula / notes scene noun teaches one; a hard-won fight or a
// completed story thread occasionally teaches one (piggybacks OTA-716).

import { lookupCraftedItem } from './crafting';

export interface RecipeLike { result: string }

/** A recipe is DISCOVERABLE (locked until learned) when its result is a cool,
 *  rare item — Rare or Legendary rarity. Common/Uncommon results stay
 *  always-craftable. Catalog-driven, so no per-recipe flags are needed.
 *
 *  This INCLUDES the Rare/Legendary golem-/sidekick-weapon tiers: those are the
 *  "stronger armaments you uncover in your travels" (found via kills / hooks /
 *  vendors), while the COMMON tier of each type is auto-granted at the forge
 *  unlock beat so you're never left unable to arm your construct. The whole
 *  category still sits behind its story gate (coresRequired / quest-%), applied
 *  separately in the craft handler — that gate + this discovery gate stack, by
 *  design, for the Rare/Legendary tiers. */
export function isDiscoverableRecipe(recipe: RecipeLike): boolean {
  const r = lookupCraftedItem(recipe.result).rarity;
  return r === 'Rare' || r === 'Legendary';
}

/** Recipe-KNOWLEDGE gate only (ingredient check is separate). Basic recipes:
 *  always unlocked. Discoverable recipes: only once learned. */
export function recipeIsUnlockedFor(
  recipe: RecipeLike,
  knownRecipes: readonly string[] | undefined,
): boolean {
  if (!isDiscoverableRecipe(recipe)) return true;
  return (knownRecipes ?? []).includes(recipe.result);
}

/** The discoverable recipes the player has NOT yet learned. */
export function unknownDiscoverableRecipes(
  allRecipes: readonly RecipeLike[],
  knownRecipes: readonly string[] | undefined,
): string[] {
  const known = new Set(knownRecipes ?? []);
  const out = new Set<string>();
  for (const r of allRecipes) {
    if (isDiscoverableRecipe(r) && !known.has(r.result)) out.add(r.result);
  }
  return Array.from(out);
}

/** Grandfather: on an OLD save (or any time), a player who already OWNS the
 *  result of a discoverable recipe clearly earned it — mark it known so the
 *  feature never retroactively takes away something they hold. */
export function grandfatheredKnownRecipes(
  allRecipes: readonly RecipeLike[],
  inventoryNames: readonly string[],
  priorKnown: readonly string[] | undefined,
): string[] {
  const owned = new Set(inventoryNames);
  const known = new Set(priorKnown ?? []);
  for (const r of allRecipes) {
    if (isDiscoverableRecipe(r) && owned.has(r.result)) known.add(r.result);
  }
  return Array.from(known);
}

/** Pick a random unknown discoverable recipe to TEACH, weighted toward Rare
 *  over Legendary (so a legendary recipe stays a rare thrill). Returns the
 *  learned result name, or null when everything's already known. */
export function pickRecipeToLearn(
  allRecipes: readonly RecipeLike[],
  knownRecipes: readonly string[] | undefined,
  rng: () => number = Math.random,
): string | null {
  const pool = unknownDiscoverableRecipes(allRecipes, knownRecipes);
  if (pool.length === 0) return null;
  const rares = pool.filter((n) => lookupCraftedItem(n).rarity === 'Rare');
  const legos = pool.filter((n) => lookupCraftedItem(n).rarity === 'Legendary');
  // 80% a Rare recipe (if any left), else a Legendary.
  if (rares.length > 0 && (legos.length === 0 || rng() < 0.8)) {
    return rares[Math.floor(rng() * rares.length)]!;
  }
  if (legos.length > 0) return legos[Math.floor(rng() * legos.length)]!;
  return pool[Math.floor(rng() * pool.length)]!;
}

// A recipe/blueprint/notes scene noun the player can READ to learn a recipe.
export const RECIPE_NOTE_RE = /\b(recipe|recipes|blueprint|blueprints|schematic|schematics|formula|formulae|formulas|notes|plans|diagram|diagrams|instructions|manual|manuals|design|designs|scroll|codex|ledger|manuscript|tablet)\b/i;

// How often a hard-won fight / completed hook teaches a recipe (instead of the
// usual bonus material). Deliberately rarer than a material sprinkle — a
// recipe is a bigger deal.
export const HARD_WON_RECIPE_CHANCE = 0.1;
export const LORE_HOOK_RECIPE_CHANCE = 0.18;
