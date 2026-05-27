import { itemWeight, weightLabel, rollThrowDamage } from '../app/engine/itemWeight';
import type { InventoryItem } from '../app/engine/types';

function item(name: string, kind: InventoryItem['kind'] = 'misc'): InventoryItem {
  return { id: 'x', name, kind, quantity: 1, tags: [] } as InventoryItem;
}

describe('itemWeight — sane defaults by name + kind', () => {
  it('lockets / amulets / rings / dust → feather-light (1)', () => {
    expect(itemWeight(item('Aetheric Locket'))).toBe(1);
    expect(itemWeight(item('Brass Ring'))).toBe(1);
    expect(itemWeight(item('Aether Dust'))).toBe(1);
  });

  it('rations → light (2)', () => {
    expect(itemWeight(item('Trail Rations'))).toBe(2);
    expect(itemWeight(item('Salted Meat'))).toBe(2);
  });

  it('knives / wands / tools → balanced (3)', () => {
    expect(itemWeight(item('Pocket Knife'))).toBe(3);
    expect(itemWeight(item('Bone Shiv'))).toBe(3);
    expect(itemWeight(item('Pyric Wand'))).toBe(3);
  });

  it('cores / stones / ingots / heavy weapons → crushing (5)', () => {
    expect(itemWeight(item('Steam Core'))).toBe(5);
    expect(itemWeight(item('Golem Stone'))).toBe(5);
    expect(itemWeight(item('Sentinel Core'))).toBe(5);
  });

  it('falls back to kind when name has no signal', () => {
    expect(itemWeight(item('Mysterious Thing', 'weapon'))).toBe(4);
    expect(itemWeight(item('Mysterious Thing', 'armor'))).toBe(4);
    expect(itemWeight(item('Mysterious Thing', 'consumable'))).toBe(2);
  });
});

describe('rollThrowDamage — weighted dice', () => {
  it('feather-light returns flat 1', () => {
    for (let i = 0; i < 30; i++) {
      expect(rollThrowDamage(item('Aetheric Locket'))).toBe(1);
    }
  });

  it('crushing returns 2..9 (d8+1)', () => {
    for (let i = 0; i < 100; i++) {
      const dmg = rollThrowDamage(item('Steam Core'));
      expect(dmg).toBeGreaterThanOrEqual(2);
      expect(dmg).toBeLessThanOrEqual(9);
    }
  });

  it('null / bare rock returns 1', () => {
    expect(rollThrowDamage(null)).toBe(1);
  });
});

describe('weightLabel — readable tags', () => {
  it('produces the canonical label per tier', () => {
    expect(weightLabel(1)).toBe('feather-light');
    expect(weightLabel(3)).toBe('balanced');
    expect(weightLabel(5)).toBe('crushing');
  });
});
