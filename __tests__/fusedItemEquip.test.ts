// OTA-224 — three bugs from the "I made a weapon with the fuse
// crucible yay, can't use it boo" playtest paste.
//
// 1) "Resonant undefined" — deterministic synth indexed into the
//    suffix pool with a negative number (JS signed `>>` shift on
//    a hash ≥ 2^31). Fixed by switching to `>>>` (unsigned shift)
//    + Math.abs() on the theme index.
//
// 2) Fused weapon shows no equip:main/equip:off — validSlotsForItem
//    looks the name up in the WEAPONS catalog and "Resonant <suffix>"
//    isn't there. New early branch reads `item.uniqueStats.kind`
//    and routes to the correct slot.
//
// 3) Fused item shows ◆ + save-for-fusion action — fused items are
//    catalog-absent BY DESIGN but they aren't "inferred" in the
//    OTA-191 sense. New isInferredInventoryItem helper guards
//    against treating uniqueStats-bearing items as inferred.

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

import { synthesizeFusionDeterministic } from '../app/engine/itemFusion';
import { validSlotsForItem } from '../app/engine/equipment';
import { isInferredInventoryItem } from '../app/engine/crafting';
import type { InventoryItem, UniqueItemStats } from '../app/engine/types';

function mkInferred(name: string, tags: string[]): InventoryItem {
  return {
    id: `i_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind: 'misc',
    quantity: 1,
    tags,
    rarity: 'Common',
    description: 'inferred test',
    reservedForFusion: true,
  };
}

describe('OTA-224 — deterministic synth name no longer contains "undefined"', () => {
  it('never produces a name with "undefined" across many input sets', () => {
    // Generate many fusion result names with varied inputs to trip
    // any hash-edge case. Pre-fix, ~1 in 8 hash values produced an
    // out-of-bounds suffix index (negative).
    const tagSets = [
      ['aether', 'cloth', 'improvised'],
      ['metal', 'fiber', 'organic'],
      ['cloth', 'fiber', 'organic'],
      ['aether', 'crystal', 'metal'],
      ['stone', 'wood', 'metal'],
      ['organic', 'bone', 'aether'],
      ['cloth', 'fiber', 'organic', 'aether', 'metal'],
      ['improvised', 'metal', 'wood'],
    ];
    const names: string[] = [];
    for (const tags of tagSets) {
      const inputs = tags.map((t) => mkInferred(`Test ${t} Item ${tags.length}`, [t]));
      const r = synthesizeFusionDeterministic(inputs, tags);
      names.push(r.name);
    }
    for (const name of names) {
      expect(name).not.toMatch(/undefined/i);
      expect(name.length).toBeGreaterThan(3);
    }
  });

  it('the specific playtest input (Aetheric Cog + Mud Cloth + Tortoise Shell) produces a valid name', () => {
    const inputs = [
      mkInferred('Aetheric Cog', ['loot', 'improvised', 'aether']),
      mkInferred('Mud Cloth', ['loot', 'cloth']),
      mkInferred('Tortoise Shell', ['loot', 'improvised']),
    ];
    const r = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised']);
    expect(r.name).not.toMatch(/undefined/i);
    expect(r.name.split(' ').length).toBe(2); // "<Theme> <Suffix>"
  });
});

describe('OTA-224 — validSlotsForItem honors uniqueStats on fused weapons', () => {
  it('a fused weapon (kind:weapon, uniqueStats present) returns [main, off]', () => {
    const fused: InventoryItem = {
      id: 'fused_1',
      name: 'Resonant Cleaver',
      kind: 'weapon',
      quantity: 1,
      tags: ['fused', 'unique', 'aetheric'],
      rarity: 'Rare',
      description: 'A fused weapon.',
      durability: { current: 30, max: 30 },
      uniqueStats: {
        kind: 'weapon',
        rarity: 'Rare',
        durability: { current: 30, max: 30 },
        damageDice: '1d8',
        damageType: 'aetheric',
        scalesWith: 'intelligence',
      },
    };
    const slots = validSlotsForItem(fused);
    expect(slots).toContain('main');
    expect(slots).toContain('off');
  });

  it('a fused armor (kind:armor, uniqueStats.armorSlot:chest) returns [chest]', () => {
    const fused: InventoryItem = {
      id: 'fused_2',
      name: 'Cinderhalt Brace',
      kind: 'armor',
      quantity: 1,
      tags: ['fused', 'unique'],
      rarity: 'Rare',
      description: 'X',
      durability: { current: 30, max: 30 },
      uniqueStats: {
        kind: 'armor',
        rarity: 'Rare',
        durability: { current: 30, max: 30 },
        armorSlot: 'chest',
        acBonus: 2,
      },
    };
    expect(validSlotsForItem(fused)).toEqual(['chest']);
  });

  it('a fused dog_armor returns [] (dog routing handled by [fits dog] tap)', () => {
    const fused: InventoryItem = {
      id: 'fused_3',
      name: 'Reclaimer Vigil',
      kind: 'dog_armor',
      quantity: 1,
      tags: ['fused', 'unique'],
      rarity: 'Rare',
      description: 'X',
      uniqueStats: {
        kind: 'dog_armor',
        rarity: 'Rare',
        durability: { current: 30, max: 30 },
        acBonus: 2,
      },
    };
    expect(validSlotsForItem(fused)).toEqual([]);
  });
});

describe('OTA-224 — isInferredInventoryItem treats fused items as NOT inferred', () => {
  it('a fused item with uniqueStats returns false (no ◆ marker, no save-for-fusion)', () => {
    const fused: { name: string; uniqueStats: UniqueItemStats } = {
      name: 'Resonant Cleaver',
      uniqueStats: {
        kind: 'weapon',
        rarity: 'Rare',
        durability: { current: 30, max: 30 },
        damageDice: '1d8',
        damageType: 'aetheric',
        scalesWith: 'intelligence',
      },
    };
    expect(isInferredInventoryItem(fused)).toBe(false);
  });

  it('a plain inferred item (no uniqueStats) returns true', () => {
    expect(isInferredInventoryItem({ name: 'Whisper Marrow' })).toBe(true);
  });

  it('a catalog item returns false', () => {
    expect(isInferredInventoryItem({ name: 'Trail Rations' })).toBe(false);
  });
});
