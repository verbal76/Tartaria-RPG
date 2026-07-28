// OTA-965 — v2 audit SEV-2: loot resolution reused the AMBIENT-NOUN alias map, whose
// pickup-oriented entries misfire on loot names ('aether residue' -> 'Aether Dust'
// meant the real recipe material Aether Residue could never drop; 'Obsidian Shard' ->
// 'Aetheric Shard' stranded the Obsidian Sentinel at 3 TC). Loot resolution now checks
// exact (alias-free) catalog membership FIRST and keeps its own short synonym list.
import { resolveLootItem, findCatalogItem } from '../app/engine/crafting';

describe('OTA-965 — exact catalog names always win over pickup aliases', () => {
  it('Aether Residue drops as ITSELF again (the real recipe material, 6 enemy sources)', () => {
    const r = resolveLootItem('Aether Residue');
    expect(r.name).toBe('Aether Residue');
    expect(r.tags).not.toContain('trophy');
    expect(resolveLootItem('aether residue').name).toBe('Aether Residue'); // case still folds
  });

  it('Obsidian Shard is no longer rerouted to a 3-TC Aetheric Shard — it trophies at tier', () => {
    const r = resolveLootItem('Obsidian Shard', 'Legendary' as never);
    expect(r.name).toBe('Obsidian Shard');
    expect(r.rarity).toBe('Legendary');
    expect(r.tags).toEqual(['trophy']);
  });

  it('the loot-name synonym list still heals the provable splits', () => {
    expect(resolveLootItem('Aetherwing').name).toBe('Aether Wing');
    expect(resolveLootItem('Aetheric Residue').name).toBe('Aether Residue');
    expect(resolveLootItem('Aetheric Crystal').name).toBe('Aether Crystal');
  });

  it('the ambient PICKUP path keeps its aliases (scene-noun context, unchanged)', () => {
    expect(findCatalogItem('rope coil')?.name).toBe('Climbing Rope');
    expect(findCatalogItem('rope coil', { aliases: false })).toBeNull();
  });
});
