import type { InventoryItem } from './types';
import {
  findWeaponByName,
  findArmorByName,
  findAmuletByName,
  findRingByName,
} from './crafting';

// Default durability for catalog entries that don't declare one. Materials,
// consumables, and generic loot are NOT durability-tracked.
const DEFAULT_DURABILITY = 25;

// Resolve the catalog baseDurability for a named item, or null if the item
// is not a durability-tracked category (consumable, material, etc.).
function lookupBaseDurability(name: string): number | null {
  const w = findWeaponByName(name);
  if (w) return w.baseDurability ?? DEFAULT_DURABILITY;
  const a = findArmorByName(name);
  if (a) return a.baseDurability ?? DEFAULT_DURABILITY;
  const am = findAmuletByName(name);
  if (am) return am.baseDurability ?? DEFAULT_DURABILITY;
  const r = findRingByName(name);
  if (r) return r.baseDurability ?? DEFAULT_DURABILITY;
  return null;
}

// Populate the durability field on an item if its catalog entry has one and
// the field is missing. Used when buying or crafting fresh gear.
export function stampDurability(item: InventoryItem): InventoryItem {
  if (item.durability) return item;
  const max = lookupBaseDurability(item.name);
  if (max == null) return item;
  return { ...item, durability: { current: max, max } };
}

// Reduce one inventory item's durability by `amount`. Matches by name; the
// first matching instance with the highest current durability wins so the
// "freshest" copy bears the wear. Returns the new inventory and whether
// the worn item broke (durability hit 0).
export function wearItemByName(
  inventory: readonly InventoryItem[],
  itemName: string,
  amount = 1,
): { inventory: InventoryItem[]; broken: boolean; brokenName: string | null } {
  const target = itemName.toLowerCase();
  // Pick the candidate by name, preferring an instance that already has a
  // durability record. (Stackable items without durability never wear.)
  const idx = inventory.findIndex((i) => i.name.toLowerCase() === target && i.durability);
  if (idx < 0) {
    return { inventory: inventory.map((i) => ({ ...i })), broken: false, brokenName: null };
  }
  const next = inventory.map((i) => ({ ...i }));
  const item = next[idx]!;
  const cur = item.durability!.current - amount;
  if (cur <= 0) {
    // Item destroyed — remove from inventory.
    next.splice(idx, 1);
    return { inventory: next, broken: true, brokenName: item.name };
  }
  item.durability = { ...item.durability!, current: cur };
  return { inventory: next, broken: false, brokenName: null };
}

// Compute the TC cost to fully restore an item's durability. Convention:
// 1 TC per point missing, with a minimum of 1.
export function repairCost(item: InventoryItem): number {
  if (!item.durability) return 0;
  const missing = item.durability.max - item.durability.current;
  return Math.max(1, missing);
}

// Restore an item's durability to max in place. Returns a fresh inventory.
export function repairItem(
  inventory: readonly InventoryItem[],
  itemId: string,
): InventoryItem[] {
  return inventory.map((i) =>
    i.id === itemId && i.durability ? { ...i, durability: { ...i.durability, current: i.durability.max } } : i,
  );
}
