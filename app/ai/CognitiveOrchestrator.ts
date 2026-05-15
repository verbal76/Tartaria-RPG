import { SemanticEmbeddingService } from './embedding/SemanticEmbeddingService';
import { EmotionInferenceEngine } from './cognition/EmotionInferenceEngine';
import { IntentInferenceEngine } from './cognition/IntentInferenceEngine';
import { ModelDownloader, type DownloaderOptions, type ResolvedModelFiles } from './ota/ModelDownloader';
import type { CognitiveResponse, WorldContext, AnchorMap, ModelInfo } from './types';
// Statically-known runtime version. Bumped when the package is bumped in package.json.
const ORT_RUNTIME_VERSION = '1.24.3';

// Natural sentences — MiniLM is a sentence embedder, not a bag-of-words model.
// Cosine similarity is much stronger against full phrases than keyword soup.
const EMOTION_ANCHORS = {
  FEAR: 'I am afraid and want to escape this danger before it kills me',
  CURIOSITY: 'I want to investigate this mysterious thing and understand what it is',
  AGGRESSION: 'I will attack and destroy my enemy with violence',
  CAUTIOUSNESS: 'I move carefully and quietly so nothing notices me',
  RESOLVE: 'I will keep going forward no matter the cost',
  DESPAIR: 'I am tired and hopeless and cannot continue',
} as const;

const INTENT_ANCHORS = {
  ATTACK: 'I attack the enemy with my weapon',
  SEARCH: 'I look around carefully and search for something hidden',
  HIDE: 'I hide and stay quiet so no one sees me',
  RETREAT: 'I run away from this place to get to safety',
  TALK: 'I speak to them and try to convince them',
  USE_ITEM: 'I use an item from my pack',
  REST: 'I sit down to rest and recover my strength',
  TRAVEL: 'I travel to another place',
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

  async getModelInfo(): Promise<ModelInfo> {
    return this.embeddingService.getModelInfo(ORT_RUNTIME_VERSION);
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
