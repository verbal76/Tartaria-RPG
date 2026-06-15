import type { InventoryItem, Rarity, DamageType } from './types';
import type { ItemEffect } from './itemEffect';
import { levenshtein } from './editDistance';
import { resolveItemAlias } from './itemAliases';
import materialsData from '../data/items/materials.json';
import weaponsData from '../data/items/weapons.json';
import armorData from '../data/items/armor.json';
import gearData from '../data/items/gear.json';
import recipesData from '../data/items/recipes.json';
import amuletsData from '../data/items/amulets.json';
import ringsData from '../data/items/rings.json';
import explorationData from '../data/items/exploration.json';
import dogGearData from '../data/items/dogGear.json';
import { inferWeapon, inferArmor, inferAccessory } from './itemDefaults';

export interface CatalogMaterial {
  name: string;
  rarity: Rarity;
  tags: string[];
  description: string;
  /** OTA 192 — optional effect tag. See engine/itemEffect.ts for
   *  the schema and how the engine consumes it. */
  effect?: ItemEffect;
}

export type WeaponStyle = 'two_handed' | 'dual_wield' | 'single_handed' | 'ranged' | 'shield' | 'runecaster';

export interface CatalogWeapon {
  name: string;
  weaponKind: 'melee' | 'ranged' | 'runecaster';
  damageType: DamageType;
  damageDice: string;
  stat: 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma';
  rarity: Rarity;
  baseDurability?: number;
  /** Bonus to a d20 block roll. 0 = can't block (ranged), 6 = heavy two-hander. */
  defense?: number;
  tags: string[];
  description: string;
  /** Optional rulebook-aligned metadata. All four added together to
   *  carry the canonical weapon-table fields without breaking the
   *  existing engine. */
  style?: WeaponStyle;
  statRequirement?: number;
  faction?: string;
  tc?: number;
  /** Free-text "Effect or Special Property" column from the rulebook.
   *  Some get wired into mechanics (bleed, stun); the rest read as
   *  flavor at the moment but the data is preserved for future hooks. */
  effect?: string;
  // arb-fix — weapons can carry a structured max-HP bonus (mirrors armor's
  // `statBonuses`). The "Grants +X HP" rebalance text on a weapon's `effect`
  // is parsed into a {stat:'hp', amount} entry here so the equip/unequip
  // handlers can bake it into hpMax exactly like armor HP boosts.
  statBonuses?: { stat: string; amount: number }[];
}

export type ArmorSlot = 'head' | 'chest' | 'legs' | 'feet';
export type CatalogArmorSlot = ArmorSlot | 'cloak' | 'hands';

export interface CatalogArmor {
  name: string;
  slot: CatalogArmorSlot;
  acBonus: number;
  resistances: string[];
  statBonus?: { stat: string; amount: number };
  // arb-fix — armor can carry MULTIPLE bonuses (the primary `statBonus` is the
  // first of these; secondary stats + the new `hp` max-HP boost live here).
  statBonuses?: { stat: string; amount: number }[];
  rarity: Rarity;
  baseDurability?: number;
  tags: string[];
  description: string;
  // arb-fix — worn gear reclassified from exploration tools can carry a
  // functional `effect` (e.g. the Aether masks' `gate: breathe_toxic`), read
  // via the EFFECT_RESOLVERS chain (which now includes findArmorByName).
  effect?: ItemEffect;
  // OTA-376 — passive per-action regeneration granted while this piece is
  // worn, summed across all equipped armor by aggregateEquippedRegen and
  // applied each player action (one "round"). A piece carries AT MOST ONE
  // of these (never both). Mild by design: per-piece values are small and
  // the aggregate is capped (STAMINA_REGEN_CAP / HP_REGEN_CAP) so even a
  // full regen build is noticeable, not OP. Faction pieces grant a little
  // more. Additive on top of the piece's AC / stat bonuses.
  staminaRegen?: number;
  hpRegen?: number;
}

export interface CatalogGear {
  name: string;
  kind: 'consumable' | 'relic' | 'misc';
  rarity: Rarity;
  tags: string[];
  description: string;
  effect?: ItemEffect;
}

/** OTA-120 Phase 5 — Dog armor (vest) catalog row. All entries are
 *  `kind: 'dog_armor'` so the engine routes them to the dog's vest
 *  slot rather than the player's chest. acBonus stacks onto the dog's
 *  base AC; statBonus optionally bumps one of the dog's three stats
 *  while the vest is worn; reflectsCorruption is the Aetheric Padded
 *  Vest's hook for the Phase 5 / Phase 6 corruption-reflect mechanic. */
export interface CatalogDogGear {
  name: string;
  kind: 'dog_armor';
  rarity: Rarity;
  acBonus: number;
  baseDurability?: number;
  statBonus?: { stat: 'strength' | 'dexterity' | 'intelligence'; amount: number };
  reflectsCorruption?: number;
  faction?: string;
  tags: string[];
  description: string;
}

/** Exploration items — the catalog the OTA 192 audit identified as
 *  the largest orphan source (78 of 96 had no mechanical hook).
 *  After OTA 192 every row may carry an `effect` field that drives
 *  passive stat bonuses, consumable use-actions, or scene-gate
 *  unlocks. */
export interface CatalogExploration {
  name: string;
  kind: string;
  rarity: Rarity;
  faction?: string;
  abilityReq?: string;
  tcBuy?: number;
  tags: string[];
  description: string;
  effect?: ItemEffect;
}

