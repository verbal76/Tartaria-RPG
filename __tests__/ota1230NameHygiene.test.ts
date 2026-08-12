// ⚠⚠ OTA-1230 — "ARE WE ABLE TO STOP PEOPLE FROM ENTERING EMOJIS IN ANY SPECIAL
// CHARACTERS IN THE NAME LINE?" Owner's question, and the answer was *mostly,
// already* — with two holes that only showed up by RUNNING the shipped
// sanitizer against real input instead of reading it.
//
// ⚠ (1) "LETTERS" IS A BIGGER CATEGORY THAN IT SOUNDS. Mathematical script,
// fullwidth, circled, roman-numeral and superscript blocks are all Unicode
// category L, so a letters-only filter passed 𝓥𝓮𝓻𝓫𝓪𝓵 and Ｖｅｒｂａｌ straight
// through — unreadable in most fonts, unpronounceable by the voice.
//
// ⚠⚠ (2) AND THE WORSE MISTAKE, IN THE OPPOSITE DIRECTION: combining marks were
// dropped as "not letters". The virama in नमस्ते JOINS two letters; removing it
// silently broke a legitimate name into नमसत. The fix keeps marks and BOUNDS the
// run, because zalgo is a quantity problem, not a category one.
//
// The suite is written as a before/after table so the holes stay closed and the
// scripts stay whole.
import { sanitizePlayerName, nameWasAltered, PLAYER_NAME_MAX } from '../app/engine/playerName';

