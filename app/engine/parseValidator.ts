// parseValidator.ts — post-processing rules for the rule-based parser
//
// Architecturally modeled on Sleator & Temperley's link grammar
// post-processor (Parsing English with a Link Grammar, §7 "Post-
// processing"). They build a linkage with their connector system,
// then run a separate rule set over it to catch things the basic
// connector rules can't enforce elegantly (non-referential `it`,
// selectional restrictions, garbage parses). We do the analogous
// thing: parseInput() builds a candidate ParsedInput, then this
// validator runs rules over it and returns a list of violations.
// Non-empty → caller demotes the result to intent:'unknown' so the
// engine doesn't act on a junk parse.
//
// V1 rules (sufficient for the playtest-caught bugs):
//   1. META_TALK — sentences starting with "it is supposed to..." /
//      "that's wrong" / "should..." / etc. Player typing feedback
//      into the action input. Highest priority: the playtest
//      regression where typing "remove a noun item from the popup"
//      parsed as equip and cleared the player's hands.
//   2. TOO_LONG — content-token count > 12. Real commands are short
//      ("attack the drone with the bolt-caster" = 6 content tokens).
//      Long inputs are almost always commentary / questions / typos.
//   3. MISSING_REQUIRED — verb's frame requires a direct (etc.) but
//      none was extracted or what was extracted is garbage.
//   4. JUNK_IN_REQUIRED — the required slot's text contains words
//      from the UI-talk blacklist (`item`, `popup`, `button`,
//      `screen`, `menu`, `noun`, `verb`) which never appear in
//      real commands.
//
// Future rules (post-V1, when scope demands):
//   - Selectional restrictions: instrument must be a tool / weapon,
//     recipient must be an NPC, etc.
//   - Constituency sanity checks on extracted segments.
//
// Returns an array of ValidationIssue codes; caller decides what to
// do with them. shouldRejectParse() is the helper for the "if any
// issue → demote to unknown" policy.

import type { ParsedInput } from './types';
import { frameFor, type VerbFrame } from './verbFrames';

export type ValidationIssue =
  | 'meta_talk'                  // feedback typed into action input
  | 'too_long'                   // > 12 content tokens
  | 'missing_required_direct'    // verb requires a direct object, none extracted
  | 'missing_required_recipient' // verb requires a recipient, none extracted
  | 'junk_in_direct'             // direct slot contains UI/meta tokens
  | 'junk_in_recipient'          // recipient slot contains UI/meta tokens
  | 'junk_in_instrument';        // instrument slot contains UI/meta tokens

/** Meta-talk markers — sentences starting with these patterns are
 *  feedback / commentary / questions, not commands. Anchored at the
 *  start so legitimate "this is" / "that is" mid-sentence don't
 *  trigger (rare in game commands anyway). Exported so parser.ts
 *  can use the same regex on the no-verb-match path. */
export const META_TALK_REGEX = /^\s*(it\s+is|that\s+is|this\s+is|it's|that's|should|supposed|needs?\s+to|wouldn't|doesn't|why\s+can|why\s+does|why\s+is|how\s+come|i\s+think\s+that|i\s+wish|can\s+you\s+(?:add|make|change|fix))/i;
const META_REGEX = META_TALK_REGEX;

/** UI-talk tokens. These never appear in legitimate game commands —
 *  they only show up when the player is typing feedback about the
 *  UI into the action input. */
const JUNK_TOKEN_REGEX = /\b(item|items|thing|things|popup|popups|button|buttons|menu|menus|screen|screens|noun|nouns|verb|verbs|widget|dropdown|checkbox|tooltip)\b/i;

/** Content-token count cap. Real commands are concise; the upper
 *  envelope of legitimate inputs in the parserHitRate corpus tops
 *  out around 10 content tokens. We give a buffer for unusual but
 *  valid commands. */
const MAX_CONTENT_TOKENS = 12;

/** Count meaningful tokens in the normalized input — strip
 *  stopword-like fillers so "the dog and the cat" doesn't count
 *  determiners or conjunctions against the cap. This is intentionally
 *  generous; we'd rather miss a flag than over-reject. */
