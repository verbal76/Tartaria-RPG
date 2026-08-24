// ⚠⚠⚠ OTA-1464 — TELLING A BUG REPORT FROM A COMMAND.
//
// The owner types notes to me straight into the game's input box, mid-session.
// When one of those is read as a command, the game ACTS on it — and on
// 2026-08-23 that cost him a character:
//
//   [player] hitting summon when there were already enemies screwed up that fight
//   parser: intent=cast conf=1.00 verb=summon target=enemies screwed fight
//   skillcheck: cast d20=2 INT 11 = 13 vs DC 12 — Hard → PASS
//   [world] An Eternal Dynasty war party crests the rise — 2 of them, blades out.
//
// He was DESCRIBING a summon that had gone wrong. The game cast one, spent his
// materials, and spawned the war party that killed him eleven minutes later.
//
// ⚠⚠ TWO SEPARATE FAILURES PRODUCED THAT, and the second is the interesting one.
//
//   1. DETECTION. The old guard was two regexes tuned to polite feature requests
//      ("ok we should add...") and frustration vents ("this game is..."). Both
//      are BLOCKLISTS OF PHRASINGS, so they are permanently one phrasing behind
//      the person typing. Of the eight notes he typed across two sessions, five
//      matched and three did not — and the three misses are not exotic, they are
//      just ordinary English about what happened.
//
//   2. ⚠⚠⚠ THE SPLITTER RAN THE GUARD'S BYPASS FLAG. gameStore's clause splitter
//      re-submits each clause with `{ skipPreChecks: true }`, and the guard is
//      gated on `!_opts?.skipPreChecks`. So the guard NEVER RAN ON A CLAUSE. A
//      note typed as several sentences was split into fragments and every one
//      was handed to the verb parser with the guard switched off:
//
//        multi-clause: 5 parts
//        parser: intent=gift conf=1.00 target=scrap metal ... told cannot equip
//        parser: intent=gift conf=1.00
//        parser: intent=gift conf=0.48 target=glitch
//
//      Three gift attempts out of one bug report. This is the many-doors mistake
//      in its purest form: the rule was taught to the front door and the side
//      door was left open, and the side door is the one prose walks through.
//
// ⚠ WHY THIS IS A MODULE AND NOT TWO MORE REGEXES IN gameStore. A predicate that
// decides whether to run the whole parser deserves to be exercised against real
// inputs, in both directions, without booting a store. The corpus in
// `__tests__/ota1464.test.ts` is every note he actually typed and every command
// he actually issued, taken verbatim from the logs — including the pair that
// matters most:
//
//     "summon crystal golem"                                   → COMMAND
//     "hitting summon when there were already enemies screwed
//      up that fight"                                          → NOTE
//
// Both contain the word `summon`. Nothing but shape separates them.

/** Why an input was judged a note rather than a command. Surfaced in the debug
 *  log so a future miss can be diagnosed from a device log instead of guessed
 *  at — the old guard printed only a character count, which said nothing about
 *  WHICH rule fired or why the ones that didn't, didn't. */
export type MetaCommentReason =
  | 'ui-vocabulary'
  | 'engine-vocabulary'
  | 'report-of-behaviour'
  | 'suggestion'
  | 'frustration';

export interface MetaCommentVerdict {
  isMeta: boolean;
  reason: MetaCommentReason | null;
  /** The substring that triggered it. Debug only — makes a false positive
   *  diagnosable from the log line alone. */
  match: string | null;
}

/** ⚠ Below this, prose is indistinguishable from a terse command and we let the
 *  parser have it. "flee", "rest", "go east", "fuse" all live down here. The
 *  STRONG markers ignore this floor because they carry their own certainty. */
const PROSE_MIN_LEN = 34;

/**
 * ⚠⚠⚠ WORDS THAT ARE NEVER IN THE FICTION. Tartaria has mud, Aether, Cores and
 * Guardians. It does not have pop-ups. Any length: if one of these appears, the
 * player has stopped addressing the world and started addressing the software.
 *
 * ⚠ `screen` and `button` are deliberately NOT here — they are plausible in a
 * room description ("a cracked screen", "press the button") and so they live in
 * the length-gated tier below. The test corpus proves the split is real: the
 * note that says "at the top of the screen" is caught by `glitch` instead.
 */
