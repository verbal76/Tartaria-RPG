// foreignText — strip non-English (foreign-script / romanized-foreign) WORDS that
// the local Qwen model occasionally code-switches into otherwise-English
// narration. A playtester saw "huà" (romanized Chinese 话) land in the Arbiter
// feed. The game narrates in English only, so any whitespace-delimited word that
// carries a foreign letter — a CJK/Cyrillic/Greek/Thai/etc. character, an accented
// Latin letter, or a pinyin/Vietnamese tone mark — is dropped whole.
//
// Deliberately range-based (NO \p{...} Unicode property escapes): Hermes' regex
// support for property escapes is unreliable, so we test raw code points instead.
// Typographic punctuation (smart quotes, em dash, ellipsis) is NOT flagged, so
// contractions and stylized punctuation survive untouched.

// Code-point ranges that mark a letter as "not English."
const FOREIGN_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], // combining diacritical marks — pinyin/Vietnamese tone marks
  [0x00c0, 0x024f], // Latin-1 Supplement + Latin Extended-A/B accented letters
  [0x1e00, 0x1eff], // Latin Extended Additional — Vietnamese precomposed vowels
  [0x0370, 0x1cff], // Greek, Cyrillic, Hebrew, Arabic, Indic, Thai, … letters
  [0x3000, 0xd7ff], // CJK punctuation + Kana + CJK ideographs + Hangul
  [0xf900, 0xfaff], // CJK compatibility ideographs
];

// × (0x00d7) and ÷ (0x00f7) sit inside the Latin-1 range but are math SYMBOLS,
// not foreign letters — never let them trigger a word drop.
const SYMBOL_EXCEPTIONS = new Set<number>([0x00d7, 0x00f7]);

