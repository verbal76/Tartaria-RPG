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
//     Keep respellings short and phonemic; rely on hyphens to break
//     syllables when needed.
//
// If a respelling produces a strange-sounding result, try alternate
// spellings: "ay-ther" vs "ee-ther" vs "eather" — the right answer
// depends on the canonical Tartaria pronunciation and how the
// phonemizer treats specific letter combinations on the device.

const LEXICON: Array<[RegExp, string]> = [
  // Aether family — "Ae" is the tricky one. Default phonemizers
  // often read it as "aye" or "eh". Lore canon is "ee-ther".
  [/\bAetherstone\b/gi, 'eatherstone'],
  [/\bAetheric\b/gi, 'eatheric'],
  [/\bAetherborn\b/gi, 'eatherborn'],
  [/\bAether\b/gi, 'eather'],

  // Place names — long-vowel + multi-syllable mishaps.
  [/\bTartaria\b/gi, 'tar-tair-ee-uh'],
  [/\bTartarian\b/gi, 'tar-tair-ee-an'],
  [/\bTartarians\b/gi, 'tar-tair-ee-anz'],
  [/\bTartary\b/gi, 'tar-ter-ee'],
  [/\bDrakova\b/gi, 'druh-koh-vah'],
  [/\bVarakush\b/gi, 'var-ah-koosh'],
  [/\bAsgardar\b/gi, 'ahz-gar-dar'],
  [/\bVoronov\b/gi, 'vor-uh-nov'],
  [/\bSamarran\b/gi, 'sam-ah-ran'],
  [/\bThametan\b/gi, 'thuh-meh-tahn'],
  [/\bNimari\b/gi, 'nih-mar-ee'],
  [/\bZharak\b/gi, 'zhuh-rak'],

  // Faction / role nouns sometimes mangled by stress placement.
  [/\bReclaimer\b/gi, 'ree-clay-mer'],
  [/\bReclaimers\b/gi, 'ree-clay-merz'],
  [/\bMud Monarchs\b/gi, 'mud mon-arks'],
  [/\bMud Monarch\b/gi, 'mud mon-ark'],

  // Lore objects.
  [/\bRunecaster\b/gi, 'rune-cast-er'],
  [/\bRunecasters\b/gi, 'rune-cast-erz'],
  [/\bAetherbat\b/gi, 'eather-bat'],
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
