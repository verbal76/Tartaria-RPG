// OTA-678 — off-canon entity guard for LLM narration. The Qwen narrator is
// prompt-told never to name a place/faction/NPC that isn't in the scene, but there
// was NO validator enforcing it — an invented proper noun ("the Sunken Choir of
// Vael") flowed straight into the logged feed and became session canon. This is the
// safety net: it flags multi-word PROPER-NOUN phrases the model emitted that don't
// match any known world entity, so the caller can drop those sentences (falling back
// to the authored template, exactly like the existing third-person filter).
//
// Deliberately CONSERVATIVE to avoid mangling good prose:
//  - Only 2+ word Capitalized phrases are treated as candidate entities. Single
//    capitalized words (sentence starts, "You", "Aether", a lone coined name) are
//    NOT flagged — too many false positives. Multi-word names are where invented
//    PLACES / FACTIONS / TITLES cluster, and they're the highest canon risk.
//  - Matching is substring-either-way + normalized, so "the Iron Concord's" still
//    matches an allowed "Iron Concord".
//  - When in doubt the caller drops the sentence and uses the authored template,
//    which is always safe — a false positive costs a little flavor, never canon.

/** Lower-case, drop a leading "the ", strip possessives + punctuation, collapse
 *  whitespace — so phrasing variants of the same name compare equal. */
export function normalizeEntity(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']s\b/g, '')     // possessive
    .replace(/[’']/g, '')        // stray apostrophes
    .replace(/^the\s+/, '')      // leading article
    .replace(/[^a-z0-9 ]/g, ' ') // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

// A candidate proper-noun phrase: two or more Capitalized words in a row, allowing
// a lowercase connective (of/the/and/de/…) BETWEEN two capitalized words. Anchored
// so a single capitalized word (sentence start) is never a match on its own.
const CAP = "[A-Z][A-Za-z0-9’']+";
const CONN = "(?:of|the|and|de|del|la|le|von|der|van)";
const PROPER_NOUN_RE = new RegExp(`${CAP}(?:\\s+(?:${CONN}\\s+)?${CAP})+`, 'g');

/** Every multi-word proper-noun phrase in the text (raw, un-normalized). */
export function extractProperNouns(text: string): string[] {
  return text.match(PROPER_NOUN_RE) ?? [];
}

/** True when `phrase` matches any allowed entity (normalized, substring either way). */
function phraseIsKnown(phrase: string, allowed: ReadonlySet<string>): boolean {
  const n = normalizeEntity(phrase);
  if (n.length === 0) return true; // nothing nameable
  if (allowed.has(n)) return true;
  for (const a of allowed) {
    if (a.length === 0) continue;
    if (a === n || a.includes(n) || n.includes(a)) return true;
  }
  return false;
}

/** True when the sentence names a multi-word proper noun NOT in the allow-list —
 *  i.e. the model likely invented a place/faction/title. */
export function sentenceNamesOffCanonEntity(sentence: string, allowed: ReadonlySet<string>): boolean {
  for (const pn of extractProperNouns(sentence)) {
    if (!phraseIsKnown(pn, allowed)) return true;
  }
  return false;
}

/** Drop every sentence that names an off-canon multi-word entity. Returns the
 *  surviving sentences joined; may return '' (caller then uses the template). */
export function stripOffCanonSentences(text: string, allowed: ReadonlySet<string>): string {
  if (!text) return text;
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !sentenceNamesOffCanonEntity(s, allowed))
    .join(' ')
    .trim();
}

/** Build the allow-list set from raw name strings (locations, factions, NPCs,
 *  races, lore concepts, identity words, the player name, live scene entities).
 *  Each name is normalized; empty/short tokens are dropped. */
export function buildEntityAllowList(names: Iterable<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const raw of names) {
    if (!raw) continue;
    const n = normalizeEntity(raw);
    if (n.length >= 2) set.add(n);
  }
  return set;
}
