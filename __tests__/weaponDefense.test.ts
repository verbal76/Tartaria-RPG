import { WEAPONS, findWeaponByName } from '../app/engine/crafting';

describe('weapon defense values', () => {
  it('every weapon declares a defense field', () => {
    for (const w of WEAPONS) {
      expect(typeof w.defense).toBe('number');
    }
  });

  it('ranged weapons have defense 0 (cannot block)', () => {
    const ranged = WEAPONS.filter((w) => w.weaponKind === 'ranged');
    expect(ranged.length).toBeGreaterThan(0);
    for (const w of ranged) {
      expect(w.defense).toBe(0);
    }
  });

  it('heavy melee weapons (Rare+) have higher defense than knives', () => {
    const knife = findWeaponByName('Pocket Knife');
    const heavy = findWeaponByName('Sentinel Cleaver');
    expect(knife?.defense).toBeDefined();
    expect(heavy?.defense).toBeDefined();
    expect(heavy!.defense!).toBeGreaterThan(knife!.defense!);
  });

  it("Founder's Edge has top-tier defense", () => {
    const founder = findWeaponByName("Founder's Edge");
    expect(founder?.defense).toBeGreaterThanOrEqual(5);
  });
});
