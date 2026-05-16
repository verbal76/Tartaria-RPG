import { isAreaSearch, rollAreaSearch } from '../app/engine/areaSearch';

describe('areaSearch', () => {
  it('recognises spatial / surface / direction terms', () => {
    expect(isAreaSearch('the mud')).toBe(true);
    expect(isAreaSearch('the rubble')).toBe(true);
    expect(isAreaSearch('the doorway')).toBe(true);
    expect(isAreaSearch('the area to my left')).toBe(true);
    expect(isAreaSearch('the area to my right')).toBe(true);
    expect(isAreaSearch('behind me')).toBe(true);
    expect(isAreaSearch('the floor')).toBe(true);
    expect(isAreaSearch('the corner')).toBe(true);
    expect(isAreaSearch('the wagon')).toBe(true);
  });

  it('rejects object-specific terms not in the area vocab', () => {
    expect(isAreaSearch('the obelisk')).toBe(false);
    expect(isAreaSearch('the handprint')).toBe(false);
    expect(isAreaSearch('the merchant')).toBe(false);
  });

  it('rollAreaSearch produces a valid outcome shape', () => {
    for (let i = 0; i < 50; i++) {
      const r = rollAreaSearch('the mud');
      expect(['nothing', 'material', 'tc', 'hook']).toContain(r.kind);
      expect(typeof r.line).toBe('string');
      expect(r.line.length).toBeGreaterThan(0);
      if (r.kind === 'material') {
        expect(r.itemName.length).toBeGreaterThan(0);
        expect(['Common', 'Uncommon', 'Rare', 'Legendary']).toContain(r.rarity);
      }
      if (r.kind === 'tc') {
        expect(r.amount).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('rollAreaSearch produces a varied distribution over many rolls', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const r = rollAreaSearch('the mud');
      counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    }
    // Expect all four outcomes to land at least once across 400 rolls.
    expect(counts.nothing).toBeGreaterThan(0);
    expect(counts.material).toBeGreaterThan(0);
    expect(counts.tc).toBeGreaterThan(0);
    expect(counts.hook).toBeGreaterThan(0);
  });
});
