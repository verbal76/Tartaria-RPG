// foreignText — strip non-English (foreign-script / romanized-foreign) WORDS that
// the local Qwen model occasionally code-switches into otherwise-English
// narration. A playtester saw "huà" (romanized Chinese 话) land in the Arbiter
// feed. The game narrates in English only, so any whitespace-delimited word that
// carries a foreign letter — a CJK/Cyrillic/Greek/Thai/etc. character, an accented
// Latin letter, or a pinyin/Vietnamese tone mark — is dropped whole.
//
// Deliberately range-based (NO \p{...} Unicode property escapes): Hermes' regex
// support for property escapes is unreliable, so we test raw code points instead.
// Typographic punctuation (smart quotes, em dash, ellipsis) is NOT flagged, so
// contractions and stylized punctuation survive untouched.

// Code-point ranges that mark a letter as "not English."
const FOREIGN_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], // combining diacritical marks — pinyin/Vietnamese tone marks
  [0x00c0, 0x024f], // Latin-1 Supplement + Latin Extended-A/B accented letters
  [0x1e00, 0x1eff], // Latin Extended Additional — Vietnamese precomposed vowels
  [0x0370, 0x1cff], // Greek, Cyrillic, Hebrew, Arabic, Indic, Thai, … letters
  [0x3000, 0xd7ff], // CJK punctuation + Kana + CJK ideographs + Hangul
  [0xf900, 0xfaff], // CJK compatibility ideographs
];

// × (0x00d7) and ÷ (0x00f7) sit inside the Latin-1 range but are math SYMBOLS,
// not foreign letters — never let them trigger a word drop.
const SYMBOL_EXCEPTIONS = new Set<number>([0x00d7, 0x00f7]);

function isForeignCodePoint(cp: number): boolean {
  if (SYMBOL_EXCEPTIONS.has(cp)) return false;
  for (const [lo, hi] of FOREIGN_RANGES) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/** Drop any word containing a foreign letter; collapse the gaps + tidy the
 *  spacing left before punctuation. English-only narration in → English-only
 *  narration out. Returns '' if every word was foreign (caller falls back to a
 *  template). */
export function stripForeignWords(text: string): string {
  if (!text) return text;
  return text
    .split(/(\s+)/) // keep whitespace runs as their own segments
    .map((seg) => {
      if (/^\s*$/.test(seg)) return seg; // preserve spacing
      for (const ch of seg) {
        if (isForeignCodePoint(ch.codePointAt(0)!)) return ''; // drop the whole word
      }
      return seg;
    })
    .join('')
    .replace(/\s{2,}/g, ' ')      // collapse the double-spaces a dropped word leaves
    .replace(/\s+([.,;:!?…])/g, '$1') // pull punctuation back onto the prior word
    .trim();
}
