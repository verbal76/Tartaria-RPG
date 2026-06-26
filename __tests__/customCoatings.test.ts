// engine_Dev — coatings are author-extensible: a pack can define NEW coating kinds
// (beyond the built-in 5) that reuse a behavior FAMILY for combat + status while
// carrying their OWN damage type (for resistance math AND the resist they grant
// when worked into armor). Built-in 5 are unchanged.

import {
  coatingFamily, coatingDamageType, coatingStatusKind, coatingLabel, coatingBlurb, coatingDice,
} from '../app/engine/weaponCoating';
import { setCoatingsOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('engine_Dev — custom (author-defined) coatings', () => {
  afterEach(() => clearAllOverrides());

  it('built-in kinds resolve to themselves (unchanged)', () => {
    for (const k of ['poison', 'acid', 'corruption', 'electrical', 'burn'] as const) {
      expect(coatingFamily(k)).toBe(k);
      expect(coatingDamageType(k)).toBe(k);
      expect(coatingStatusKind(k)).toBe(`${k}_coat`);
    }
  });

  it('a custom Frost coating reuses the burn family but counts as cold', () => {
    setCoatingsOverride({
      frost: { family: 'burn', damageType: 'cold', dice: '1d6', label: 'Frostbite', blurb: 'rimes the wound', lootLabel: 'Frostbitten' },
    });
    expect(coatingFamily('frost')).toBe('burn');         // behavior family
    expect(coatingDamageType('frost')).toBe('cold');     // resistance / armor-resist type
    expect(coatingStatusKind('frost')).toBe('burn_coat'); // maps to a REAL status (no dangling)
    expect(coatingLabel('frost')).toBe('Frostbite');
    expect(coatingBlurb('frost')).toBe('rimes the wound');
    expect(coatingDice('frost')).toBe('1d6');
  });

  it('a custom coating with no family/damageType falls back sanely', () => {
    setCoatingsOverride({ mystery: { label: 'Mysterious' } });
    expect(coatingFamily('mystery')).toBe('burn'); // default behavior family
    expect(coatingDamageType('mystery')).toBe('mystery'); // defaults to the id
    expect(coatingDice('mystery')).toBe('1d4'); // default dice
  });
});
