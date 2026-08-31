// askArbiter — MiniLM-backed lore lookup. Player types
// "ask the arbiter about <X>" / "ask about <X>" / "what is <X>" and
// the engine cosine-matches against the loreConceptBank, surfacing
// the closest concept as Arbiter dialogue.
//
// OTA-233 — first wave of "Ask the Arbiter." Pairs with OTA-232's
// canon ingestion (events + titles + food/drink) and the existing
// glossary.json (mechanics + lore_terms + factions + people + places).
//
// Threshold note: target inference uses 0.85 (CognitiveOrchestrator
// .ts:140) as a hard guard against semantic drift. Lore lookup
// tolerates a much wider semantic match — the player might ask
// "what's the mud thing?" expecting "Mud Monarchs" — so we use
// 0.45. False positives here are recoverable (the Arbiter just
// surfaces a not-quite-right concept); false negatives are not (the
// player sees "the Arbiter is silent" when a concept genuinely exists).
//
// Lazy embedding cache: concepts embed on first query and stick for
// the session. First query is ~ N × 10ms (N = 132 concepts, ~1.3s
// total worst case); subsequent queries are sub-50ms (one query
// embed + cached cosine sweep).

import { loadLoreConceptBank, formatArbiterAnswer, type LoreConcept } from './loreConceptBank';

const LORE_MATCH_THRESHOLD = 0.45;

interface EmbeddingProvider {
  isReady(): boolean;
  embed(text: string): Promise<Float32Array>;
}

/** Cosine similarity — same math as VectorSimilarityEngine but kept
 *  local so this module has no React-Native binding requirements at
 *  test time. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0, bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const mag = Math.sqrt(na) * Math.sqrt(nb);
  return mag > 0 ? dot / mag : 0;
}

const conceptVectorCache = new Map<string, Float32Array>();

/** Find the closest lore concept to a free-text query. Returns null
 *  when the embedder isn't ready, no concept scores above threshold,
 *  or the query is empty. Caller (gameStore's 'ask' handler) is
 *  responsible for log output — this function just resolves. */
export async function findClosestLoreConcept(
  query: string,
  embedder: EmbeddingProvider,
): Promise<{ concept: LoreConcept; score: number } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (!embedder.isReady()) return null;

  const concepts = loadLoreConceptBank();
  let queryVec: Float32Array;
  try {
    queryVec = await embedder.embed(trimmed);
  } catch {
    return null;
  }

  let best: { concept: LoreConcept; score: number } | null = null;
  for (const c of concepts) {
    let v = conceptVectorCache.get(c.id);
    if (!v) {
      try {
        v = await embedder.embed(c.searchText);
        conceptVectorCache.set(c.id, v);
      } catch {
        continue;
      }
    }
    const score = cosineSimilarity(queryVec, v);
    if (score >= LORE_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { concept: c, score };
    }
  }
  return best;
}

/** Parser-side helper: strip common "ask the arbiter about" prefixes
 *  from the raw player input so the embedded query is the actual
 *  topic. "ask the arbiter about the great mud flood" -> "the great
 *  mud flood". "what is aetherstone" -> "aetherstone". */
export function extractLoreQuery(rawText: string): string {
  let t = rawText.toLowerCase().trim();
  // Drop the leading verb + the "the arbiter" object so we're left
  // with the topic.
  const prefixes = [
    /^ask the arbiter (about|of|on|for) /,
    /^ask the arbiter /,
    /^ask (about|of|on|for) /,
    /^ask /,
    /^what is /,
    /^what are /,
    /^who is /,
    /^who are /,
    /^tell me about /,
    /^tell me /,
    /^explain /,
    /^arbiter[, ]+(what is|what are|what|who is|who are|who|tell me about|tell me|explain) /,
  ];
  for (const re of prefixes) {
    t = t.replace(re, '');
  }
  // Drop trailing "?" and stray articles for cleaner embedding.
  t = t.replace(/[?!.]+$/g, '').trim();
  return t;
}

