import type { InventoryItem } from '../engine/types';
import { WEAPONS, ARMOR, MATERIALS, GEAR, AMULETS, RINGS } from '../engine/crafting';
import { itemIsTool } from '../engine/pouchEligibility';

export type InventoryCategory =
  | 'weapon'
  | 'armor'
  | 'accessory'
  | 'consumable'
  | 'tool'
  | 'relic'
  | 'material'
  | 'loot';

// Color coding used by both the inventory screen rows and the legend
// strip at the bottom. Tuned to fit the existing dark/amber palette.
export const CATEGORY_COLORS: Record<InventoryCategory, string> = {
  weapon: '#e07a5f',
  armor: '#6a9bbf',
  accessory: '#d4a55a',
  consumable: '#9ec96a',
  tool: '#7fb0a8', // teal — utility implements (pry bar, lockpick, scanner…)
  relic: '#b88ce0',
  material: '#c9a86a',
  loot: '#a89a7a',
};

export const CATEGORY_LABEL: Record<InventoryCategory, string> = {
  weapon: 'Weapons',
  armor: 'Armor',
  accessory: 'Amulets & Rings',
  consumable: 'Consumables',
  tool: 'Tools',
  relic: 'Relics',
  material: 'Materials',
  loot: 'Loot',
};

// Order the categories appear in. Weapons first (most actionable),
// then armor, then accessories, then consumables, then relics, then
// crafting stock, then generic loot.
export const CATEGORY_ORDER: InventoryCategory[] = [
  'weapon',
  'armor',
  'accessory',
  'consumable',
  'tool',
  'relic',
  'material',
  'loot',
];

// arb101 — the inventory TOOLS category now uses the SAME tool definition as
// the tool pouch (engine/pouchEligibility.itemIsTool), so what shows as a
// "Tool" is exactly what can be stowed in a tool slot — scanners, lenses,
// torches, pry bar, kits, ropes, grapples, etc. — and a `wardrobe`-tagged
// piece (the Hardened Climbing Strap) is correctly NOT a tool. (Was a
// separate name-regex that disagreed with the pouch: it missed torches/lenses
// and wrongly caught the climbing strap.)
export const isToolItem = itemIsTool;

export function categorizeItem(item: InventoryItem): InventoryCategory {
  const nameLower = item.name.toLowerCase();
  // Catalog name matches take precedence over kind/tag heuristics — if a
  // crafted Aetheric Torch shows up with kind='relic', it should still
  // resolve to 'relic' via the GEAR catalog.
  if (WEAPONS.some((w) => w.name.toLowerCase() === nameLower)) return 'weapon';
  if (ARMOR.some((a) => a.name.toLowerCase() === nameLower)) return 'armor';
  if (AMULETS.some((a) => a.name.toLowerCase() === nameLower)) return 'accessory';
  if (RINGS.some((r) => r.name.toLowerCase() === nameLower)) return 'accessory';
  // arb90 — tools before the generic gear/material buckets so utility
  // implements get their own section (and the pry bar lands there).
  if (isToolItem(item)) return 'tool';
  if (GEAR.some((g) => g.name.toLowerCase() === nameLower)) {
    const gearKind = GEAR.find((g) => g.name.toLowerCase() === nameLower)?.kind;
    if (gearKind === 'consumable') return 'consumable';
    if (gearKind === 'relic') return 'relic';
    return 'loot';
  }
  if (MATERIALS.some((m) => m.name.toLowerCase() === nameLower)) return 'material';

  // Fallback by kind/tags.
  if (item.kind === 'weapon') return 'weapon';
  if (item.kind === 'armor') return 'armor';
  if (item.tags.some((t) => /^(amulet|ring|locket|necklace|band|seal|diadem|charm)$/i.test(t))) return 'accessory';
  if (item.kind === 'consumable' || item.tags.some((t) => /food|healing/i.test(t))) return 'consumable';
  if (item.kind === 'relic' || item.tags.some((t) => /relic|detection|light/i.test(t))) return 'relic';
  if (item.tags.some((t) => /aether|crystal|mud|metal|cloth|fiber|construct/i.test(t))) return 'material';
  return 'loot';
}

export function groupInventoryByCategory(
  inventory: InventoryItem[],
): Record<InventoryCategory, InventoryItem[]> {
  const groups: Record<InventoryCategory, InventoryItem[]> = {
    weapon: [],
    armor: [],
    accessory: [],
    consumable: [],
    tool: [],
    relic: [],
    material: [],
    loot: [],
  };
  for (const item of inventory) {
    groups[categorizeItem(item)].push(item);
  }
  return groups;
}
