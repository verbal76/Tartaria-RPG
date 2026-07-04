import { normNoun, isNounConsumed } from '../app/engine/ambientNounMatch';

describe('ambient noun matching (chip consumed/exhausted reconciliation)', () => {
  describe('normNoun', () => {
    it('drops the connective "of" and collapses whitespace', () => {
      expect(normNoun('scraps of cloth')).toBe('scraps cloth');
    });
    it('drops the WHOLE possessive "’s" (matches the parser), not just the apostrophe', () => {
      expect(normNoun("Zharak's Teeth Spire")).toBe('zharak teeth spire');
      expect(normNoun("messenger's post")).toBe('messenger post');
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
    it('reconciles a possessive display chip against the parser-stored form (the "messenger’s post" bug)', () => {
      // The chip keeps the display form "messenger's post"; the engine records the
      // consumed noun as the parser-normalized "messenger post" (whole 's dropped).
      // These MUST match or the chip stays live in the Investigate picker and
      // re-taps forever into "already examined" (the reported loop).
      expect(isNounConsumed("messenger's post", new Set(['messenger post']))).toBe(true);
      expect(isNounConsumed("Zharak's Teeth Spire", new Set(['zharak teeth spire']))).toBe(true);
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
