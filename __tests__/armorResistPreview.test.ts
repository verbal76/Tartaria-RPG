// engine_Dev — coating-applied armor resists (addedResists) now show in the item's
// stat preview, tagged "(coated)" so they read distinct from native/laddered resists.
// Pure helper test (no store needed).

import { getItemPreviewForInstance } from '../app/components/itemPreview';
import type { UniqueItemStats } from '../app/engine/types';

describe('armor resist preview reflects coating-applied resists', () => {
  it('appends an added resist to an existing Resists line, tagged (coated)', () => {
    const u: UniqueItemStats = {
      kind: 'armor', armorSlot: 'chest', rarity: 'Rare', acBonus: 3,
      resistance: 'slashing', durability: { current: 20, max: 20 },
    } as UniqueItemStats;
    const p = getItemPreviewForInstance({ name: 'Fused Chestplate', uniqueStats: u, addedResists: ['poison'] });
    const resistLine = p.stats.find((s) => s.startsWith('Resists:'))!;
    expect(resistLine).toContain('slashing');
    expect(resistLine).toContain('poison (coated)');
  });

  it('inserts a Resists line when the piece had none', () => {
    const p = getItemPreviewForInstance({
      name: 'Plain Test Vest', kind: 'armor', durability: { current: 10, max: 10 }, addedResists: ['acid'],
    } as Parameters<typeof getItemPreviewForInstance>[0]);
    expect(p.stats.some((s) => /^Resists:.*acid \(coated\)/.test(s))).toBe(true);
  });

  it('shows multiple coated resists', () => {
    const u: UniqueItemStats = {
      kind: 'armor', armorSlot: 'legs', rarity: 'Common', acBonus: 1,
      durability: { current: 15, max: 15 },
    } as UniqueItemStats;
    const p = getItemPreviewForInstance({ name: 'Greaves', uniqueStats: u, addedResists: ['poison', 'burn'] });
    const resistLine = p.stats.find((s) => s.startsWith('Resists:'))!;
    expect(resistLine).toContain('poison (coated)');
    expect(resistLine).toContain('burn (coated)');
  });

  it('leaves the preview unchanged when there are no added resists', () => {
    const u: UniqueItemStats = {
      kind: 'armor', armorSlot: 'chest', rarity: 'Common', acBonus: 2,
      durability: { current: 12, max: 12 },
    } as UniqueItemStats;
    const p = getItemPreviewForInstance({ name: 'Vest', uniqueStats: u });
    expect(p.stats.some((s) => s.includes('(coated)'))).toBe(false);
  });
});
