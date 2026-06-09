import {
  stampDurability,
  wearItemByName,
  repairCost,
  repairItem,
} from '../app/engine/durability';
import type { InventoryItem } from '../app/engine/types';

describe('durability', () => {
  it('stamps catalog baseDurability on a fresh weapon', () => {
    const raw: InventoryItem = {
      id: 'w1',
      name: 'Rusted Blade',
      kind: 'weapon',
      quantity: 1,
      tags: [],
    };
    const stamped = stampDurability(raw);
    expect(stamped.durability).toBeDefined();
    expect(stamped.durability!.max).toBeGreaterThan(0);
    expect(stamped.durability!.current).toBe(stamped.durability!.max);
  });

  it('leaves non-catalog items alone', () => {
    const raw: InventoryItem = {
      id: 'x1',
      name: 'Not A Real Thing',
      kind: 'misc',
      quantity: 1,
      tags: [],
    };
    expect(stampDurability(raw).durability).toBeUndefined();
  });

  it('wears a named item by one and reports a break', () => {
    const inv: InventoryItem[] = [
      { id: 'a', name: 'Mud-Stalker Leggings', kind: 'armor', quantity: 1, tags: [], durability: { current: 1, max: 30 } },
    ];
    const r = wearItemByName(inv, 'Mud-Stalker Leggings');
    expect(r.broken).toBe(true);
    expect(r.brokenName).toBe('Mud-Stalker Leggings');
    expect(r.inventory).toHaveLength(0);
  });

  it('reduces durability without breaking when above zero', () => {
    const inv: InventoryItem[] = [
      { id: 'a', name: 'Aetheric Vest', kind: 'armor', quantity: 1, tags: [], durability: { current: 10, max: 45 } },
    ];
    const r = wearItemByName(inv, 'Aetheric Vest');
    expect(r.broken).toBe(false);
    expect(r.inventory[0]!.durability!.current).toBe(9);
  });

  it('repairCost equals points missing (min 1)', () => {
    const item: InventoryItem = {
      id: 'a',
      name: 'X',
      kind: 'armor',
      quantity: 1,
      tags: [],
      durability: { current: 10, max: 30 },
    };
    expect(repairCost(item)).toBe(20);
  });

  it('repairItem restores to max', () => {
    const inv: InventoryItem[] = [
      { id: 'a', name: 'X', kind: 'armor', quantity: 1, tags: [], durability: { current: 5, max: 30 } },
    ];
    const next = repairItem(inv, 'a');
    expect(next[0]!.durability!.current).toBe(30);
  });

  it('repairItem preserves a weapon coating — the coating survives a repair', () => {
    const inv: InventoryItem[] = [
      {
        id: 'a', name: 'Rusty Shortbow', kind: 'weapon', quantity: 1, tags: [],
        durability: { current: 2, max: 30 },
        coating: { kind: 'acid', dice: '1d4', label: 'Acid-Etched' },
      },
    ];
    const next = repairItem(inv, 'a');
    expect(next[0]!.durability!.current).toBe(30);
    // The instance (and its coating) is kept, so the coated name holds too.
    expect(next[0]!.coating).toEqual({ kind: 'acid', dice: '1d4', label: 'Acid-Etched' });
  });
});

describe('durability — per-instance variation (inverse tradeoff)', () => {
  const fresh = (): InventoryItem => ({
    id: 'w', name: 'Rusted Blade', kind: 'weapon', quantity: 1, tags: [],
  });
  const perkTotal = (i: InventoryItem): number =>
    (i.instanceStats?.acBonus ?? 0)
    + (i.instanceStats?.statBonuses ?? []).reduce((s, b) => s + b.amount, 0);

  afterEach(() => jest.restoreAllMocks());

  it('a fragile roll (temper 0) has LOW durability but a BIG perk budget', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // temper 0 = fragile
    const fragile = stampDurability(fresh());
    jest.spyOn(Math, 'random').mockReturnValue(0.999); // temper ~1 = sturdy
    const sturdy = stampDurability(fresh());

    // Inverse relationship: the fragile copy is weaker-bodied, stronger-perked.
    expect(fragile.durability!.max).toBeLessThan(sturdy.durability!.max);
    expect(perkTotal(fragile)).toBeGreaterThan(perkTotal(sturdy));
    // Both still carry a rolled perk loadout, and the primary channel survives.
    expect(perkTotal(fragile)).toBeGreaterThanOrEqual(1);
    expect(perkTotal(sturdy)).toBeGreaterThanOrEqual(1);
  });

  it('never re-rolls an item that already has durability (idempotent)', () => {
    const already: InventoryItem = {
      id: 'w', name: 'Rusted Blade', kind: 'weapon', quantity: 1, tags: [],
      durability: { current: 7, max: 7 },
    };
    expect(stampDurability(already)).toBe(already);
  });
});
