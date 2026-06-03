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
  // Aether family — playtester spec OTA-107 (final, after a
  // round of IPA-driven detours in OTAs 103/105/106). User's
  // canonical pattern is UNIFORM across the family: long-A "ay"
  // + "thur" + suffix. Caps cue: AY-thur. The IPA respellings
  // shipped in OTAs 103/105 over-interpreted character-level
  // detail (rhotic schwa "ther" vs "thur"; /ɛθ/ short-E start
  // for born/bat) and produced TTS output that didn't match
  // the user's intended pronunciation. Reverted here.
  //   Aether       → "ay thur"
  //   Aetheric     → "ay thur ik"
  //   Aetherstone  → "ay thur stone"
  //   Aetherborn   → "ay thur born"
  //   Aetherbat    → "ay thur bat"
  [/\bAetherstone\b/gi, 'ay thur stone'],
  [/\bAetheric\b/gi, 'ay thur ik'],
  [/\bAetherborn\b/gi, 'ay thur born'],
  [/\bAetherbat\b/gi, 'ay thur bat'],
  [/\bAether\b/gi, 'ay thur'],

  // Place names — long-vowel + multi-syllable mishaps.
  // Tartar* family is two beats: "tar" + the rest as one rapid stress
  // group. Earlier 4-chunk respelling ("tar tair ee uh") read as four
  // slow emphasized syllables; collapsing the trailing chunks into one
  // unbroken token lets espeak-ng pronounce tair+ee+uh as a single
  // beat per the playtester's "tar then everything-else-together" spec.
  //   Tartaria   = "tar taireeuh"
  //   Tartarian  = "tar taireeun"
  //   Tartarians = "tar taireeunz"
  //   Tartary    = "tar tar ee" (unchanged — different word)
  [/\bTartaria\b/gi, 'tar taireeuh'],
  [/\bTartarian\b/gi, 'tar taireeun'],
  [/\bTartarians\b/gi, 'tar taireeunz'],
  [/\bTartary\b/gi, 'tar tar ee'],
  // Playtester spec OTA 219; place-name IPA refresh OTA-104 for
  // Asgardar, Samarran, Nimari per fresh playtester IPA:
  //   Asgardar /ɛz gɑdɔɹ/    → "ez gah dor"    (was "az gar dar")
  //   Samarran /ɛsɛmɔːɾɛn/   → "eh sem or en"  (was "sam ah ran")
  //   Nimari   /ɛnɛmɑɹi/     → "eh neh mah ree" (was "nih mar ee")
  // Common pattern: all three open with a leading /ɛ/ schwa
  // ("eh") that the prior respellings dropped. Samarran and Nimari
  // are 4-syllable words, not 3; the prior respellings collapsed
  // an internal vowel.
  [/\bDrakova\b/gi, 'dra koh vah'],
  [/\bVarakush\b/gi, 'vara koosh'],
  [/\bAsgardar\b/gi, 'ez gah dor'],
  [/\bVoronov\b/gi, 'voro nov'],
  [/\bSamarran\b/gi, 'eh sem or en'],
  [/\bThametan\b/gi, 'thuh meh tahn'],
  [/\bNimari\b/gi, 'eh neh mah ree'],
  [/\bZharak\b/gi, 'zah rak'],

  // Faction / role nouns sometimes mangled by stress placement.
  // Monarch — playtester spell-it-out spec OTA-109: "mon-nark"
  // (first syllable "mon" rhymes with "on", second syllable
  // "nark" rhymes with "park"). User initially gave IPA
  // /ˈmɑnɑrk/ in OTA-108 which I parsed as MAH-nark; when
  // refining to /ˈmɑːnɑːrk/ they clarified the ear they hear
  // is "mon-nark" — the standard English pronunciation with
  // the syllable-boundary N audible. The spell-it-out cue wins
  // over the IPA parse per the OTA-107 rule.
  [/\bReclaimer\b/gi, 'ree clay mer'],
  [/\bReclaimers\b/gi, 'ree clay merz'],
  [/\bMud Monarchs\b/gi, 'mud mon narks'],
  [/\bMud Monarch\b/gi, 'mud mon nark'],
  [/\bMonarchs\b/gi, 'mon narks'],
  [/\bMonarch\b/gi, 'mon nark'],

  // Lore objects.
  [/\bRunecaster\b/gi, 'rune caster'],
  [/\bRunecasters\b/gi, 'rune casters'],

  // English contractions where espeak's letter-to-sound rule lands on
  // the wrong vowel. "doesn't" comes out as "DOSE-ent" (like "rose")
  // instead of "DUZ-ent". Match with or without the apostrophe in case
  // the pipeline strips it before we get here.
  [/\bdoesn'?t\b/gi, 'duzzent'],
];

// OTA 013 — sort lexicon entries by pattern length descending so
// longer phrases always try first. "Aetherstone" should never be
// pre-empted by "Aether" matching the first 6 chars (\b boundaries
// usually prevent this, but the safety belt protects against future
// authors adding overlapping entries out of order).
const SORTED_LEXICON: Array<[RegExp, string]> = [...LEXICON]
  .sort((a, b) => b[0].source.length - a[0].source.length);