export interface CatalogAccessory {
  name: string;
  rarity: Rarity;
  statBonus?: { stat: string; amount: number };
  resistances: string[];
  baseDurability?: number;
  tags: string[];
  description: string;
  effect?: ItemEffect;
  // OTA-497 — faction-issue accessories (rings) stocked by the player's own
  // faction armory. Mirrors the weapon/armor faction_gear fields.
  faction?: string;
  tc?: number;
}

export interface RecipeIngredient {
  name: string;
  quantity: number;
}

export interface Recipe {
  result: string;
  ingredients: RecipeIngredient[];
  /** OTA-170 — INT requirement to craft. Runecaster recipes set this
   *  to 11 (per the Tartaria Prima spec). When set, the craft handler
   *  refuses with an Arbiter line if the player's effective INT is
   *  below the threshold. Omitted recipes have no INT gate. */
  intRequirement?: number;
  /** OTA-495 — Cores-recovered gate. The golem-armament recipes set this to 4:
   *  the Arbiter only entrusts the pre-Flood war-forging once the player has
   *  carried four Cores out of the Lost Capitals (the Core-4 forge beat). When
   *  set, the craft handler refuses with an Arbiter line until
   *  mainQuest.coresRecovered.length meets the threshold. Omitted = no gate. */
  coresRequired?: number;
}

export const MATERIALS = (materialsData as { materials: CatalogMaterial[] }).materials;
export const WEAPONS = (weaponsData as { weapons: CatalogWeapon[] }).weapons;
export const ARMOR = (armorData as { armor: CatalogArmor[] }).armor;
export const GEAR = (gearData as { gear: CatalogGear[] }).gear;
export const RECIPES = (recipesData as { recipes: Recipe[] }).recipes;
export const AMULETS = (amuletsData as { amulets: CatalogAccessory[] }).amulets;
export const RINGS = (ringsData as { rings: CatalogAccessory[] }).rings;
/** OTA-120 Phase 5 — dog vest catalog. 4 entries (Burlap / Riveted /
 *  Aetheric / Reclaimer). Read by the dog-equip flow on the Character
 *  screen Companion panel and the Inventory `[fits dog]` tag. */
export const DOG_GEAR = (dogGearData as { dogGear: CatalogDogGear[] }).dogGear;
export function findDogGearByName(name: string): CatalogDogGear | undefined {
  const lower = name.toLowerCase();
  return DOG_GEAR.find((g) => g.name.toLowerCase() === lower);
}
// Note: exploration.json is a bare top-level array, unlike the
// other catalogs which wrap in { weapons: [...] }, { armor: [...] },
// etc. Don't try to unwrap.
export const EXPLORATION = explorationData as CatalogExploration[];

const DEFAULT_DURABILITY = 25;

export function lookupCraftedItem(resultName: string): {
  kind: 'weapon' | 'armor' | 'consumable' | 'relic' | 'misc' | 'dog_armor';
  rarity: Rarity;
  tags: string[];
  baseDurability?: number;
} {
  const w = WEAPONS.find((x) => x.name === resultName);
  if (w) return { kind: 'weapon', rarity: w.rarity, tags: w.tags, baseDurability: w.baseDurability ?? DEFAULT_DURABILITY };
  const a = ARMOR.find((x) => x.name === resultName);
  if (a) return { kind: 'armor', rarity: a.rarity, tags: a.tags, baseDurability: a.baseDurability ?? DEFAULT_DURABILITY };
  const g = GEAR.find((x) => x.name === resultName);
  if (g) return { kind: g.kind, rarity: g.rarity, tags: g.tags };
  // OTA-603 — dog vests (kind 'dog_armor') were authored in dogGear.json but
  // never resolved here, so a looted/dropped vest minted as a tagless 'misc'
  // and couldn't be equipped on the dog. Resolve them to their real kind so
  // the loot paths grant a proper, wearable vest. (Crafting/fusion still
  // exclude DOG_GEAR via their own guards — this branch is construction-only.)
  const dg = DOG_GEAR.find((x) => x.name === resultName);
  if (dg) return { kind: 'dog_armor', rarity: dg.rarity, tags: dg.tags, baseDurability: dg.baseDurability ?? DEFAULT_DURABILITY };
  const am = AMULETS.find((x) => x.name === resultName);
  if (am) return { kind: 'relic', rarity: am.rarity, tags: am.tags, baseDurability: am.baseDurability ?? DEFAULT_DURABILITY };
  const r = RINGS.find((x) => x.name === resultName);
  if (r) return { kind: 'relic', rarity: r.rarity, tags: r.tags, baseDurability: r.baseDurability ?? DEFAULT_DURABILITY };
  const m = MATERIALS.find((x) => x.name === resultName);
  if (m) return { kind: 'misc', rarity: m.rarity, tags: m.tags };
  // 2026-05-25 — exploration catalog lookup. Without this branch the
  // MECHANIC-2 Pulse Scanner recipe (added 2026-05-25, OTA-006)
  // crafts as a tagless Common misc instead of the catalog's proper
  // Scanner with its effect/faction/tcBuy. Any future exploration
  // recipe (compass, lantern variants, scanner variants) would hit
  // the same fallback.
  const exp = EXPLORATION.find((x) => x.name === resultName);
  if (exp) return { kind: 'relic', rarity: exp.rarity, tags: exp.tags };
  return { kind: 'misc', rarity: 'Common', tags: [] };
}

