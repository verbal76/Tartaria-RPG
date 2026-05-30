// OTA 23-014 — Pure helpers for the new salvage roll model. Tests
// stay engine-only (no gameStore mocks) so they run fast and never
// flake on cross-test Math.random ordering.

import {
  scrapSuccessChance,
  scrapHasSecondChance,
  pickScrapFailureLine,
  SCRAP_FAILURE_LINES,
} from '../app/engine/scrapEngine';

describe('OTA 23-014 — salvage success roll', () => {
  describe('scrapSuccessChance', () => {
    it('returns 0.7 at exactly 10/10 — design baseline', () => {
      expect(scrapSuccessChance(10, 10)).toBeCloseTo(0.7);
    });

    it('INT scales the curve more than DEX', () => {
      const intGain = scrapSuccessChance(15, 10) - scrapSuccessChance(10, 10);
      const dexGain = scrapSuccessChance(10, 15) - scrapSuccessChance(10, 10);
      expect(intGain).toBeGreaterThan(dexGain);
    });

    it('clamps to a 35% floor for low-stat characters', () => {
      expect(scrapSuccessChance(1, 1)).toBe(0.35);
    });

    it('clamps to a 95% ceiling — no guaranteed salvage', () => {
      expect(scrapSuccessChance(30, 30)).toBe(0.95);
    });

    it('mid-tier engineer (INT 14, DEX 12) lands roughly 82%', () => {
      expect(scrapSuccessChance(14, 12)).toBeCloseTo(0.84, 1);
    });
  });

  describe('scrapHasSecondChance', () => {
    it('grants a re-roll at INT 14', () => {
      expect(scrapHasSecondChance(14, 10)).toBe(true);
    });

    it('grants a re-roll at DEX 16', () => {
      expect(scrapHasSecondChance(10, 16)).toBe(true);
    });

    it('refuses a re-roll for mid characters (INT 12, DEX 13)', () => {
      expect(scrapHasSecondChance(12, 13)).toBe(false);
    });
  });

  describe('pickScrapFailureLine', () => {
    it('substitutes the item name into every variant', () => {
      for (let i = 0; i < SCRAP_FAILURE_LINES.length; i++) {
        const line = pickScrapFailureLine('Rusted Blade');
        expect(line).toContain('Rusted Blade');
        expect(line).not.toContain('{item}');
      }
    });

    it('has 10 distinct failure variants — the playtester ASKED for variety', () => {
      const distinct = new Set(SCRAP_FAILURE_LINES);
      expect(distinct.size).toBe(10);
    });
  });
});
