// OTA-635 — player-name hygiene. The name is SPOKEN aloud by the Kokoro voice, so
// it has to be pronounceable letters and bounded in length: otherwise an emoji /
// number / symbol salad confuses the synth, and "175 J's in a row" makes it read
// for half an hour. Strip to letters (any script) + spaces / hyphen / apostrophe
// (so real names like "Mary-Jane" or "O'Brien" survive), collapse whitespace,
// trim, and hard-cap the length.
//
// ⚠⚠ OTA-1230 — TWO HOLES THE ORIGINAL RULE COULD NOT SEE, both found by running
// the shipped sanitizer against real input rather than reading it. Owner: *"are
// we able to stop people from entering emojis in any special characters in the
// name line?"* Mostly yes, already — but "letters" is a bigger category than it
// sounds, and the answer measured out like this:
//
//   BEFORE            AFTER-1253
//   "🔥💀👾"      ""        ""          already refused, re-prompts
//   "V🎮erbal!"   "Verbal"  "Verbal"    already fine
//   "Verbal123"   "Verbal"  "Verbal"    already fine
//   "𝓥𝓮𝓻𝓫𝓪𝓵"      "𝓥𝓮𝓻𝓫𝓪𝓵"   "Verbal"    ⚠ WAS LETTING IT THROUGH
//   "Ｖｅｒｂａｌ"   "Ｖｅｒｂａｌ"  "Verbal"    ⚠ WAS LETTING IT THROUGH
//   "Ⓥⓔⓡⓑⓐⓛ"      ""        "Verbal"    ⚠ was destroying a legible name
//   "ᴠᴇʀʙᴀʟ"      "ᴠᴇʀʙᴀʟ"   "verbal"    ⚠ WAS LETTING IT THROUGH
//   "नमस्ते"        "नमसत"     "नमस्ते"      ⚠⚠ WAS MANGLING A REAL NAME
//
// ⚠ (1) FANCY LOOKALIKES ARE UNICODE LETTERS. Mathematical script, fullwidth,
// circled, roman-numeral and superscript blocks are all category L, so the
// letters-only filter waved them through — they render as garbage in most fonts
// and the voice cannot pronounce a word of it. NFKC (compatibility) folds every
// one of those back to plain Latin instead of stripping them, so the player gets
// the name they meant rather than a refusal. The one block NFKC does not cover
// is Latin small-caps / phonetic extensions, folded below by hand.
//
// ⚠⚠ (2) AND THE OPPOSITE MISTAKE, WHICH WAS THE WORSE ONE: combining marks were
// stripped as "not letters". In Devanagari, Thai, Hebrew and Arabic those marks
// are not decoration — the virama in नमस्ते JOINS two letters, and removing it
// broke a legitimate name into नमसत without telling anyone. Marks are now kept.
// Zalgo (V̸̢͈e̷r̴b̸a̶l̷ — 8 marks over 6 letters) is handled by BOUNDING the run
// instead of banning the category: real scripts never stack more than two marks
// on one base, and that is the line drawn here.
//
// ⚠ WHAT THIS IS NOT: a security boundary. The name is stored as a plain string
// and rendered through <Text>, which has no markup path — see the OTA-1230 audit
// in VERSION.md. This function exists so the name is READABLE and SPEAKABLE, not
// because anything downstream is unsafe with odd characters in it.

/** Max characters kept for a player name (the voice reads it aloud). */
export const PLAYER_NAME_MAX = 24;

/** ⚠ Latin small-caps and phonetic extensions (U+1D00–U+1DBF). NFKC leaves these
 *  alone — they have no compatibility decomposition — so "ᴠᴇʀʙᴀʟ" survived as
 *  "letters" and the voice had nothing to say. Folded by hand to plain Latin. */
const SMALL_CAPS_FOLD: Readonly<Record<string, string>> = {
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h',
  'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p',
  'ǫ': 'q', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y',
  'ᴢ': 'z',
};

/** ⚠ Two marks per base character. Devanagari and Hebrew need two; Thai needs
 *  two; zalgo needs dozens. Bounding the run keeps every real script intact and
 *  collapses the abuse case, which banning the category outright could not do. */
const MAX_MARKS_PER_BASE = 2;

function foldMarkRuns(s: string): string {
  let out = '';
  let run = 0;
  for (const ch of s) {
    if (/\p{M}/u.test(ch)) {
      if (run < MAX_MARKS_PER_BASE) { out += ch; run++; }
      // else: drop it — this is the zalgo tail
    } else {
      out += ch;
      run = 0;
    }
  }
  return out;
}

/** Clean a raw typed name down to a speakable, bounded string. May return ''
 *  (or a <2-char remnant) if the input was all emoji/digits/symbols — callers
 *  should reject that and re-prompt rather than accept an empty name. */
export function sanitizePlayerName(raw: string): string {
  // ⚠ NFKC, not NFC. NFC preserves the lookalike blocks as distinct characters;
  // NFKC is the COMPATIBILITY fold that maps 𝓥 / Ｖ / Ⓥ / Ⅴ / ⱽ all back to V.
  // That is the whole first fix, and it is one letter of difference.
  const folded = [...raw.normalize('NFKC')]
    .map((ch) => SMALL_CAPS_FOLD[ch] ?? ch)
    .join('');
  return foldMarkRuns(folded)
    // Letters (any script), MARKS (so joined scripts survive), space, apostrophe,
    // hyphen. Everything else — emoji, digits, punctuation, symbols — is dropped.
    .replace(/[^\p{L}\p{M}\s'\-]/gu, '')
    .replace(/\s+/g, ' ')
    // ⚠ OTA-1230 — hyphen and apostrophe are kept for Mary-Jane and O'Brien, and
    // that allowance was being used as a loophole: "Rob--------" and "''''Rob"
    // cleaned to themselves, because every character in them is on the keep
    // list. Collapse runs to one, and never let a name open or close on
    // punctuation — a real name does neither.
    .replace(/-{2,}/g, '-')
    .replace(/'{2,}/g, "'")
    .replace(/^[\s'\-]+|[\s'\-]+$/g, '')
    .trim()
    .slice(0, PLAYER_NAME_MAX)
    // The slice can land mid-punctuation on a truncated name; tidy the tail again.
    .replace(/[\s'\-]+$/g, '');
}

/** ⚠ OTA-1230 — DID THE CLEAN CHANGE ANYTHING THE PLAYER TYPED? The strip used to
 *  be silent: type "Verbal123" and you simply became "Verbal", with no line
 *  anywhere saying so, and the first time you noticed was the character sheet.
 *  Callers use this to say it out loud once, in the Arbiter's voice.
 *
 *  Compared against the TRIMMED raw input, so ordinary leading/trailing spaces
 *  never trigger a message about nothing. */
export function nameWasAltered(raw: string, cleaned: string): boolean {
  return raw.trim().replace(/\s+/g, ' ') !== cleaned;
}
