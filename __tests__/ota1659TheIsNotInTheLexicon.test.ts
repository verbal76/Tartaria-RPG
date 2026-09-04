// OTA-1659 — "the" IS NOT IN THIS LEXICON, AND THE ENGINE ALWAYS HAD IT RIGHT.
//
// Owner, twice: *"kokoro pronounces the as thee it should be pronounce thuh or
// tha"* (→ OTA-1146) and then again, still wrong: *"the needs to be pronounced
// thuh in kokoro."*
//
// ⚠⚠⚠ THE SECOND REPORT IS A REPORT ABOUT THE FIRST FIX. OTA-1146 answered him
// by rewriting every consonant-position "the" to the literal string "thuh"
// before handing the line to the engine. This is the measurement it never took
// — espeak-ng 1.51, the phonemizer this app bundles per voice under
// `<voice>/espeak-ng-data/`, run as `espeak-ng -v en-us -q --ipa`:
//
//   "The raider swings the rusted blade at the dog."
//      plain     →  ðə ɹˈeɪdɚ swˈɪŋz ðə ɹˈʌstᵻd blˈeɪd æt ðə dˈɑːɡ
//      OTA-1146  →  θˈʌ ɹˈeɪdɚ swˈɪŋz θˈʌ ɹˈʌstᵻd blˈeɪd æt θˈʌ dˈɑːɡ
//
// ⚠ THE ENGINE WAS ALREADY SAYING "thuh". /ðə/ IS "thuh" — the exact sound he
// asked for, three times in that sentence, before anyone touched anything. The
// respelling replaced it with /θˈʌ/: the voiceless th of THUMB instead of the
// voiced th of THIS, the STRUT vowel instead of a schwa, and stressed, because
// espeak stresses a monosyllable it has to sound out. An unstressed article
// became a hard beat in front of every noun in the game.
//
// ⚠⚠ AND NO RESPELLING COULD EVER HAVE FIXED IT. espeak gives word-initial `th`
// its voiceless reading for every word not in its dictionary; voiced /ð/ at the
// head of a word survives only in the closed set of function words it knows.
// The escape hatch OTA-1146 wrote down ("thuh" → "thu" → "tha") only ever
// changed the vowel, and the vowel was not the defect:
//
//   thuh → θˈʌ     thu → θˈɜː     tha → θˈɑː     dhuh → dˈiːhˈʌ ("dee-huh")
//
// There is exactly one string that phonemizes to /ðə/ on this engine, and it is
// "the". Its dictionary entry is `Found: 'the' [D@2]` — schwa, stress level 2,
// unstressed — and espeak runs the vowel/consonant switch itself, identically
// on en-us, en-gb and en-gb-x-rp. The two hand-maintained exception lists
// OTA-1146 built for hour/honest/heir and use/unit/one were reimplementing, in
// JavaScript, a rule that was already there in C and already correct.
//
// THE RULE THIS SUITE EXISTS TO HOLD: this file respells words the phonemizer
// does NOT know. Respelling into its own vocabulary does not correct it, it
// overrides it — with letters it has no entry for, which is the exact condition
// that produces a mispronunciation.

import { applyLoreLexicon, getLexiconSize } from '../app/voice/loreLexicon';

const SOURCE = (): string =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '..', 'app', 'voice', 'loreLexicon.ts'), 'utf8',
  ) as string;

/** ⚠ THE ENTRIES, WITHOUT THE PROSE. The comments in that file quote the old
 *  spellings on purpose — that is the whole record of what was measured and
 *  why — so a naive `not.toContain('duzzent')` over the raw source would fail
 *  against its own explanation. Strip the comment lines and read only the code
 *  that actually runs. */
const LEXICON_CODE = (): string => {
  const src = SOURCE();
  const block = src.slice(src.indexOf('const LEXICON:'), src.indexOf('// OTA 013 —'));
  return block.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
};

describe('OTA-1659 — the article reaches the engine untouched', () => {
  it('⚠ THE REPRODUCTION, INVERTED: every shape OTA-1146 rewrote now passes through', () => {
    // Each of these came out of applyLoreLexicon as "thuh …" before this OTA,
    // and each phonemized to θˈʌ instead of ðə.
    for (const line of [
      'the blade', 'the guardian', 'the dog', 'the rusted blade',
      'The guardian turns.', 'the "blade"', 'the the cat',
      'The raider swings the rusted blade at the dog.',
    ]) {
      expect(applyLoreLexicon(line)).toBe(line);
    }
  });

  it('the vowel-position article is untouched too — espeak switches it itself', () => {
    // These were already left alone by OTA-1146's exception list; the point is
    // that the list is gone and they are still correct, because the correctness
    // never came from the list.
    for (const line of ['the hour', 'the honest broker', 'the heirloom',
      'the enemy', 'the edge of the open road', 'the iron door']) {
      expect(applyLoreLexicon(line)).toBe(line);
    }
  });

  it('⚠ and the traps the exception lists existed for are no longer ours to get wrong', () => {
    // "the university" is THUH, "the unknown" is THEE, "the hour" is THEE —
    // three different answers for three vowel/consonant-letter shapes. The
    // dictionary decides all three now, so none of them can rot in this file.
    for (const w of ['university', 'unit', 'union', 'unique', 'use', 'euro', 'one',
      'once', 'unknown', 'unarmed', 'uninformed', 'undead', 'hour', 'heir']) {
      expect(applyLoreLexicon(`the ${w}`)).toBe(`the ${w}`);
    }
  });

  it('⚠⚠ the respelling machinery is GONE, not merely bypassed', () => {
    const src = SOURCE();
    expect(src).not.toContain('THE_SCHWA_RESPELLING');
    expect(src).not.toContain('respellTheArticle');
    expect(src).not.toContain('startsWithVowelSound');
    // And no lexicon entry may target the bare article by any route.
    expect(LEXICON_CODE()).not.toMatch(/\\bthe\\b/);
  });

  it('a lore respelling still composes with the article correctly', () => {
    // The ordering argument OTA-1146 made was sound — the article depends on
    // the sound of the word AFTER it, and this file changes that sound. The
    // answer is that the engine phonemizes the text it is handed, so it sees
    // "ayther" and reads ðɪ. Measured: `the ayther` → ðɪ ˈaɪðɚ.
    expect(applyLoreLexicon('the Aether')).toBe('the ayther');
    expect(applyLoreLexicon('the Tartaria wastes')).toBe('the tar taireea wastes');
  });
});

