import type { InventoryItem } from './types';

// OTA 004 / OTA-393 — drinking a Water Bottle must leave an Empty Water Bottle
// behind so it can be refilled, no matter WHICH consume path fires. Originally
// only the `eat` handler did this; the `use`/use_relic structured-effect path
// (Water Bottle carries healHP + restoreStamina) destroyed the bottle outright,
// so "use Water Bottle" left the player with nothing to refill. This shared
// helper is applied on every consume path. Returns the inventory with an empty
// bottle added/merged when the consumed item was a Water Bottle; unchanged
// otherwise.
export function leaveEmptyWaterBottle(
  inventory: InventoryItem[],
  consumedName: string,
): InventoryItem[] {
  if (consumedName !== 'Water Bottle') return inventory;
  const idx = inventory.findIndex((i) => i.name === 'Empty Water Bottle');
  if (idx >= 0) {
    const next = inventory.slice();
    next[idx] = { ...next[idx]!, quantity: next[idx]!.quantity + 1 };
    return next;
  }
  return [
    ...inventory,
    {
      id: `empty_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: 'Empty Water Bottle',
      kind: 'misc',
      rarity: 'Common',
      quantity: 1,
      tags: ['container', 'water'],
    },
  ];
}
