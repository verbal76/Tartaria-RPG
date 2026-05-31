import type { InventoryItem } from './types';
import {
  findWeaponByName,
  findArmorByName,
  findAmuletByName,
  findRingByName,
  findExplorationItemByName,
  GEAR,
} from './crafting';
import { scrapOutputFor } from './scrapEngine';

// OTA-188 — when a durability-tracked item breaks, drop ONE low-tier
// material so the player has a foothold to repair / re-craft. Ropes
// drop "Broken Rope" (which is the recipe ingredient for crafting a
// new Climbing Rope). Other items drop the first material from
// their scrap output — the base component for the equivalent
// repair recipe. Player ask: "when the rope finally breaks I have
// never seen it turn into the broken rope item and populate my
// inventory. also when weapons break from durability what happens
// to them? so they have a chance to drop 1 single low level
// material that would be needed to repair that item?"
function brokenSalvageFor(item: InventoryItem): { name: string; quantity: number } | null {
  const nameLower = item.name.toLowerCase();
  // Ropes always salvage to Broken Rope (which 2× of crafts a new
  // Climbing Rope via the OTA-008 recipe).
  if (/\b(rope|line|cord|cable)\b/.test(nameLower)) {
    return { name: 'Broken Rope', quantity: 1 };
  }
  // Everything else: first scrap output. scrapOutputFor returns 1+
  // material grants tagged off the item's catalog tags + kind.
  const out = scrapOutputFor(item);
  if (out.grants.length === 0) return null;
  return { name: out.grants[0]!.name, quantity: 1 };
}

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
  // GEAR catalog entries typed as 'relic' (Aetheric Torch, Aetheric
  // Locket, Aetheric Compass, etc.) were previously skipped — the
  // 'every relic has durability' invariant broke for them. Stress
  // test caught the gap. Treat any GEAR row whose kind is 'relic' /
  // 'weapon' / 'armor' as durability-tracked.
  const nameLower = name.toLowerCase();
  const g = GEAR.find((x) => x.name.toLowerCase() === nameLower);
  if (g && g.kind === 'relic') {
    // GEAR rows don't currently declare baseDurability, but the door
    // is open for them to do so. Honor it if present.
    const gAny = g as typeof g & { baseDurability?: number };
    return gAny.baseDurability ?? DEFAULT_DURABILITY;
  }
  // Exploration catalog: Reclaimer's Rope (and any future durability-tracked
  // exploration item) carries baseDurability now that rope is wear-tracked.
  // Honor it the same way we honor relic-kind GEAR rows.
  const e = findExplorationItemByName(name);
  if (e) {
    const eAny = e as typeof e & { baseDurability?: number };
    if (eAny.baseDurability != null) return eAny.baseDurability;
  }
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
): { inventory: InventoryItem[]; broken: boolean; brokenName: string | null; salvageDrop: { name: string; quantity: number } | null } {
  const target = itemName.toLowerCase();
  // Pick the candidate by name, preferring an instance that already has a
  // durability record. (Stackable items without durability never wear.)
  const idx = inventory.findIndex((i) => i.name.toLowerCase() === target && i.durability);
  if (idx < 0) {
    return { inventory: inventory.map((i) => ({ ...i })), broken: false, brokenName: null, salvageDrop: null };
  }
  const next = inventory.map((i) => ({ ...i }));
  const item = next[idx]!;
  const cur = item.durability!.current - amount;
  if (cur <= 0) {
    // Item destroyed — remove from inventory.
    next.splice(idx, 1);
    return { inventory: next, broken: true, brokenName: item.name, salvageDrop: brokenSalvageFor(item) };
  }
  item.durability = { ...item.durability!, current: cur };
  return { inventory: next, broken: false, brokenName: null, salvageDrop: null };
}

/** Wear a specific item instance by id. Preferred over wearItemByName
 *  when the caller knows which copy is equipped — e.g. the player
 *  holds two Aetheric Lockets and only the one in the amulet slot
 *  should take durability damage. Falls back silently when the id
 *  isn't in the inventory (item already removed / never had
 *  durability). */
export function wearItemById(
  inventory: readonly InventoryItem[],
  itemId: string,
  amount = 1,
): { inventory: InventoryItem[]; broken: boolean; brokenName: string | null; salvageDrop: { name: string; quantity: number } | null } {
  const idx = inventory.findIndex((i) => i.id === itemId && i.durability);
  if (idx < 0) {
    return { inventory: inventory.map((i) => ({ ...i })), broken: false, brokenName: null, salvageDrop: null };
  }
  const next = inventory.map((i) => ({ ...i }));
  const item = next[idx]!;
  const cur = item.durability!.current - amount;
  if (cur <= 0) {
    next.splice(idx, 1);
    return { inventory: next, broken: true, brokenName: item.name, salvageDrop: brokenSalvageFor(item) };
  }
  item.durability = { ...item.durability!, current: cur };
  return { inventory: next, broken: false, brokenName: null, salvageDrop: null };
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
