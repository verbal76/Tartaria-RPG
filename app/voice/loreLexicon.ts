// loreLexicon — respelling overrides for Tartaria-specific words so
// the bundled Kokoro TTS pronounces them naturally instead of
// stumbling on unusual letter combinations (Ae-, -ush, -ova, etc.).
//
// Approach: instead of feeding Kokoro IPA phonemes directly (which
// would require us to phonemize the surrounding sentence too),
// we respell the offending words using regular English letters that
// the built-in phonemizer reads correctly. This is the same trick
// audiobook narrators write into their scripts.
//
// Rules:
//   - Match whole words only (\b boundaries), case-insensitive.
//   - Replace with the lowercase respelling. Case doesn't affect
//     speech output — the audio is the same regardless.
//   - Add new entries below as players surface mispronunciations.
//
// Why spaces instead of hyphens between syllables:
//   Kokoro's phonemizer (espeak-ng) treats hyphens as compound-word
//   joiners, not syllable separators — so "tar-tair-ee-uh" gets
//   mashed into one phonemized blob and the syllable boundaries we
//   wrote are ignored. With spaces, espeak sees each chunk as a
//   separate word and applies its letter-to-sound rules per word,
//   which produces clean, distinct syllables.
//
//   Use unambiguous English-orthography spellings: "tare" rhymes
//   with "hare", "ter" with "her", "koh" with "go", "eether" with
//   "ether", etc.
//
// If a respelling still sounds wrong, try alternate spellings — the
// right answer depends on the canonical Tartaria pronunciation and
// how espeak's letter-to-sound rules treat specific letter combos.

const LEXICON: Array<[RegExp, string]> = [
  // Aether family — "Ae" is the tricky one. Default phonemizers
  // often read it as "aye" or "eh". Lore canon is "ee-ther".
  [/\bAetherstone\b/gi, 'eether stone'],
  [/\bAetheric\b/gi, 'eetheric'],
  [/\bAetherborn\b/gi, 'eether born'],
  [/\bAether\b/gi, 'eether'],

  // Place names — long-vowel + multi-syllable mishaps.
  // Tartaria = "tar TARE ee uh" — stress on the second syllable,
  // "tare" rhymes with "hare" (the standard English audiobook
  // respelling for /tɑrˈtɛriə/).
  [/\bTartaria\b/gi, 'tar tare ee uh'],
  [/\bTartarian\b/gi, 'tar tare ee an'],
  [/\bTartarians\b/gi, 'tar tare ee anz'],
  [/\bTartary\b/gi, 'tar ter ee'],
  [/\bDrakova\b/gi, 'druh koh vah'],
  [/\bVarakush\b/gi, 'var ah koosh'],
  [/\bAsgardar\b/gi, 'ahz gar dar'],
  [/\bVoronov\b/gi, 'vor uh nov'],
  [/\bSamarran\b/gi, 'sam ah ran'],
  [/\bThametan\b/gi, 'thuh meh tahn'],
  [/\bNimari\b/gi, 'nih mar ee'],
  [/\bZharak\b/gi, 'zhuh rak'],

  // Faction / role nouns sometimes mangled by stress placement.
  [/\bReclaimer\b/gi, 'ree clay mer'],
  [/\bReclaimers\b/gi, 'ree clay merz'],
  [/\bMud Monarchs\b/gi, 'mud mon arks'],
  [/\bMud Monarch\b/gi, 'mud mon ark'],

  // Lore objects.
  [/\bRunecaster\b/gi, 'rune caster'],
  [/\bRunecasters\b/gi, 'rune casters'],
  [/\bAetherbat\b/gi, 'eether bat'],
];

/**
 * Apply the lore lexicon to a chunk of text before it goes to the
 * Kokoro TTS engine. Pure function; safe to call on every speak().
 */
export function applyLoreLexicon(text: string): string {
  let out = text;
  for (const [pattern, replacement] of LEXICON) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Exposed for tests + the settings card so we can show the player
 *  the override count ("12 lore words pronounced manually"). */
export function getLexiconSize(): number {
  return LEXICON.length;
}
