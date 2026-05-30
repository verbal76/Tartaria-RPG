// itemResolution — single source of truth for "give me this item's
// catalog-shaped stats." Wraps findWeaponByName / findArmorByName
// with a uniqueStats-first branch so fused items (OTA-191 / OTA-195)
// resolve through the SAME API as hand-authored catalog items.
//
// Why this exists (OTA-227): the bug class behind OTA-224 + OTA-226
// is "any UI / engine site that does findWeaponByName(item.name) or
// findArmorByName(name) misses fused items, which are catalog-absent
// by design." Each missed site causes a silent display gap (green
// damage line missing, displayed AC wrong, range/inRange wrong).
// The fix isn't to patch each site individually — it's to remove the
// catalog-only lookup from UI code entirely. New display sites that
// import these helpers physically can't forget fused items.
//
// Combat-side resolution (combatRules.ts:resolveActiveWeapon,
// aggregateArmor) already handles uniqueStats inline because it ran
// before this helper existed — kept as-is to avoid a no-op refactor.
// Future combat additions should call the helpers below.

import type { UniqueItemStats } from './types';
import type { CatalogWeapon, CatalogArmor } from './crafting';
import { findWeaponByName, findArmorByName } from './crafting';

type ItemRef = { name: string; uniqueStats?: UniqueItemStats };
type InventoryLike = ReadonlyArray<ItemRef>;

// Returns a CatalogWeapon-shaped row for any item with weapon stats,
// whether hand-authored (catalog hit) or fused (uniqueStats present).
// null when the item has neither.
export function resolveDisplayWeapon(item: ItemRef): CatalogWeapon | null {
  const u = item.uniqueStats;
  if (u && u.kind === 'weapon' && u.damageDice) {
    const damageType = (u.damageType ?? 'slashing') as CatalogWeapon['damageType'];
    return {
      name: item.name,
      weaponKind: damageType === 'aetheric' ? 'runecaster' : 'melee',
      damageType,
      damageDice: u.damageDice,
      stat: u.scalesWith ?? 'strength',
      rarity: u.rarity,
      baseDurability: u.durability.max,
      tags: [],
      description: u.special ?? 'A fused unique weapon.',
    };
  }
  return findWeaponByName(item.name);
}

export function resolveDisplayArmor(item: ItemRef): CatalogArmor | null {
  const u = item.uniqueStats;
  if (u && u.kind === 'armor' && u.armorSlot) {
    return {
      name: item.name,
      slot: u.armorSlot,
      acBonus: u.acBonus ?? 0,
      resistances: u.resistance ? [u.resistance] : [],
      rarity: u.rarity,
      baseDurability: u.durability.max,
      tags: [],
      description: u.special ?? 'A fused unique armor piece.',
    };
  }
  return findArmorByName(item.name);
}

// Name-only convenience for callers that hold an equipped-slot name
// (StatsPanel summing equipped armor AC, ExplorationScreen reading
// the main-hand weapon name). Falls back to inventory scan to find
// the uniqueStats-bearing instance.
export function resolveDisplayWeaponByName(
  name: string,
  inventory: InventoryLike,
): CatalogWeapon | null {
  const lower = name.toLowerCase();
  const item = inventory.find((i) => i.name.toLowerCase() === lower);
  return resolveDisplayWeapon(item ?? { name });
}

export function resolveDisplayArmorByName(
  name: string,
  inventory: InventoryLike,
): CatalogArmor | null {
  const lower = name.toLowerCase();
  const item = inventory.find((i) => i.name.toLowerCase() === lower);
  return resolveDisplayArmor(item ?? { name });
}
