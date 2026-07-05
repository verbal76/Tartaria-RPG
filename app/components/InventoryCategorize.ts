import type { InventoryItem } from '../engine/types';
import { WEAPONS, ARMOR, MATERIALS, GEAR, AMULETS, RINGS, DOG_GEAR, findWeaponByName } from '../engine/crafting';
import { inferGearTagPack } from '../engine/itemDefaults';
import { itemIsTool } from '../engine/pouchEligibility';
import { isQuestLockedItem } from '../engine/questItems';

export type InventoryCategory =
  | 'weapon'
  | 'armor'
  // Dog companion vests (kind 'dog_armor'). Their own section so a stray vest
  // never hides among the player's own Armor or scatters into Loot/Materials.
  | 'dog_armor'
  | 'accessory'
  | 'consumable'
  // engine_Dev — weapon coatings (damage-type reagents) get their own section so
  // combat-prep doesn't hide among food in Consumables.
  | 'coating'
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
  dog_armor: '#b5764a', // leather brown — dog companion vests
  accessory: '#d4a55a',
  consumable: '#9ec96a',
  coating: '#c75b9c', // venom magenta — weapon/armor damage-type reagents
  tool: '#7fb0a8', // teal — utility implements (pry bar, lockpick, scanner…)
  relic: '#b88ce0',
  material: '#6ab0c9',
  loot: '#8fa6ac',
  quest: '#d9c34a', // gold — reserved objective items (locked)
};

export const CATEGORY_LABEL: Record<InventoryCategory, string> = {
  weapon: 'Weapons',
  armor: 'Armor',
  dog_armor: 'Dog Armor',
  accessory: 'Amulets & Rings',
  consumable: 'Consumables',
  coating: 'Coatings',
  tool: 'Tools',
  relic: 'Relics',
  material: 'Materials',
  loot: 'Loot',
  quest: 'Quest Items',
};

/** engine_Dev — the display label for a category, honoring an author rename from the
 *  inventory override (e.g. "Weapons" -> "Arsenal"). Read this, not CATEGORY_LABEL,
 *  at render sites. */
export function getCategoryLabel(cat: InventoryCategory): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('../engine/contentPack') as typeof import('../engine/contentPack')).getInventoryLabel(cat, CATEGORY_LABEL[cat]);
}

// Order the categories appear in. Weapons first (most actionable),
// then armor, then accessories, then consumables, then relics, then
// crafting stock, then generic loot.
export const CATEGORY_ORDER: InventoryCategory[] = [
  'weapon',
  'armor',
  'dog_armor', // right after the player's own armor
  'accessory',
  'consumable',
  'coating', // engine_Dev — combat-prep reagents, right after the things you eat
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
  // engine_Dev — weapon coatings (Poison Vial / Acid Flask / Corruption Tonic +
  // any author-defined coating) carry the `weapon_coating` tag. Pull them into their
  // own Coatings section ahead of the catalog/kind heuristics, which would otherwise
  // file these (kind 'consumable') under Consumables among food and potions.
  if (item.tags.some((t) => /^weapon_coating$/i.test(t))) return 'coating';
  // OTA-688 — a Crucible-fused item's KIND is authoritative (uniqueStats/'fused'
  // stamped at the forge). Trust it BEFORE the name-based heuristics, which can
  // misread a fused ARMOR's synthesized name as a weapon and mis-file it (that
  // mismatch also broke the "View in inventory" highlight).
  if (item.uniqueStats || item.tags.some((t) => t.toLowerCase() === 'fused')) {
    if (item.kind === 'weapon') return 'weapon';
    if (item.kind === 'armor') return 'armor';
    if (item.kind === 'dog_armor') return 'dog_armor';
  }
  // Dog companion vests get their own section. Match by kind ('dog_armor'), the
  // canonical 'dog_armor' tag, or the DOG_GEAR catalog name (so crafted/looted
  // copies land here too) — BEFORE the material/loot heuristics below, which would
  // otherwise file an Aetheric Padded Vest (carries the 'aether' tag) under Materials
  // and the plainer vests under Loot.
  if (
    item.kind === 'dog_armor' ||
    item.tags.some((t) => t.toLowerCase() === 'dog_armor') ||
    DOG_GEAR.some((g) => g.name.toLowerCase() === nameLower)
  ) {
    return 'dog_armor';
  }
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
  // arb113 — MATERIAL stock BEFORE the consumable/loot fallbacks. Catches creature-
  // part reagents whose kind got mis-stamped consumable (Aetheric Moss — "moss"
  // tripped the fungus heuristic) or whose persisted tags are too sparse to read
  // (Leech Mucus → was Loot). Re-derives `organic` from the NAME (blood/mucus/
  // feather/moss → organic) so items already in old saves file correctly with no
  // migration. Gated to exclude genuine food/drink/potions so foraged edibles
  // (Bioluminescent Fungus, etc.) stay consumable.
  {
    const isEdible = item.tags.some((t) => /food|drink|healing|potion|weapon_coating|edible|ration|alcohol|treat|forag/i.test(t));
    const hasMaterial = item.tags.some((t) => /aether|crystal|mud|metal|cloth|fiber|construct|organic|bone|stone|wood|vermin/i.test(t))
      || inferGearTagPack(item.name).includes('organic');
    if (!isEdible && hasMaterial) return 'material';
  }
  if (item.kind === 'consumable' || item.tags.some((t) => /food|healing/i.test(t))) return 'consumable';
  if (item.kind === 'relic' || item.tags.some((t) => /relic|detection|light/i.test(t))) return 'relic';
  if (item.tags.some((t) => /aether|crystal|mud|metal|cloth|fiber|construct/i.test(t))) return 'material';
  return 'loot';
}

// arb109 — every category an item should be LISTED under. Usually one. But a
// crafting MATERIAL that is also a deliberate thrown WEAPON (the `throwable` tag —
// exactly what validSlotsForItem routes to a hand, e.g. Disease Sample / Sentinel
// Core Plate) is listed under BOTH Weapons AND Materials. It's the SAME underlying
// stack shown twice (shared quantity, same item id), so consuming it for EITHER
// purpose — throw it OR craft with it — decrements the one stack and BOTH listings
// drop together: 4 samples read "×4" in both sections, not 8, and crafting 3 +
// throwing 1 empties it everywhere. Improvised `thrown` junk (rocks) is not a real
// weapon (validSlotsForItem ignores `thrown`), so it stays Materials-only.
export function categoriesForItem(item: InventoryItem): InventoryCategory[] {
  const primary = categorizeItem(item);
  if (primary === 'material' && (item.tags ?? []).some((t) => /^throwable$/i.test(t))) {
    return ['weapon', 'material'];
  }
  return [primary];
}

export function groupInventoryByCategory(
  inventory: InventoryItem[],
): Record<InventoryCategory, InventoryItem[]> {
  const groups: Record<InventoryCategory, InventoryItem[]> = {
    weapon: [],
    armor: [],
    dog_armor: [],
    accessory: [],
    consumable: [],
    coating: [],
    tool: [],
    relic: [],
    material: [],
    loot: [],
    quest: [],
  };
  for (const item of inventory) {
    for (const cat of categoriesForItem(item)) groups[cat].push(item);
  }
  return groups;
}
