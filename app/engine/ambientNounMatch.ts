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

/** Lower-case, drop possessive apostrophes, drop the connective "of", and
 *  collapse whitespace so phrasing variants of the same noun compare equal. */
export function normNoun(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
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
