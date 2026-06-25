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
import { getNarratorName } from './contentPack';

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

/** Default fallback line when no concept hits the threshold. */
export const ARBITER_SILENT_LINE = `The ${getNarratorName()} is silent on that. The name does not surface in the lore.`;

export { formatArbiterAnswer };

/** Test-only — reset the in-memory vector cache. */
export function _resetLoreVectorCache(): void {
  conceptVectorCache.clear();
}
