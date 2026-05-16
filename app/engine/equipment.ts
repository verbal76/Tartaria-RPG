import type { InventoryItem, EquipSlot } from './types';
import { findWeaponByName, findArmorByName, findAmuletByName, findRingByName, GEAR } from './crafting';

/**
 * Return the list of slots an item could legally be equipped into.
 * Empty array = the item can't be equipped at all.
 */
export function validSlotsForItem(item: InventoryItem): EquipSlot[] {
  const nameLower = item.name.toLowerCase();
  if (findWeaponByName(item.name)) {
    return ['main', 'off']; // any weapon can go in either hand
  }
  const armor = findArmorByName(item.name);
  if (armor) {
    return [armor.slot];
  }
  if (findAmuletByName(item.name)) return ['amulet'];
  if (findRingByName(item.name)) return ['ring'];
  // Gear-side: relics with detection / locket-ish tags can be amulets.
  const gear = GEAR.find((g) => g.name.toLowerCase() === nameLower);
  if (gear) {
    if (gear.tags.includes('detection') || /locket|amulet|necklace/i.test(gear.name)) {
      return ['amulet'];
    }
    if (/ring|band/i.test(gear.name)) {
      return ['ring'];
    }
  }
  // Tag-based fallback for items not in the catalog yet.
  if (item.tags.some((t) => /amulet|locket|necklace/i.test(t))) return ['amulet'];
  if (item.tags.some((t) => /ring|band/i.test(t))) return ['ring'];
  return [];
}

/** Pretty label for a slot. Used in UI prompts and StatsPanel. */
export const SLOT_LABEL: Record<EquipSlot, string> = {
  main: 'Main hand',
  off: 'Off hand',
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
  amulet: 'Amulet',
  ring: 'Ring',
};

/** Slots that hold armor pieces (used to aggregate AC + resistances). */
export const ARMOR_SLOTS: readonly EquipSlot[] = ['head', 'chest', 'legs', 'feet'];