/** ⚠⚠ OTA-1198 — THE OFFLINE LORE PATH (PUNCHLIST P17).
 *
 *  `findClosestLoreConcept` returns null the moment the embedder is not ready, and the
 *  store's ask-handler ticked `loreRead` ONLY inside that branch. So on any device where
 *  the narration model fails to load — which is the owner's own device across OTA-1180,
 *  OTA-1181 and OTA-1182 (`Narration engine: failed`) — the counter never moved and **Scholar of
 *  Forgotten Lore could not be earned at all.** 177 authored concepts, unreachable, because
 *  the only door needed a model that was not there.
 *
 *  ⚠ The lore bank does not need a model. Every concept carries a `label` and prose
 *  `searchText`; matching a typed topic against those is ordinary text work. The embedder
 *  is better at "what's the mud thing?" — it stays FIRST and nothing about it changes. This
 *  is what runs when it is unavailable, or when it looks and finds nothing.
 *
 *  Three tiers, deliberately the same shape as `titleMatch.ts` (OTA-1188/1216):
 *    1. exact label,
 *    2. label substring — ambiguity REFUSES rather than guessing,
 *    3. token subset over label + searchText, scored, best distinct winner.
 *
 *  ⚠ Tier 3 requires every query token to appear, so "mud" alone will not drag back a
 *  random Mud concept, and a two-word query has to earn both words. A wrong answer here is
 *  worse than silence: the Arbiter is the game's canon voice. */
export function findLoreConceptOffline(
  query: string,
  bank: readonly LoreConcept[] = loadLoreConceptBank(),
): { concept: LoreConcept; score: number } | null {
  const t = query.toLowerCase().trim();
  if (!t || bank.length === 0) return null;

  const label = (c: LoreConcept) => c.label.toLowerCase();

  const exact = bank.find((c) => label(c) === t);
  if (exact) return { concept: exact, score: 1 };

  const subs = bank.filter((c) => label(c).includes(t) || t.includes(label(c)));
  if (subs.length === 1) return { concept: subs[0]!, score: 0.9 };
  // ⚠ Two or more: stop. A query contained by several labels fits the same several by
  // token too, so falling through would reach the same ambiguity by a longer road.
  if (subs.length > 1) return null;

  // ⚠ Tokens of 3+ chars only. "of", "the" and "a" match everything and would turn a
  // subset test into a coin flip.
  const words = t.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (words.length === 0) return null;

  let best: { concept: LoreConcept; score: number } | null = null;
  let tied = false;
  for (const c of bank) {
    const hay = `${label(c)} ${c.searchText.toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    // A hit in the LABEL is worth more than one buried in the prose — the label is what
    // the concept is called, and that is what a player types.
    const inLabel = words.filter((w) => label(c).includes(w)).length;
    const score = 0.5 + (0.4 * inLabel) / words.length;
    if (!best || score > best.score) { best = { concept: c, score }; tied = false; }
    else if (score === best.score) tied = true;
  }
  // ⚠ A tie is ambiguity wearing a number. Refuse it, exactly as tier 2 does.
  return best && !tied ? best : null;
}

/** Default fallback line when no concept hits the threshold. */
export const ARBITER_SILENT_LINE = 'The Arbiter is silent on that. The name does not surface in the lore.';

// ⚠⚠⚠ OTA-1595 — THE ARBITER CANNOT BREAK CHARACTER, AND A PROMPT RULE IS NOT
// A GUARANTEE. Three leaks in one play session, straight past the persona
// prompt's "never break character": *"I'm not familiar with this specific band
// or its music"*, *"I have finished the mission. My purpose is to ensure the
// safety..."*, *"I was typing in the Arbiter's voice."* A 0.5B model WILL slip
// under an off-distribution question; this sieve is the enforcement. A hit
// nulls the answer and the caller lands on ARBITER_SILENT_LINE — silence in
// voice beats fluency out of it. Patterns are assistant-speak fingerprints,
// not topic filters: self-narration about helping/typing, meta about the voice
// itself, the model claiming the PLAYER's deeds in first person.
const ARBITER_OUT_OF_CHARACTER = [
  /\bAI\b|language model|\bassistant\b|\bchatbot\b/i,
  /i'?m not familiar with/i,
  /provide more (details|context|information)/i,
  /i('?m| am) here to (listen|help|assist|understand)/i,
  /my (purpose|role|goal|job) is to/i,
  /(happy|glad) to help/i,
  /i was typing/i,
  /in the arbiter'?s voice/i,
  /never breaks? character|breaking character/i,
  /i have (finished|completed) the (mission|quest|contract)/i,
  /as (an? )?(witness|arbiter), i\b/i,
];
export function arbiterAnswerOutOfCharacter(line: string): boolean {
  return ARBITER_OUT_OF_CHARACTER.some((re) => re.test(line));
}

export { formatArbiterAnswer };

/** Test-only — reset the in-memory vector cache. */
export function _resetLoreVectorCache(): void {
  conceptVectorCache.clear();
}
