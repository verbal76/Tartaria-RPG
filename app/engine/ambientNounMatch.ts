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
    // OTA-736 — hyphens/dashes → space. The parser resolves a typed/tapped chip
    // like "rune glass" to the canonical "rune-glass" before the engine records
    // it consumed, so the raw display noun never substring-matched the stored
    // hyphenated form and the chip stayed GREEN forever — the player re-tapped an
    // exhausted rune-glass into an endless "nothing new". Collapsing the hyphen
    // reconciles both sides (also covers en/em dashes).
    .replace(/[-–—]/g, ' ')
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

/** OTA-953 — normNoun first (so possessive / "of" / hyphen variants reconcile), then split to
 *  WORDS with a light plural fold ("pillars" -> "pillar"; double-s words like "glass" keep
 *  their s so they don't fold to nonsense). Used by the flavor-exhausted matchers below. */
export function nounTokens(s: string): string[] {
  return normNoun(s)
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** OTA-953 — WORD-level noun match for the flavorExhaustedNouns pools. The raw bidirectional
 *  SUBSTRING rule those matchers used hid unrelated nouns that merely share letters:
 *  "rack" hid "cRACKed terminal", "vat" hid "obserVATion window", "well" hid "dWELLer torch"
 *  — the authored room pools carry 10 such letter-collision pairs. Two nouns now match only when
 *  one's COMPLETE word list appears in the other's, which keeps the legitimate
 *  partial-phrase tolerance ("rack" vs "armor rack", "core" vs "core stabilizer" — scene
 *  rebuilds shorten/lengthen the same prop) but can never match across word boundaries.
 *  Sibling props that share only PART of their words ("armor rack" vs "drone rack") stay
 *  independent. The searched-noun matchers keep the historical loose substring rule — they
 *  predate this and their catalog self-heal gives a wrong hide an escape hatch that the
 *  pure-flavor path deliberately doesn't have. */
export function nounTokensMatch(a: string, b: string): boolean {
  const at = nounTokens(a);
  const bt = nounTokens(b);
  if (at.length === 0 || bt.length === 0) return false;
  if (at.length <= bt.length) {
    const bs = new Set(bt);
    if (at.every((t) => bs.has(t))) return true;
  }
  if (bt.length <= at.length) {
    const as = new Set(at);
    if (bt.every((t) => as.has(t))) return true;
  }
  return false;
}

/** OTA-953 — pool check for a room's flavorExhaustedNouns: true when any recorded entry
 *  word-matches the display noun. Empty entries and climb markers can never match
 *  (nounTokens('' ) is empty; "climbed:noun:tN" tokens never equal real noun words). */
export function isNounFlavorExhausted(chipNoun: string, pool: Iterable<string>): boolean {
  for (const entry of pool) {
    if (nounTokensMatch(chipNoun, entry)) return true;
  }
  return false;
}
