// OTA-1146 — "THE" IS TWO WORDS, and Kokoro only ever said one of them.
//
// Owner: *"kokoro pronounces the as thee it should be pronounce thuh or tha."*
//
// English has two articles spelled "the": /ðə/ ("thuh") before a consonant
// SOUND, /ðiː/ ("thee") before a vowel SOUND. Speakers switch without noticing,
// which is why the wrong one grates — "thee blade", "thee guardian", "thee dog"
// reads as someone spelling the word rather than saying it.
//
// ⚠ THE SOUND DECIDES, NOT THE LETTER. That is the whole difficulty, and a bare
// /^[aeiou]/ test gets the two commonest shapes in this game's prose backwards:
// "the hour" is THEE (silent h), "the university" is THUH (u says "yoo"), and
// "the unknown" is THEE (u says "uh"). Both exception lists exist for that, and
// both are whole-word anchored so a `uni` prefix can't swallow "uninformed".
import {
  respellTheArticle,
  startsWithVowelSound,
  applyLoreLexicon,
  THE_SCHWA_RESPELLING,
} from '../app/voice/loreLexicon';

describe('OTA-1146 — the consonant-sound article becomes "thuh"', () => {
  it('the ordinary case: a plain consonant word', () => {
    expect(respellTheArticle('the blade')).toBe('thuh blade');
    // ⚠ Note "the Arbiter" stays THEE — the game's own narrator is a
    // vowel-sound noun, so the two readings sit in the same sentence.
    expect(respellTheArticle('the Arbiter watches the dog')).toBe('the Arbiter watches thuh dog');
  });

  it('capitalised "The" at the head of a sentence is respelled too', () => {
    // Case does not affect speech output — the file's standing convention.
    expect(respellTheArticle('The guardian turns.')).toBe('thuh guardian turns.');
  });

  it('every occurrence in a line is handled, including back-to-back articles', () => {
    // The lookahead means the following word is inspected, never consumed, so a
    // second "the" is still examined on its own terms.
    expect(respellTheArticle('the the cat')).toBe('thuh thuh cat');
  });
});

describe('OTA-1146 — the vowel-sound article stays "thee"', () => {
  it('a plain vowel word is left alone', () => {
    expect(respellTheArticle('the edge of the open road')).toBe('the edge of the open road');
    expect(respellTheArticle('the enemy')).toBe('the enemy');
    expect(respellTheArticle('the iron door')).toBe('the iron door');
  });

  it('⚠ silent h — consonant letter, vowel sound', () => {
    for (const w of ['hour', 'hours', 'honest', 'honour', 'honor', 'heir', 'heirloom']) {
      expect(startsWithVowelSound(w)).toBe(true);
      expect(respellTheArticle(`the ${w}`)).toBe(`the ${w}`);
    }
  });
});

describe('OTA-1146 — ⚠ the two traps a letter test gets backwards', () => {
  it('vowel letter, CONSONANT sound ("yoo") → thuh', () => {
    for (const w of ['use', 'used', 'useful', 'unit', 'united', 'union', 'unique',
      'uniform', 'universe', 'university', 'unicorn', 'utility', 'euro', 'ewe',
      'one', 'once']) {
      expect(startsWithVowelSound(w)).toBe(false);
      expect(respellTheArticle(`the ${w}`)).toBe(`${THE_SCHWA_RESPELLING} ${w}`);
    }
  });

  it('⚠ but "un-" words are vowel sounds — the prefix trap stays closed', () => {
    // `uni` as a PREFIX would swallow these, and they are far commoner in this
    // game's prose than "unicorn".
    for (const w of ['unknown', 'unarmed', 'uninformed', 'uninvited', 'unimportant',
      'under', 'undead', 'umbrella', 'ugly']) {
      expect(startsWithVowelSound(w)).toBe(true);
      expect(respellTheArticle(`the ${w}`)).toBe(`the ${w}`);
    }
  });
});

describe('OTA-1146 — it does not touch anything else', () => {
  it('"the" inside a word is untouched', () => {
    expect(respellTheArticle('there is a theme in their tether')).toBe('there is a theme in their tether');
    expect(respellTheArticle('Aether')).toBe('Aether');
  });

  it('a trailing "the" with no following word is left alone', () => {
    expect(respellTheArticle('the')).toBe('the');
    expect(respellTheArticle('what is the')).toBe('what is the');
  });

  it('punctuation between the article and its noun is respected', () => {
    expect(respellTheArticle('the "blade"')).toBe('thuh "blade"');
  });
});

describe('OTA-1146 — it runs LAST, after the respellings', () => {
  it('⚠ judges the text espeak WILL SEE, not the text we were handed', () => {
    // The lexicon turns "Aether" into "ayther" (OTA-1147; was "ay thur") —
    // consonant-initial on the page, vowel-initial in the mouth. Running the
    // article rule after the loop is what makes "the Aether" come out as
    // "thee ayther" rather than "thuh".
    expect(applyLoreLexicon('the Aether')).toBe('the ayther');
    // And the reverse: a respelling that stays consonant-initial takes "thuh".
    expect(applyLoreLexicon('the Tartaria')).toContain(THE_SCHWA_RESPELLING);
  });

  it('the knob is one constant, per the file\'s own escape hatch', () => {
    expect(THE_SCHWA_RESPELLING).toBe('thuh');
  });
});
