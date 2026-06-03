import type { InventoryItem } from './types';

// The pack has NO carrying limit — every item stacks without bound, and
// there is no total weight / slot / encumbrance system anywhere.
//
// A few improvised items (Small Rock, Big Rock, Stick) used to have small
// per-name caps, but since nothing else was ever capped the pack had no
// real limit anyway, and the "pack too full / upgrade" messaging promised a
// capacity-upgrade system that was never built. Per design decision the
// caps are removed: a full pack is never a constraint. The table is kept
// (empty) alongside capacityFor() + grantItem()'s accepted/dropped plumbing
// so re-introducing a genuine, intentional cap later is a one-line change.
const ITEM_CAPS: Record<string, number> = {};

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
