import { SemanticEmbeddingService } from './embedding/SemanticEmbeddingService';
import { EmotionInferenceEngine } from './cognition/EmotionInferenceEngine';
import { IntentInferenceEngine } from './cognition/IntentInferenceEngine';
import { ModelDownloader, type DownloaderOptions, type ResolvedModelFiles } from './ota/ModelDownloader';
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

export interface BootOptions {
  modelUrl?: string;
  vocabUrl?: string;
  onProgress?: (stage: BootStage, fraction: number) => void;
}

export type BootStage = 'downloading' | 'loading' | 'precomputing' | 'ready';

/**
 * Hooks for dependency injection in tests. Production code calls boot() with
 * no second argument.
 */
export interface OrchestratorDeps {
  downloader?: { ensureFiles(opts: DownloaderOptions): Promise<ResolvedModelFiles> };
  embeddingService?: SemanticEmbeddingService;
  emotionEngine?: EmotionInferenceEngine;
  intentEngine?: IntentInferenceEngine;
}

export class CognitiveOrchestrator {
  private downloader: OrchestratorDeps['downloader'];
  private embeddingService: SemanticEmbeddingService;
  private emotionEngine: EmotionInferenceEngine;
  private intentEngine: IntentInferenceEngine;
  private ready: boolean = false;
  private lastBootOpts: BootOptions = {};

  constructor(deps: OrchestratorDeps = {}) {
    this.downloader = deps.downloader ?? new ModelDownloader();
    this.embeddingService = deps.embeddingService ?? new SemanticEmbeddingService();
    this.emotionEngine = deps.emotionEngine ?? new EmotionInferenceEngine();
    this.intentEngine = deps.intentEngine ?? new IntentInferenceEngine();
  }

  isReady(): boolean {
    return this.ready && this.embeddingService.isReady();
  }

  async boot(opts: BootOptions = {}): Promise<void> {
    this.lastBootOpts = opts;
    const { onProgress } = opts;

    onProgress?.('downloading', 0);
    const { modelPath, vocabText } = await this.downloader!.ensureFiles({
      modelUrl: opts.modelUrl,
      vocabUrl: opts.vocabUrl,
      onProgress: (frac) => onProgress?.('downloading', frac),
    });
    onProgress?.('downloading', 1);

    onProgress?.('loading', 0);
    await this.embeddingService.initialize(modelPath, vocabText);
    onProgress?.('loading', 1);

    onProgress?.('precomputing', 0);
    this.emotionEngine.setAnchors(await this.precomputeAnchors(EMOTION_ANCHORS, onProgress));
    this.intentEngine.setAnchors(await this.precomputeAnchors(INTENT_ANCHORS, onProgress));
    onProgress?.('precomputing', 1);

    this.ready = true;
    onProgress?.('ready', 1);
  }

  async shutdown(): Promise<void> {
    this.ready = false;
    await this.embeddingService.dispose();
  }

  async resume(): Promise<void> {
    await this.embeddingService.reinitializeIfNeeded();
    this.ready = this.embeddingService.isReady() && this.emotionEngine.hasAnchors();
    if (!this.ready && this.lastBootOpts) {
      // Anchors were cleared somehow — re-derive from cache (cheap on second boot).
      this.emotionEngine.setAnchors(await this.precomputeAnchors(EMOTION_ANCHORS));
      this.intentEngine.setAnchors(await this.precomputeAnchors(INTENT_ANCHORS));
      this.ready = this.embeddingService.isReady();
    }
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

  private async precomputeAnchors(
    map: Record<string, string>,
    onProgress?: (stage: BootStage, fraction: number) => void,
  ): Promise<AnchorMap> {
    const keys = Object.keys(map);
    const out: AnchorMap = {};
    for (let i = 0; i < keys.length; i++) {
      const concept = keys[i]!;
      const text = map[concept];
      if (!text) continue;
      out[concept] = await this.embeddingService.embed(text);
      onProgress?.('precomputing', (i + 1) / keys.length);
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
