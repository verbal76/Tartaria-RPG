// OTA-609 — near-duplicate suppression for GENERATED Arbiter lines.
//
// The exact-match dedup in gameStore.appendLog only catches a line repeated
// VERBATIM within a short window. It can't catch the local model rephrasing the
// same thought ("you've traveled far and wide" / "far and wide you have come"),
// which let a travel musing repeat ~5-6 times across a long journey (player
// report). This pure helper flags a freshly-generated line as a near-duplicate
// of a recent Arbiter line so the caller can drop it (ambient → silence) or fall
// back to its canned template (reactive). Pure + standalone so it's unit-tested
// without booting the store.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'you', 'your', 'i', 'it', 'its', 'of', 'and', 'to', 'in', 'on', 'at',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'that', 'this', 'with',
  'for', 'as', 'but', 'not', 'no', 'so', 'then', 'here', 'there', 'they', 'them', 'their',
  'what', 'when', 'where', 'how', 'will', 'would', 'do', 'does', 'did', 'from', 'by', 'up',
  'down', 'out', 'over', 'if', 'or', 'one', 'now', 'into', 'about', 'than', 'too', 'very',
  'just', 'still', 'yet', 'more', 'some', 'any', 'all', 'we', 'me', 'my', 'he', 'she', 'his',
]);

/** Content words: >2 chars, not a stopword. Lowercased, punctuation stripped. */
function contentTokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Adjacent content-word pairs (stopwords already dropped): "traveled far and
 *  wide" → ["traveled far", "far wide"]. A shared pair is the signal that two
 *  short flavor lines are the same musing reworded. */
function contentBigrams(text: string): Set<string> {
  const w = contentTokens(text);
  const g = new Set<string>();
  for (let i = 0; i + 1 < w.length; i++) g.add(`${w[i]} ${w[i + 1]}`);
  return g;
}

/**
 * True when `text` restates something the Arbiter said recently.
 * Two signals (either fires):
 *   1. A shared distinctive content phrase (adjacent content-word pair), e.g.
 *      "far wide" in both — catches short flavor lines reworded.
 *   2. Heavy whole-set overlap (Jaccard >= 0.6) — catches longer restatements
 *      that lack an identical adjacent pair.
 * Lines with < 3 content words are too short to judge and are never flagged.
 */
export function isRepetitiveArbiterLine(text: string, recentArbiterTexts: readonly string[]): boolean {
  const words = new Set(contentTokens(text));
  if (words.size < 3) return false;
  const grams = contentBigrams(text);
  for (const prev of recentArbiterTexts) {
    const pw = new Set(contentTokens(prev));
    if (pw.size < 3) continue;
    const pg = contentBigrams(prev);
    for (const g of grams) if (pg.has(g)) return true; // signal 1
    let inter = 0;
    for (const w of words) if (pw.has(w)) inter++;
    const union = words.size + pw.size - inter;
    if (union > 0 && inter / union >= 0.6) return true; // signal 2
  }
  return false;
}
