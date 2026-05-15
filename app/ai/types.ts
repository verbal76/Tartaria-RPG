export interface SemanticMemoryNode {
  id: string;
  category: string;
  text: string;
  emotionalWeight: number;
  importance: number;
  timestamp: number;
}

export interface PlayerPsychology {
  dominantDrives: string[];
  emotionalPressure: number;
  curiosityDepth: number;
  aggressionDepth: number;
  cautiousness: number;
}

export interface WorldContext {
  hp: number;
  maxHp: number;
  currentLocation?: string;
  nearbyObjects: readonly string[];
}

export interface CognitiveResponse {
  interpretedMeaning: string;
  inferredEmotions: readonly string[];
  inferredIntentions: readonly string[];
  semanticConfidence: number;
  embeddingMs: number;
  inferenceMs: number;
}

export type AnchorMap = Record<string, Float32Array>;

export interface SimilarityMatch {
  concept: string;
  score: number;
}

export interface ModelInfo {
  name: string;
  source: string;
  embeddingDim: number;
  maxSeqLen: number;
  vocabSize: number;
  modelPath: string | null;
  modelSizeBytes: number | null;
  runtime: string;
}
