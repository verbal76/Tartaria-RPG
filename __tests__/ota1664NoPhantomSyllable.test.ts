// OTA-1664 — NO PHANTOM SYLLABLE.
//
// Owner, after I offered to "re-tune" these two: *"there should be no a sound in
// front of either of those. the s and the n are the starting sound of each word.
// where are you getting an AY sound before that — to me it reads like you're
// mispronouncing the word, not a tone or inflection, but adding a syllable."*
//
// ⚠⚠⚠ HE IS RIGHT, AND MY FRAMING WAS WRONG. I reported this as a vowel-quality
// problem — "eh" coming out as "AY" — which invited a re-spelling. It is not
// that. The leading token should not be there AT ALL. Samarran is three
// syllables and opens on S; Nimari is three and opens on N. OTA-104 welded a
// fourth beat onto the front of both and has been saying it ever since.
//
// ⚠ THE CAUSE IS A MISREAD OF THE PLAYTESTER'S IPA. OTA-104 was handed
// /ɛsɛmɔːɾɛn/ and /ɛnɛmɑɹi/, saw the leading ɛ, and promoted it to its own
// space-separated token — which this file's own header says espeak treats as a
// separate WORD. It then wrote the mistake down as fact: "all three open with a
// leading /ɛ/ schwa that the prior respellings dropped. Samarran and Nimari are
// 4-syllable words, not 3." Both sentences were false, and the second one is
// the kind of confident note that stops the next person checking.
//
// Measured (`espeak-ng -v en-us -q --ipa`), the entries were not a shade off —
// they were a different word:
//
//   eh sem or en    → ˈeɪ sˈɛm ɔːɹ ˈɛn    "AY-SEM-OR-EN"    (4 beats, 4 stresses)
//   Samarran        → sˈæmæɹən            "SAM-a-run"       ✓
//   eh neh mah ree  → ˈeɪ nˈeɪ mˈɑː ɹˈiː  "AY-NAY-MAH-REE"  ("neh" also says NAY)
//   Nimari          → nˈɪmɚɹi             "NIM-uh-ree"      ✓
//
// ⚠⚠ SO THE FIX IS REMOVAL, NOT A RE-TUNE — the third time in six OTAs that the
// right answer was to delete an entry rather than re-spell it (OTA-1659: "the",
// "doesn't"). The rule this file now states plainly: respell words the
// phonemizer gets WRONG. Overriding one it already reads correctly is how you
// manufacture a mispronunciation.

import { applyLoreLexicon, getLexiconSize } from '../app/voice/loreLexicon';

const LEXICON_CODE = (): string => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src = require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '..', 'app', 'voice', 'loreLexicon.ts'), 'utf8',
  ) as string;
  // Comments quote the retired spellings on purpose — that is the record of what
  // was measured. Read only the code that runs.
  const block = src.slice(src.indexOf('const LEXICON:'), src.indexOf('// OTA 013 —'));
  return block.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
};

describe('OTA-1664 — the phantom syllable is gone', () => {
  it('⚠ Samarran reaches the engine as itself', () => {
    expect(applyLoreLexicon('Samarran')).toBe('Samarran');
    expect(applyLoreLexicon('the road to Samarran')).toBe('the road to Samarran');
  });

  it('⚠ Nimari reaches the engine as itself', () => {
    expect(applyLoreLexicon('Nimari')).toBe('Nimari');
    expect(applyLoreLexicon('Red Tower of Nimari')).toBe('Red Tower of Nimari');
  });

  it('⚠⚠ and nothing in the lexicon puts a vowel in front of either word', () => {
    // The specific thing he heard: a beat before the S and before the N.
    const code = LEXICON_CODE();
    expect(code).not.toContain('eh sem or en');
    expect(code).not.toContain('eh neh mah ree');
    expect(code).not.toContain('Samarran');
    expect(code).not.toContain('Nimari');
  });

  it('the compound place names inherit the fix, since nothing rewrites them', () => {
    // "Red Tower of Nimari" and "Samarran Core" are content strings; with the
    // entries gone they pass through whole rather than gaining a syllable
    // mid-phrase, which is where it would have been loudest.
    expect(applyLoreLexicon('Samarran Core')).toBe('Samarran Core');
  });
});

describe('OTA-1664 — ⚠ Asgardar is NOT the same case, and stays', () => {
  it('its leading vowel is the word, not an addition', () => {
    // A-s-gardar genuinely opens on a vowel, so "ez" is not a phantom beat —
    // it is the first syllable, and it is the owner's own OTA-104 spelling.
    // Measured: Asgardar → ˈæzɡɑːɹdˌɑːɹ, ez gah dor → ˈɛz ɡˈɑː dˈoːɹ. Same
    // count, different vowel, which is what he asked for.
    expect(applyLoreLexicon('Asgardar')).toBe('ez gah dor');
  });
});

describe('OTA-1664 — ⚠⚠ the survivors keep their syllable count', () => {
  it('every remaining respelling has the beats the word has', () => {
    // The defect class is a respelling that CHANGES the number of beats. Each
    // pair below was measured through espeak; the assertion here is the cheap
    // proxy that catches a future entry adding or dropping a chunk: the token
    // count of the respelling, against the count OTA-1664 verified.
    const expected: Record<string, number> = {
      Aether: 1,          // ayther
      Aetherstone: 2,     // ayther stone
      Tartaria: 2,        // tar taireea
      Drakova: 3,         // dra koh vah
      Varakush: 2,        // vara koosh
      Asgardar: 3,        // ez gah dor
      Voronov: 2,         // voro nov
      Zharak: 2,          // zhah rak
      Thametan: 3,        // thuh meh tahn
      Reclaimer: 3,       // ree clay mer
    };
    for (const [word, chunks] of Object.entries(expected)) {
      expect(applyLoreLexicon(word).split(/\s+/).length).toBe(chunks);
    }
  });

  it('and the lexicon is still a lexicon', () => {
    expect(getLexiconSize()).toBeGreaterThan(10);
  });
});
