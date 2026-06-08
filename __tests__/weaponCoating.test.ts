import { isCoatableWeapon, coatedDisplayName, coatingBlurb } from '../app/engine/weaponCoating';
import { resolveItemEffect } from '../app/engine/itemEffect';
import { findGearByName, RECIPES } from '../app/engine/crafting';

// OTA-360 — weapon coatings. A consumable substance (poison / acid /
// corruption) painted onto a single weapon instance. Permanent for
// the weapon's life: survives a repair, lost only when the weapon
// breaks. Coatability is gated on damage type (an edge or a point
// carries the substance), the display name is derived (the base
// `name` is never renamed so stat lookup still resolves), and the
// three coating consumables + recipes are authored data.

describe('isCoatableWeapon — only edges and points hold a coating', () => {
  it('a bladed (slashing) melee weapon is coatable', () => {
    expect(isCoatableWeapon('Rusted Blade')).toBe(true);
  });
  it('a piercing melee weapon is coatable', () => {
    expect(isCoatableWeapon('Stone Spear')).toBe(true);
  });
  it('a piercing ranged weapon (arrows / bolts) is coatable', () => {
    expect(isCoatableWeapon('Salvaged Bow')).toBe(true);
  });
  it('a bludgeoning melee weapon is NOT coatable (no edge to carry it)', () => {
    expect(isCoatableWeapon('Mud-fist Wraps')).toBe(false);
  });
  it('an energy ranged weapon is NOT coatable (fires no point)', () => {
    expect(isCoatableWeapon('Rail Cannon')).toBe(false);
  });
  it('a non-weapon name is not coatable', () => {
    expect(isCoatableWeapon('Scrap Metal')).toBe(false);
    expect(isCoatableWeapon('')).toBe(false);
  });
});

describe('coatedDisplayName — derived, never renames the base item', () => {
  it('prefixes the coating label when one is applied', () => {
    expect(
      coatedDisplayName({ name: 'Battle Axe', coating: { kind: 'corruption', dice: '1d4', label: 'Corrupted' } }),
    ).toBe('Corrupted Battle Axe');
  });
  it('returns the plain name when uncoated', () => {
    expect(coatedDisplayName({ name: 'Battle Axe' })).toBe('Battle Axe');
  });
});

describe('coatingBlurb — one line per kind', () => {
  it('describes each coating kind distinctly', () => {
    expect(coatingBlurb('poison')).toMatch(/poison/i);
    expect(coatingBlurb('acid')).toMatch(/armor/i);
    expect(coatingBlurb('corruption')).toMatch(/corruption/i);
  });
});

describe('coating consumables carry a coating effect spec', () => {
  const cases: Array<[string, 'poison' | 'acid' | 'corruption', string]> = [
    ['Poison Vial', 'poison', 'Poisoned'],
    ['Acid Flask', 'acid', 'Acid-Etched'],
    ['Corruption Tonic', 'corruption', 'Corrupted'],
  ];
  it.each(cases)('%s resolves a %s coating spec', (name, kind, label) => {
    const fx = resolveItemEffect(name, [findGearByName]);
    expect(fx?.kind).toBe('consumable');
    if (fx?.kind === 'consumable') {
      expect(fx.coating).toBeDefined();
      expect(fx.coating?.kind).toBe(kind);
      expect(fx.coating?.label).toBe(label);
      expect(fx.coating?.dice).toBe('1d4');
    }
  });

  it('every coating consumable has a craftable recipe', () => {
    for (const [name] of cases) {
      const recipe = RECIPES.find((r) => r.result === name);
      expect(recipe).toBeDefined();
      expect((recipe?.ingredients.length ?? 0)).toBeGreaterThan(0);
    }
  });
});