/** Case-insensitive catalog match. Returns the canonical (title-case)
 *  name + kind + rarity + tags when the input maps to a REAL catalog
 *  item — weapon, armor, gear, amulet, ring, or material. Returns
 *  null for scene features that aren't pickupable items (pillar,
 *  arch, fountain, lever, fissure, etc.). Used by pickup-on-ambient
 *  to decide: grant a real item, or redirect to salvage. */
export function findCatalogItem(name: string): {
  name: string;
  kind: 'weapon' | 'armor' | 'consumable' | 'relic' | 'misc';
  rarity: Rarity;
  tags: string[];
  baseDurability?: number;
} | null {
  if (!name) return null;
  // Try alias resolution first — many ambient-noun variants
  // ('rope coil', 'broken compass', 'frost lantern', 'rusted
  // harpoon') map to a single canonical catalog item. Aliases
  // give the pickup path 30+ extra recognisable nouns without
  // authoring new catalog entries.
  const aliased = resolveItemAlias(name);
  const q = (aliased ?? name).trim().toLowerCase();
  if (!q) return null;
  const w = WEAPONS.find((x) => x.name.toLowerCase() === q);
  if (w) return { name: w.name, kind: 'weapon', rarity: w.rarity, tags: w.tags, baseDurability: w.baseDurability ?? DEFAULT_DURABILITY };
  const a = ARMOR.find((x) => x.name.toLowerCase() === q);
  if (a) return { name: a.name, kind: 'armor', rarity: a.rarity, tags: a.tags, baseDurability: a.baseDurability ?? DEFAULT_DURABILITY };
  const g = GEAR.find((x) => x.name.toLowerCase() === q);
  if (g) return { name: g.name, kind: g.kind, rarity: g.rarity, tags: g.tags };
  const am = AMULETS.find((x) => x.name.toLowerCase() === q);
  if (am) return { name: am.name, kind: 'relic', rarity: am.rarity, tags: am.tags, baseDurability: am.baseDurability ?? DEFAULT_DURABILITY };
  const r = RINGS.find((x) => x.name.toLowerCase() === q);
  if (r) return { name: r.name, kind: 'relic', rarity: r.rarity, tags: r.tags, baseDurability: r.baseDurability ?? DEFAULT_DURABILITY };
  const m = MATERIALS.find((x) => x.name.toLowerCase() === q);
  if (m) return { name: m.name, kind: 'misc', rarity: m.rarity, tags: m.tags };
  // 2026-05-25 — exploration catalog also reachable through
  // findCatalogItem so ambient TAKE of a scanner / compass / etc.
  // grants the real catalog entry with effect + tags instead of
  // redirecting through the "scene feature" fallback.
  const exp = EXPLORATION.find((x) => x.name.toLowerCase() === q);
  if (exp) return { name: exp.name, kind: 'relic', rarity: exp.rarity, tags: exp.tags };
  return null;
}

/** OTA-194 — true when no hand-authored catalog row exists for this
 *  name. Drives the inventory UI's heart-icon gate: only inferred
 *  items (catalog-absent, OTA-191 synthesized via inferGear / inferred
 *  weapon / armor / accessory) can be reserved for the fusion bench.
 *  Cataloged items have a fixed identity and don't fuse. Alias-aware:
 *  if the name resolves through resolveItemAlias to a catalog row,
 *  the item is NOT inferred. */
export function isInferredItem(name: string): boolean {
  if (!name) return false;
  if (findCatalogItem(name)) return false;
  const q = name.toLowerCase().trim();
  if (EXPLORATION.some((x) => x.name.toLowerCase() === q)) return false;
  if (DOG_GEAR.some((x) => x.name.toLowerCase() === q)) return false;
  return true;
}

/** OTA-224 — instance-aware version of isInferredItem that also
 *  guards against fused items (which carry `uniqueStats`) being
 *  treated as inferred. A fused item is catalog-absent by design
 *  (synthesized at the Crucible, one-of-a-kind for the save) but it
 *  isn't "inferred" in the OTA-191 sense — it shouldn't show the ◆
 *  diamond, shouldn't offer save-for-fusion, shouldn't be tagged for
 *  the OTA-193 substitute drain. Three call sites use this:
 *  InventoryScreen row + modal, inventorySnapshot actions. */
export function isInferredInventoryItem(item: { name: string; uniqueStats?: unknown }): boolean {
  if (item.uniqueStats) return false;
  return isInferredItem(item.name);
}

function totalQuantity(inventory: readonly InventoryItem[], materialName: string): number {
  const target = materialName.toLowerCase();
  let total = 0;
  for (const item of inventory) {
    if (item.name.toLowerCase() === target) total += item.quantity;
  }
  return total;
}

