import type { InventoryItem, Rarity, DamageType } from './types';
import { levenshtein } from './editDistance';
import materialsData from '../data/items/materials.json';
import weaponsData from '../data/items/weapons.json';
import armorData from '../data/items/armor.json';
import gearData from '../data/items/gear.json';
import recipesData from '../data/items/recipes.json';
import amuletsData from '../data/items/amulets.json';
import ringsData from '../data/items/rings.json';

export interface CatalogMaterial {
  name: string;
  rarity: Rarity;
  tags: string[];
  description: string;
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
}

export interface CatalogAccessory {
  name: string;
  rarity: Rarity;
  statBonus?: { stat: string; amount: number };
  resistances: string[];
  baseDurability?: number;
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
export const AMULETS = (amuletsData as { amulets: CatalogAccessory[] }).amulets;
export const RINGS = (ringsData as { rings: CatalogAccessory[] }).rings;

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
  return { kind: 'misc', rarity: 'Common', tags: [] };
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

export function findAmuletByName(name: string): CatalogAccessory | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  return AMULETS.find((a) => a.name.toLowerCase() === t) ?? null;
}

export function findRingByName(name: string): CatalogAccessory | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  return RINGS.find((r) => r.name.toLowerCase() === t) ?? null;
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
