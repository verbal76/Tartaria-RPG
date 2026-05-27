import { applyDamageTypeModifier, applyArmorResistance } from '../app/engine/crafting';

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

describe('applyArmorResistance — armor halves matching incoming damage', () => {
  const aetherstoneResists = ['aetheric'];
  it('halves incoming damage when armor lists the type', () => {
    const r = applyArmorResistance(8, 'aetheric', aetherstoneResists);
    expect(r.damage).toBe(4);
    expect(r.blocked).toBe(true);
  });
  it('passes through damage for unmatched types', () => {
    const r = applyArmorResistance(8, 'slashing', aetherstoneResists);
    expect(r.damage).toBe(8);
    expect(r.blocked).toBe(false);
  });
  it('aggregates across pieces — first match still halves', () => {
    const r = applyArmorResistance(10, 'burn', ['poison', 'burn', 'radiation']);
    expect(r.damage).toBe(5);
    expect(r.blocked).toBe(true);
  });
  it('returns unchanged when resistances list is empty or type is null', () => {
    expect(applyArmorResistance(8, 'aetheric', []).damage).toBe(8);
    expect(applyArmorResistance(8, null, aetherstoneResists).damage).toBe(8);
  });
});
