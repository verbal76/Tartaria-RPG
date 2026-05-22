import { aethercraftDcModifier, aethercraftStatBonus } from '../app/engine/raceMechanics';

describe('OTA 039 — Aethercraft race modifiers', () => {
  describe('aethercraftDcModifier', () => {
    it('Mud Dwellers cast at base DC (modifier 0)', () => {
      expect(aethercraftDcModifier('mud_dweller')).toBe(0);
    });
    it('Aetherborn cast at +2 DC (training gap)', () => {
      expect(aethercraftDcModifier('aetherborn')).toBe(2);
    });
    it('All other races cast at +4 DC (guessing)', () => {
      expect(aethercraftDcModifier('tartarian_giant')).toBe(4);
      expect(aethercraftDcModifier('reclaimer')).toBe(4);
      expect(aethercraftDcModifier('architectural_sentinel')).toBe(4);
      expect(aethercraftDcModifier('mud_golem')).toBe(4);
      expect(aethercraftDcModifier('unknowing_mass')).toBe(4);
    });
    it('unknown raceId falls to +4 (safe default)', () => {
      expect(aethercraftDcModifier('does_not_exist')).toBe(4);
      expect(aethercraftDcModifier(undefined)).toBe(4);
    });
  });

  describe('aethercraftStatBonus', () => {
    it('Mud Dwellers get +2 INT when using Aethercraft', () => {
      expect(aethercraftStatBonus('mud_dweller')).toEqual({ intelligence: 2 });
    });
    it('other races get no Aethercraft INT bonus', () => {
      expect(aethercraftStatBonus('tartarian_giant')).toEqual({});
      expect(aethercraftStatBonus('aetherborn')).toEqual({});
      expect(aethercraftStatBonus(undefined)).toEqual({});
    });
  });
});
