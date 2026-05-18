import type { InventoryItem } from './types';

// Per-item-name maximum quantity. Most loot stacks freely, but a few
// improvised items have hard caps so the pack doesn't fill with rocks:
//   - Small Rock: 10. Throwable; you can stack a pocket's worth.
//   - Big Rock:   1. Two-handed; only one fits.
//   - Stick:      6. Bundles, not forests.
// Look-up is case-insensitive against InventoryItem.name. Returns
// Infinity when no cap is configured.
const ITEM_CAPS: Record<string, number> = {
  'small rock': 10,
  'big rock': 1,
  'stick': 6,
};

export function capacityFor(itemName: string): number {
  return ITEM_CAPS[itemName.toLowerCase()] ?? Infinity;
}

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
 *
 * Honors ITEM_CAPS: if the resulting stack would exceed the cap, it is
 * clamped. Use grantItem() when the caller wants to know how many
 * units were actually accepted vs. dropped on the floor.
 */
export function mergeOrPushItem(
  inventory: readonly InventoryItem[],
  newItem: InventoryItem,
): InventoryItem[] {
  return grantItem(inventory, newItem).inventory;
}

/**
 * Grant an item to inventory and report what actually landed. Same
 * stacking rules as mergeOrPushItem, but returns:
 *   - inventory: the new array (always defined)
 *   - accepted: how many units actually went into the pack
 *   - dropped:  units that exceeded the per-name cap (caller can
 *               narrate "your pack is full of rocks")
 *   - cap:     the active cap for this item (Infinity = uncapped)
 */
export function grantItem(
  inventory: readonly InventoryItem[],
  newItem: InventoryItem,
): { inventory: InventoryItem[]; accepted: number; dropped: number; cap: number } {
  const cap = capacityFor(newItem.name);
  if (newItem.quantity <= 0) return { inventory: [...inventory], accepted: 0, dropped: 0, cap };
  const stackable = alwaysStackable(newItem.kind);
  const newItemFull = isFullyDurable(newItem);
  const mergeIdx = inventory.findIndex((existing) => {
    if (existing.name !== newItem.name) return false;
    if (existing.kind !== newItem.kind) return false;
    if (stackable) return true;
    return isFullyDurable(existing) && newItemFull;
  });
  if (mergeIdx < 0) {
    // Brand-new row. Clamp its initial quantity to the cap.
    const accepted = Math.min(newItem.quantity, cap);
    if (accepted <= 0) return { inventory: [...inventory], accepted: 0, dropped: newItem.quantity, cap };
    return {
      inventory: [...inventory, { ...newItem, quantity: accepted }],
      accepted,
      dropped: newItem.quantity - accepted,
      cap,
    };
  }
  const existing = inventory[mergeIdx]!;
  const room = Math.max(0, cap - existing.quantity);
  const accepted = Math.min(newItem.quantity, room);
  if (accepted <= 0) {
    return { inventory: [...inventory], accepted: 0, dropped: newItem.quantity, cap };
  }
  const next = inventory.map((item, idx) =>
    idx === mergeIdx ? { ...item, quantity: item.quantity + accepted } : item,
  );
  return { inventory: next, accepted, dropped: newItem.quantity - accepted, cap };
}
