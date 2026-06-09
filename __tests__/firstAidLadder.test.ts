import { resolveItemEffect } from '../app/engine/itemEffect';
import { findGearByName, RECIPES } from '../app/engine/crafting';

// OTA-371 — rag-based first-aid ladder (RE1-style). A rag (Patched
// Cloth) is the base of every tier; adding more/better ingredients
// makes a stronger kit:
//   Field Dressing  (rag + red cap)                 → +10 HP, cure bleed
//   First Aid Kit   (rag + silk + salve)            → +25 HP, +10 stam, cure bleed
//   Trauma Kit      (rag + silk + salve + red cap)  → +45 HP, +15 stam, cure bleed

const LADDER: Array<{ name: string; heal: number; bleed: boolean }> = [
  { name: 'Field Dressing', heal: 10, bleed: true },
  { name: 'First Aid Kit', heal: 25, bleed: true },
  { name: 'Trauma Kit', heal: 45, bleed: true },
];

describe('first-aid ladder — effects', () => {
  it.each(LADDER)('$name heals $heal and cures bleed', ({ name, heal, bleed }) => {
    const fx = resolveItemEffect(name, [findGearByName]);
    expect(fx?.kind).toBe('consumable');
    if (fx?.kind === 'consumable') {
      expect(fx.healHP).toBe(heal);
      expect(fx.cureBleed).toBe(bleed);
    }
  });

  it('heal scales monotonically up the ladder', () => {
    const heals = LADDER.map((t) => {
      const fx = resolveItemEffect(t.name, [findGearByName]);
      return fx?.kind === 'consumable' ? (fx.healHP ?? 0) : 0;
    });
    expect(heals).toEqual([...heals].sort((a, b) => a - b));
    expect(new Set(heals).size).toBe(heals.length); // strictly increasing
  });
});

describe('first-aid ladder — recipes', () => {
  it('every tier is crafted from a rag (Patched Cloth), one recipe per result', () => {
    for (const { name } of LADDER) {
      const matches = RECIPES.filter((r) => r.result === name);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.ingredients.some((i) => i.name === 'Patched Cloth')).toBe(true);
    }
  });

  it('each tier up needs at least as many ingredients (adding to it makes it stronger)', () => {
    const counts = LADDER.map((t) => {
      const r = RECIPES.find((x) => x.result === t.name)!;
      return r.ingredients.reduce((n, i) => n + i.quantity, 0);
    });
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
  });
});
