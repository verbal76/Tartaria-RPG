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

/**
 * TTS-only text cleanup. Strips / rewrites symbols that the engine
 * would otherwise read literally (the player would hear "right
 * arrow" for → or "minus two" for -2). The visible game log keeps
 * the original symbols — this transform applies only to the copy
 * we hand to the engine.
 *
 * Rules:
 *   - " → " / " ← " / " ⇒ " / " -> "  →  " to " (travel arrows)
 *     Bare-symbol fallback (no surrounding spaces) drops to " to "
 *     too, just in case.
 *   - "-N" preceded by start / whitespace / punctuation  →
 *     "negative N" (the visible "-2 AC" stays; the spoken line
 *     becomes "negative 2 AC"). Word-internal hyphens like
 *     "well-known" or "Mud-fist" are untouched.
 *   - "×N" / "x N" stays — engine handles "times" fine.
 *   - "·" middle-dot → ", " so the engine pauses naturally instead
 *     of reading "middle dot".
 */
export function cleanForSpeech(text: string): string {
  let out = text;
  // Arrows — single or surrounded by spaces.
  out = out.replace(/\s*[→←⇒⇐]\s*/g, ' to ');
  out = out.replace(/\s*->\s*/g, ' to ');
  // Middle-dot separator becomes a comma+space so we get a breath.
  out = out.replace(/\s*·\s*/g, ', ');
  // Unicode "minus sign" (U+2212) shows up in combat lines emitted by
  // the dice/roll formatter and weapon-effect narration. Normalize it
  // to the ASCII "-" so the negative-number rule below catches it.
  out = out.replace(/−/g, '-');
  // Negative numbers — only when "-" is at a word boundary preceding
  // a digit, so word-internal hyphens (e.g. "well-known", "Mud-fist
  // Wraps") aren't touched.
  out = out.replace(/(^|[\s(\[{,;])-(\d)/g, '$1negative $2');
  return out;
}

/** Exposed for tests + the settings card so we can show the player
 *  the override count ("12 lore words pronounced manually"). */
export function getLexiconSize(): number {
  return LEXICON.length;
}
