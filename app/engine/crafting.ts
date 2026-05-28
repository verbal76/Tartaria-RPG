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
}

export type ArmorSlot = 'head' | 'chest' | 'legs' | 'feet';
export type CatalogArmorSlot = ArmorSlot | 'cloak' | 'hands';

export interface CatalogArmor {
  name: string;
  slot: CatalogArmorSlot;
  acBonus: number;
  resistances: string[];
  statBonus?: { stat: string; amount: number };
  rarity: Rarity;
  baseDurability?: number;
  tags: string[];
  description: string;
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
}

export interface RecipeIngredient {
  name: string;
  quantity: number;
}

export interface Recipe {
  result: string;
  ingredients: RecipeIngredient[];
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
  kind: 'weapon' | 'armor' | 'consumable' | 'relic' | 'misc';
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

function totalQuantity(inventory: readonly InventoryItem[], materialName: string): number {
  const target = materialName.toLowerCase();
  let total = 0;
  for (const item of inventory) {
    if (item.name.toLowerCase() === target) total += item.quantity;
  }
  return total;
}

export function canCraft(recipe: Recipe, inventory: readonly InventoryItem[]): boolean {
  return recipe.ingredients.every((ing) => totalQuantity(inventory, ing.name) >= ing.quantity);
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
  const next: InventoryItem[] = inventory.map((i) => ({ ...i }));
  for (const ing of recipe.ingredients) {
    let need = ing.quantity;
    const target = ing.name.toLowerCase();
    for (const item of next) {
      if (need <= 0) break;
      if (item.name.toLowerCase() !== target) continue;
      const take = Math.min(item.quantity, need);
      item.quantity -= take;
      need -= take;
    }
  }
  return next.filter((i) => i.quantity > 0);
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

export function applyArmorResistance(
  incomingDamage: number,
  damageType: string | null | undefined,
  resistances: readonly string[] | null | undefined,
): { damage: number; blocked: boolean } {
  if (!resistances || resistances.length === 0 || !damageType) return { damage: incomingDamage, blocked: false };
  const dt = damageType.toLowerCase();
  if (resistances.some((r) => r.toLowerCase() === dt)) {
    return { damage: Math.max(1, Math.floor(incomingDamage / 2)), blocked: true };
  }
  return { damage: incomingDamage, blocked: false };
}
