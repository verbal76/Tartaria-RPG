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

import type { ParsedInput, InventoryItem } from './types';
import { frameFor, type VerbFrame } from './verbFrames';

/** OTA 205 — context for the selectional-restriction rules
 *  (Sleator & Temperley §7.3). Optional; if omitted, the validator
 *  skips type checks on resolved args. */
export interface ValidationContext {
  inventory?: InventoryItem[];
  ambientNouns?: string[];
  vendorName?: string;
  enemyNames?: string[];
  /** ⚠ OTA-1264 — index of the matched verb in the normalized token
   *  stream. parseInput knows it (`bestMatch.index`); the validator
   *  cannot recover it, because on a FUZZY match ("slep" → 'sleep')
   *  `matchedVerb` is not a token that appears in `normalized` at all.
   *  The negation rule is entirely about what sits BEFORE the verb, so
   *  it needs the real index. Omitted → the rule is skipped rather
   *  than guessed. */
  verbTokenIndex?: number;
}

export type ValidationIssue =
  | 'meta_talk'                  // feedback typed into action input
  | 'too_long'                   // > 12 content tokens
  | 'missing_required_direct'    // verb requires a direct object, none extracted
  | 'missing_required_recipient' // verb requires a recipient, none extracted
  | 'junk_in_direct'             // direct slot contains UI/meta tokens
  | 'junk_in_recipient'          // recipient slot contains UI/meta tokens
  | 'junk_in_instrument'         // instrument slot contains UI/meta tokens
  // OTA 205 — selectional restrictions (Sleator & Temperley §7.3)
  | 'instrument_not_a_tool'      // instrument slot resolved to consumable
  | 'recipient_not_an_npc'       // recipient slot resolved to a wall / ambient
  | 'destination_not_a_place'    // destination slot resolved to an item
  // ⚠⚠ OTA-1264 — negation scoping over the matched verb
  | 'negated_command';           // "do not open the chest" was opening the chest

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

/** ⚠⚠ OTA-1264 — negation markers. Apostrophes are already dissolved
 *  by normalizeInput ("don't" → "dont"), so the contracted forms are
 *  listed in their post-normalization shape — matching on "don't"
 *  here would never fire. */
const NEGATION_TOKENS = new Set([
  'no', 'not', 'never', 'nothing', 'none', 'nor', 'neither',
  'dont', 'doesnt', 'didnt', 'wont', 'cant', 'cannot', 'shouldnt',
  'wouldnt', 'couldnt', 'isnt', 'arent', 'wasnt', 'werent', 'aint',
]);

/** ⚠ Negation does not scope across a coordinating conjunction. "I have
 *  nothing SO I will attack" is an attack; "I will not attack" is not.
 *  Without this boundary the backward scan would read the `nothing` and
 *  refuse a command the player really did give. */
const NEGATION_BOUNDARY_TOKENS = new Set([
  'and', 'then', 'but', 'so', 'because', 'or', 'however', 'though', 'although',
]);

/** ⚠ How far back to look. MEASURED, not picked: the longest real
 *  distance across the probed phrasings is 3 ("I do not want to sleep",
 *  "I never want to camp here"), so 4 covers them with one token of
 *  headroom. An unbounded scan would let a negation at the head of a
 *  long sentence veto a verb ten words later that it has nothing to do
 *  with. */
const NEGATION_LOOKBACK = 4;

/** True iff a negation scopes over the verb at `verbTokenIndex`.
 *  Walks BACKWARD from the verb, stopping at a clause boundary. */
function verbIsNegated(normalized: string, verbTokenIndex: number): boolean {
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (verbTokenIndex < 0 || verbTokenIndex >= tokens.length) return false;
  const stopAt = Math.max(0, verbTokenIndex - NEGATION_LOOKBACK);
  for (let i = verbTokenIndex - 1; i >= stopAt; i--) {
    const t = tokens[i]!;
    if (NEGATION_BOUNDARY_TOKENS.has(t)) return false;
    if (NEGATION_TOKENS.has(t)) return true;
  }
  return false;
}

/** Returns the list of validation issues found. Empty list = parse
 *  is clean. Caller decides whether to act on the issues.
 *  Optional ValidationContext enables the selectional-restriction
 *  rules (Sleator §7.3) which need scene + inventory awareness. */
