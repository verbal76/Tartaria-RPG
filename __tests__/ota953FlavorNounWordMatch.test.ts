// OTA-953 — the flavor-exhausted noun matchers are WORD-level, not substring-level.
// Playtest: "look around sees things I have already investigated and cleared" was fixed by
// filtering the "You see:" list on flavorExhaustedNouns — but that filter (and the older
// investigate-refusal matchers on the same list) compared raw bidirectional SUBSTRINGS, so
// one investigated noun hid/refused unrelated nouns that merely share letters. Every
// must-stay-visible pair below is a real collision from the authored room data.
import { nounTokens, nounTokensMatch, isNounFlavorExhausted } from '../app/engine/ambientNounMatch';

describe('OTA-953 nounTokensMatch — flavor-exhausted word-level matching', () => {
  // Real authored-room collisions the substring rule wrongly matched. These must stay
  // visible (and re-investigable) after the short noun is flavor-exhausted.
  const mustNotMatch: Array<[string, string]> = [
    ['rack', 'cracked terminal'],
    ['rack', 'crackling wire'],
    ['rack', 'cracked dome'],
    ['vat', 'observation window'],
    ['well', 'dweller torch'],
    ['oil', 'rope coil'],
    ['pit', 'climbing piton'],
    ['echo', 'echoing bell'],
    ['rift', 'ash drift'],
    ['core', 'scored plate'],
    // sibling props share a word but are DIFFERENT nouns — clearing one leaves the other
    ['armor rack', 'drone rack'],
  ];
  for (const [a, b] of mustNotMatch) {
    it(`does not match "${a}" vs "${b}" (either direction)`, () => {
      expect(nounTokensMatch(a, b)).toBe(false);
      expect(nounTokensMatch(b, a)).toBe(false);
    });
  }

  // The tolerance the substring rule was there to provide must survive: same prop under
  // variant phrasing still matches.
  const mustMatch: Array<[string, string]> = [
    ['cooling vat', 'cooling vat'], // exact
    ['rack', 'armor rack'], // partial phrase — scene rebuilds shorten/lengthen the same prop
    ['core', 'core stabilizer'],
    ['pillars', 'pillar'], // light plural fold
    ["scribe's quill", 'scribe quill'], // possessive parser-normalized form (normNoun)
    ['rune-glass', 'rune glass'], // hyphen fold (normNoun)
    ['scraps of cloth', 'scrap cloth'], // "of" drop + plural fold
  ];
  for (const [a, b] of mustMatch) {
    it(`still matches "${a}" vs "${b}" (either direction)`, () => {
      expect(nounTokensMatch(a, b)).toBe(true);
      expect(nounTokensMatch(b, a)).toBe(true);
    });
  }

  it('double-s words do not plural-fold into nonsense', () => {
    expect(nounTokens('glass')).toEqual(['glass']);
    expect(nounTokens('moss')).toEqual(['moss']);
    expect(nounTokens('pillars')).toEqual(['pillar']);
  });

  it('empty and climb-marker entries never match anything', () => {
    expect(nounTokensMatch('', 'anything')).toBe(false);
    expect(nounTokensMatch('anything', '')).toBe(false);
    expect(isNounFlavorExhausted('bench', ['', 'climbed:bench:t2'])).toBe(false);
  });

  it('pool check hides on any word-matching entry and only those', () => {
    const pool = ['vat', 'rack'];
    expect(isNounFlavorExhausted('armor rack', pool)).toBe(true);
    expect(isNounFlavorExhausted('cooling vat', pool)).toBe(true);
    expect(isNounFlavorExhausted('cracked terminal', pool)).toBe(false);
    expect(isNounFlavorExhausted('observation window', pool)).toBe(false);
  });
});
