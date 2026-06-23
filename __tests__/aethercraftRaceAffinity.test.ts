// engine_Dev — the aethercraft (summon/shape/mend) race affinity is data-driven:
// an uploaded races table sets each race's aethercraftDcMod / aethercraftIntBonus,
// and raceMechanics reads it (no hardcoded Tartaria race ids). A race that sets no
// affinity casts at the base DC with no INT bonus.

import { aethercraftDcModifier, aethercraftStatBonus } from '../app/engine/raceMechanics';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

const baseRace = {
  name: 'X', baseAC: 10, racialACBonus: '', startingTCFormula: '3d6 x 10',
  startingHPBonus: 0, barehandDamage: '1d4', tags: [], traits: [], description: '', flavor: '',
};

describe('engine_Dev — data-driven aethercraft race affinity', () => {
  afterEach(() => clearAllOverrides());

  it('an uploaded race drives its summon DC modifier + INT bonus', () => {
    setTableOverride('races', [
      { ...baseRace, id: 'adept', aethercraftDcMod: -2, aethercraftIntBonus: 3 },   // gifted
      { ...baseRace, id: 'mundane', aethercraftDcMod: 4 },                          // poor at it
      { ...baseRace, id: 'plain' },                                                 // no affinity
    ]);
    expect(aethercraftDcModifier('adept')).toBe(-2);
    expect(aethercraftStatBonus('adept')).toEqual({ intelligence: 3 });
    expect(aethercraftDcModifier('mundane')).toBe(4);
    expect(aethercraftStatBonus('mundane')).toEqual({});
    expect(aethercraftDcModifier('plain')).toBe(0);
    expect(aethercraftStatBonus('plain')).toEqual({});
  });

  it('an unknown / undefined race casts at the base DC (neutral default)', () => {
    setTableOverride('races', [{ ...baseRace, id: 'only' }]);
    expect(aethercraftDcModifier('not_a_race')).toBe(0);
    expect(aethercraftDcModifier(undefined)).toBe(0);
    expect(aethercraftStatBonus('not_a_race')).toEqual({});
  });
});