// 2026-05-25 [TTS-1] — IPA-override channel. The user asked "we
// should see if kokoro can read ipa text" with /tɑːrˈtɑːriə/ as
// the example case for "Tartaria." Kokoro's phonemizer is
// espeak-ng-derived, and espeak-ng accepts inline IPA wrapped in
// double brackets (e.g. `[[tɑːrˈtɑːriə]]`). Whether the bracket
// syntax survives the Kokoro tokenizer is verified on-device only
// — this map is OFF by default. To enable: flip the
// IPA_OVERRIDES_ENABLED flag at the top of applyLoreLexicon.
//
// If on-device test shows Kokoro speaks the IPA correctly, expand
// this map with the proper-noun set the playtester surfaces and
// drop the corresponding respelling regex from LEXICON above.
// If Kokoro speaks the brackets verbatim ("double-bracket open
// tee a colon r…"), leave disabled and rely on respellings only.
const IPA_OVERRIDES: Record<string, string> = {
  Tartaria:   'tɑːrˈtɑːriə',
  Tartarian:  'tɑːrˈtɑːriən',
  Tartarians: 'tɑːrˈtɑːriənz',
  Drakova:    'drəˈkoʊvə',
  Aether:     'ˈeɪθər',
};
function applyIPAOverrides(text: string): string {
  let out = text;
  for (const [word, ipa] of Object.entries(IPA_OVERRIDES)) {
    out = out.replace(new RegExp(`\\b${word}\\b`, 'gi'), `[[${ipa}]]`);
  }
  return out;
}

/**
 * Apply the lore lexicon to a chunk of text before it goes to the
 * Kokoro TTS engine. Pure function; safe to call on every speak().
 *
 * 2026-05-25 [TTS-1] — IPA experiment is OFF by default. Flip to
 * true to ship IPA-wrapped proper-noun output to Kokoro. If on-
 * device verification shows clean pronunciation, leave on and
 * remove the respelling regexes that the IPA entries cover.
 */
const IPA_OVERRIDES_ENABLED = false;
export function applyLoreLexicon(text: string): string {
  let out = IPA_OVERRIDES_ENABLED ? applyIPAOverrides(text) : text;
  for (const [pattern, replacement] of SORTED_LEXICON) {
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
  // Em / en dashes — playtester asked for these to speak as commas.
  // Some TTS engines read an em-dash as a long dead gap that can
  // swallow the clause after it (the "skipped sentence" report); a
  // comma gives a clean, natural pause instead. The visible game log
  // keeps the typographic dash — this only touches the spoken copy.
  // Surrounding spaces are collapsed so we don't leave a double space.
  out = out.replace(/\s*[—–]\s*/g, ', ');
  // Spaced ASCII hyphen used as a dash ("a cudgel - on the floor"). Same
  // problem as the em-dash: the engine reads it as a dead gap that eats
  // the next word. Only a hyphen with whitespace on BOTH sides matches, so
  // compound words ("well-known") and "-2" negatives are left untouched.
  out = out.replace(/\s+-\s+/g, ', ');
  // Unicode "minus sign" (U+2212) shows up in combat lines emitted by
  // the dice/roll formatter and weapon-effect narration. Normalize it
  // to the ASCII "-" so the negative-number rule below catches it.
  out = out.replace(/−/g, '-');
  // Negative numbers — only when "-" is at a word boundary preceding
  // a digit, so word-internal hyphens (e.g. "well-known", "Mud-fist
  // Wraps") aren't touched.
  out = out.replace(/(^|[\s(\[{,;])-(\d)/g, '$1negative $2');
  // OTA 223 — strip single-quote wrappers around a quoted word.
  // Playtester: "the Arbiter said 'I do not see a 'wreck' here' but
  // Kokoro skipped 'wreck' because of the single quotes." The
  // visible log keeps the quotes for emphasis (they read fine on
  // screen) but the TTS-bound copy drops them so espeak / Kokoro
  // pronounces the word cleanly.
  //
  // Pattern: 'TOKEN' where TOKEN has letters/digits/space/hyphen
  // (not another apostrophe) and is bounded outside by whitespace
  // or punctuation. This leaves possessives ("Mark's") and
  // contractions ("don't") untouched because they have letters on
  // both sides of the apostrophe.
  // OTA 013 — was {0,30} which silently passed longer quoted
  // phrases through to Kokoro unstripped. Widened to {0,160} so
  // any reasonable in-game quotation gets cleaned (most lines are
  // < 80 chars; 160 covers Arbiter dialog in full).
  out = out.replace(/(^|[\s(\[{>])'([A-Za-z0-9][A-Za-z0-9 \-]{0,160}[A-Za-z0-9])'(?=$|[\s)\].,!?;:])/g, '$1$2');
  // Same rule for "smart" single quotes ' and ' (U+2018 / U+2019)
  // — emitted by some authoring sources.
  out = out.replace(/(^|[\s(\[{>])[‘’]([A-Za-z0-9][A-Za-z0-9 \-]{0,160}[A-Za-z0-9])[‘’](?=$|[\s)\].,!?;:])/g, '$1$2');
  return out;
}

/** Exposed for tests + the settings card so we can show the player
 *  the override count ("12 lore words pronounced manually"). */
export function getLexiconSize(): number {
  return LEXICON.length;
}
