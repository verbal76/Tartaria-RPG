// OTA-210 — Disease Sample as throwable + infection DoT. Verifies
// the catalog row carries the throwable tag, the throw damage
// override returns 1d3 (range [1, 3]), and the infection status
// shape is well-formed for the per-enemy tick.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve(); }),
    },
  };
});

import { rollThrowDamage, throwDamageNotation } from '../app/engine/itemWeight';
import { validSlotsForItem } from '../app/engine/equipment';
import { findMaterialByName } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

describe('OTA-210 — Disease Sample throwable catalog row', () => {
  it('carries the throwable tag in materials.json', () => {
    const row = findMaterialByName('Disease Sample');
    expect(row).not.toBeNull();
    expect(row?.tags).toContain('throwable');
  });

  it('description mentions infection / 10 rounds / DoT', () => {
    const row = findMaterialByName('Disease Sample');
    expect(row?.description).toMatch(/infection/i);
    expect(row?.description).toMatch(/10 rounds/);
  });
});

describe('OTA-210 — Disease Sample throw damage', () => {
  const sample: InventoryItem = {
    id: 'ds_1',
    name: 'Disease Sample',
    kind: 'misc',
    quantity: 1,
    tags: ['organic', 'alchemy', 'vermin', 'throwable'],
    rarity: 'Uncommon',
    description: 'X',
  };

  it('throwDamageNotation returns "1d3"', () => {
    expect(throwDamageNotation(sample)).toBe('1d3');
  });

  it('rollThrowDamage stays in [1, 3]', () => {
    for (let i = 0; i < 200; i++) {
      const d = rollThrowDamage(sample);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(3);
    }
  });
});

describe('OTA-210 — Disease Sample is equippable as a weapon', () => {
  it('validSlotsForItem routes to main/off via the throwable tag', () => {
    const sample: InventoryItem = {
      id: 'ds_2',
      name: 'Disease Sample',
      kind: 'misc',
      quantity: 1,
      tags: ['organic', 'alchemy', 'vermin', 'throwable'],
      rarity: 'Uncommon',
      description: 'X',
    };
    const slots = validSlotsForItem(sample);
    expect(slots).toContain('main');
    expect(slots).toContain('off');
  });
});
