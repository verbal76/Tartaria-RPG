import { SemanticEmbeddingService } from './embedding/SemanticEmbeddingService';
import { VectorSimilarityEngine } from './embedding/VectorSimilarityEngine';
import { EmotionInferenceEngine } from './cognition/EmotionInferenceEngine';
import { IntentInferenceEngine } from './cognition/IntentInferenceEngine';
import { ModelDownloader, type DownloaderOptions, type ResolvedModelFiles } from './ota/ModelDownloader';
import type { CognitiveResponse, WorldContext, AnchorMap, ModelInfo } from './types';
// Statically-known runtime version. Bumped when the package is bumped in package.json.
const ORT_RUNTIME_VERSION = '1.24.3';

// Natural sentences — MiniLM is a sentence embedder, not a bag-of-words model.
// Cosine similarity is much stronger against full phrases than keyword soup.
const EMOTION_ANCHORS = {
  FEAR: 'I am terrified and want to flee from this Aetheric hazard before the buried ruins collapse and kill me',
  CURIOSITY: 'I want to investigate the strange resonance from the buried Aetherstone and understand what these forgotten Tartarian ruins are hiding',
  AGGRESSION: 'I will attack and destroy this Sentinel with my weapon, channeling my runecaster to smash the construct apart in violence',
  CAUTIOUSNESS: 'I move slowly and quietly through the collapsed ruins so the dormant sentinels and Aetheric hazards do not notice me passing',
  RESOLVE: 'I will push deeper into the buried Tartarian ruins no matter the cost, determined to recover the lost relic and survive',
  DESPAIR: 'I am exhausted and hopeless, drained by the Aetheric storms and the endless ruins, and I cannot keep going any longer',
} as const;

const INTENT_ANCHORS = {
  ATTACK: 'I attack the enemy with my weapon, swinging my blade or firing my runecaster to strike the sentinel down',
  SEARCH: 'I look carefully around the ruins, scavenging for hidden Aetherstone, relics, and forgotten Tartarian artifacts buried in the rubble',
  HIDE: 'I hide behind the rubble and stay silent so the patrolling sentinels and Aetherborn enemies cannot see or hear me',
  RETREAT: 'I retreat and run away from this dangerous place, escaping the collapsing ruins and Aetheric storm to reach safety',
  TALK: 'I speak to them and try to persuade or negotiate, asking the Arbiter or NPC about the lore of these ruins',
  USE_ITEM: 'I reach into my pack and use an item, a relic, a runecaster, or an Aetherstone charge to help me',
  REST: 'I sit down to rest and recover my strength and HP, sheltering from the Aetheric storms inside the quiet ruins',
  TRAVEL: 'I travel onward to another place, journeying across the ruined Tartarian landscape toward the next buried city or settlement',
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

  // Semantic target inference — given the player's input and a list of
  // candidate scene nouns (ambient nouns, hook nouns, enemy names, etc.),
  // return the candidate the player most likely meant. Used as a fallback
  // when the regex-based parser doesn't resolve a target.
  //
  // Threshold tuned conservatively (0.45) so we don't false-match common
  // verbs like "go" / "look" to random nouns.
  async inferTarget(
    input: string,
    candidates: readonly string[],
    threshold = 0.45,
  ): Promise<{ target: string; score: number } | null> {
    if (!this.isReady() || candidates.length === 0) return null;
    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const c of candidates) {
      const k = c.toLowerCase().trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      uniq.push(c);
    }
    if (uniq.length === 0) return null;
    try {
      const inputVec = await this.embeddingService.embed(input);
      let best: { target: string; score: number } | null = null;
      for (const c of uniq) {
        const cVec = await this.embeddingService.embed(c);
        const score = VectorSimilarityEngine.cosineSimilarity(inputVec, cVec);
        if (score >= threshold && (!best || score > best.score)) best = { target: c, score };
      }
      return best;
    } catch {
      // Embedding can fail under cold-boot / model swap — silently skip,
      // caller falls back to regex resolution.
      return null;
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
