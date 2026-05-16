import type { InventoryItem, Rarity } from './types';
import materialsData from '../data/items/materials.json';
import weaponsData from '../data/items/weapons.json';
import armorData from '../data/items/armor.json';
import gearData from '../data/items/gear.json';
import recipesData from '../data/items/recipes.json';

export interface CatalogMaterial {
  name: string;
  rarity: Rarity;
  tags: string[];
  description: string;
}

export interface CatalogWeapon {
  name: string;
  weaponKind: 'melee' | 'ranged' | 'runecaster';
  damageType: string;
  damageDice: string;
  stat: 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma';
  rarity: Rarity;
  tags: string[];
  description: string;
}

export interface CatalogArmor {
  name: string;
  acBonus: number;
  resistances: string[];
  statBonus?: { stat: string; amount: number };
  rarity: Rarity;
  tags: string[];
  description: string;
}

export interface CatalogGear {
  name: string;
  kind: 'consumable' | 'relic' | 'misc';
  rarity: Rarity;
  tags: string[];
  description: string;
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

// Resolve a recipe's result name to a full catalog entry so we know what
// kind of item to write into the player's inventory (weapon vs armor vs
// gear). Falls back to a generic misc item if not found.
export function lookupCraftedItem(resultName: string): {
  kind: 'weapon' | 'armor' | 'consumable' | 'relic' | 'misc';
  rarity: Rarity;
  tags: string[];
} {
  const w = WEAPONS.find((x) => x.name === resultName);
  if (w) return { kind: 'weapon', rarity: w.rarity, tags: w.tags };
  const a = ARMOR.find((x) => x.name === resultName);
  if (a) return { kind: 'armor', rarity: a.rarity, tags: a.tags };
  const g = GEAR.find((x) => x.name === resultName);
  if (g) return { kind: g.kind, rarity: g.rarity, tags: g.tags };
  return { kind: 'misc', rarity: 'Common', tags: [] };
}

// Sum total quantity available across all matching inventory rows. We match
// case-insensitively so loot drops always line up with material names from
// the catalog regardless of casing drift.
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

// Find a recipe whose result name matches a target string (the player's
// "craft X" text). Substring + case-insensitive so "craft a torch" and
// "craft aetheric torch" both resolve to "Aetheric Torch".
export function findRecipeByResult(target: string): Recipe | null {
  const t = target.toLowerCase().trim();
  if (!t) return null;
  for (const r of RECIPES) {
    if (r.result.toLowerCase().includes(t) || t.includes(r.result.toLowerCase())) return r;
  }
  return null;
}

// Catalog lookup helpers — find an item entry by name across the four
// catalog buckets. Used by the equip flow and combat damage resolution.
export function findWeaponByName(name: string): CatalogWeapon | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  return WEAPONS.find((w) => w.name.toLowerCase() === t) ?? null;
}

export function findArmorByName(name: string): CatalogArmor | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  return ARMOR.find((a) => a.name.toLowerCase() === t) ?? null;
}

// Looser match — used when the player types "equip the crystal blade"
// and we want to resolve to "Aetheric Crystal Blade".
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

// Damage-type modifier matrix keyed by enemy `type` (the field already on
// every Enemy row, e.g. "Mud Creature", "Aetheric Mutation"). Resistances
// halve incoming damage; weaknesses multiply by 1.5. Centralized here so
// both combat resolution and Arbiter narration can read the same data.
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

// Player armor resistance — halves incoming damage when the armor lists
// the damage type. Returns a 1-tuple of the new amount; armor resistances
// don't scale beyond 50% in this pass.
export function applyArmorResistance(
  incomingDamage: number,
  damageType: string | null | undefined,
  armor: CatalogArmor | null | undefined,
): { damage: number; blocked: boolean } {
  if (!armor || !damageType) return { damage: incomingDamage, blocked: false };
  const dt = damageType.toLowerCase();
  if (armor.resistances?.some((r) => r.toLowerCase() === dt)) {
    return { damage: Math.max(1, Math.floor(incomingDamage / 2)), blocked: true };
  }
  return { damage: incomingDamage, blocked: false };
}

// Subtract ingredients from inventory, return the new inventory. Mutates
// quantities in-place on cloned rows; removes rows that hit 0.
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
