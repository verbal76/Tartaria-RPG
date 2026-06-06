// arb92 — trader sell-quantities. Food stocks up to 5, materials up to 10,
// everything else stays one-of. Locks the player's explicit caps:
// "no more than 5 of a food item, and no more than 10 of a material".
import { rollOfferQuantity } from '../app/engine/vendors';

describe('vendor offer quantities', () => {
  it('food never exceeds 5 and is at least 1', () => {
    for (let i = 0; i < 500; i++) {
      const q = rollOfferQuantity('Speckled Egg'); // gear.json food
      expect(q).toBeGreaterThanOrEqual(1);
      expect(q).toBeLessThanOrEqual(5);
    }
  });

  it('materials never exceed 10 and are at least 1', () => {
    for (let i = 0; i < 500; i++) {
      const q = rollOfferQuantity('Scrap Metal'); // materials.json
      expect(q).toBeGreaterThanOrEqual(1);
      expect(q).toBeLessThanOrEqual(10);
    }
  });

  it('non food/material items are one-of', () => {
    // A weapon / unknown name is not a perishable or crafting stock.
    expect(rollOfferQuantity('Rusted Blade')).toBe(1);
    expect(rollOfferQuantity('Definitely Not A Real Item')).toBe(1);
  });

  it('can roll more than one for food and material (multiples exist)', () => {
    const foods = Array.from({ length: 200 }, () => rollOfferQuantity('Speckled Egg'));
    const mats = Array.from({ length: 200 }, () => rollOfferQuantity('Scrap Metal'));
    expect(Math.max(...foods)).toBeGreaterThan(1);
    expect(Math.max(...mats)).toBeGreaterThan(1);
  });
});