// OTA-193 — material-tag substitution. Lets a miscellaneous item the
// catalog DOESN'T name explicitly (a synthesized "Brass Sextant", a
// scavenged "Reclaimer's Cord", a Qwen-named "Whisper Marrow") stand in
// for one of the canonical scrap materials when the recipe calls for
// it. Without this, the static + Qwen inference path generates "useless
// pile" items the player can only sell or scrap manually — they can't
// participate directly in any recipe.
//
// Map shape: ingredient name (lowercased) → tag set that satisfies it.
// Mirrors scrapEngine.scrapOutputFor's tag rules so "if you'd get a
// Scrap Metal from scrapping it, you can spend it as a Scrap Metal."
const MATERIAL_SUBSTITUTE_TAGS: Record<string, string[]> = {
  'scrap metal': ['metal', 'plate', 'iron', 'blade'],
  'patched cloth': ['cloth', 'fiber', 'organic'],
  'stick': ['wood', 'haft'],
  'small rock': ['stone', 'mudstone', 'improvised'],
  'aetheric shard': ['aether', 'crystal'],
  'bone shard': ['organic', 'bone'],
};

/** Is this inventory item eligible to be auto-consumed as a substitute
 *  for a canonical material? Restricted to MISC kind so the player's
 *  equipped sword / armor / accessory isn't silently destroyed by a
 *  craft. Stolen items are also off-limits — the player may want to
 *  fence them, and consuming contraband for a craft would feel like a
 *  bug. OTA-194 also respects `reservedForFusion` — the player's
 *  heart-tapped items are locked out of the substitute drain so they
 *  survive for the fusion bench. */
function isSubstitutable(item: InventoryItem): boolean {
  if (item.kind !== 'misc') return false;
  if (item.stolen) return false;
  if (item.reservedForFusion) return false;
  // OTA-424 — [audit fix #6] BOUGHT weapons/armor are stored kind:'misc' (so they
  // stack), but they are NOT raw material. If the item's name resolves to a real
  // weapon/armor catalog entry — or it carries a coating (a real weapon) — never
  // auto-consume it as a craft/repair substitute. Pre-fix, an unequipped bought
  // sword silently vanished into an Acid Flask. (Looted gear is already safe — it's
  // stored with its real weapon/armor kind, which the kind!=='misc' guard catches;
  // raw materials never resolve to a weapon/armor name.)
  if (item.coating) return false;
  if (findWeaponByName(item.name) || findArmorByName(item.name)) return false;
  return true;
}

export function canCraft(recipe: Recipe, inventory: readonly InventoryItem[]): boolean {
  // OTA-613 — allocation-aware (see ingredientShortfall): a misc item with two
  // matching tags can satisfy only ONE ingredient, matching the actual drain.
  return ingredientShortfall(recipe.ingredients, inventory).length === 0;
}

/** OTA-205 — substitution-aware shortage check for a flat ingredient
 *  list (not bound to a Recipe). Used by the repair handler to drain
 *  Patched Cloth substitutes (Cloth Scrap / Spider Silk / Mud Cloth)
 *  the same way crafting does. Same canonical-first + substitute-tag
 *  pass as missingIngredients(). */
export function missingIngredientsList(
  ingredients: ReadonlyArray<{ name: string; quantity: number }>,
  inventory: readonly InventoryItem[],
): Array<{ name: string; quantity: number }> {
  // OTA-613 — allocation-aware, mirroring the drain (see ingredientShortfall),
  // so the "you still need X" line matches what the craft would actually pay.
  return ingredientShortfall(ingredients, inventory);
}

/** OTA-193 — list ingredients still short after both name + substitute
 *  drains. Returns the missing-quantity-by-name shape the craft caller
 *  needs to surface a "you still need X" arbiter line. */
export function missingIngredients(
  recipe: Recipe,
  inventory: readonly InventoryItem[],
): Array<{ name: string; quantity: number }> {
  return missingIngredientsList(recipe.ingredients, inventory);
}

/** OTA-205 — substitution preview for a flat ingredient list, used by
 *  the repair handler to narrate "Repaired with 2 Cloth Scrap for the
 *  Patched Cloth." Same drain order as previewCraftSubstitutions. */
export function previewSubstitutionsList(
  ingredients: ReadonlyArray<{ name: string; quantity: number }>,
  inventory: readonly InventoryItem[],
): Array<{ ingredient: string; substitute: string; quantity: number }> {
  const out: Array<{ ingredient: string; substitute: string; quantity: number }> = [];
  const consumed = new Map<string, number>(); // id → already-counted

  for (const ing of ingredients) {
    const namedHave = totalQuantity(inventory, ing.name);
    if (namedHave >= ing.quantity) continue;
    let stillNeed = ing.quantity - namedHave;
    const tags = MATERIAL_SUBSTITUTE_TAGS[ing.name.toLowerCase()];
    if (!tags) continue;
    const tagSet = new Set(tags);
    for (const item of inventory) {
      if (stillNeed <= 0) break;
      if (!isSubstitutable(item)) continue;
      if (!(item.tags ?? []).some((t) => tagSet.has(t.toLowerCase()))) continue;
      const alreadyTaken = consumed.get(item.id) ?? 0;
      const available = item.quantity - alreadyTaken;
      if (available <= 0) continue;
      const take = Math.min(available, stillNeed);
      out.push({ ingredient: ing.name, substitute: item.name, quantity: take });
      consumed.set(item.id, alreadyTaken + take);
      stillNeed -= take;
    }
  }
  return out;
}

/** OTA-193 — preview the substitutions a craft would perform without
 *  mutating inventory. Used by the craft caller so the arbiter can
 *  narrate what's being consumed ("You strip the Brass Sextant for the
 *  metal it needs."). Per-substitution stacks are flattened to one
 *  entry per (ingredient, substitute name) pair. */