function isForeignCodePoint(cp: number): boolean {
  if (SYMBOL_EXCEPTIONS.has(cp)) return false;
  for (const [lo, hi] of FOREIGN_RANGES) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/** Repair GLUED words in generated narration. Qwen 0.5B occasionally emits a token
 *  boundary with no space, so two words run together with a lowercase→Uppercase seam —
 *  the playtest caught "theYou stood in the shadowy chamber…". English narration prose
 *  never has intra-word camelCase (place/faction/item names are space- or hyphen-
 *  separated), so a lowercase letter immediately followed by an uppercase one inside a
 *  token is always a missing-space glue. We split those, then drop an article left in
 *  front of a subject pronoun (English has no "the You" / "a I"), which is what the
 *  leading-article glue ("theYou" → "the You" → "You") really was. */
export function repairGluedNarration(text: string): string {
  if (!text) return text;
  let s = text.replace(/([a-z])([A-Z])/g, '$1 $2');           // un-glue: "theYou" → "the You"
  s = s.replace(/\b(?:the|a|an)\s+(You|I|We|They|He|She|It)\b/g, '$1'); // no "the You" → "You"
  return s.replace(/\s{2,}/g, ' ').trim();
}

// OTA-1030 — INSTRUCTION-ECHO DETECTOR. The local model is small enough that it
// sometimes answers a prompt by reciting the prompt: the owner watched the
// ambient brief's own opening sentence appear at Asgardar as an Arbiter line.
// These patterns are meta-text about HOW to narrate — a word-count, a "do not"
// rule, a third-person label for the person being narrated to. None of them can
// occur inside a real 18-word grim aside, so matching one means the output is
// the brief coming back, not a line.
const INSTRUCTION_ECHO_PATTERNS: readonly RegExp[] = [
  // The narration is second person. Anything calling them "the player" is the
  // brief talking ABOUT them, not the Arbiter talking TO them.
  /\b(the player|the adventurer|the explorer|the figure)\b/i,
  // The exact phrase from the brief the owner saw recited back.
  /\bwalked beside\b/i,
  // Craft directions: length caps, register notes, meta nouns.
  /\bone short (sentence|line|aside)\b/i,
  /\b(no more than|about)\s+\d+\s+words\b/i,
  /\bunprompted\b/i,
  /\bsecond[- ]person\b/i,
  /\bsystem facts\b/i,
  /\bdo not (narrate|react|invent|repeat|restate)\b/i,
  /\b(restate|these directions)\b/i,
  /\b(the|their) last action\b/i,
  /\bavailable player actions\b/i,
  /\bidle companion talk\b/i,
  // An imperative ALONE is not a tell — the Arbiter really does say "Do not
  // look behind you." and "Speak carefully." (both authored lines, and an
  // earlier draft of this guard silently ate them). What marks a craft
  // direction is an imperative aimed at a CRAFT OBJECT — a sentence, a word
  // count, a register — within the same clause.
  /^\s*(speak|write|narrate|make|keep it|end)\b[^.!?]{0,80}\b(sentence|words|tone|register|person|aside|narration|instructions?|companion who|reflection)\b/i,
];

/** True when generated text is the model reciting its own brief rather than
 *  narrating. Used three ways: to blank the LIVE streaming preview the instant
 *  it turns into meta-text (the leak the owner actually saw — the preview shows
 *  raw tokens, and the post-generation filters can only clean the FINAL line),
 *  and as a belt-and-braces sentence filter on both narration paths. */
export function looksLikeInstructionEcho(text: string): boolean {
  if (!text) return false;
  return INSTRUCTION_ECHO_PATTERNS.some((re) => re.test(text));
}

// OTA-1031 — "You …" openers, split by REGISTER rather than banned outright.
// The ambient companion filter used to drop every sentence starting with "You",
// to kill a real failure (the model narrating invented scenery — "You step
// back, surveying the alleyway" — inside a room that has no alleyway). But the
// shared VOICE_RULES *command* the model to start sentences with "You", so that
// filter discarded the ambient path's own output by construction: both of the
// owner's logs show `arbiter: ambient ∅` and never once `ambient ✓`.
//
// The tell isn't the pronoun, it's the VERB. A scene hallucination opens with a
// present-tense action ("You step / turn / reach"); a reflection — the thing
// ambient exists to produce — opens with a state or perfect ("You have come…",
// "You've grown…", "You carry it better now"). Allow the second, drop the first.
const REFLECTIVE_YOU_OPENER =
  /^\s*you(?:'(?:ve|re|ll|d))\b|^\s*you\s+(?:have|has|had|are|were|was|will|can|could|would|should|used|came|come|arrived|learned|learnt|grew|grown|changed|carry|carried|bear|bore|wear|wore|know|knew|remember|remembered|forget|forgot|never|always|still|no|not|do|don't|didn't|weren't|aren't|seem|seemed|began|begin|stopped|survived|lasted|lived)\b/i;

/** True for a second-person opener that reads as SCENE NARRATION ("You step
 *  back…") rather than reflection ("You have come a long way…"). Only the
 *  ambient companion path uses it: reactive narration is *supposed* to describe
 *  what just happened, so it must never filter these. */
export function isSecondPersonActionOpener(sentence: string): boolean {
  if (!/^\s*you\b/i.test(sentence)) return false; // not a bare "You …" opener
  return !REFLECTIVE_YOU_OPENER.test(sentence);
}

/** Drop any word containing a foreign letter; collapse the gaps + tidy the
 *  spacing left before punctuation. English-only narration in → English-only
 *  narration out. Returns '' if every word was foreign (caller falls back to a
 *  template). */
export function stripForeignWords(text: string): string {
  if (!text) return text;
  return text
    .split(/(\s+)/) // keep whitespace runs as their own segments
    .map((seg) => {
      if (/^\s*$/.test(seg)) return seg; // preserve spacing
      for (const ch of seg) {
        if (isForeignCodePoint(ch.codePointAt(0)!)) return ''; // drop the whole word
      }
      return seg;
    })
    .join('')
    .replace(/\s{2,}/g, ' ')      // collapse the double-spaces a dropped word leaves
    .replace(/\s+([.,;:!?…])/g, '$1') // pull punctuation back onto the prior word
    .trim();
}
