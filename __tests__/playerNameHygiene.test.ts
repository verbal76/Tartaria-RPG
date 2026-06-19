// OTA-635 — the player name is SPOKEN by Kokoro, so it must clean down to
// pronounceable letters and stay bounded (no emoji/number/symbol salad; no
// "175 J's" that reads for half an hour).

import { sanitizePlayerName, PLAYER_NAME_MAX } from '../app/engine/playerName';

describe('OTA-635 — player name hygiene', () => {
  it('strips digits, emojis, and symbols', () => {
    expect(sanitizePlayerName('Verbal123')).toBe('Verbal');
    expect(sanitizePlayerName('V🎮erbal!')).toBe('Verbal');
    expect(sanitizePlayerName('@#$%Bob&*()')).toBe('Bob');
  });

  it('keeps letters, spaces, hyphens, and apostrophes (real names survive)', () => {
    expect(sanitizePlayerName('Mary-Jane')).toBe('Mary-Jane');
    expect(sanitizePlayerName("O'Brien")).toBe("O'Brien");
    expect(sanitizePlayerName('John Smith')).toBe('John Smith');
  });

  it('collapses whitespace and trims', () => {
    expect(sanitizePlayerName('  John   Smith  ')).toBe('John Smith');
  });

  it('hard-caps the length so the voice cannot read forever', () => {
    const long = 'J'.repeat(175);
    expect(sanitizePlayerName(long).length).toBe(PLAYER_NAME_MAX);
    expect(sanitizePlayerName(long)).toBe('J'.repeat(PLAYER_NAME_MAX));
  });

  it('returns a sub-2 remnant for all-junk input so the caller re-prompts', () => {
    expect(sanitizePlayerName('123🎮!!!').length).toBeLessThan(2);
    expect(sanitizePlayerName('')).toBe('');
    expect(sanitizePlayerName('🔥💀👾').length).toBe(0);
  });

  it('allows accented letters (pronounceable, not a "weird symbol")', () => {
    expect(sanitizePlayerName('José')).toBe('José');
  });
});
