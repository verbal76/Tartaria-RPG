import { weaponHpBonus, gearHpBonus, armorHpBonus } from '../app/engine/equipment';

// arb-fix — weapons with a "Grants +X HP" rebalance effect now carry a
// structured { stat:'hp', amount } bonus, read by weaponHpBonus and folded
// into the unified gearHpBonus the equip/unequip handlers use for hpMax.
describe('weapon max-HP grants', () => {
  it('Titan Shield grants +35 HP', () => {
    expect(weaponHpBonus('Titan Shield')).toBe(35);
  });

  it('Mud Royal Shield grants +50 HP', () => {
    expect(weaponHpBonus('Mud Royal Shield')).toBe(50);
  });

  it('a plain weapon with no HP text grants 0', () => {
    expect(weaponHpBonus('Aetheric Pike')).toBe(0);
  });

  it('unknown / null names grant 0', () => {
    expect(weaponHpBonus('Not A Weapon')).toBe(0);
    expect(weaponHpBonus(null)).toBe(0);
    expect(weaponHpBonus(undefined)).toBe(0);
  });

  it('gearHpBonus resolves a weapon (Titan Shield) the same as armor', () => {
    expect(gearHpBonus('Titan Shield')).toBe(35);
    // armorHpBonus alone does NOT see a weapon — the unification lives in gearHpBonus.
    expect(armorHpBonus('Titan Shield')).toBe(0);
  });
});
