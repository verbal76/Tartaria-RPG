// arb116 — rarity-driven armor resistance ladder: Common 0–1, Uncommon 1, Rare
// 2, Legendary 3 — applied across the WHOLE armor catalog (deterministically),
// while preserving hand-authored resistances.

import { armorResistances, fusedArmorResistances, ARMOR } from '../app/engine/crafting';
import type { CatalogArmor } from '../app/engine/crafting';

describe('armor resistance ladder', () => {
  it('Uncommon ≥1, Rare ≥2, Legendary ≥3 across the whole catalog', () => {
    for (const a of ARMOR as CatalogArmor[]) {
      // OTA-912 — the Skyreacher set is the deliberate exception: the ladder is
      // suppressed so it resists only its baseline (cold) and leaves its slots
      // open for player choice. Skip it here (covered by greatClimbs.test.ts).
      if ((a.tags ?? []).some((t) => t.toLowerCase() === 'skyreacher')) continue;
      const n = armorResistances(a).length;
      if (a.rarity === 'Uncommon') expect(n).toBeGreaterThanOrEqual(1);
      if (a.rarity === 'Rare') expect(n).toBeGreaterThanOrEqual(2);
      if (a.rarity === 'Legendary') expect(n).toBeGreaterThanOrEqual(3);
      // Commons are 0 or 1.
      if (a.rarity === 'Common') expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('some Commons carry a resistance and some do not (the coin-flip)', () => {
    const commons = (ARMOR as CatalogArmor[]).filter((a) => a.rarity === 'Common');
    const withResist = commons.filter((a) => armorResistances(a).length > 0).length;
    expect(withResist).toBeGreaterThan(0);
    expect(withResist).toBeLessThan(commons.length); // not ALL of them
  });

  it('is deterministic and preserves hand-authored resistances', () => {
    for (const a of ARMOR as CatalogArmor[]) {
      const a1 = armorResistances(a);
      const a2 = armorResistances(a);
      expect(a1).toEqual(a2); // stable
      for (const r of a.resistances) expect(a1).toContain(r); // authored kept
    }
  });

  it('derived resistances are all real damage types', () => {
    const valid = new Set(['slashing', 'piercing', 'bludgeoning', 'aetheric', 'burn', 'cold', 'poison']);
    for (const a of ARMOR as CatalogArmor[]) {
      for (const r of armorResistances(a)) expect(valid.has(r)).toBe(true);
    }
  });

  it('FUSED armor ladders too: Rare ≥2, Legendary ≥3, seeded from the synth resistance', () => {
    const rare = fusedArmorResistances('Resonant Mantle', 'Rare', 'aetheric');
    expect(rare.length).toBeGreaterThanOrEqual(2);
    expect(rare).toContain('aetheric'); // synth seed preserved
    const leg = fusedArmorResistances('Iron-Bound Bulwark', 'Legendary', 'slashing');
    expect(leg.length).toBeGreaterThanOrEqual(3);
    expect(leg).toContain('slashing');
    // No synth resistance? Still ladders by name/rarity.
    expect(fusedArmorResistances('Bone-Stitched Shroud', 'Legendary', null).length).toBeGreaterThanOrEqual(3);
  });
});
