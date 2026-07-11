// arb114 — the deterministic Crucible namer (used whenever Qwen is off — which is
// the player's case) was repeating weapon names because the word banks were tiny
// (~20 combos). With the expanded banks, 200 distinct input sets should yield a
// large number of distinct names.

import { synthesizeFusionDeterministic, synthesizeFusionNameViaQwen, migrateFusedName, isLowQualityForgeName } from '../app/engine/itemFusion';
import type { InventoryItem, UniqueItemStats } from '../app/engine/types';

const mk = (id: string, name: string, tags: string[]): InventoryItem =>
  ({ id, name, kind: 'misc', rarity: 'Common', quantity: 1, reservedForFusion: true, tags } as InventoryItem);

describe('fusion name variety (deterministic namer)', () => {
  it('200 different aether-weapon input sets produce many distinct names', () => {
    const names = new Set<string>();
    for (let i = 0; i < 200; i++) {
      // Distinct input ids/names → distinct fusionInputHash → (ideally) distinct name.
      const inputs = [
        mk(`a${i}`, `Aether Sliver ${i}`, ['aether']),
        mk(`b${i}`, `Crystal Bit ${i}`, ['crystal']),
        mk(`c${i}`, `Resonant Core ${i}`, ['aether', 'crystal']),
      ];
      names.add(synthesizeFusionDeterministic(inputs, ['aether', 'crystal']).name);
    }
    // The old 4×5 banks capped aether-weapons at ~20 combos; the expanded banks
    // clear that comfortably. (Birthday collisions keep it under the theoretical max.)
    expect(names.size).toBeGreaterThan(60);
  });

  it('is still deterministic — the same input set always yields the same name', () => {
    const inputs = [
      mk('x', 'Aether Sliver', ['aether']),
      mk('y', 'Crystal Bit', ['crystal']),
      mk('z', 'Resonant Core', ['aether', 'crystal']),
    ];
    const a = synthesizeFusionDeterministic(inputs, ['aether', 'crystal']).name;
    const b = synthesizeFusionDeterministic(inputs, ['aether', 'crystal']).name;
    expect(a).toBe(b);
  });
});

describe('OTA-1048 — the Qwen namer rejects echoed / low-quality names', () => {
  const mockQwen = (reply: string) => ({ isReady: () => true, generate: async () => reply });
  const dogStats = { kind: 'dog_armor', rarity: 'Rare', acBonus: 3 } as unknown as UniqueItemStats;
  const inputs = [mk('a', 'Alpha Fur', ['organic'])];

  it('rejects the prompt-echo name ("A Rare Dog Armor (+3 AC)")', async () => {
    const r = await synthesizeFusionNameViaQwen(dogStats, inputs, ['organic'],
      mockQwen('{"name":"A Rare Dog Armor (+3 AC)","description":"A sturdy vest of scraps."}'));
    expect(r).toBeNull();
  });

  it('rejects a bare "<theme> Armor" name', async () => {
    const r = await synthesizeFusionNameViaQwen(dogStats, inputs, ['organic'],
      mockQwen('{"name":"Aetheric Armor","description":"A humming vest."}'));
    expect(r).toBeNull();
  });

  it('accepts a clean 2-4 word evocative name', async () => {
    const r = await synthesizeFusionNameViaQwen(dogStats, inputs, ['organic'],
      mockQwen('{"name":"Marrow Ward","description":"A vest strung from cured hide."}'));
    expect(r?.name).toBe('Marrow Ward');
  });
});

describe('OTA-1048 — migrateFusedName re-mints an existing low-quality name on load', () => {
  const fused = (name: string): InventoryItem =>
    ({
      id: 'fx', name, kind: 'dog_armor', quantity: 1, rarity: 'Rare',
      tags: ['fused', 'unique', 'organic'],
      uniqueStats: { kind: 'dog_armor', rarity: 'Rare', acBonus: 3 } as unknown as UniqueItemStats,
    } as InventoryItem);

  it('renames "A Rare Dog Armor (+3 AC)" to a clean deterministic name', () => {
    const out = migrateFusedName(fused('A Rare Dog Armor (+3 AC)'));
    expect(out.name).not.toBe('A Rare Dog Armor (+3 AC)');
    expect(isLowQualityForgeName(out.name)).toBe(false);
  });

  it('leaves a clean name alone (idempotent)', () => {
    expect(migrateFusedName(fused('Marrow Wrap')).name).toBe('Marrow Wrap');
  });
});
