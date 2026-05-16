import type { InventoryItem } from './types';

// ---------------------------------------------------------------------------
// mergeOrPushItem
// ---------------------------------------------------------------------------
//
// Single source of truth for "we just acquired an item — does it stack onto
// an existing inventory row, or land as a new one?"
//
// Before this helper existed, every loot-grant site in gameStore.ts spread
// the inventory array unconditionally:
//     inventory: [...player.inventory, newItem]
// which meant two Aetheric Lockets, two Bioluminescent Fungi, or two of
// anything else all ended up as separate quantity-1 rows. The playtest log
// showed this constantly — players hated it.
//
// Stacking rules:
//   - consumable / misc / runecaster: always merge by (name, kind). These
//     are by-definition fungible.
//   - weapon / armor / relic: merge only when BOTH items are at full
//     durability (or have no durability tracking at all). A half-broken
//     sword should NOT fuse with a pristine one — the player would lose
//     the difference. Damaged-and-fresh stay separate rows.
//
// Quantity > 1 in the new item is added to the existing row's quantity, so
// granting "3 Aetherstone Pebble" onto an existing 2-stack lands at 5.

function isFullyDurable(item: InventoryItem): boolean {
  if (!item.durability) return true; // no tracking → always treated as full
  return item.durability.current >= item.durability.max;
}

function alwaysStackable(kind: InventoryItem['kind']): boolean {
  return kind === 'consumable' || kind === 'misc' || kind === 'runecaster';
}

/**
 * Returns a new inventory array with `newItem` merged into an existing row
 * if eligible, otherwise appended. Pure function — input array is not
 * mutated. Quantity-aware (newItem.quantity > 1 adds, doesn't replace).
 */
export function mergeOrPushItem(
  inventory: readonly InventoryItem[],
  newItem: InventoryItem,
): InventoryItem[] {
  if (newItem.quantity <= 0) return [...inventory]; // nothing to grant
  const stackable = alwaysStackable(newItem.kind);
  const newItemFull = isFullyDurable(newItem);
  const mergeIdx = inventory.findIndex((existing) => {
    if (existing.name !== newItem.name) return false;
    if (existing.kind !== newItem.kind) return false;
    if (stackable) return true;
    // Durability-tracked: only merge when both sides are pristine.
    return isFullyDurable(existing) && newItemFull;
  });
  if (mergeIdx < 0) return [...inventory, newItem];
  return inventory.map((item, idx) =>
    idx === mergeIdx ? { ...item, quantity: item.quantity + newItem.quantity } : item,
  );
}