const STRONG_MARKERS: readonly RegExp[] = [
  /\bglitch(es|ed|y)?\b/i,
  /\bbugg?(y|ed)?\b(?!\s*(swarm|s\b))/i,   // "bug"/"buggy" but not a bug swarm
  /\bpop-?ups?\b/i,
  /\bscreen-?shots?\b/i,
  /\bscreen\s+shot\b/i,
  /\btool-?tips?\b/i,
  /\bdrop-?downs?\b/i,
  /\bhot-?keys?\b/i,
  /\bthis\s+(game|app|build)\b/i,
  /\bthe\s+(game|app|parser|engine|ui)\s+(is|was|keeps|kept|won'?t|doesn'?t|didn'?t|should|needs?)\b/i,
];

/**
 * ⚠⚠ THE SOFTWARE NARRATING ITSELF. A player commands the world in the
 * imperative; a reporter describes what a system DID to them, in the past
 * tense, with the interface as the subject. "it told me", "it wouldn't let me",
 * "screwed up that fight" — these are the shapes the old guard had no concept
 * of, and they are what both misses were made of.
 */
/**
 * ⚠⚠ NEGATION, SPELLED BOTH WAYS. The first draft wrote `doesn'?t`, which
 * matches "doesnt" and "doesn't" and NOT "does not" — and people type both, in
 * the same paragraph. A clause reading "the button is broken and does not work"
 * sailed straight through to the parser while "doesn't work" was caught, which
 * is a distinction no player could be expected to know about.
 *
 * Recorded because it is the same shape as the apostrophe bug in
 * check:voicepools and the non-greedy-paren bug in ota1152: a hand-written
 * pattern that covers the spelling its author happened to think of first.
 */
const NOT = String.raw`(?:\s*n'?t|\s+not)`;

/**
 * ⚠⚠⚠ OTA-1473 — THE WORDS OF SOMEBODY WHO KNOWS HOW IT IS BUILT.
 *
 * The 4.32.11 log has four notes that reached the parser on a build that
 * already carried OTA-1464, and two of them the game ACTED ON:
 *
 *   "the last text box was half covered by the keyboard"
 *      → intent=help verb=cover target=keyboard
 *      → "You shoulder in beside keyboard — but here, alone on the road,
 *         there's no second pair of hands to lift."
 *
 *   "any investigation story hook that ends in a trade now in a tile that has
 *    a vendor should not be able to spawn in that tile"
 *      → intent=unknown → "Your coil of tartarian filament is still there"
 *   "if there is already a vendor there that story hook gets skipped"
 *      → intent=maneuver verb=hook
 *      → "Maneuver against whom? Empty ground does not grapple back."
 *
 *   "I selected take and wear throwing knife and it did not go to my bandolier
 *    … wear did it go?"    → fell through to a 4.7s qwen parse, then refused
 *
 * ⚠⚠ THE TIER THAT WAS MISSING IS NOT ABOUT INTERFACE, IT IS ABOUT MACHINERY.
 * `UI_NOUNS` covers the things a player SEES — screen, button, menu — and is
 * length-gated because a room can hold a cracked screen. These are different:
 * `spawn`, `story hook`, `keyboard`, `text box` are words for how the thing is
 * BUILT. Tartaria has no keyboards and nothing in it spawns; a character in the
 * fiction could not form these sentences. So they need no length gate and no
 * corroboration, exactly like `glitch` — they carry their own certainty.
 *
 * ⚠ WHAT IS DELIBERATELY ABSENT, because each was checked against the world:
 *   • bare `hook`     — "Dried meat on hooks" is scene prose and "investigate
 *                       hooks" is a real command he could type. Only the
 *                       compound `story hook` is safe.
 *   • bare `tile`     — the game itself says "2 tiles" AND a kitchen tile is a
 *                       salvageable noun. Ambiguous both ways.
 *   • `build`, `flag` — "build a golem", a faction banner. Both in-world.
 *   • `state`, `cap`  — too generic to be evidence of anything.
 *
 * ⚠ And `spawn` was verified never to reach the player: it appears 452 times in
 * the source, but only ever as an identifier (`${spawn.name}`), never as a word
 * in a line anyone reads. A player cannot be parroting it back at us.
 */
const ENGINE_VOCABULARY: readonly RegExp[] = [
  /\bre-?spawn(s|ed|ing)?\b/i,
  /\bspawn(s|ed|ing)?\b/i,
  /\bstory\s+hooks?\b/i,
  /\bkey-?boards?\b/i,
  /\btext\s*(box|boxes|field|fields)\b/i,
  /\bscroll-?bars?\b/i,
  /\bmodals?\b/i,
  /\b(ui|ux|hud)\b/i,
  /\bota\b/i,
  /\bparser\b/i,
];

const REPORT_MARKERS: readonly RegExp[] = [
  /\bit\s+(told|showed|gave)\s+me\b/i,
  new RegExp(String.raw`\bit\s+(?:wo|will|would|did|does|is|was)${NOT}\s+(?:let|allow|show|tell|give)\b`, 'i'),
  // ⚠⚠ OTA-1473 — THE VERB LIST WAS THE BUG, not the shape. "it did not LET me"
  // was covered; "it did not GO to my bandolier" was not, and neither was "nor
  // did it end up in my weapons inventory" — the same sentence, twice, from the
  // same note. Enumerating the verbs somebody might use is the copied-constant
  // mistake in a new costume, so the verb is now ANY verb: what makes this a
  // report is the SUBJECT (a bare `it`/`they`/`that`, i.e. the software) plus a
  // negated past-tense outcome. No command has that shape — a player says
  // "attack it", never "it did not go".
  new RegExp(String.raw`\b(?:it|they|that)\s+(?:wo|will|would|did|does|do|is|was|were|are|has|have|had)${NOT}\s+\w+`, 'i'),
  new RegExp(String.raw`\bnor\s+(?:did|does|do|is|was|were|has|have)\b`, 'i'),
  /\bit\s+(keeps|kept)\s+\w+ing\b/i,
  /\b(screwed|messed|fouled)\s+up\b/i,
  new RegExp(String.raw`\b(?:does|do|is|are|was|were|will|would|did)${NOT}\s+work(?:ing)?\b`, 'i'),
  /\bnot\s+working\b/i,
  /\bsupposed\s+to\b/i,
  /\bthere\s+(was|is)\s+no\s+\w+\s+(telling|saying|explaining)\b/i,
  /\bwhen\s+i\s+.{0,60}\bit\s+(refreshes|resets|puts|went|goes|shows|said|says|told)\b/i,
];

/**
 * ⚠ INTERFACE NOUNS — real words that CAN appear in the fiction, so they only
 * count inside prose long enough that a terse command is ruled out. This is the
 * tier that carries the risk of a false positive, which is why it is gated on
 * length AND why the corpus test asserts every real command he issued still
 * passes through untouched.
 */
const UI_NOUNS = /\b(screens?|buttons?|tabs?|menus?|banners?|chips?|sliders?|checkboxes?)\b/i;

/** Polite feature-request shape. Kept verbatim from the original guard — it
 *  caught five of his eight notes and there is no reason to disturb it. */
const SUGGESTION =
  /^(ok\b|btw\b|fyi\b|hey\b|so\b|also\b|when (i|the)\b)|(\b(we|i) ((\w+)\s+)?(should|need|could|gotta|gonna|wish|want|really)\b|\byou should\b|\bi think\b|\bi'?d like\b|\bcan we\b|\bcould you\b|\bshould have\b|\bneeds? to be\b|\bit should (have|be|also)\b|\badd a\b|\bplease add\b)/i;

/**
 * ⚠⚠ OTA-1473 — A DESIGN DIRECTIVE WITH SOMEBODY ELSE AS THE SUBJECT.
 *
 * `SUGGESTION` above requires the sentence to be about `we` or `I` — "we should
 * add", "I think". But a specification names the THING, not the speaker:
 *
 *   "…should not be able to spawn in that tile"
 *   "…that story hook gets skipped"
 *
 * The subject there is a story hook, so every alternative in the pattern above
 * missed, and the second clause parsed as `intent=maneuver verb=hook`. These
 * shapes are prescriptive whoever the subject is — "X should be able to Y" and
 * "X gets skipped" are sentences about how the game ought to behave, and there
 * is no command that reads like one.
 *
 * ⚠ Length-gated with the rest of this tier, deliberately: "should" alone is far
 * too common to trust in a short line.
 */
const DESIGN_DIRECTIVE: readonly RegExp[] = [
  /\bshould(\s+not|n'?t)?\s+be\s+able\s+to\b/i,
  /\bshould(\s+not|n'?t)?\s+(spawn|appear|show|fire|trigger|render|happen|exist)\b/i,
  /\bget(s|ting)?\s+skipped\b/i,
  /\bshould(\s+not|n'?t)?\s+be\s+(there|here|possible|allowed)\b/i,
];

/** Frustration vent. Also kept from the original. */
const FRUSTRATION: readonly RegExp[] = [
  /\bsorry\s+(guys|y'?all|everyone|folks|all|dudes)\b/i,
  /\b(i\s+tried|tried\s+to)\s+.{0,30}\b(game|app|engine|parser|menu|button|inventory)\b/i,
  /\bthis\s+(game|app)\s+(is|keeps|won'?t|doesn'?t|wont|dont)\b/i,
  /\bthe\s+game'?s?\s+(being|is|was)\b/i,
  /\b(retarded)\b/i,
];

const firstMatch = (text: string, pats: readonly RegExp[]): string | null => {
  for (const p of pats) {
    const m = p.exec(text);
    if (m) return m[0];
  }
  return null;
};

/**
 * Is this input a note ABOUT the game rather than a command TO it?
 *
 * ⚠ Order matters only for the reported reason, never for the verdict — every
 * tier is checked and any hit is a hit. Reported most-certain first so a debug
 * line names the strongest evidence rather than whichever rule happened to sit
 * at the top of the file.
 */
export function classifyMetaComment(raw: string): MetaCommentVerdict {
  const text = String(raw ?? '').trim();
  if (!text) return { isMeta: false, reason: null, match: null };

  const strong = firstMatch(text, STRONG_MARKERS);
  if (strong) return { isMeta: true, reason: 'ui-vocabulary', match: strong };

  // ⚠ OTA-1473 — ungated, alongside STRONG. These words have no meaning inside
  // the fiction at all, so length adds nothing: a two-word "keyboard covered"
  // is as certainly a bug report as a two-hundred-character one.
  const engine = firstMatch(text, ENGINE_VOCABULARY);
  if (engine) return { isMeta: true, reason: 'engine-vocabulary', match: engine };

  const report = firstMatch(text, REPORT_MARKERS);
  if (report) return { isMeta: true, reason: 'report-of-behaviour', match: report };

  const vent = firstMatch(text, FRUSTRATION);
  if (vent) return { isMeta: true, reason: 'frustration', match: vent };

  // Length-gated tiers below this line.
  if (text.length < PROSE_MIN_LEN) return { isMeta: false, reason: null, match: null };

  const ui = UI_NOUNS.exec(text);
  if (ui && text.length > 60) {
    return { isMeta: true, reason: 'ui-vocabulary', match: ui[0] };
  }

  if (text.length > 60) {
    const sug = SUGGESTION.exec(text);
    if (sug) return { isMeta: true, reason: 'suggestion', match: sug[0] };
    // OTA-1473 — the same tier, with the subject freed. See DESIGN_DIRECTIVE.
    const spec = firstMatch(text, DESIGN_DIRECTIVE);
    if (spec) return { isMeta: true, reason: 'suggestion', match: spec };
  }

  return { isMeta: false, reason: null, match: null };
}

/** Boolean convenience — the same predicate. */
export function isMetaComment(raw: string): boolean {
  return classifyMetaComment(raw).isMeta;
}

/**
 * ⚠⚠⚠ THE CLAUSE RULE, AND THE REASON THIS FUNCTION EXISTS SEPARATELY.
 *
 * A bug report typed as five sentences is still ONE bug report. The old code
 * split it and ran each fragment as a command with the guard bypassed, so a
 * single note produced three gift attempts. Judging the clauses independently
 * would only shrink that to "run the fragments that don't individually look
 * like prose", which is still running fragments of a paragraph as commands.
 *
 * So: if the whole input reads as a note, OR ANY CLAUSE OF IT DOES, the entire
 * input is a note. Prose does not become a command by being cut up.
 */
export function anyClauseIsMeta(
  whole: string,
  clauses: readonly string[],
): MetaCommentVerdict {
  const full = classifyMetaComment(whole);
  if (full.isMeta) return full;
  for (const c of clauses) {
    const v = classifyMetaComment(c);
    if (v.isMeta) return v;
  }
  return { isMeta: false, reason: null, match: null };
}