describe('OTA-1230 — nothing but a speakable name comes out of the name line', () => {
  it('⚠⚠ emoji, digits, punctuation and symbols never survive', () => {
    expect(sanitizePlayerName('V🎮erbal!')).toBe('Verbal');
    expect(sanitizePlayerName('Verbal123')).toBe('Verbal');
    expect(sanitizePlayerName('@#$%Bob&*()')).toBe('Bob');
    expect(sanitizePlayerName('<script>alert(1)</script>')).toBe('scriptalertscript');
    expect(sanitizePlayerName('Rob"; DROP TABLE--')).toBe('Rob DROP TABLE');
    // ⚠ hyphen/apostrophe are kept for Mary-Jane and O'Brien, so they were a
    // loophole of their own: a name made only of them cleaned to itself.
    expect(sanitizePlayerName('Rob--------')).toBe('Rob');
    expect(sanitizePlayerName("''''Rob''''")).toBe('Rob');
    expect(sanitizePlayerName('----')).toBe('');
    expect(sanitizePlayerName('../../etc/passwd')).toBe('etcpasswd');
  });

  it('⚠⚠ an all-symbol answer cleans to nothing, so the caller re-asks', () => {
    // The store rejects anything under 2 chars and stays on the name beat
    // rather than accepting a blank player.
    expect(sanitizePlayerName('🔥💀👾')).toBe('');
    expect(sanitizePlayerName('123🎮!!!').length).toBeLessThan(2);
    expect(sanitizePlayerName('')).toBe('');
    expect(sanitizePlayerName('   ')).toBe('');
  });

  it('⚠⚠ THE FIRST HOLE: fancy lookalike letters fold to plain Latin, not through', () => {
    // Every one of these was Unicode category L and sailed past the old filter.
    expect(sanitizePlayerName('𝓥𝓮𝓻𝓫𝓪𝓵')).toBe('Verbal');   // math script
    expect(sanitizePlayerName('𝐕𝐞𝐫𝐛𝐚𝐥')).toBe('Verbal');   // math bold
    expect(sanitizePlayerName('𝕍𝕖𝕣𝕓𝕒𝕝')).toBe('Verbal');   // double-struck
    expect(sanitizePlayerName('Ｖｅｒｂａｌ')).toBe('Verbal');   // fullwidth
    expect(sanitizePlayerName('ⱽᵉʳᵇᵃˡ')).toBe('Verbal');   // superscript
    expect(sanitizePlayerName('ℌ𝔢𝔩𝔩𝔬')).toBe('Hello');     // fraktur
    // ...and two that USED to be destroyed rather than passed, which was its own
    // bug: a legible name refused for looking odd.
    expect(sanitizePlayerName('Ⓥⓔⓡⓑⓐⓛ')).toBe('Verbal');   // circled
    expect(sanitizePlayerName('Ⅴerbal')).toBe('Verbal');   // roman numeral V
    // Small-caps has no compatibility decomposition, so NFKC cannot reach it —
    // it is folded by hand, and this is the assertion that says so.
    expect(sanitizePlayerName('ᴠᴇʀʙᴀʟ')).toBe('verbal');
  });

  it('⚠⚠ THE SECOND HOLE: joined scripts survive intact — the marks are the word', () => {
    // Devanagari: the virama joins स and त. Stripping it (the old behaviour)
    // turned a real name into नमसत, silently.
    expect(sanitizePlayerName('नमस्ते')).toBe('नमस्ते');
    expect(sanitizePlayerName('สวัสดี')).toBe('สวัสดี');     // Thai vowel marks
    expect(sanitizePlayerName('שָׁלוֹם')).toBe('שָׁלוֹם');       // Hebrew niqqud
    expect(sanitizePlayerName('مرحبا')).toBe('مرحبا');     // Arabic
    expect(sanitizePlayerName('Björk')).toBe('Björk');
    expect(sanitizePlayerName('Ольга')).toBe('Ольга');
  });

  it('⚠ zalgo is bounded, not banned — a quantity rule, not a category one', () => {
    // Banning marks outright is what broke Devanagari. Capping the run per base
    // character keeps every real script and collapses the abuse.
    const zalgo = 'V̸̢͈e̷r̴b̸a̶l̷';
    const out = sanitizePlayerName(zalgo);
    expect(out.startsWith('V')).toBe(true);
    const marks = [...out].filter((c) => /\p{M}/u.test(c)).length;
    const bases = [...out].filter((c) => !/\p{M}/u.test(c)).length;
    expect(marks).toBeLessThanOrEqual(bases * 2);
    expect(out.length).toBeLessThan(zalgo.length);
  });

  it('⚠ real names still come through untouched', () => {
    expect(sanitizePlayerName('Mary-Jane')).toBe('Mary-Jane');
    expect(sanitizePlayerName("O'Brien")).toBe("O'Brien");
    expect(sanitizePlayerName('John Smith')).toBe('John Smith');
    expect(sanitizePlayerName('  John   Smith  ')).toBe('John Smith');
  });

  it('⚠ the length cap holds — the voice reads this aloud', () => {
    const long = 'J'.repeat(200);
    expect(sanitizePlayerName(long)).toBe('J'.repeat(PLAYER_NAME_MAX));
    // And a cap applied to folded text, so 200 fullwidth chars cannot slip past
    // by counting differently before the fold.
    expect(sanitizePlayerName('Ｊ'.repeat(200)).length).toBe(PLAYER_NAME_MAX);
  });

  it('⚠⚠ the game admits it when it edited your answer', () => {
    // The strip used to be silent — you typed Verbal123, became Verbal, and the
    // first you knew was the character sheet.
    expect(nameWasAltered('Verbal123', 'Verbal')).toBe(true);
    expect(nameWasAltered('🔥Bob', 'Bob')).toBe(true);
    // ...but ordinary whitespace tidying is NOT worth a line about nothing.
    expect(nameWasAltered('Verbal', 'Verbal')).toBe(false);
    expect(nameWasAltered('  Verbal  ', 'Verbal')).toBe(false);
    expect(nameWasAltered('John   Smith', 'John Smith')).toBe(false);
  });

  it('⚠⚠ the store says the line, and only when the name actually changed', () => {
    const store = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8',
    ) as string;
    expect(store).toContain('nameWasAltered(trimmed, cleanName)');
    expect(store).toContain('The Arbiter writes it down as');
    // The under-2-chars refusal stays as the separate, harder stop.
    expect(store).toContain('A name I can actually say');
  });
});