export function validateParse(parsed: ParsedInput, ctx?: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (parsed.intent === 'unknown') return issues; // already rejected upstream

  // Rule 1: meta-talk. Anchored regex catches the playtest case:
  //   "it is supposed to remove a noun item from the popup..."
  if (META_REGEX.test(parsed.normalized)) {
    issues.push('meta_talk');
  }

  // ⚠⚠ OTA-1264 Rule 1b: NEGATION. "do not open the chest" was opening
  // the chest, at confidence 1.00 — the verb scan took the exact `open`
  // hit and nothing in the parser or this validator had ever looked at
  // the word in front of it. Measured before the fix: 10 of 10 negated
  // phrasings executed the negated action.
  if (ctx?.verbTokenIndex != null && verbIsNegated(parsed.normalized, ctx.verbTokenIndex)) {
    issues.push('negated_command');
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

  // OTA 205 — selectional restrictions (Sleator & Temperley §7.3).
  // The frames in verbFrames.ts say WHICH roles a verb takes; these
  // rules check that what filled the slot makes SEMANTIC sense.
  // Skipped entirely when no ctx is provided (parser.ts always
  // passes one).
  if (ctx && parsed.args) {
    for (const arg of parsed.args) {
      // Rule: instrument should be a weapon / runecaster / relic / misc-tool,
      // not a consumable. "Attack the drone with the trail rations" is the
      // canonical wrong case.
      if (arg.role === 'instrument' && arg.resolvedItemId && ctx.inventory) {
        const item = ctx.inventory.find((i) => i.id === arg.resolvedItemId);
        if (item && item.kind === 'consumable') {
          issues.push('instrument_not_a_tool');
        }
      }
      // Rule: recipient should be an NPC (vendor or named character),
      // not an ambient scene noun. "Give the locket to the wall" is wrong.
      // Uses arg.text rather than arg.resolvedNoun because the
      // segmenter only resolves against inventory + recentNouns —
      // ambient nouns can legitimately appear in recipient text
      // ("the wall") without ever being "resolved" formally.
      // Approximation: NPC = matches vendor name; ambient noun match
      // (substring either direction) rejects.
      if (arg.role === 'recipient') {
        const recipText = arg.text.toLowerCase().trim().replace(/^the\s+/, '');
        if (recipText.length > 0) {
          const isVendor = !!(
            ctx.vendorName &&
            (ctx.vendorName.toLowerCase().includes(recipText) ||
              recipText.includes(ctx.vendorName.toLowerCase()))
          );
          const isAmbient = (ctx.ambientNouns ?? []).some((n) => {
            const an = n.toLowerCase();
            return an === recipText || recipText.includes(an) || an.includes(recipText);
          });
          const isEnemy = (ctx.enemyNames ?? []).some((n) =>
            n.toLowerCase().includes(recipText) || recipText.includes(n.toLowerCase()),
          );
          if ((isAmbient || isEnemy) && !isVendor) {
            issues.push('recipient_not_an_npc');
          }
        }
      }
      // Rule: destination should be a place / direction / exit, not an
      // inventory item. "Go into the bolt-caster" is wrong. We approximate
      // by rejecting destination args that resolved to a catalog item.
      if (arg.role === 'destination' && arg.resolvedItemId) {
        issues.push('destination_not_a_place');
      }
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
  // ⚠⚠ OTA-1264 — first, because it is the only issue where the player
  // said something perfectly clear and the parser did the OPPOSITE of
  // it. "That is a lot of words for one action" would be an insulting
  // reply to "do not open the chest".
  if (issues.includes('negated_command')) {
    return 'You decide against it. (Say what you DO want to do — "look around", "attack the drone".)';
  }
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
  if (issues.includes('instrument_not_a_tool')) {
    return "That isn't a tool you can use that way. Pick a weapon or relic instead.";
  }
  if (issues.includes('recipient_not_an_npc')) {
    return "That isn't someone you can give things to. Pick a person — a vendor, a companion, or a named NPC.";
  }
  if (issues.includes('destination_not_a_place')) {
    return "That isn't a place you can go to. Try a direction (north / east) or an exit named by the room.";
  }
  return 'I am not sure what you mean. Try a short, specific action.';
}
