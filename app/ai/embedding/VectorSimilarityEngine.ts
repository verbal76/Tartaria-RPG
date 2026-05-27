import type { AnchorMap, SimilarityMatch } from '../types';

export class VectorSimilarityEngine {
  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      dot += av * bv;
      normA += av * av;
      normB += bv * bv;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  static getClosestMatches(
    inputVector: Float32Array,
    anchors: AnchorMap,
    threshold: number = 0.4,
  ): SimilarityMatch[] {
    const matches: SimilarityMatch[] = [];
    for (const concept of Object.keys(anchors)) {
      const anchorVector = anchors[concept];
      if (!anchorVector) continue;
      const score = this.cosineSimilarity(inputVector, anchorVector);
      if (score >= threshold) matches.push({ concept, score });
    }
    matches.sort((x, y) => y.score - x.score);
    return matches;
  }
}
