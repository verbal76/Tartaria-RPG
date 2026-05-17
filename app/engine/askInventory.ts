// Small text-pattern helpers used by intent handlers in the game store.
// Pulled out as plain functions so they're unit-testable without spinning
// up the store.
//
// Helpers for the "do I have X?" / "is X in my pack?" pattern surfaced by
// the `ask` intent handler.
//
// The pattern complements the existing concept lookup: when the player asks
// about a tangible thing (an item name, a material name), this short-circuits
// to a yes/no inventory answer instead of falling through to the soft
// "I don't have a clean answer" Aether-trivia refusal.

/**
 * True when the input phrasing looks like a yes/no inventory question.
 * Conservative — would rather miss a question than misread a concept query
 * (e.g. "what is the Aether" should NOT match here).
 */
export function isInventoryQuestion(text: string): boolean {
  // "do i have / got X", "have i got X" — match anywhere; these phrasings are
  // ~always inventory questions.
  if (/\b(do i (?:have|got)|have i (?:got)?|got any|got the|got a)\b/i.test(text)) return true;
  // "how many X" / "how much X" — count question variant. The handler can
  // detect this via isCountQuestion() and answer with a quantity instead of
  // yes/no. Anchored to the sentence opening so "tell me how many rats are
  // here" (concept-ish) doesn't get caught.
  if (/^\s*how\s+(?:many|much)\b/i.test(text)) return true;
  // "is X / is the Y in my pack/inventory/bag/pockets" — explicit container
  // reference is the strongest signal an inventory question is in flight.
  if (/\bin my (?:pack|inventory|bag|pockets)\b/i.test(text)) return true;
  // Sentence-initial "is the / is a / is there X" — common phrasing for "is
  // the fungus here?" Anchored to the start so "what is the Aether" does NOT
  // get caught.
  if (/^\s*(is the|is a|is any|is there)\b/i.test(text)) return true;
  return false;
}

/**
 * Pull the candidate noun out of an inventory question. Strips question
 * frames and common articles/quantifiers so the remainder lines up with
 * inventory item names. Best-effort — caller does the actual lookup against
 * player.inventory by substring match.
 *
 * Examples:
 *   "is the fungus in my pack?"        → "fungus"
 *   "do I have a locket"               → "locket"
 *   "got any bandages"                 → "bandages"
 *   "how many rations are in my pack"  → "rations"
 *   "how much aetherstone do I have"   → "aetherstone"
 */
export function extractInventoryTarget(text: string): string {
  return text
    .toLowerCase()
    .replace(
      /\b(how (?:many|much)|do i have|do i got|have i got|have i|is there a|is there any|is there|is the|is a|is any|got any|got the|got a|in my (?:pack|inventory|bag|pockets))\b/g,
      ' ',
    )
    .replace(/\?/g, ' ')
    // Linking words / state-of-being verbs that creep into question phrasings
    // ("how many rations ARE in my pack" / "what bandages DO i HAVE"). Without
    // stripping these the responder gets "No how many rations are on you."
    .replace(/\b(are|is|was|were|do|does|did|have|has)\b/g, ' ')
    .replace(/\b(any|some|the|my|a|an|on me|with me)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the inventory question is asking for a COUNT ("how many rations
 * do I have?") rather than a yes/no ("do I have rations?"). The caller
 * answers with the actual quantity instead of a binary.
 */
export function isCountQuestion(text: string): boolean {
  return /\bhow\s+(?:many|much)\b/i.test(text);
}

/**
 * True when the player typed something like "continue" / "keep going" /
 * "onward" — meaning "repeat my last cardinal travel step." Anchored to
 * the start so phrases that just *contain* "continue" elsewhere don't
 * accidentally trigger.
 *
 *   "continue"           → true
 *   "keep going"         → true
 *   "onward"             → true
 *   "press on"           → true
 *   "same way"           → true
 *   "continue to the bazaar" → true (still a continue intent — the handler
 *                                    will use the last direction regardless)
 *   "I will not continue" → false (continue is not the first verb)
 */
export function isContinueCommand(text: string): boolean {
  return /^\s*(continue|keep\s+going|same\s+way|onward|press\s+on)\b/i.test(text);
}
