import type { InventoryItem } from '../engine/types';
import { WEAPONS, ARMOR, MATERIALS, GEAR, AMULETS, RINGS, findWeaponByName } from '../engine/crafting';
import { itemIsTool } from '../engine/pouchEligibility';
import { isQuestLockedItem } from '../engine/questItems';

export type InventoryCategory =
  | 'weapon'
  | 'armor'
  | 'accessory'
  | 'consumable'
  | 'tool'
  | 'relic'
  | 'material'
  | 'loot'
  // OTA-493 — locked objective items (quest / contract / whisper). Always LAST.
  | 'quest';

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
  quest: '#d9c34a', // gold — reserved objective items (locked)
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
  quest: 'Quest Items',
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
  'quest', // OTA-493 — reserved objective items pinned to the END of the list
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
  // OTA-493 — locked objective items (quest / contract / whisper) ALWAYS go to the
  // Quest Items section, ahead of every other bucket, regardless of their other
  // tags/kind (a Core is kind 'misc'; a whisper token also carries 'aether').
  if (isQuestLockedItem(item)) return 'quest';
  // Catalog name matches take precedence over kind/tag heuristics — if a
  // crafted Aetheric Torch shows up with kind='relic', it should still
  // resolve to 'relic' via the GEAR catalog.
  // arb107 — use findWeaponByName (not the direct catalog) so an INFERRED weapon —
  // a catalog-absent drop whose name reads as a weapon, e.g. "Shrike Claw" (claw),
  // which combat + validSlotsForItem already wield as a melee weapon — lands in the
  // Weapons category instead of falling through to Loot. findWeaponByName's own
  // isCataloguedElsewhere guard keeps armor/material/amulet drops out of here.
  if (findWeaponByName(item.name)) return 'weapon';
  if (ARMOR.some((a) => a.name.toLowerCase() === nameLower)) return 'armor';
  if (AMULETS.some((a) => a.name.toLowerCase() === nameLower)) return 'accessory';
  if (RINGS.some((r) => r.name.toLowerCase() === nameLower)) return 'accessory';
  // arb104 — a catalog MATERIAL wins before the thrown-weapon heuristic below.
  // Big Rock / Small Rock are crafting stock in materials.json that also carry a
  // `thrown` tag (they double as improvised throws), so the `/(throwable|thrown)/`
  // rule was filing them under Weapons. They're materials — bucket them as such.
  if (MATERIALS.some((m) => m.name.toLowerCase() === nameLower)) return 'material';
  // OTA-491 — a thrown one-shot weapon (e.g. the Shaped Aetheric Shard, a GEAR-
  // catalog item with kind 'misc' + 'throwable', not in the WEAPONS catalog) is a
  // WEAPON. Bucket it by the weapon tag BEFORE the tool check — otherwise its
  // name-synthesized 'aetheric' tag made isToolItem file it under Tools.
  if (item.tags.some((t) => /^(throwable|thrown)$/i.test(t))) return 'weapon';
  // arb90 — tools before the generic gear/material buckets so utility
  // implements get their own section (and the pry bar lands there).
  if (isToolItem(item)) return 'tool';
  // arb-fix — `wardrobe`-tagged worn apparel (the Hardened Climbing Strap)
  // equips in the cloak slot, so it belongs under ARMOR, not the generic Loot
  // bucket. It lives in exploration.json (kind:exploration) for its climb_steep
  // gate, so it isn't in the ARMOR catalog above and was falling through to
  // 'loot'. `wardrobe` is the canonical worn-not-tool tag (see pouchEligibility
  // NON_TOOL_TAGS); the strap is currently its only holder.
  if (item.tags.some((t) => t.toLowerCase() === 'wardrobe')) return 'armor';
  if (GEAR.some((g) => g.name.toLowerCase() === nameLower)) {
    const gearKind = GEAR.find((g) => g.name.toLowerCase() === nameLower)?.kind;
    if (gearKind === 'consumable') return 'consumable';
    if (gearKind === 'relic') return 'relic';
    return 'loot';
  }

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
    quest: [],
  };
  for (const item of inventory) {
    groups[categorizeItem(item)].push(item);
  }
  return groups;
}
