// OTA-677 — a Climbing Rope's max durability climbed to ~270 ("almost 300").
// stampDurability applied the WEAPON/ARMOR temper roll (max = base × [0.4, 1.8] +
// rolled perks) to any item with a baseDurability, so a 150-durability utility rope
// rolled a random 60–270 and re-rolled on fresh instances. The temper is now gated
// to weapons/armor; utility tools get a FIXED max = base. resealUtilityDurability
// heals existing saves that already carry the inflated max.

import { stampDurability, resealUtilityDurability } from '../app/engine/durability';
import type { InventoryItem } from '../app/engine/types';

function item(name: string, kind: string, over: Partial<InventoryItem> = {}): InventoryItem {
  return { id: `t_${name}`, name, kind, rarity: 'Common', tags: [], quantity: 1, ...over } as unknown as InventoryItem;
}

describe('utility durability is fixed, not tempered (OTA-677)', () => {
  it('a Climbing Rope stamps a FIXED max = base (150), deterministically, no perks', () => {
    // Stamp many times — a tempered roll would vary; a fixed one never does.
    const maxes = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const stamped = stampDurability(item('Climbing Rope', 'misc'));
      maxes.add(stamped.durability!.max);
      expect(stamped.durability!.current).toBe(stamped.durability!.max);
      expect((stamped as { instanceStats?: unknown }).instanceStats).toBeUndefined();
    }
    expect([...maxes]).toEqual([150]); // never drifts
  });

  it('a weapon still tempers (max varies within the band across rolls)', () => {
    const maxes = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const stamped = stampDurability(item('Mud-Rend Blade', 'weapon'));
      if (stamped.durability) maxes.add(stamped.durability.max);
    }
    // A tempered roll produces more than one distinct max (base 18 → ~7..32).
    expect(maxes.size).toBeGreaterThan(1);
  });

  it('resealUtilityDurability heals an inflated rope max and clamps current', () => {
    const bloated = item('Climbing Rope', 'misc', { durability: { max: 270, current: 100 } } as Partial<InventoryItem>);
    const healed = resealUtilityDurability(bloated);
    expect(healed.durability!.max).toBe(150);
    expect(healed.durability!.current).toBe(100); // preserved (≤ new max)
  });

  it('resealUtilityDurability clamps current when it exceeded the healed max', () => {
    const bloated = item('Climbing Rope', 'misc', { durability: { max: 270, current: 260 } } as Partial<InventoryItem>);
    expect(resealUtilityDurability(bloated).durability!.current).toBe(150);
  });

  it('resealUtilityDurability leaves weapons alone (their temper band is intended)', () => {
    const w = item('Mud-Rend Blade', 'weapon', { durability: { max: 30, current: 12 } } as Partial<InventoryItem>);
    const out = resealUtilityDurability(w);
    expect(out.durability!.max).toBe(30);
    expect(out.durability!.current).toBe(12);
  });
});
