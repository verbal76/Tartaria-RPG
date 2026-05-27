// Inventory-delta helper used by SalvageModal and the Inventory
// screen's scrap flow. Behavioural test — no UI snapshotting,
// just verifies the diff is right for the cases the modals care
// about.

import { computeInventoryDelta } from '../app/components/inventoryDelta';
import type { InventoryItem } from '../app/engine/types';

function mk(name: string, quantity: number, rarity?: string): InventoryItem {
  return {
    id: `${name}_${quantity}`,
    name,
    kind: 'misc',
    rarity: rarity as InventoryItem['rarity'],
    quantity,
    tags: [],
  };
}

describe('computeInventoryDelta', () => {
  it('detects a brand-new row', () => {
    const before: InventoryItem[] = [];
    const after = [mk('Scrap Metal', 2, 'Uncommon')];
    const delta = computeInventoryDelta(before, after);
    expect(delta).toEqual([{ name: 'Scrap Metal', quantity: 2, rarity: 'Uncommon' }]);
  });

  it('detects a quantity bump on an existing row (the merge case)', () => {
    const before = [mk('Aether Residue', 1, 'Common')];
    const after = [mk('Aether Residue', 4, 'Common')];
    const delta = computeInventoryDelta(before, after);
    expect(delta).toEqual([{ name: 'Aether Residue', quantity: 3, rarity: 'Common' }]);
  });

  it('combines a fresh row + bump on existing into a flat list', () => {
    const before = [mk('Scrap Metal', 1, 'Uncommon')];
    const after = [
      mk('Scrap Metal', 3, 'Uncommon'), // +2
      mk('Aether Residue', 1, 'Common'),  // new
    ];
    const delta = computeInventoryDelta(before, after);
    const byName = Object.fromEntries(delta.map((d) => [d.name, d]));
    expect(byName['Scrap Metal']).toEqual({ name: 'Scrap Metal', quantity: 2, rarity: 'Uncommon' });
    expect(byName['Aether Residue']).toEqual({ name: 'Aether Residue', quantity: 1, rarity: 'Common' });
  });

  it('ignores items that DECREASED in quantity (the salvage source itself)', () => {
    // Player started with 1 broken construct hull, scrapped it.
    // Output was 2 Scrap Metal. The hull disappears; only the
    // scrap should surface as delta.
    const before = [
      mk('Broken Construct Hull', 1, 'Common'),
    ];
    const after = [
      // hull removed
      mk('Scrap Metal', 2, 'Uncommon'),
    ];
    const delta = computeInventoryDelta(before, after);
    expect(delta).toEqual([{ name: 'Scrap Metal', quantity: 2, rarity: 'Uncommon' }]);
  });

  it('returns an empty list when nothing was added', () => {
    const before = [mk('Aether Residue', 1, 'Common')];
    const after = [mk('Aether Residue', 1, 'Common')];
    expect(computeInventoryDelta(before, after)).toEqual([]);
  });

  it('aggregates two rows sharing a name into one entry', () => {
    // grantItem usually merges, but legacy save data sometimes has
    // duplicate rows. The diff should still surface the right total.
    const before: InventoryItem[] = [];
    const after = [
      mk('Scrap Metal', 1, 'Uncommon'),
      { ...mk('Scrap Metal', 2, 'Uncommon'), id: 'second' },
    ];
    const delta = computeInventoryDelta(before, after);
    expect(delta).toEqual([{ name: 'Scrap Metal', quantity: 3, rarity: 'Uncommon' }]);
  });
});