export function previewCraftSubstitutions(
  recipe: Recipe,
  inventory: readonly InventoryItem[],
): Array<{ ingredient: string; substitute: string; quantity: number }> {
  return previewSubstitutionsList(recipe.ingredients, inventory);
}

/** OTA-205 — substitution-aware consume for a flat ingredient list.
 *  Drains exact-name first, then substitutes; preserves equipped /
 *  stolen / reserved items. Returns the new inventory. */
export function consumeIngredientsList(
  inventory: readonly InventoryItem[],
  ingredients: ReadonlyArray<{ name: string; quantity: number }>,
): InventoryItem[] {
  const next: InventoryItem[] = inventory.map((i) => ({ ...i }));
  for (const ing of ingredients) {
    let need = ing.quantity;
    const target = ing.name.toLowerCase();
    // Pass 1 — exact-name drain.
    for (const item of next) {
      if (need <= 0) break;
      if (item.name.toLowerCase() !== target) continue;
      const take = Math.min(item.quantity, need);
      item.quantity -= take;
      need -= take;
    }
    if (need <= 0) continue;
    // Pass 2 — tag substitution drain.
    const tags = MATERIAL_SUBSTITUTE_TAGS[target];
    if (!tags) continue;
    const tagSet = new Set(tags);
    for (const item of next) {
      if (need <= 0) break;
      if (item.quantity <= 0) continue;
      if (!isSubstitutable(item)) continue;
      if (!(item.tags ?? []).some((t) => tagSet.has(t.toLowerCase()))) continue;
      const take = Math.min(item.quantity, need);
      item.quantity -= take;
      need -= take;
    }
  }
  return next.filter((i) => i.quantity > 0);
}

/** OTA-613 — allocation-aware ingredient shortfall, mirroring
 *  consumeIngredientsList's exact-name-then-substitute drain on a mutable
 *  quantity copy. The availability gates below previously counted each
 *  ingredient's substitutes INDEPENDENTLY, so a single misc item carrying two
 *  matching tags (e.g. [metal, bone]) could satisfy BOTH a
 *  Scrap Metal and a Bone Shard ingredient in the check — but the real drain
 *  consumed it once, so the craft went through paying one material short. This
 *  allocates each item to the first ingredient that claims it, exactly as the
 *  drain does, so canCraft can never approve a craft the drain would underpay. */
function ingredientShortfall(
  ingredients: ReadonlyArray<{ name: string; quantity: number }>,
  inventory: readonly InventoryItem[],
): Array<{ name: string; quantity: number }> {
  const pool = inventory.map((i) => ({
    name: i.name.toLowerCase(),
    tags: (i.tags ?? []).map((t) => t.toLowerCase()),
    qty: i.quantity,
    sub: isSubstitutable(i),
  }));
  const out: Array<{ name: string; quantity: number }> = [];
  for (const ing of ingredients) {
    let need = ing.quantity;
    const target = ing.name.toLowerCase();
    // Pass 1 — exact-name drain.
    for (const p of pool) {
      if (need <= 0) break;
      if (p.qty <= 0 || p.name !== target) continue;
      const take = Math.min(p.qty, need); p.qty -= take; need -= take;
    }
    // Pass 2 — tag substitution drain (only items not already spent above).
    const tags = MATERIAL_SUBSTITUTE_TAGS[target];
    if (tags && need > 0) {
      const tagSet = new Set(tags);
      for (const p of pool) {
        if (need <= 0) break;
        if (p.qty <= 0 || !p.sub || p.name === target) continue;
        if (!p.tags.some((t) => tagSet.has(t))) continue;
        const take = Math.min(p.qty, need); p.qty -= take; need -= take;
      }
    }
    if (need > 0) out.push({ name: ing.name, quantity: need });
  }
  return out;
}

export function listCraftableRecipes(inventory: readonly InventoryItem[]): Recipe[] {
  return RECIPES.filter((r) => canCraft(r, inventory));
}

export function findRecipeByResult(target: string): Recipe | null {
  const t = target.toLowerCase().trim();
  if (!t) return null;
  // Pass 1 — substring match either direction. Cheap, covers most cases.
  for (const r of RECIPES) {
    if (r.result.toLowerCase().includes(t) || t.includes(r.result.toLowerCase())) return r;
  }
  // Pass 2 — Levenshtein fuzzy match per word, so single-letter typos
  // resolve without needing the cognitive layer. "aethetic vest" → "Aetheric Vest"
  // works because "aethetic" → "aetheric" (distance 1, length 8 allows 2).
  // We compare token-by-token against the recipe name's tokens, accepting
  // when EVERY input token has a close match in the recipe.
  const tTokens = t.split(/\s+/).filter(Boolean);
  if (tTokens.length === 0) return null;
  let best: { recipe: Recipe; totalDistance: number } | null = null;
  for (const r of RECIPES) {
    const rTokens = r.result.toLowerCase().split(/\s+/).filter(Boolean);
    let totalDistance = 0;
    let allMatched = true;
    for (const it of tTokens) {
      let bestForToken = Infinity;
      for (const rt of rTokens) {
        const maxLen = Math.max(it.length, rt.length);
        const allowed = maxLen <= 4 ? 1 : maxLen <= 7 ? 2 : 3;
        const d = levenshtein(it, rt);
        if (d <= allowed && d < bestForToken) bestForToken = d;
      }
      if (bestForToken === Infinity) { allMatched = false; break; }
      totalDistance += bestForToken;
    }
    if (allMatched && (!best || totalDistance < best.totalDistance)) {
      best = { recipe: r, totalDistance };
    }
  }
  return best?.recipe ?? null;
}

