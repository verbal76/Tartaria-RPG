import { powerDcModifier, powerStatBonus } from '../app/engine/raceMechanics';

describe('OTA 039 — Aethercraft race modifiers', () => {
  describe('powerDcModifier', () => {
    it('Mud Dwellers cast at base DC (modifier 0)', () => {
      expect(powerDcModifier('mud_dweller')).toBe(0);
    });
    it('Aetherborn cast at +2 DC (training gap)', () => {
      expect(powerDcModifier('aetherborn')).toBe(2);
    });
    it('the Tartaria untrained races carry +3 in races.json (data-driven now)', () => {
      expect(powerDcModifier('tartarian_giant')).toBe(3);
      expect(powerDcModifier('reclaimer')).toBe(3);
      expect(powerDcModifier('architectural_sentinel')).toBe(3);
      expect(powerDcModifier('mud_golem')).toBe(3);
      expect(powerDcModifier('unknowing_mass')).toBe(3);
    });
    it('unknown / undefined raceId casts at the base DC (+0 neutral default)', () => {
      expect(powerDcModifier('does_not_exist')).toBe(0);
      expect(powerDcModifier(undefined)).toBe(0);
    });
  });

  describe('powerStatBonus', () => {
    it('Mud Dwellers get +2 INT when using Aethercraft', () => {
      expect(powerStatBonus('mud_dweller')).toEqual({ intelligence: 2 });
    });
    it('other races get no Aethercraft INT bonus', () => {
      expect(powerStatBonus('tartarian_giant')).toEqual({});
      expect(powerStatBonus('aetherborn')).toEqual({});
      expect(powerStatBonus(undefined)).toEqual({});
    });
  });
});
