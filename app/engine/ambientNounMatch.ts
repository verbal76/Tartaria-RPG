// Pure noun-matching used by the exploration UI to decide whether an
// ambient-interaction CHIP (e.g. "scraps of cloth") has already been
// consumed / flavor-exhausted, given the room's pool of recorded nouns.
//
// This mirrors the engine's substring dedup logic so the chip's green/amber
// "live" state matches the engine's accept/refuse decision exactly. It is
// deliberately phrasing-tolerant: the parser normalizes typed/resolved nouns
// (dropping possessive apostrophes and the connective "of") before recording
// them, but the live chip keeps the display phrasing — so a raw substring
// compare misses ("scraps of cloth" vs the stored "scraps cloth"; "Zharak's
// Teeth Spire" vs the stored "zharak teeth spire") and the chip would stay
// green forever, re-tappable for an endless "already examined".
//
// normNoun() strips both of those connectives and collapses whitespace on BOTH
// sides before the compare so the variant forms reconcile. Extracted from the
// inline ExplorationScreen closure so it can be unit-tested directly.

/** Lower-case, drop the WHOLE possessive "'s" (not just the apostrophe), drop the
 *  connective "of", and collapse whitespace so phrasing variants of the same noun
 *  compare equal.
 *
 *  The possessive must drop the trailing `s` too, to match the parser: it normalizes
 *  a typed/resolved noun like "messenger's post" to "messenger post" (whole `'s`
 *  gone) before the engine records it consumed. The old rule stripped only the
 *  apostrophe → "messengers post", which does NOT substring-match the stored
 *  "messenger post" — so a possessive chip ("messenger's post", "Zharak's Teeth")
 *  never registered as consumed, never left the Investigate picker, and re-tapped
 *  forever into "already examined". Dropping `'s` as a unit reconciles both sides. */
export function normNoun(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]s\b/g, ' ') // possessive "'s" → gone entirely (matches the parser)
    .replace(/['’]/g, '')      // any remaining stray apostrophes
    .replace(/\bof\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when `chipNoun` matches any entry in `pool` under normNoun, by exact
 *  or substring match in either direction (same loose match the engine uses).
 *  Empty entries are skipped — "anything".includes('') is trivially true and
 *  would mark every chip consumed. */
export function isNounConsumed(chipNoun: string, pool: Iterable<string>): boolean {
  const chipLower = normNoun(chipNoun);
  if (chipLower.length === 0) return false;
  for (const entry of pool) {
    if (entry.length === 0) continue;
    const e = normNoun(entry);
    if (e.length === 0) continue;
    if (e === chipLower) return true;
    if (chipLower.includes(e)) return true;
    if (e.includes(chipLower)) return true;
  }
  return false;
}