export function consumeIngredients(
  inventory: readonly InventoryItem[],
  recipe: Recipe,
): InventoryItem[] {
  return consumeIngredientsList(inventory, recipe.ingredients);
}

// Catalog lookup helpers — find an item entry by name across the four
// catalog buckets. Used by the equip flow and combat damage resolution.
//
// Unknown items fall back to itemDefaults.infer* so the engine ALWAYS
// has stats to work with: no more bare-hands damage on un-catalogued
// weapons, no more "no record" preview on inventory items. The
// inference also logs the name once-per-session via setOnInferred so
// the player can ship a backfill log to the dev and we populate the
// real catalog row later.
// Cross-bucket guard — if the name resolves in a different catalog
// bucket (MATERIALS, EXPLORATION, GEAR, ARMOR, AMULETS, RINGS), this
// is NOT the bucket the caller asked about and inference must NOT
// fire. Without this gate, items like "Aetheric Cloak" (in
// exploration.json) and "Wyrm Fang" (in materials.json) trip the
// armor/weapon keyword regex and produce false-positive
// `inferred-stats:` warnings. OTA-110 fix; the reference
// implementation is in app/components/itemPreview.ts:60-95 which
// already orders the lookups correctly. Returns true if the name
// is catalogued in a bucket OTHER than the target bucket.
function isCataloguedElsewhere(name: string, exclude: 'weapon' | 'armor' | 'amulet' | 'ring'): boolean {
  const t = name.toLowerCase().trim();
  if (!t) return false;
  if (exclude !== 'weapon' && WEAPONS.some((w) => w.name.toLowerCase() === t)) return true;
  if (exclude !== 'armor' && ARMOR.some((a) => a.name.toLowerCase() === t)) return true;
  if (exclude !== 'amulet' && AMULETS.some((a) => a.name.toLowerCase() === t)) return true;
  if (exclude !== 'ring' && RINGS.some((r) => r.name.toLowerCase() === t)) return true;
  if (MATERIALS.some((m) => m.name.toLowerCase() === t)) return true;
  if (EXPLORATION.some((x) => x.name.toLowerCase() === t)) return true;
  if (GEAR.some((g) => g.name.toLowerCase() === t)) return true;
  // OTA-133 — defensive add: DOG_GEAR is a separate catalog (4 vests
  // in OTA-122). Current vest names (Burlap / Riveted Leather /
  // Aetheric Padded / Reclaimer Pattern) don't trip the weapon/
  // armor inference regex today, but a future vest named e.g.
  // "Plated Vest" or "Bladed Harness" would slip past the guard.
  // Including DOG_GEAR closes that path before authoring opens it.
  if (DOG_GEAR.some((g) => g.name.toLowerCase() === t)) return true;
  return false;
}

export function findWeaponByName(name: string): CatalogWeapon | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  const direct = WEAPONS.find((w) => w.name.toLowerCase() === t);
  if (direct) return direct;
  if (isCataloguedElsewhere(name, 'weapon')) return null;
  // Inference fallback — only fires for names that READ as a weapon,
  // so plain materials ("Scrap Metal", "Stick") don't get false-
  // promoted into weapons.
  const looksLikeWeapon = /\b(blade|sword|axe|spear|bow|crossbow|dagger|knife|club|mace|hammer|maul|staff|wand|rod|scepter|gun|rifle|pistol|sling|javelin|lance|glaive|halberd|pike|scythe|whip|claw|fang|baton|cudgel|cleaver|saber|sabre|katana|machete|tomahawk|trowel|hatchet|warblade|thornblade|shadowblade|nightblade|deathblade|etherblade|caster|runecaster)\b/i.test(name);
  if (!looksLikeWeapon) return null;
  return inferWeapon(name);
}

// arb116 — rarity-driven RESISTANCE LADDER. Hand-authored content only put a
// resistance on ~20 of 279 pieces; the rest halved nothing, so armor "balance"
// was almost entirely the AC (miss-chance) stat. Now EVERY piece derives its
// damage-type resistances from its RARITY (how many) and its MATERIAL (which
// types), deterministically by name (so a given piece is ALWAYS the same):
//     Common    → 0 or 1   (a name-seeded coin-flip — "may or may not")
//     Uncommon  → 1
//     Rare      → 2         (guaranteed ≥1, a clear step up)
//     Legendary → 3
// Authored resistances are PRESERVED — they seed the list and the piece is only
// topped up toward its rarity count — so the 20 hand-tuned pieces keep their
// flavor. (Resistances halve matching-type damage; the same type halves only
// once no matter how many pieces resist it, so a full set caps at 50% per type,
// never immunity.)
const PHYSICAL_RESISTS = ['slashing', 'piercing', 'bludgeoning'] as const;
const ELEMENTAL_RESISTS = ['aetheric', 'burn', 'cold', 'poison'] as const;

