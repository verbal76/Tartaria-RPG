import type { InventoryItem } from './types';

// The pack has no weight / slot / encumbrance system — meaningful gear, loot,
// and quest items stack without bound, and a full pack is never a constraint on
// real play. The table below (kept deliberately alongside capacityFor() +
// grantItem()'s accepted/dropped plumbing) re-introduces GENEROUS caps for the
// three flood-prone improvised commodities only.
//
// OTA-441 — [audit #26] bound the one trivially-abusable unbounded-growth vector.
// Small Rock / Big Rock / Stick are the highest-weight forage drops (areaSearch
// SMALL_FINDS), so a forage-farmer could stack tens of thousands of them. No
// recipe needs more than 3 of any junk item, so caps of 40–60 are ~20–60× above
// any genuine use — invisible to a normal player, while grantItem cleanly
// declines the overflow (the search handler already narrates "your pack is
// already full of them"). Everything else stays uncapped (Infinity). The
// row-generating farm vectors (repeat-forage, oscillation encounters) are
// separately bounded by OTA-437 / OTA-438.
const ITEM_CAPS: Record<string, number> = {
  'small rock': 60,
  'big rock': 40,
  'stick': 60,
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
  // engine_Dev — CENTRAL material-leak guard. Any system that grants a BUILT-IN
  // (Tartaria) material the re-skin doesn't have (dig / forage / investigation /
  // dog finds / loot) gets the substitute swapped in here, so the player's pack
  // fills with THEIR materials, not ours. No-op for the built-in game (no override)
  // and for non-material grants (quest items, weapons, armor, encounter loot).
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { substituteLeakedMaterial } = require('./salvagePools') as typeof import('./salvagePools');
    const sub = substituteLeakedMaterial(newItem.name, newItem.rarity, undefined, newItem.kind);
    if (sub) newItem = { ...newItem, name: sub.name, rarity: sub.rarity };
  }
  const cap = capacityFor(newItem.name);
  if (newItem.quantity <= 0) return { inventory: [...inventory], accepted: 0, dropped: 0, cap };
  const stackable = alwaysStackable(newItem.kind);
  const newItemFull = isFullyDurable(newItem);
  const mergeIdx = inventory.findIndex((existing) => {
    if (existing.name !== newItem.name) return false;
    if (existing.kind !== newItem.kind) return false;
    // OTA-363 — a weapon coating makes an instance unique; never merge a
    // coated weapon (it would silently drop the coating on the incoming
    // item or fuse two differently-coated blades).
    if (existing.coating || newItem.coating) return false;
    // OTA-427 — per-instance gear is unique. A rolled weapon/armor carries its
    // own temper-driven instanceStats (and fused gear carries uniqueStats); two
    // copies of the same name now have different durability bands + perk sets.
    // Merging would collapse them into one row and silently drop the loser's
    // rolled stats. Never stack a row that carries either marker.
    if (existing.instanceStats || newItem.instanceStats) return false;
    if (existing.uniqueStats || newItem.uniqueStats) return false;
    // OTA-1007 — a DURABILITY-tracked item is per-instance wear, even when its
    // KIND is normally "always stackable." A Climbing Rope / Pry Bar / torch /
    // compass is kind:'misc', but it carries durability, and merging a FRESH
    // (full) one into a WORN stack silently discards the new durability — the
    // merge only bumps quantity and keeps the existing worn row's value. That
    // was the "I crafted a fresh 150/150 rope but still can't climb" bug: the
    // new rope folded into a 15/150 stack and its full durability vanished.
    // Treat any durability-tracked item like weapons/armor: merge ONLY when
    // BOTH are fully durable — which still keeps pristine stacks tidy (×21
    // full torches merge) but never collapses a fresh copy onto a worn one.
    if (existing.durability || newItem.durability) {
      return isFullyDurable(existing) && newItemFull;
    }
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
