// OTA-1147 — "ĀTHER", AND THE FAMILY THAT WAS THREE-QUARTERS UNCOVERED.
//
// Owner: *"and aether should be āther … anything starting with aether should
// have it start with āther for pronunciation not spelling."*
//
// Two changes, and the second is the bigger one.
//
// 1. ONE WORD, NOT TWO. OTA-107 wrote the head as "ay thur" — two
//    space-separated tokens, which the lexicon's own header says espeak treats
//    as two separate words. So it came out as two stressed beats, AY · THUR,
//    when the canon is a single smooth trochee: ā-ther. Closing the space is
//    what the macron in the owner's spelling is asking for.
//
// 2. ⚠ IT IS A PREFIX RULE NOW, BECAUSE THE OLD LIST MISSED MOST OF THE FAMILY.
//    Five entries were enumerated; the content carries twenty. Aetherkin,
//    Aethercraft, Aetherium, Aetherstorm, Aetherwing, Aetherforge, Aethereal,
//    Aetherflame, Aetherlight, Aetherbound, Aetherwave, Aetherons and the rest
//    all fell through to espeak's raw letter-to-sound rules — the exact
//    mispronunciation this family was respelled to prevent. "Anything starting
//    with aether" is a prefix rule, and a prefix rule cannot miss the next word
//    someone authors.
//
// ⚠ PRONUNCIATION, NOT SPELLING: this is the TTS copy only. The visible log,
// the item names and the codex all still read "Aether".
import { applyLoreLexicon } from '../app/voice/loreLexicon';

/** Every Aether-prefixed word actually present in the game's content, found by
 *  grepping app/data + app/engine. The point of the list is that only five of
 *  them used to be handled. */
const FAMILY = [
  'Aether', 'Aetheric', 'Aetherstone', 'Aetherborn', 'Aetherbat',
  'Aetherkin', 'Aetherbound', 'Aethercraft', 'Aethercrafted', 'Aethercrafters',
  'Aethereal', 'Aetherflame', 'Aetherforge', 'Aetherforged', 'Aetherium',
  'Aetherlight', 'Aetherons', 'Aetherstorm', 'Aetherstorms', 'Aetherwave',
  'Aetherwing',
];

describe('OTA-1147 — the head is one word', () => {
  it('⚠ "ay thur" is gone from every reading in the family', () => {
    for (const word of FAMILY) {
      expect(applyLoreLexicon(word)).not.toContain('ay thur');
    }
  });

  it('the bare noun is a single token', () => {
    expect(applyLoreLexicon('Aether')).toBe('ayther');
  });

  it('a bare suffix stays attached so the stress lands ay-THER-ik', () => {
    expect(applyLoreLexicon('Aetheric')).toBe('aytheric');
  });

  it('a compound whose tail is a REAL WORD keeps its space', () => {
    // espeak gives a real word its own clean letter-to-sound pass.
    expect(applyLoreLexicon('Aetherstone')).toBe('ayther stone');
    expect(applyLoreLexicon('Aetherborn')).toBe('ayther born');
    expect(applyLoreLexicon('Aetherbat')).toBe('ayther bat');
    expect(applyLoreLexicon('Aetherkin')).toBe('ayther kin');
  });
});

describe('OTA-1147 — ⚠ anything starting with Aether is covered', () => {
  it('EVERY word in the family gets the ayther head', () => {
    for (const word of FAMILY) {
      expect(applyLoreLexicon(word).toLowerCase()).toMatch(/^ayther/);
    }
  });

  it('the ones the old five-entry list silently missed', () => {
    // These reached espeak untouched before this OTA.
    expect(applyLoreLexicon('Aethercraft')).toBe('aythercraft');
    expect(applyLoreLexicon('Aetherium')).toBe('aytherium');
    expect(applyLoreLexicon('Aetherstorm')).toBe('aytherstorm');
    expect(applyLoreLexicon('Aetherwing')).toBe('aytherwing');
    expect(applyLoreLexicon('Aetherforged')).toBe('aytherforged');
  });

  it('a word nobody has authored yet is still covered — that is the point', () => {
    expect(applyLoreLexicon('Aetherhound')).toBe('aytherhound');
    expect(applyLoreLexicon('Aetherblade prices')).toBe('aytherblade prices');
  });

  it('case does not matter', () => {
    expect(applyLoreLexicon('aetheric')).toBe('aytheric');
    expect(applyLoreLexicon('AETHERSTORM')).toBe('aytherstorm');
  });
});

describe('OTA-1147 — ⚠ the catch-all must sort LAST', () => {
  it('the prefix rule does not pre-empt the named compounds', () => {
    // The trap: `\bAether(?=[a-z])` is 17 source chars, LONGER than
    // `\bAetherstone\b` at 15, so a sort on length alone fires the catch-all
    // first and collapses "ayther stone" into "aytherstone" — silently, since
    // both still sound roughly right.
    expect(applyLoreLexicon('Aetherstone')).toContain(' ');
    expect(applyLoreLexicon('Aetherstone')).not.toBe('aytherstone');
  });

  it('and the bare-noun rule still beats the catch-all', () => {
    expect(applyLoreLexicon('the Aether itself')).toContain('ayther itself');
  });
});

describe('OTA-1147 — it stays inside its own family', () => {
  it('Ether* (the reconciled non-Aether spelling) is untouched by this rule', () => {
    expect(applyLoreLexicon('Etheric')).toBe('Etheric');
  });

  it('a word merely containing "aether" mid-token is not a prefix match', () => {
    expect(applyLoreLexicon('paether')).toBe('paether');
  });
});

describe('OTA-1147 — the respelling leaves the article alone', () => {
  it('⚠ "the Aether" keeps its "the", and the engine reads it correctly', () => {
    // OTA-1146 used to rewrite the article here; OTA-1659 removed that rule.
    // espeak already gives "the ayther" the vowel-position article (measured:
    // ðɪ) because it phonemizes the text it is actually handed — which is the
    // ordering argument OTA-1146 made, answered by the engine itself. The full
    // measurement lives in the OTA-1659 block in loreLexicon.ts.
    expect(applyLoreLexicon('the Aether')).toBe('the ayther');
    expect(applyLoreLexicon('the Aetheric surge')).toBe('the aytheric surge');
  });
});