function armorNameHash(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a, no external deps
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** The thematic primary resistance from the piece's dominant material. */
function primaryArmorResist(name: string, tags: readonly string[]): string {
  const n = name.toLowerCase();
  const t = tags.map((x) => x.toLowerCase());
  const has = (re: RegExp): boolean => re.test(n) || t.some((x) => re.test(x));
  if (has(/metal|plate|iron|steel|bronze|brass|copper|mail|gauntlet|rivet/)) return 'slashing';
  if (has(/bone|chitin|carapace|tooth|fang|tusk|spine|shell|scale/)) return 'piercing';
  if (has(/aether|aetheric|crystal|resonant|ether|lumen/)) return 'aetheric';
  if (has(/leather|hide|pelt|fur|gut|sinew/)) return 'bludgeoning';
  if (has(/cloth|linen|silk|wool|padded|wrap|veil|robe|cloak|coat|fiber|gauze/)) return 'cold';
  if (has(/stone|mudstone|obsidian|granite|slate|cairn/)) return 'bludgeoning';
  if (has(/mud|silt|sludge|bog|swamp/)) return 'poison';
  return 'slashing';
}

function resistCountForRarity(rarity: Rarity, hash: number): number {
  switch (rarity) {
    case 'Legendary': return 3;
    case 'Rare': return 2;
    case 'Uncommon': return 1;
    case 'Common': return (hash & 1) ? 1 : 0; // ~half of commons carry one
    default: return 0;
  }
}

/** Core ladder: seed list + rarity/material-derived top-up, deterministic by
 *  name. Shared by catalog armor AND fused unique armor. */
function ladderResistances(name: string, rarity: Rarity, seed: readonly string[], tags: readonly string[] = []): string[] {
  const hash = armorNameHash(name);
  const count = resistCountForRarity(rarity, hash);
  const out: string[] = [...seed];
  if (count <= out.length) return out; // already meets/exceeds the floor (or count 0)
  const add = (r: string): void => { if (!out.includes(r)) out.push(r); };
  add(primaryArmorResist(name, tags));
  const pool = [...PHYSICAL_RESISTS, ...ELEMENTAL_RESISTS];
  let h = hash;
  let guard = 0;
  while (out.length < count && guard++ < 32) {
    add(pool[h % pool.length]!);
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
  }
  return out;
}

/** The EFFECTIVE resistance list for a CATALOG armor piece (authored seeds +
 *  rarity/material top-up). Used by combat (aggregateArmor) AND the item preview
 *  so what the player SEES is what actually mitigates. Deterministic. */
export function armorResistances(piece: CatalogArmor): string[] {
  return ladderResistances(piece.name, piece.rarity, piece.resistances ?? [], piece.tags ?? []);
}

/** Same ladder for a FUSED unique armor piece — the synth gives it one resistance
 *  (the seed); this tops it up to its rarity (Rare 2 / Legendary 3). The fused
 *  NAME carries the material theme (e.g. "Resonant Mantle" → aether primary). */
export function fusedArmorResistances(name: string, rarity: Rarity, resistance?: string | null): string[] {
  return ladderResistances(name, rarity, resistance ? [resistance] : []);
}

export function findArmorByName(name: string): CatalogArmor | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  const direct = ARMOR.find((a) => a.name.toLowerCase() === t);
  if (direct) return direct;
  if (isCataloguedElsewhere(name, 'armor')) return null;
  return inferArmor(name);
}

export function findAmuletByName(name: string): CatalogAccessory | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  const direct = AMULETS.find((a) => a.name.toLowerCase() === t);
  if (direct) return direct;
  if (isCataloguedElsewhere(name, 'amulet')) return null;
  if (/\b(amulet|locket|necklace|pendant|medallion|charm|talisman|brooch)\b/i.test(name)) {
    return inferAccessory(name);
  }
  return null;
}

export function findRingByName(name: string): CatalogAccessory | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  const direct = RINGS.find((r) => r.name.toLowerCase() === t);
  if (direct) return direct;
  if (isCataloguedElsewhere(name, 'ring')) return null;
  if (/\b(ring|band|signet)\b/i.test(name)) {
    return inferAccessory(name);
  }
  return null;
}

/** OTA 192 — name → exploration catalog row. Used by the new
 *  effect resolver (itemEffect.ts) so any inventory item that
 *  carries an `effect` field can be looked up and applied
 *  (passive stat bonus, consumable use, gate unlock). Returns
 *  null when not found — no inference fallback, since the
 *  exploration catalog is a closed list. */
export function findExplorationItemByName(name: string): CatalogExploration | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  return EXPLORATION.find((e) => e.name.toLowerCase() === t) ?? null;
}

/** Same for materials. The 13 orphan materials from the OTA 192
 *  audit now carry recipe-consumer relationships, but other code
 *  paths (salvage, lore lookup) want catalog access too. */
export function findMaterialByName(name: string): CatalogMaterial | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  return MATERIALS.find((m) => m.name.toLowerCase() === t) ?? null;
}

/** Same for gear — small catalog (6 items as of OTA 192) but the
 *  effect resolver needs a uniform lookup interface. */
export function findGearByName(name: string): CatalogGear | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  return GEAR.find((g) => g.name.toLowerCase() === t) ?? null;
}

export function fuzzyFindWeapon(text: string): CatalogWeapon | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const exact = WEAPONS.find((w) => w.name.toLowerCase() === t);
  if (exact) return exact;
  return WEAPONS.find((w) => w.name.toLowerCase().includes(t) || t.includes(w.name.toLowerCase())) ?? null;
}

