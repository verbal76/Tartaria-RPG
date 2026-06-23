// engine_Dev — the POWERS (summon/shape/mend) race affinity is data-driven:
// an uploaded races table sets each race's powerDcMod / powerIntBonus,
// and raceMechanics reads it (no hardcoded Tartaria race ids). A race that sets no
// affinity casts at the base DC with no INT bonus.

import { powerDcModifier, powerStatBonus } from '../app/engine/raceMechanics';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

const baseRace = {
  name: 'X', baseAC: 10, racialACBonus: '', startingTCFormula: '3d6 x 10',
  startingHPBonus: 0, barehandDamage: '1d4', tags: [], traits: [], description: '', flavor: '',
};

describe('engine_Dev — data-driven power-discipline race affinity', () => {
  afterEach(() => clearAllOverrides());

  it('an uploaded race drives its summon DC modifier + INT bonus', () => {
    setTableOverride('races', [
      { ...baseRace, id: 'adept', powerDcMod: -2, powerIntBonus: 3 },   // gifted
      { ...baseRace, id: 'mundane', powerDcMod: 4 },                          // poor at it
      { ...baseRace, id: 'plain' },                                                 // no affinity
    ]);
    expect(powerDcModifier('adept')).toBe(-2);
    expect(powerStatBonus('adept')).toEqual({ intelligence: 3 });
    expect(powerDcModifier('mundane')).toBe(4);
    expect(powerStatBonus('mundane')).toEqual({});
    expect(powerDcModifier('plain')).toBe(0);
    expect(powerStatBonus('plain')).toEqual({});
  });

  it('an unknown / undefined race casts at the base DC (neutral default)', () => {
    setTableOverride('races', [{ ...baseRace, id: 'only' }]);
    expect(powerDcModifier('not_a_race')).toBe(0);
    expect(powerDcModifier(undefined)).toBe(0);
    expect(powerStatBonus('not_a_race')).toEqual({});
  });
});
