// OTA-635 — player-name hygiene. The name is SPOKEN aloud by the Kokoro voice, so
// it has to be pronounceable letters and bounded in length: otherwise an emoji /
// number / symbol salad confuses the synth, and "175 J's in a row" makes it read
// for half an hour. Strip to letters (any script) + spaces / hyphen / apostrophe
// (so real names like "Mary-Jane" or "O'Brien" survive), collapse whitespace,
// trim, and hard-cap the length.

/** Max characters kept for a player name (the voice reads it aloud). */
export const PLAYER_NAME_MAX = 24;

/** Clean a raw typed name down to a speakable, bounded string. May return ''
 *  (or a <2-char remnant) if the input was all emoji/digits/symbols — callers
 *  should reject that and re-prompt rather than accept an empty name. */
export function sanitizePlayerName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\s'\-]/gu, '') // letters (any script) + space + apostrophe + hyphen
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PLAYER_NAME_MAX);
}
