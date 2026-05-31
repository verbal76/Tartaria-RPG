// Scrap engine — disassemble built items into stock materials.

import { canScrap, scrapOutputFor } from '../app/engine/scrapEngine';
import type { InventoryItem } from '../app/engine/types';

function mk(name: string, kind: InventoryItem['kind'], tags: string[] = []): InventoryItem {
  return { id: `t_${name}`, name, kind, rarity: 'Common', quantity: 1, tags };
}

describe('canScrap', () => {
  it('accepts weapons / armor / relics', () => {
    expect(canScrap(mk('Rusted Blade', 'weapon'))).toBe(true);
    expect(canScrap(mk('Patched Cuirass', 'armor'))).toBe(true);
    expect(canScrap(mk('Aetheric Locket', 'relic'))).toBe(true);
  });

  it('accepts misc gear with material tags (Compass, Torch)', () => {
    expect(canScrap(mk('Aetheric Torch', 'misc', ['light', 'metal']))).toBe(true);
    expect(canScrap(mk('Aetheric Compass', 'misc', ['metal']))).toBe(true);
  });

  it('refuses raw stock materials (would scrap into themselves)', () => {
    expect(canScrap(mk('Scrap Metal', 'misc', ['metal']))).toBe(false);
    expect(canScrap(mk('Stick', 'misc', ['wood']))).toBe(false);
    expect(canScrap(mk('Small Rock', 'misc', ['stone']))).toBe(false);
    expect(canScrap(mk('Aetheric Shard', 'misc', ['aether', 'crystal']))).toBe(false);
  });

  it('refuses consumables', () => {
    expect(canScrap(mk('Trail Rations', 'consumable'))).toBe(false);
  });
});

describe('scrapOutputFor — every scrap yields at least one material', () => {
  it('weapons yield Scrap Metal + Stick by default', () => {
    const out = scrapOutputFor(mk('Rusted Blade', 'weapon', ['blade', 'metal']));
    const names = out.grants.map((g) => g.name);
    expect(names).toContain('Scrap Metal');
    expect(names).toContain('Stick');
  });

  it('armor yields Patched Cloth (and any tagged metal)', () => {
    const out = scrapOutputFor(mk('Patched Cuirass', 'armor', ['cloth']));
    const names = out.grants.map((g) => g.name);
    expect(names).toContain('Patched Cloth');
  });

  it('relics yield Aetheric Shard', () => {
    const out = scrapOutputFor(mk('Aetheric Locket', 'relic', ['aether']));
    const names = out.grants.map((g) => g.name);
    expect(names).toContain('Aetheric Shard');
  });

  it('stone-tagged improvised gear yields Small Rock', () => {
    const out = scrapOutputFor(mk('Cudgel', 'weapon', ['stone', 'improvised']));
    const names = out.grants.map((g) => g.name);
    expect(names).toContain('Small Rock');
  });

  it('untagged misc fallback gives Stick + Small Rock so the click is never wasted', () => {
    const out = scrapOutputFor(mk('Mystery Object', 'misc', []));
    expect(out.grants.length).toBeGreaterThan(0);
  });

  it('summary string lists every grant', () => {
    const out = scrapOutputFor(mk('Aetheric Torch', 'misc', ['metal', 'aether']));
    expect(out.summary.length).toBeGreaterThan(0);
    for (const g of out.grants) {
      expect(out.summary).toContain(g.name);
    }
  });

  it('de-dupes grants (two paths to Scrap Metal collapse to one)', () => {
    const out = scrapOutputFor(mk('Iron Blade', 'weapon', ['metal', 'blade', 'iron']));
    const scrapEntries = out.grants.filter((g) => g.name === 'Scrap Metal');
    expect(scrapEntries.length).toBe(1);
  });
});
