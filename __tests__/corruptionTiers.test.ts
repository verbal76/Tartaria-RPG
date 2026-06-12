import {
  corruptionTierOf,
  corruptionStatPenalty,
  corruptionPriceMultiplier,
  corruptionExtraEncounterChance,
  tierCrossLine,
  tierLabel,
} from '../app/engine/corruption';

describe('OTA 039 — corruption tier ladder', () => {
  describe('corruptionTierOf', () => {
    it('returns clean for 0-10', () => {
      expect(corruptionTierOf(0)).toBe('clean');
      expect(corruptionTierOf(5)).toBe('clean');
      expect(corruptionTierOf(10)).toBe('clean');
    });
    it('returns tainted for 11-30', () => {
      expect(corruptionTierOf(11)).toBe('tainted');
      expect(corruptionTierOf(20)).toBe('tainted');
      expect(corruptionTierOf(30)).toBe('tainted');
    });
    it('returns corrupted for 31-60', () => {
      expect(corruptionTierOf(31)).toBe('corrupted');
      expect(corruptionTierOf(45)).toBe('corrupted');
      expect(corruptionTierOf(60)).toBe('corrupted');
    });
    it('returns hollowed for 61+', () => {
      expect(corruptionTierOf(61)).toBe('hollowed');
      expect(corruptionTierOf(100)).toBe('hollowed');
      expect(corruptionTierOf(9999)).toBe('hollowed');
    });
  });

  describe('corruptionStatPenalty', () => {
    it('clean returns no penalty', () => {
      expect(corruptionStatPenalty('clean')).toEqual({});
    });
    it('tainted returns -1 CHA only', () => {
      expect(corruptionStatPenalty('tainted')).toEqual({ charisma: -1 });
    });
    it('corrupted returns -1 to all stats', () => {
      expect(corruptionStatPenalty('corrupted')).toEqual({
        strength: -1, dexterity: -1, intelligence: -1, wisdom: -1, charisma: -1, stealth: -1,
      });
    });
    it('hollowed returns -2 to all stats', () => {
      expect(corruptionStatPenalty('hollowed')).toEqual({
        strength: -2, dexterity: -2, intelligence: -2, wisdom: -2, charisma: -2, stealth: -2,
      });
    });
  });

  describe('corruptionPriceMultiplier', () => {
    it('clean and tainted unchanged (×1)', () => {
      expect(corruptionPriceMultiplier('clean')).toBe(1);
      expect(corruptionPriceMultiplier('tainted')).toBe(1);
    });
    it('corrupted ×1.15', () => {
      expect(corruptionPriceMultiplier('corrupted')).toBe(1.15);
    });
    it('hollowed ×1.3', () => {
      expect(corruptionPriceMultiplier('hollowed')).toBe(1.3);
    });
  });

  describe('corruptionExtraEncounterChance', () => {
    it('clean: 0', () => {
      expect(corruptionExtraEncounterChance('clean')).toBe(0);
    });
    it('tainted: 0.05, corrupted: 0.15, hollowed: 0.3', () => {
      expect(corruptionExtraEncounterChance('tainted')).toBe(0.05);
      expect(corruptionExtraEncounterChance('corrupted')).toBe(0.15);
      expect(corruptionExtraEncounterChance('hollowed')).toBe(0.3);
    });
  });

  describe('tierCrossLine', () => {
    it('no message when tier unchanged', () => {
      expect(tierCrossLine('clean', 'clean')).toBeNull();
      expect(tierCrossLine('hollowed', 'hollowed')).toBeNull();
    });
    it('worsening clean → tainted emits the "tightens" line', () => {
      const line = tierCrossLine('clean', 'tainted');
      expect(line).toContain('Tainted');
      expect(line).toContain('CHA');
    });
    it('worsening corrupted → hollowed emits the Hollowed warning', () => {
      const line = tierCrossLine('corrupted', 'hollowed');
      expect(line).toContain('Hollowed');
      expect(line).toContain('Mud Monarchs');
    });
    it('cleansing hollowed → corrupted emits cleaner line', () => {
      const line = tierCrossLine('hollowed', 'corrupted');
      expect(line).toContain('cleaner');
    });
    it('cleansing tainted → clean emits the "Clean" line', () => {
      const line = tierCrossLine('tainted', 'clean');
      expect(line).toContain('Clean');
    });
  });

  describe('tierLabel', () => {
    it('capitalizes the tier id', () => {
      expect(tierLabel('clean')).toBe('Clean');
      expect(tierLabel('tainted')).toBe('Tainted');
      expect(tierLabel('corrupted')).toBe('Corrupted');
      expect(tierLabel('hollowed')).toBe('Hollowed');
    });
  });
});
