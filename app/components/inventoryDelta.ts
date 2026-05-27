// Shared inventory-delta helper. Used by SalvageModal and the
// Inventory screen's scrap flow to compare before/after pack
// snapshots and surface "✦ Added: X ×2" results in the modal that
// triggered the action.
//
// Aggregation is by NAME — a fresh row OR a quantity bump on an
// existing row both collapse into a single Delta entry. Items that
// disappear (the salvage source itself, the scrap source) are
// intentionally NOT surfaced; the player already knows what they
// broke down.

import type { InventoryItem } from '../engine/types';

export interface InventoryDelta {
  name: string;
  quantity: number;
  rarity?: string;
}

export function computeInventoryDelta(
  before: readonly InventoryItem[],
  after: readonly InventoryItem[],
): InventoryDelta[] {
  const sum = (inv: readonly InventoryItem[]): Map<string, { qty: number; rarity?: string }> => {
    const out = new Map<string, { qty: number; rarity?: string }>();
    for (const i of inv) {
      const prev = out.get(i.name)?.qty ?? 0;
      out.set(i.name, { qty: prev + i.quantity, rarity: i.rarity });
    }
    return out;
  };
  const a = sum(before);
  const b = sum(after);
  const out: InventoryDelta[] = [];
  for (const [name, { qty: qb, rarity }] of b) {
    const qa = a.get(name)?.qty ?? 0;
    if (qb > qa) out.push({ name, quantity: qb - qa, rarity });
  }
  return out;
}
