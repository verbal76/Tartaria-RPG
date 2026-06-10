import { mergeOrPushItem } from '../app/engine/inventory';
import type { InventoryItem } from '../app/engine/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(over: Partial<InventoryItem> & { name: string; kind: InventoryItem['kind'] }): InventoryItem {
  return {
    id: over.id ?? `${over.name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`,
    name: over.name,
    kind: over.kind,
    quantity: over.quantity ?? 1,
    tags: over.tags ?? [],
    rarity: over.rarity,
    description: over.description,
    durability: over.durability,
  };
}

// ---------------------------------------------------------------------------
// Always-stackable kinds: consumable, misc, runecaster
// ---------------------------------------------------------------------------

describe('mergeOrPushItem — consumable / misc / runecaster (always stack)', () => {
  it('merges two same-name misc items', () => {
    const inv = [makeItem({ name: 'Bioluminescent Fungus', kind: 'misc' })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Bioluminescent Fungus', kind: 'misc' }));
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(2);
  });

  it('merges two same-name consumables', () => {
    const inv = [makeItem({ name: 'Healing Tonic', kind: 'consumable', quantity: 3 })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Healing Tonic', kind: 'consumable' }));
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(4);
  });

  it('merges runecaster shells regardless of how many are added', () => {
    const inv = [makeItem({ name: 'Rune Caster Shell (Common)', kind: 'runecaster', quantity: 2 })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Rune Caster Shell (Common)', kind: 'runecaster', quantity: 5 }));
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(7);
  });

  it('does not merge items with different names', () => {
    const inv = [makeItem({ name: 'Bioluminescent Fungus', kind: 'misc' })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Worn Tartarian Coin', kind: 'misc' }));
    expect(out).toHaveLength(2);
  });

  it('does not merge items with same name but different kind (catalog drift safety)', () => {
    const inv = [makeItem({ name: 'Locket', kind: 'misc' })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Locket', kind: 'relic' }));
    expect(out).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Durability-tracked kinds: weapon / armor / relic
// ---------------------------------------------------------------------------

describe('mergeOrPushItem — durability-tracked (only merge when both pristine)', () => {
  it('merges two same-name weapons when both have no durability tracking', () => {
    const inv = [makeItem({ name: 'Rusted Pipe', kind: 'weapon' })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Rusted Pipe', kind: 'weapon' }));
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(2);
  });

  it('merges two same-name weapons when both are at full durability', () => {
    const inv = [makeItem({ name: 'Iron Sword', kind: 'weapon', durability: { current: 25, max: 25 } })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Iron Sword', kind: 'weapon', durability: { current: 25, max: 25 } }));
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(2);
  });

  it('does NOT merge when the existing weapon is damaged', () => {
    const inv = [makeItem({ name: 'Iron Sword', kind: 'weapon', durability: { current: 12, max: 25 } })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Iron Sword', kind: 'weapon', durability: { current: 25, max: 25 } }));
    expect(out).toHaveLength(2);
  });

  it('does NOT merge when the incoming weapon is damaged', () => {
    const inv = [makeItem({ name: 'Iron Sword', kind: 'weapon', durability: { current: 25, max: 25 } })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Iron Sword', kind: 'weapon', durability: { current: 10, max: 25 } }));
    expect(out).toHaveLength(2);
  });

  it('merges two same-name relics at full durability (the locket bug)', () => {
    const inv = [makeItem({ name: 'Aetheric Locket', kind: 'relic', durability: { current: 25, max: 25 } })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Aetheric Locket', kind: 'relic', durability: { current: 25, max: 25 } }));
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(2);
  });

  it('merges armor pieces when both are pristine', () => {
    const inv = [makeItem({ name: 'Mud-glass Helm', kind: 'armor', durability: { current: 20, max: 20 } })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Mud-glass Helm', kind: 'armor', durability: { current: 20, max: 20 } }));
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('mergeOrPushItem — edge cases', () => {
  it('pushes onto an empty inventory cleanly', () => {
    const out = mergeOrPushItem([], makeItem({ name: 'Worn Tartarian Coin', kind: 'misc' }));
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Worn Tartarian Coin');
  });

  it('returns a fresh array — does not mutate the input', () => {
    const inv = [makeItem({ name: 'Coin', kind: 'misc' })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Coin', kind: 'misc' }));
    expect(out).not.toBe(inv);
    expect(inv[0]!.quantity).toBe(1); // original untouched
    expect(out[0]!.quantity).toBe(2);
  });

  it('ignores grants of quantity <= 0', () => {
    const inv = [makeItem({ name: 'Coin', kind: 'misc' })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Coin', kind: 'misc', quantity: 0 }));
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(1);
  });

  it('respects quantity > 1 on the incoming item', () => {
    const inv = [makeItem({ name: 'Aetherstone Pebble', kind: 'misc', quantity: 2 })];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Aetherstone Pebble', kind: 'misc', quantity: 3 }));
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(5);
  });

  it('keeps unrelated items intact when merging into the middle of the inventory', () => {
    const inv = [
      makeItem({ name: 'Coin', kind: 'misc' }),
      makeItem({ name: 'Fungus', kind: 'misc' }),
      makeItem({ name: 'Tools', kind: 'misc' }),
    ];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Fungus', kind: 'misc' }));
    expect(out).toHaveLength(3);
    expect(out[0]!.name).toBe('Coin');
    expect(out[1]!.name).toBe('Fungus');
    expect(out[1]!.quantity).toBe(2);
    expect(out[2]!.name).toBe('Tools');
  });

  it('chooses the FIRST eligible merge target when several match', () => {
    // Two coin rows somehow exist (legacy from before this helper). New coins
    // land in the first matching row, not the second.
    const inv = [
      makeItem({ name: 'Coin', kind: 'misc', id: 'first', quantity: 1 }),
      makeItem({ name: 'Coin', kind: 'misc', id: 'second', quantity: 1 }),
    ];
    const out = mergeOrPushItem(inv, makeItem({ name: 'Coin', kind: 'misc' }));
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe('first');
    expect(out[0]!.quantity).toBe(2);
    expect(out[1]!.id).toBe('second');
    expect(out[1]!.quantity).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// OTA-427 — per-instance gear (instanceStats / uniqueStats) never stacks
// ---------------------------------------------------------------------------

describe('mergeOrPushItem — per-instance gear stays separate', () => {
  it('does NOT merge two same-name weapons that carry instanceStats', () => {
    const a = makeItem({
      name: 'Iron Axe', kind: 'weapon', durability: { current: 10, max: 10 },
    });
    a.instanceStats = { statBonuses: [{ stat: 'strength', amount: 4 }] };
    const b = makeItem({
      name: 'Iron Axe', kind: 'weapon', durability: { current: 50, max: 50 },
    });
    b.instanceStats = { statBonuses: [{ stat: 'strength', amount: 3 }] };
    const out = mergeOrPushItem([a], b);
    expect(out).toHaveLength(2);
    expect(out[0]!.instanceStats?.statBonuses[0]!.amount).toBe(4);
    expect(out[1]!.instanceStats?.statBonuses[0]!.amount).toBe(3);
  });

  it('does NOT merge fused gear (uniqueStats) into a plain copy', () => {
    const plain = makeItem({
      name: 'Steel Helm', kind: 'armor', durability: { current: 20, max: 20 },
    });
    const fused = makeItem({
      name: 'Steel Helm', kind: 'armor', durability: { current: 20, max: 20 },
    });
    fused.uniqueStats = { statBonuses: [{ stat: 'constitution', amount: 2 }] } as never;
    const out = mergeOrPushItem([plain], fused);
    expect(out).toHaveLength(2);
  });

  it('still stacks plain (no-instanceStats) fully-durable copies', () => {
    const a = makeItem({ name: 'Plain Dagger', kind: 'weapon', durability: { current: 12, max: 12 } });
    const b = makeItem({ name: 'Plain Dagger', kind: 'weapon', durability: { current: 12, max: 12 } });
    const out = mergeOrPushItem([a], b);
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(2);
  });
});