function contentTokenCount(normalized: string): number {
  if (!normalized) return 0;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const fillerRegex = /^(a|an|the|of|to|for|in|on|at|with|and|or|but|then|so|that|this|these|those|my|your|his|her|its|their|our|i|me|you|we|us|they|them|is|am|are|was|were|be|been|being|do|does|did|have|has|had|can|will|would|should|could|may|might|must)$/i;
  return tokens.filter((t) => !fillerRegex.test(t)).length;
}

/** Returns the list of validation issues found. Empty list = parse
 *  is clean. Caller decides whether to act on the issues. */
export function validateParse(parsed: ParsedInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (parsed.intent === 'unknown') return issues; // already rejected upstream

  // Rule 1: meta-talk. Anchored regex catches the playtest case:
  //   "it is supposed to remove a noun item from the popup..."
  if (META_REGEX.test(parsed.normalized)) {
    issues.push('meta_talk');
  }

  // Rule 2: too-long input. Catches commentary that slipped past
  // meta-talk (e.g. mid-sentence-only meta phrases).
  if (contentTokenCount(parsed.normalized) > MAX_CONTENT_TOKENS) {
    issues.push('too_long');
  }

  // Rules 3 & 4: frame-required role checks. Only run when args was
  // populated (parseInput did the extraction). Verbs without an
  // explicit frame use DEFAULT_FRAME which has no required roles,
  // so these rules are no-ops for unframed verbs.
  const frame: VerbFrame = frameFor(parsed.intent);
  if (frame.requireRoles && parsed.args) {
    for (const requiredRole of frame.requireRoles) {
      const arg = parsed.args.find((a) => a.role === requiredRole);
      const resolved = arg?.resolvedItemId || arg?.resolvedNoun;
      const argText = arg?.text ?? '';
      const hasJunk = JUNK_TOKEN_REGEX.test(argText);
      if (!arg || (!resolved && !argText.trim())) {
        if (requiredRole === 'direct') issues.push('missing_required_direct');
        else if (requiredRole === 'recipient') issues.push('missing_required_recipient');
      } else if (!resolved && hasJunk) {
        // Arg extracted but unresolved AND contains UI-talk tokens.
        // This is the bug case: "noun item popup..." extracted as
        // direct text, resolveItem fuzzed it to Aetheric Torch.
        if (requiredRole === 'direct') issues.push('junk_in_direct');
        else if (requiredRole === 'recipient') issues.push('junk_in_recipient');
      }
    }
  }

  // Always check instrument for junk even when not required —
  // catches "attack the drone with the popup menu".
  if (parsed.args) {
    const instrumentArg = parsed.args.find((a) => a.role === 'instrument');
    if (instrumentArg && !instrumentArg.resolvedItemId && JUNK_TOKEN_REGEX.test(instrumentArg.text)) {
      issues.push('junk_in_instrument');
    }
  }

  return issues;
}

/** True iff the issue list is severe enough to demote the parse to
 *  intent:'unknown'. V1 policy: any issue triggers rejection. Kept
 *  as a separate predicate so we can soften it later
 *  (e.g. tolerate too_long if all other slots are clean). */
export function shouldRejectParse(issues: ValidationIssue[]): boolean {
  return issues.length > 0;
}

/** Player-facing message that explains the rejection. Used by the
 *  engine to surface "did you mean..." prompts after a junk parse.
 *  Returns a single short string suitable for the Arbiter channel.*/
export function describeIssues(issues: ValidationIssue[]): string {
  if (issues.includes('meta_talk')) {
    return "That reads like a note about the game rather than something your character would do. Use the 📝 button to leave a note; try a short action like 'look around' or 'attack the drone' otherwise.";
  }
  if (issues.includes('too_long')) {
    return 'That is a lot of words for one action. Try a short command like "attack the drone" or "search the trap".';
  }
  if (issues.includes('junk_in_direct') || issues.includes('junk_in_recipient') || issues.includes('junk_in_instrument')) {
    return "I do not see that here. Name a real thing — an enemy, an item from your pack, or something the room mentions.";
  }
  if (issues.includes('missing_required_direct')) {
    return 'What is the target? Try naming a specific thing — "attack the drone", "search the chain".';
  }
  if (issues.includes('missing_required_recipient')) {
    return 'Who is the recipient? Try "give the locket to Yulka".';
  }
  return 'I am not sure what you mean. Try a short, specific action.';
}
