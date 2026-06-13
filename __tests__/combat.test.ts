import { applyDamageTypeModifier, applyArmorResistance, armorResistanceFraction, MAX_ARMOR_RESIST } from '../app/engine/crafting';

describe('applyDamageTypeModifier — enemy resistances/weaknesses', () => {
  it('multiplies damage by 1.5 when weapon hits enemy weakness', () => {
    const r = applyDamageTypeModifier(10, 'burn', 'Mud Creature');
    expect(r.damage).toBe(15);
    expect(r.match).toBe('weak');
  });
  it('halves damage when enemy resists the type', () => {
    const r = applyDamageTypeModifier(10, 'aetheric', 'Aetheric Mutation');
    expect(r.damage).toBe(5);
    expect(r.match).toBe('resist');
  });
  it('returns unchanged damage for neutral matchups', () => {
    const r = applyDamageTypeModifier(10, 'slashing', 'Animal');
    expect(r.damage).toBe(10);
    expect(r.match).toBe('normal');
  });
  it('returns unchanged damage when type or enemy is missing', () => {
    expect(applyDamageTypeModifier(10, null, 'Animal').damage).toBe(10);
    expect(applyDamageTypeModifier(10, 'burn', null).damage).toBe(10);
  });
  it('floors resisted damage at minimum 1', () => {
    const r = applyDamageTypeModifier(1, 'aetheric', 'Aetheric Mutation');
    expect(r.damage).toBe(1);
  });
});

describe('applyArmorResistance — arb119 slot-weighted diminishing stacking', () => {
  it('a single matching piece reduces by its slot weight (chest = 35%)', () => {
    const r = applyArmorResistance(20, 'aetheric', [{ type: 'aetheric', slot: 'chest' }]);
    expect(r.damage).toBe(13); // round(20 * 0.65)
    expect(r.blocked).toBe(true);
    expect(r.fraction).toBeCloseTo(0.35, 5);
  });

  it('passes through damage for unmatched types', () => {
    const r = applyArmorResistance(20, 'slashing', [{ type: 'aetheric', slot: 'chest' }]);
    expect(r.damage).toBe(20);
    expect(r.blocked).toBe(false);
    expect(r.fraction).toBe(0);
  });

  it('chest-first → cloak-last: same piece resists MORE in a heavier slot', () => {
    const chest = applyArmorResistance(20, 'burn', [{ type: 'burn', slot: 'chest' }]);
    const cloak = applyArmorResistance(20, 'burn', [{ type: 'burn', slot: 'cloak' }]);
    expect(chest.fraction).toBeGreaterThan(cloak.fraction); // 0.35 vs 0.10
    expect(chest.damage).toBeLessThan(cloak.damage);
  });

  it('matching pieces STACK with diminishing returns', () => {
    const one = armorResistanceFraction('burn', [{ type: 'burn', slot: 'chest' }]);
    const two = armorResistanceFraction('burn', [
      { type: 'burn', slot: 'chest' }, { type: 'burn', slot: 'legs' },
    ]);
    const three = armorResistanceFraction('burn', [
      { type: 'burn', slot: 'chest' }, { type: 'burn', slot: 'legs' }, { type: 'burn', slot: 'head' },
    ]);
    // each piece adds, but each adds LESS than the last (diminishing)
    expect(two).toBeGreaterThan(one);
    expect(three).toBeGreaterThan(two);
    expect(three - two).toBeLessThan(two - one);
  });

  it('FOCUSED beats the RAINBOW: 3 pieces on one type >> 1 piece across three', () => {
    // Focused: chest+legs+head all resist piercing.
    const focused = applyArmorResistance(20, 'piercing', [
      { type: 'piercing', slot: 'chest' }, { type: 'piercing', slot: 'legs' }, { type: 'piercing', slot: 'head' },
    ]);
    // Rainbow: one piece each for three different types — only the chest matches piercing.
    const rainbow = applyArmorResistance(20, 'piercing', [
      { type: 'piercing', slot: 'chest' }, { type: 'fire', slot: 'legs' }, { type: 'slashing', slot: 'head' },
    ]);
    expect(focused.fraction).toBeGreaterThan(0.55);
    expect(rainbow.fraction).toBeCloseTo(0.35, 5);
    expect(focused.damage).toBeLessThan(rainbow.damage);
  });

  it('a slot counts once per type even if listed twice', () => {
    const dup = armorResistanceFraction('burn', [
      { type: 'burn', slot: 'chest' }, { type: 'burn', slot: 'chest' },
    ]);
    expect(dup).toBeCloseTo(0.35, 5);
  });

  it('NEVER immunity: a full focused set caps below the ceiling and always leaves ≥1 dmg', () => {
    const all = ['chest', 'legs', 'head', 'hands', 'feet', 'cloak'].map((slot) => ({ type: 'cold', slot }));
    const frac = armorResistanceFraction('cold', all);
    expect(frac).toBeLessThanOrEqual(MAX_ARMOR_RESIST);
    expect(frac).toBeLessThan(1);
    expect(applyArmorResistance(1, 'cold', all).damage).toBeGreaterThanOrEqual(1);
  });

  it('returns unchanged when resistances are empty or type is null', () => {
    expect(applyArmorResistance(8, 'aetheric', []).damage).toBe(8);
    expect(applyArmorResistance(8, null, [{ type: 'aetheric', slot: 'chest' }]).damage).toBe(8);
  });
});
