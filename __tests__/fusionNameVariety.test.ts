// arb114 — the deterministic Crucible namer (used whenever Qwen is off — which is
// the player's case) was repeating weapon names because the word banks were tiny
// (~20 combos). With the expanded banks, 200 distinct input sets should yield a
// large number of distinct names.

import { synthesizeFusionDeterministic } from '../app/engine/itemFusion';
import type { InventoryItem } from '../app/engine/types';

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
