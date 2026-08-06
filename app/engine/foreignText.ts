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

// OTA-1053 — INSTRUCTION-ECHO DETECTOR. The local model is small enough that it
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
  // ⚠ OTA-1154 — THE PROMPT'S OWN FIELD LABELS, TAKEN VERBATIM FROM THE LOG.
  // The device log for OTA-1152 carried this, on screen AND voiced aloud:
  //
  //   [arbiter] Your read of them: HP 24/24, Stamina 8/14, AC 10 You, the
  //             seasoned traveler, have
  //
  // That is the ambient prompt's own line — `Your read of them: ${player_stats}`
  // — recited back and then continued from. Every guard above is about the
  // model reciting its INSTRUCTIONS; none covered it reciting the FACTS BLOCK,
  // which is just as much prompt and reads even worse, because it puts raw
  // numbers in the narrator's mouth.
  //
  // Anchored on the literal strings the prompt emits, per OTA-1148's rule:
  // when a log hands you the exact failing input, build the guard around THAT
  // STRING rather than around a reconstruction of it.
  /\byour read of them\b/i,
  /\bentities present\b/i,
  /\binventory & equipment\b/i,
  /^\s*(stats|location|environment|exits)\s*:/i,
  // …and the SHAPE of the stat block, which is the half that survived in the
  // log after its label. No narration ever says "HP 24/24, Stamina 8/14" —
  // that is a readout, not a sentence.
  /\bhp \d+\s*\/\s*\d+\s*,\s*stamina \d+\s*\/\s*\d+/i,
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

// OTA-1054 — "You …" openers, split by REGISTER rather than banned outright.
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
// OTA-1062 — THE WHITELIST WAS FAIL-CLOSED, AND THAT IS WHY THE FEATURE NEVER
// WORKED. OTA-1054 listed the reflective openers it knew and dropped everything
// else that began with "You" — so any phrasing nobody anticipated was killed on
// sight. The owner's instrumented log finally caught it in the act:
//
//   arbiter: ambient-empty reason=action-opener
//   raw="You, my companion, have traveled far and wide, but the distance
//        between you and the ancient city you once called home ha…"
//
// That is precisely the reflective companion line ambient exists to write. It
// died because an appositive sat between the pronoun and the verb: the old rule
// required `you\s+have`, and "You, my companion, have" put a comma there. One
// unanticipated comma, and a whole feature produced nothing across four builds.
//
// So this no longer guesses at every good phrasing. It names the BAD one and
// lets everything else through — fail OPEN. A hallucinated scene opens with a
// present-tense physical action ("You step back", "You reach for the lid");
// reflection does not. The asymmetry matters: a scene line slipping through
// costs one odd sentence, while a reflection wrongly blocked costs the entire
// feature, which is the bill we have been paying.
//
// Deliberately EXCLUDED as ambiguous — each reads either way, so fail open:
// take/drop/strike/fire/run/rise/stop/pause ("You drop your guard less often
// now" is reflection; "You drop your pack" is scene).
const SCENE_ACTION_OPENER =
  /^\s*you\b(?:\s*,[^,]{1,40},)?\s+(?:\w+ly\s+)?(?:step|turn|reach|walk|move|look|glance|peer|kneel|crouch|stand|sit|lean|pull|push|draw|raise|lower|open|close|grab|enter|exit|climb|descend|swing|slash|stab|throw|scan|search|survey|approach|follow|cross|slip|duck|dive|creep|crawl|slide|press|lift|place|pick|toss|hurl|swipe|dodge|sprint)\b/i;

/** True for a second-person opener that reads as SCENE NARRATION ("You step
 *  back…") rather than reflection ("You have come a long way…"). Only the
 *  ambient companion path uses it: reactive narration is *supposed* to describe
 *  what just happened, so it must never filter these.
 *
 *  Fails OPEN — an opener this doesn't recognise is allowed through. Adding a
 *  verb here can silence a real line, so add only unambiguous physical actions. */
export function isSecondPersonActionOpener(sentence: string): boolean {
  return SCENE_ACTION_OPENER.test(sentence);
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
