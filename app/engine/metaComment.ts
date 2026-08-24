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

const REPORT_MARKERS: readonly RegExp[] = [
  /\bit\s+(told|showed|gave)\s+me\b/i,
  new RegExp(String.raw`\bit\s+(?:wo|will|would|did|does|is|was)${NOT}\s+(?:let|allow|show|tell|give)\b`, 'i'),
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
