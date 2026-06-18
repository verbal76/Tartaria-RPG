import { normNoun, isNounConsumed } from '../app/engine/ambientNounMatch';

describe('ambient noun matching (chip consumed/exhausted reconciliation)', () => {
  describe('normNoun', () => {
    it('drops the connective "of" and collapses whitespace', () => {
      expect(normNoun('scraps of cloth')).toBe('scraps cloth');
    });
    it('drops possessive apostrophes', () => {
      expect(normNoun("Zharak's Teeth Spire")).toBe('zharaks teeth spire');
    });
    it('lower-cases and trims', () => {
      expect(normNoun('  Rusted Blade  ')).toBe('rusted blade');
    });
    it('only strips "of" as a whole word, not inside another word', () => {
      // "offcut" must NOT lose its leading "of".
      expect(normNoun('offcut')).toBe('offcut');
    });
  });

  describe('isNounConsumed', () => {
    // OTA-624 (Bibiquadium Amber) — the live bug. The engine records the noun
    // consumed under the parser-normalized "scraps cloth" (no "of"), while the
    // live chip keeps the display form "scraps of cloth". Both the SALVAGE and
    // INVESTIGATE tab-tone counts route through this match, so a miss here left
    // BOTH buttons green ("live") forever, re-tappable for an endless
    // "already examined". They must reconcile so the chip drops to amber.
    it('matches the display chip "scraps of cloth" against the stored "scraps cloth"', () => {
      expect(isNounConsumed('scraps of cloth', new Set(['scraps cloth']))).toBe(true);
    });
    it('matches in the reverse direction too', () => {
      expect(isNounConsumed('scraps cloth', new Set(['scraps of cloth']))).toBe(true);
    });
    it('still reconciles the possessive case (apostrophe fix)', () => {
      expect(
        isNounConsumed("Zharak's Teeth Spire", new Set(['zharaks teeth spire'])),
      ).toBe(true);
    });
    it('does not match an unrelated noun', () => {
      expect(isNounConsumed('scraps of cloth', new Set(['rusted blade']))).toBe(false);
    });
    it('skips empty pool entries (no spurious universal match)', () => {
      expect(isNounConsumed('scraps of cloth', new Set([''])).valueOf()).toBe(false);
    });
    it('an empty chip noun never matches', () => {
      expect(isNounConsumed('', new Set(['scraps cloth']))).toBe(false);
    });
  });
});