export function fuzzyFindArmor(text: string): CatalogArmor | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const exact = ARMOR.find((a) => a.name.toLowerCase() === t);
  if (exact) return exact;
  return ARMOR.find((a) => a.name.toLowerCase().includes(t) || t.includes(a.name.toLowerCase())) ?? null;
}

const TYPE_RESISTANCE_MAP: Record<string, { resist: string[]; weak: string[] }> = {
  Animal: { resist: [], weak: ['piercing'] },
  'Mud Creature': { resist: ['slashing', 'piercing'], weak: ['burn', 'radiation'] },
  'Aetheric Mutation': { resist: ['aetheric', 'radiation'], weak: ['bludgeoning'] },
  'Aetheric Creature': { resist: ['aetheric', 'electrical'], weak: ['bludgeoning'] },
  Automation: { resist: ['poison', 'aetheric'], weak: ['electrical', 'bludgeoning'] },
  Construct: { resist: ['slashing', 'piercing'], weak: ['bludgeoning', 'electrical'] },
};

export type DamageMatch = 'normal' | 'weak' | 'resist';

/** Macro type-resistance for an enemy type (the `TYPE_RESISTANCE_MAP` row).
 *  Returns the resisted + weak-to damage-type lists, or empty arrays when the
 *  type has no entry. Used by the EnemyPanel to surface defenses to the player. */
export function enemyTypeDefenses(
  enemyType: string | null | undefined,
): { resist: string[]; weak: string[] } {
  const map = enemyType ? TYPE_RESISTANCE_MAP[enemyType] : undefined;
  return { resist: map?.resist ?? [], weak: map?.weak ?? [] };
}


export function applyDamageTypeModifier(
  rawDamage: number,
  weaponDamageType: string | null | undefined,
  enemyType: string | null | undefined,
): { damage: number; match: DamageMatch } {
  if (!weaponDamageType || !enemyType) return { damage: rawDamage, match: 'normal' };
  const map = TYPE_RESISTANCE_MAP[enemyType];
  if (!map) return { damage: rawDamage, match: 'normal' };
  const wt = weaponDamageType.toLowerCase();
  if (map.weak.includes(wt)) return { damage: Math.ceil(rawDamage * 1.5), match: 'weak' };
  if (map.resist.includes(wt)) return { damage: Math.max(1, Math.floor(rawDamage / 2)), match: 'resist' };
  return { damage: rawDamage, match: 'normal' };
}

// ─── arb119 — slot-weighted diminishing armor resistance ──────────────────
// Replaces the old flat "any matching piece halves the hit, once" model. Each
// armor slot resists at a base fraction set by how much of the body it covers:
// the CHEST plate is the core and counts most; the CLOAK is a thin outer layer
// and counts least (chest-first → cloak-last). Multiple pieces resisting the
// SAME damage type STACK with diminishing returns — each piece chips the
// *remaining* damage — so:
//   • a FOCUSED build (several pieces all resisting one type) earns strong
//     resistance to that type, well past the old 50%;
//   • a RAINBOW build (one piece per type) gets only a single slot's worth
//     against any given type, so spreading thin is strictly weaker;
//   • the multiplicative stack asymptotes below 100% and is hard-capped, so
//     armor ALONE never grants immunity.
export const ARMOR_SLOT_RESIST_WEIGHT: Readonly<Record<string, number>> = {
  chest: 0.35,
  legs: 0.25,
  head: 0.18,
  hands: 0.12,
  feet: 0.12,
  cloak: 0.1,
};
/** Hard ceiling on armor-only resistance — never immunity, even fully focused. */
export const MAX_ARMOR_RESIST = 0.8;

export interface ArmorSlotResist {
  /** Lower-cased damage type this slot resists. */
  type: string;
  /** Equip slot the resisting piece sits in (drives its weight). */
  slot: string;
}

/** Combined resistance fraction (0..MAX_ARMOR_RESIST) against `damageType`:
 *  stacks every equipped piece that resists it, weighted by slot, with
 *  diminishing (multiplicative) returns. A given slot counts at most once per
 *  type even if its piece lists the type twice. */
export function armorResistanceFraction(
  damageType: string | null | undefined,
  slotResists: ReadonlyArray<ArmorSlotResist> | null | undefined,
): number {
  if (!damageType || !slotResists || slotResists.length === 0) return 0;
  const dt = damageType.toLowerCase();
  let remaining = 1;
  const countedSlots = new Set<string>();
  for (const { type, slot } of slotResists) {
    if (type.toLowerCase() !== dt || countedSlots.has(slot)) continue;
    countedSlots.add(slot);
    remaining *= 1 - (ARMOR_SLOT_RESIST_WEIGHT[slot] ?? 0.1);
  }
  return Math.min(MAX_ARMOR_RESIST, 1 - remaining);
}

export function applyArmorResistance(
  incomingDamage: number,
  damageType: string | null | undefined,
  slotResists: ReadonlyArray<ArmorSlotResist> | null | undefined,
): { damage: number; blocked: boolean; fraction: number } {
  const fraction = armorResistanceFraction(damageType, slotResists);
  if (fraction <= 0) return { damage: incomingDamage, blocked: false, fraction: 0 };
  const reduced = Math.max(1, Math.round(incomingDamage * (1 - fraction)));
  return { damage: reduced, blocked: reduced < incomingDamage, fraction };
}
