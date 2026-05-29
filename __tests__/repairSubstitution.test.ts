// OTA-205 — verifies that the repair handler accepts substitute
// materials the same way crafting does. The triggering scenario:
// a playtest snapshot showed a Chestplate at dur 2/20 with the
// player carrying Cloth Scrap + Spider Silk + Mud Cloth but no
// Patched Cloth. Pre-OTA the repair refused; OTA-205 lets the
// cloth-tag stock substitute, same drain rules as crafting.
//
// This test covers the new exposed list-based helpers (since the
// actual repair handler is wired through the gameStore which is
// hard to integration-test). The handler calls these directly.

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

import {
  missingIngredientsList,
  consumeIngredientsList,
  previewSubstitutionsList,
} from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

function mkMisc(name: string, tags: string[], qty = 1, extra: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `m_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind: 'misc',
    quantity: qty,
    tags,
    rarity: 'Common',
    description: 'Test material.',
    ...extra,
  };
}

describe('OTA-205 — repair substitution via list-based helpers', () => {
  // Matches the real Chestplate repair cost: 2 Patched Cloth + 2 Scrap Metal.
  const chestRepair: Array<{ name: string; quantity: number }> = [
    { name: 'Patched Cloth', quantity: 2 },
    { name: 'Scrap Metal', quantity: 2 },
  ];

  it('player with NO Patched Cloth but enough cloth-tag substitutes can repair', () => {
    const inv: InventoryItem[] = [
      mkMisc('Scrap Metal', ['metal'], 11),
      mkMisc('Cloth Scrap', ['fiber', 'junk', 'scrap']),
      mkMisc('Spider Silk', ['organic', 'fiber']),
      mkMisc('Mud Cloth', ['loot', 'cloth']),
    ];
    expect(missingIngredientsList(chestRepair, inv)).toHaveLength(0);
  });

  it('previewSubstitutionsList surfaces what will be consumed for the missing Patched Cloth', () => {
    const inv: InventoryItem[] = [
      mkMisc('Scrap Metal', ['metal'], 11),
      mkMisc('Cloth Scrap', ['fiber']),
      mkMisc('Spider Silk', ['organic', 'fiber']),
    ];
    const subs = previewSubstitutionsList(chestRepair, inv);
    // 2 Patched Cloth needed; subs drain Cloth Scrap first then Spider Silk.
    const ingredientNames = new Set(subs.map((s) => s.ingredient));
    expect(ingredientNames.has('Patched Cloth')).toBe(true);
    expect(ingredientNames.has('Scrap Metal')).toBe(false); // canonical covers it
    const total = subs.reduce((acc, s) => acc + s.quantity, 0);
    expect(total).toBe(2);
  });

  it('consumeIngredientsList drains canonical Scrap Metal + substitute cloth', () => {
    const inv: InventoryItem[] = [
      mkMisc('Scrap Metal', ['metal'], 5),
      mkMisc('Cloth Scrap', ['fiber']),
      mkMisc('Spider Silk', ['organic', 'fiber']),
    ];
    const after = consumeIngredientsList(inv, chestRepair);
    // Scrap Metal drained 2 from 5.
    expect(after.find((i) => i.name === 'Scrap Metal')?.quantity).toBe(3);
    // Both cloth items consumed (each was quantity 1; 2 Patched Cloth needed).
    expect(after.find((i) => i.name === 'Cloth Scrap')).toBeUndefined();
    expect(after.find((i) => i.name === 'Spider Silk')).toBeUndefined();
  });

  it('repair refuses when even substitutes are short', () => {
    const inv: InventoryItem[] = [
      mkMisc('Scrap Metal', ['metal'], 1), // need 2
      mkMisc('Cloth Scrap', ['fiber']), // need 2 (1 from this)
    ];
    const missing = missingIngredientsList(chestRepair, inv);
    expect(missing).toContainEqual({ name: 'Patched Cloth', quantity: 1 });
    expect(missing).toContainEqual({ name: 'Scrap Metal', quantity: 1 });
  });

  it('reserved items are NOT auto-consumed by the repair', () => {
    const inv: InventoryItem[] = [
      mkMisc('Scrap Metal', ['metal'], 11),
      { ...mkMisc('Mud Cloth', ['loot', 'cloth']), reservedForFusion: true },
    ];
    const missing = missingIngredientsList(chestRepair, inv);
    // Mud Cloth is locked → Patched Cloth shortage remains.
    expect(missing).toContainEqual({ name: 'Patched Cloth', quantity: 2 });
  });

  it('stolen items are NOT auto-consumed by the repair', () => {
    const inv: InventoryItem[] = [
      mkMisc('Scrap Metal', ['metal'], 11),
      { ...mkMisc('Mud Cloth', ['loot', 'cloth']), stolen: true },
    ];
    const missing = missingIngredientsList(chestRepair, inv);
    expect(missing).toContainEqual({ name: 'Patched Cloth', quantity: 2 });
  });
});

describe('OTA-205 — Aetheric Compass has a passive WIS effect', () => {
  it('the catalog row carries a passive wisdom +1', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findGearByName } = require('../app/engine/crafting');
    const row = findGearByName('Aetheric Compass');
    expect(row).not.toBeNull();
    expect(row?.effect).toBeDefined();
    expect(row?.effect?.kind).toBe('passive');
    if (row?.effect?.kind === 'passive') {
      expect(row.effect.stat).toBe('wisdom');
      expect(row.effect.bonus).toBe(1);
    }
  });

  it('aggregateInventoryPassives picks up the Compass while carried', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { aggregateInventoryPassives } = require('../app/engine/itemEffect');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findGearByName } = require('../app/engine/crafting');
    const bonus = aggregateInventoryPassives(['Aetheric Compass'], [findGearByName]);
    expect(bonus.wisdom).toBe(1);
  });
});
