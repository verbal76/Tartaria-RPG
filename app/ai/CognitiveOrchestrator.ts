import { SemanticEmbeddingService } from './embedding/SemanticEmbeddingService';
import { EmotionInferenceEngine } from './cognition/EmotionInferenceEngine';
import { IntentInferenceEngine } from './cognition/IntentInferenceEngine';
import type { CognitiveResponse, WorldContext, AnchorMap } from './types';

const EMOTION_ANCHORS = {
  FEAR: 'danger terrifying scary run away death trap dark threat',
  CURIOSITY: 'investigate mysterious strange ancient glowing study symbol resonance',
  AGGRESSION: 'kill destroy attack smash fight blood strike',
  CAUTIOUSNESS: 'hide sneak quiet observe from distance careful',
  RESOLVE: 'press on continue forward despite the cost',
  DESPAIR: 'tired hopeless lost cannot go on collapse',
} as const;

const INTENT_ANCHORS = {
  ATTACK: 'attack strike slash stab kill the enemy',
  SEARCH: 'search look around examine investigate inspect',
  HIDE: 'hide sneak crouch take cover stay quiet',
  RETREAT: 'flee run away withdraw bolt escape',
  TALK: 'speak ask parley persuade negotiate',
  USE_ITEM: 'use activate wield apply consume drink eat the item',
  REST: 'rest sleep camp recover',
  TRAVEL: 'travel go walk head toward enter descend climb',
} as const;

export class CognitiveOrchestrator {
  private embeddingService: SemanticEmbeddingService;
  private emotionEngine: EmotionInferenceEngine;
  private intentEngine: IntentInferenceEngine;
  private ready: boolean = false;

  constructor() {
    this.embeddingService = new SemanticEmbeddingService();
    this.emotionEngine = new EmotionInferenceEngine();
    this.intentEngine = new IntentInferenceEngine();
  }

  isReady(): boolean {
    return this.ready && this.embeddingService.isReady();
  }

  async boot(modelPath: string, vocabText: string): Promise<void> {
    await this.embeddingService.initialize(modelPath, vocabText);
    this.emotionEngine.setAnchors(await this.precomputeAnchors(EMOTION_ANCHORS));
    this.intentEngine.setAnchors(await this.precomputeAnchors(INTENT_ANCHORS));
    this.ready = true;
  }

  async shutdown(): Promise<void> {
    this.ready = false;
    await this.embeddingService.dispose();
  }

  async resume(): Promise<void> {
    await this.embeddingService.reinitializeIfNeeded();
    this.ready = this.embeddingService.isReady() && this.emotionEngine.hasAnchors();
  }

  async processInput(text: string, _context: WorldContext): Promise<CognitiveResponse> {
    if (!this.isReady()) throw new Error('CognitiveOrchestrator not booted');

    const t0 = nowMs();
    const vector = await this.embeddingService.embed(text);
    const t1 = nowMs();
    const emotions = this.emotionEngine.infer(vector);
    const intentions = this.intentEngine.infer(vector);
    const t2 = nowMs();

    return {
      interpretedMeaning: text.toLowerCase().trim(),
      inferredEmotions: emotions,
      inferredIntentions: intentions,
      semanticConfidence: emotions.length > 0 || intentions.length > 0 ? 0.8 : 0.2,
      embeddingMs: t1 - t0,
      inferenceMs: t2 - t1,
    };
  }

  private async precomputeAnchors(map: Record<string, string>): Promise<AnchorMap> {
    const out: AnchorMap = {};
    for (const concept of Object.keys(map)) {
      const text = map[concept];
      if (!text) continue;
      out[concept] = await this.embeddingService.embed(text);
    }
    return out;
  }
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
