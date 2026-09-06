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

import { lookupCraftedItem, findMaterialByName } from './crafting';

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
// OTA-734 — a MATERIAL can opt back INTO discovery with this content tag. By
// default materials are never locked (see below); tagging one 'found-recipe'
// makes its recipe a find (e.g. Hardened Mudstone), while the base material it
// upgrades from stays always-craftable. Lives in the content JSON, so the
// engine carries no lore — an author sets it per material in their own pack.
const FOUND_RECIPE_TAG = 'found-recipe';

/** Is this result a material the content has flagged as a found recipe?
 *  Resolved from the material NAME (via findMaterialByName), so a synthetic
 *  { result } and a real recipe object always agree. */
function materialIsFoundRecipe(result: string): boolean {
  const mat = findMaterialByName(result) as { tags?: readonly string[] } | undefined;
  return !!mat && (mat.tags ?? []).includes(FOUND_RECIPE_TAG);
}

export function isDiscoverableRecipe(recipe: RecipeLike): boolean {
  const mat = findMaterialByName(recipe.result);
  if (mat) {
    // OTA-731 — MATERIAL-refinement recipes (Mudstone, Shaped Aetheric Shard, …)
    // are crafting INTERMEDIATES, not aspirational loot. Never lock them behind
    // discovery even at Rare rarity — otherwise the refine chain soft-blocks
    // everything downstream. They stay always-craftable BY DEFAULT.
    // OTA-734 — EXCEPT a material the content tags 'found-recipe' (Hardened
    // Mudstone): base Mudstone stays always-craftable, but the hardened upgrade
    // is a find — locked until learned, and weighted to surface EARLY so it
    // never walls its downstream tree for long (see pickRecipeToLearn).
    return materialIsFoundRecipe(recipe.result);
  }
  // ⚠⚠⚠ OTA-1723 — FOOD IS NEVER LOCKED, on exactly the argument the material
  // carve-out above already makes. Owner: *"yes, unlock Hearty Stew."* It is the
  // only Rare-result food, so it was the only dish gated behind a random recipe
  // note — a player could hold every ingredient and be told nothing, with no way
  // to learn that cooking was even the reason. Cooking is a survival basic, not
  // aspirational loot: locking a stew behind a find soft-blocks the food economy
  // the same way locking Mudstone soft-blocked the refine chain.
  //
  // ⚠ Done as a RULE rather than by dropping Hearty Stew to Uncommon, because
  // its rarity is what its stew is WORTH; changing that to dodge a gate would
  // have quietly nerfed the dish to fix the door. The five dishes OTA-1723 adds
  // are Common and Uncommon and would not have tripped this either way — the
  // rule is here so the next Rare dish does not have to rediscover the problem.
  const look = lookupCraftedItem(recipe.result);
  if ((look.tags ?? []).includes('food')) return false;
  const r = look.rarity;
  return r === 'Rare' || r === 'Legendary';
}

/** Content-flagged "find this early" recipes (the 'found-recipe' material tag).
 *  pickRecipeToLearn surfaces these ahead of generic rares so a gating refine
 *  step (e.g. Hardened Mudstone) is discovered soon, not buried behind a pile
 *  of legendary weapons. */
export function isPriorityFoundRecipe(result: string): boolean {
  return materialIsFoundRecipe(result);
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
  // OTA-734 — content-flagged priority recipes (Hardened Mudstone and friends)
  // surface FIRST, so a gating refine step is found early instead of buried.
  const priority = pool.filter(isPriorityFoundRecipe);
  if (priority.length > 0) return priority[Math.floor(rng() * priority.length)]!;
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
// OTA-724 — two more "found" channels. Finishing a contract / mystery / storyline
// / hunt is a milestone, so it carries the best odds. A cracked container is
// frequent, so its odds are low — a rare thrill, not a firehose.
export const MISSION_RECIPE_CHANCE = 0.25;
export const LOOT_RECIPE_CHANCE = 0.06;

// OTA-726 — vendors can SELL recipes (a gold sink + a reliable, if pricey, way to
// learn a working you haven't stumbled on). Priced by rarity of the result.
export function recipeVendorPrice(result: string): number {
  switch (lookupCraftedItem(result).rarity) {
    case 'Legendary': return 500;
    case 'Rare': return 200;
    default: return 120; // any other discoverable tier — a safe middle price
  }
}

/** Every discoverable recipe RESULT, sorted — the FULL, stable pool (independent of
 *  what the player knows). This is the anchor for a vendor's fixed menu. */
export function allDiscoverableRecipes(allRecipes: readonly RecipeLike[]): string[] {
  const out = new Set<string>();
  for (const r of allRecipes) if (isDiscoverableRecipe(r)) out.add(r.result);
  return Array.from(out).sort();
}

/** A stable per-vendor slice of the recipes this vendor will teach for TC.
 *  The MENU (which `count` recipes this trader carries) is fixed by `seed` over the
 *  FULL discoverable pool, so it does NOT change as you learn things — otherwise every
 *  purchase shrank the "unknown" pool and rerolled the window, restocking endlessly
 *  (player could buy recipes until broke). Already-learned recipes in the fixed menu
 *  simply drop out of the buyable list (their menu slot doesn't slide), so once you've
 *  bought this trader's whole menu there's nothing left — no reroll, bounded supply. */
export function vendorRecipeOffers(
  allRecipes: readonly RecipeLike[],
  knownRecipes: readonly string[] | undefined,
  seed: number,
  count = 3,
): { result: string; price: number }[] {
  const full = allDiscoverableRecipes(allRecipes);          // STABLE — not filtered by known
  if (full.length === 0) return [];
  const start = ((seed % full.length) + full.length) % full.length;
  const n = Math.min(count, full.length);
  const known = new Set(knownRecipes ?? []);
  const out: { result: string; price: number }[] = [];
  for (let i = 0; i < n; i++) {
    const result = full[(start + i) % full.length]!;
    if (known.has(result)) continue;                         // learned → not buyable, but the menu slice stays fixed
    out.push({ result, price: recipeVendorPrice(result) });
  }
  return out;
}

/** Tiny stable string hash → a vendor seed for vendorRecipeOffers. */
export function vendorSeed(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}