describe('OTA-1659 — the entries the measurement condemned', () => {
  it('⚠ "doesn\'t" is out: the respelling and the word were the same phonemes', () => {
    // The entry claimed espeak said "DOSE-ent". It did not, and never had:
    //   doesn't → dˈʌzənt      duzzent → dˈʌzənt
    expect(applyLoreLexicon("it doesn't matter")).toBe("it doesn't matter");
    expect(LEXICON_CODE()).not.toContain('duzzent');
  });

  it('⚠ Zharak keeps its ZH — the old respelling deleted the sound it protected', () => {
    //   Zharak   → ʒˈæɹæk     (raw: right consonant, wrong vowel)
    //   zah rak  → zˈɑː ɹˈæk  (shipped: the zh was gone — a plain Z)
    //   zhah rak → ʒˈɑː ɹˈæk  (both)
    expect(applyLoreLexicon('Zharak')).toBe('zhah rak');
    expect(applyLoreLexicon('Zharak')).toMatch(/^zh/);
  });

  it('⚠ the Tartaria family gets its third syllable back', () => {
    // espeak reads `eeu` as the glide /juː/, so "taireeuh" said "TERR-yoo":
    //   tar taireeuh  → tˈɑːɹ tˈɛɹjuː       tar taireea   → tˈɑːɹ tˈɛɹiə
    //   tar taireeunz → tˈɑːɹ tˈɛɹjuːnts    tar taireeans → tˈɑːɹ tˈɛɹiənz
    expect(applyLoreLexicon('Tartaria')).toBe('tar taireea');
    expect(applyLoreLexicon('Tartarian')).toBe('tar taireean');
    expect(applyLoreLexicon('Tartarians')).toBe('tar taireeans');
    expect(LEXICON_CODE()).not.toContain('taireeuh');
  });
});

describe('OTA-1659 — the inline-phoneme map is no longer a loaded gun', () => {
  it('⚠⚠⚠ it holds espeak MNEMONICS, not Unicode IPA, which silently deleted the word', () => {
    //   [[ðə]] blade  →  "blˈeɪd"      ⚠ the word is simply gone
    //   [[D@]] blade  →  "ðə blˈeɪd"   ✓
    // The flag is still off pending device verification, but flipping it used
    // to mean every Tartaria / Drakova / Aether in the game going SILENT with
    // no error anywhere — not the "it reads the brackets out loud" failure the
    // old comment predicted.
    const map = SOURCE().slice(
      SOURCE().indexOf('const IPA_OVERRIDES: Record<string, string> = {'),
    ).slice(0, 400);
    // eslint-disable-next-line no-control-regex
    expect(map).not.toMatch(/[^\x00-\x7F]/);
    expect(map).toContain("tA:t'A:ri@");
  });

  it('and it is still OFF — measuring espeak is not the same as measuring the device', () => {
    expect(SOURCE()).toContain('const IPA_OVERRIDES_ENABLED = false;');
  });
});

describe('OTA-1659 — nothing else in the lexicon moved', () => {
  it('the owner-specified cadences are all still exactly as he wrote them', () => {
    expect(applyLoreLexicon('Aether')).toBe('ayther');
    expect(applyLoreLexicon('Aetheric')).toBe('aytheric');
    expect(applyLoreLexicon('Aetherstone')).toBe('ayther stone');
    expect(applyLoreLexicon('Thametan')).toBe('thuh meh tahn');
    expect(applyLoreLexicon('Drakova')).toBe('dra koh vah');
    expect(applyLoreLexicon('Asgardar')).toBe('ez gah dor');
    expect(applyLoreLexicon('Mud Monarch')).toBe('mud mon nark');
    expect(applyLoreLexicon('Reclaimer')).toBe('ree clay mer');
  });

  it('⚠ "thuh" inside Thametan is not the article rule coming back', () => {
    // The one legitimate "thuh" left in the file is the head of a proper noun
    // the owner spelled out himself, and it is a whole-word entry — it cannot
    // touch an article.
    expect(applyLoreLexicon('the Thametan road')).toBe('the thuh meh tahn road');
  });

  it('the lexicon is still a lexicon', () => {
    expect(getLexiconSize()).toBeGreaterThan(10);
  });
});
