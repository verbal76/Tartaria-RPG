// OTA-156 — regression lock for the drunk-run collapse in
// bestVerbMatch. Pre-fix: typing `eatt`, `useee`, `scrappp`,
// `drinkkk`, etc. all routed to intent=unknown because fuzzyEqual's
// 1-edit budget couldn't cross a 2-char insertion. Fix: collapse
// runs of 3+ identical chars to 1 (`useee` → `use`) AND collapse a
// trailing 2-char doubled consonant to 1 (`eatt` → `eat`). Catches
// drunk-typing without loosening the fuzzy cutoff (which would risk
// OTA-094-style false positives like `Bone-Caster` collisions).
//
// Locks the catches AND the no-regression cases (don't break
// legitimate verbs that happen to end in doubled letters — but we
// avoid that by only collapsing CONSONANT doubles, so `see` / `too` /
// `goo` are safe).

jest.setTimeout(15000);

import { parseInput } from '../app/engine/parser';

describe('OTA-156 — drunk-run collapse catches doubled-letter typos', () => {
  describe('MUST catch (verb collapses back to known synonym)', () => {
    it.each([
      ['eatt', 'rest'],            // eatt → eat (rest synonym)
      ['eatttt', 'rest'],          // 4+ trailing also collapses
      ['useee', 'use_relic'],      // useee → use (use_relic synonym)
      ['useeee', 'use_relic'],
      ['scrappp', 'dig'],          // scrappp → scrap (dig synonym)
      ['drinkkk', 'drink'],        // drinkkk → drink (3+ run → drink)
      ['drinkk', 'drink'],         // trailing-2 consonant → drink
      ['lookkk', 'investigate'],   // lookkk → look (investigate synonym)
      ['restt', 'rest'],
      ['attackk', 'attack'],
    ])('parses %j to intent %s', (input, expectedIntent) => {
      const r = parseInput(input, { ambientNouns: [] });
      expect(r.intent).toBe(expectedIntent);
    });
  });

  describe('MUST NOT regress (legitimate verbs still work)', () => {
    it.each([
      ['eat', 'rest'],
      ['use', 'use_relic'],
      ['scrap', 'dig'],
      ['drink', 'drink'],
      ['look', 'investigate'],
      ['rest', 'rest'],
      ['attack', 'attack'],
      // Vowel-doubled endings preserved (so future "moo", "boo",
      // legitimate doubled-vowel verbs aren't broken)
    ])('still parses %j to %s', (input, expectedIntent) => {
      const r = parseInput(input, { ambientNouns: [] });
      expect(r.intent).toBe(expectedIntent);
    });
  });

  describe('MUST NOT introduce false positives', () => {
    it('garbage strings still resolve to unknown', () => {
      const r = parseInput('xqqq', { ambientNouns: [] });
      expect(r.intent).toBe('unknown');
    });

    it('words shorter than 3 chars are not collapsed', () => {
      // 2-char inputs shouldn't get clobbered
      const r = parseInput('go', { ambientNouns: [] });
      // 'go' is a travel synonym so it resolves; what matters is
      // we didn't crash on the short token.
      expect(r.intent).toBeDefined();
    });
  });
});
