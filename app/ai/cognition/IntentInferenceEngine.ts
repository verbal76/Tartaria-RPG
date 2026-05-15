import { VectorSimilarityEngine } from '../embedding/VectorSimilarityEngine';
import type { AnchorMap } from '../types';

export class IntentInferenceEngine {
  private anchors: AnchorMap = {};
  private threshold: number;

  constructor(threshold: number = 0.42) {
    this.threshold = threshold;
  }

  setAnchors(anchors: AnchorMap): void {
    this.anchors = anchors;
  }

  hasAnchors(): boolean {
    return Object.keys(this.anchors).length > 0;
  }

  infer(inputVector: Float32Array): string[] {
    return VectorSimilarityEngine.getClosestMatches(inputVector, this.anchors, this.threshold).map(
      (m) => m.concept,
    );
  }
}
