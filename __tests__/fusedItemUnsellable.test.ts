import { isUnsellable, sellPriceFor } from '../app/engine/sellPrice';
import { applyFusion, synthesizeFusionDeterministic, gateFusion, type FactionTheme } from '../app/engine/itemFusion';
import type { InventoryItem } from '../app/engine/types';

// arb107 — red-team fix: Crucible-fused items are UNSELLABLE. They fell
// through to the RARITY_BASE sell fallback (96 TC for a forced-Legendary
// faction fuse) while costing almost nothing to mint — an unbounded money
// pump. Both faction-themed and plain fused items carry the `fused` tag.

function scrap(id: string, name: string, tags: string[]): InventoryItem {
  return { id, name, kind: 'misc', quantity: 1, tags, reservedForFusion: true };
}
const SCRAPS: InventoryItem[] = [
  scrap('s1', 'Inferred Aether Sliver', ['aether']),
  scrap('s2', 'Inferred Iron Strip', ['metal', 'iron']),
  scrap('s3', 'Inferred Bone Shard', ['bone', 'organic']),
];

describe('fused items are unsellable (arb107)', () => {
  it('a plain fused item is unsellable', () => {
    const gate = gateFusion(SCRAPS);
    const result = synthesizeFusionDeterministic(gate.inputs, gate.tagProfile);
    const { fused } = applyFusion(SCRAPS, gate.inputs, result, 'seedA');
    expect(fused.tags).toContain('fused');
    expect(isUnsellable(fused)).toBe(true);
  });

  it('a faction-themed (Legendary) fused item is unsellable', () => {
    const gate = gateFusion(SCRAPS);
    const result = synthesizeFusionDeterministic(gate.inputs, gate.tagProfile);
    const theme: FactionTheme = { id: 'mud_monarchs', label: 'Mud Monarchs', catalystId: 'x', rarity: 'Legendary' };
    const { fused } = applyFusion(SCRAPS, gate.inputs, result, 'seedB', theme);
    expect(fused.rarity).toBe('Legendary');
    expect(isUnsellable(fused)).toBe(true);
  });

  it('non-fused gear with the same rarity is STILL sellable (no collateral)', () => {
    const normal: InventoryItem = {
      id: 'n1', name: 'Court Standards Cuirass', kind: 'armor', quantity: 1,
      tags: ['armor', 'faction_gear', 'mud_monarchs'], rarity: 'Uncommon',
    };
    expect(isUnsellable(normal)).toBe(false);
    expect(sellPriceFor(normal, null)).toBeGreaterThan(0);
  });
});
