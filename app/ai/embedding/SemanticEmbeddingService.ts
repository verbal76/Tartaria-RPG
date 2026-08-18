import * as ort from 'onnxruntime-react-native';
import * as FileSystem from 'expo-file-system';
// ⚠⚠ OTA-1354 — the classifier joins the native-ML lock. It was the ONE native
// ML engine running outside it: every inference (and every foreground-resume
// session create) could land on top of an in-flight ~15s Qwen generation — the
// exact two-heavy-native-workloads collision the lock was built to prevent on
// the Tensor chip family. Inference runs at LLM priority: a queued 60ms embed
// preempts homework (the lock's hook cuts it short) and waits briefly behind a
// live narration, which only delays an enrichment label nobody is blocked on.
import { runExclusiveNativeMl, ML_PRIORITY_LLM } from '../nativeMlLock';
import { WordPieceTokenizer } from './Tokenizer';
import { EmbeddingCache } from './EmbeddingCache';
import type { ModelInfo } from '../types';

const EMBEDDING_DIM = 384;
const MAX_SEQ_LEN = 128;
const MODEL_NAME = 'all-MiniLM-L6-v2 (int8 quantized)';
const MODEL_SOURCE = 'Xenova/all-MiniLM-L6-v2 @ HuggingFace';

export class SemanticEmbeddingService {
  private session: ort.InferenceSession | null = null;
  private tokenizer: WordPieceTokenizer;
  private cache: EmbeddingCache;
  private modelPath: string | null = null;

  constructor(cacheSize: number = 2000) {
    this.tokenizer = new WordPieceTokenizer();
    this.cache = new EmbeddingCache(cacheSize);
  }

  async initialize(modelPath: string, vocabText: string): Promise<void> {
    this.tokenizer.loadVocab(vocabText);
    this.session = await runExclusiveNativeMl(() => ort.InferenceSession.create(modelPath), ML_PRIORITY_LLM);
    this.modelPath = modelPath;
  }

  isReady(): boolean {
    return this.session !== null && this.tokenizer.isLoaded();
  }

  async getModelInfo(runtimeVersion: string): Promise<ModelInfo> {
    let modelSizeBytes: number | null = null;
    if (this.modelPath) {
      try {
        const info = await FileSystem.getInfoAsync(this.modelPath);
        if (info.exists && 'size' in info && typeof info.size === 'number') {
          modelSizeBytes = info.size;
        }
      } catch {
        // best-effort — leave as null
      }
    }
    return {
      name: MODEL_NAME,
      source: MODEL_SOURCE,
      embeddingDim: EMBEDDING_DIM,
      maxSeqLen: MAX_SEQ_LEN,
      vocabSize: this.tokenizer.vocabSize(),
      modelPath: this.modelPath,
      modelSizeBytes,
      runtime: `onnxruntime-react-native ${runtimeVersion}`,
    };
  }

  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
  }

  async reinitializeIfNeeded(): Promise<void> {
    if (this.session || !this.modelPath || !this.tokenizer.isLoaded()) return;
    const path = this.modelPath;
    this.session = await runExclusiveNativeMl(() => ort.InferenceSession.create(path), ML_PRIORITY_LLM);
  }

  clearCache(): void {
    this.cache.clear();
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.session) throw new Error('SemanticEmbeddingService not initialized');

    const key = text.toLowerCase().trim();
    if (!key) throw new Error('Cannot embed empty text');

    const cached = this.cache.get(key);
    if (cached) return cached;

    const tokenIds = this.tokenizer.tokenize(key, MAX_SEQ_LEN);
    const seqLen = tokenIds.length;
    const dims = [1, seqLen];

    const inputIds = BigInt64Array.from(tokenIds, (id) => BigInt(id));
    const attentionMask = new BigInt64Array(seqLen).fill(1n);
    const tokenTypeIds = new BigInt64Array(seqLen);

    const feeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor('int64', inputIds, dims),
      attention_mask: new ort.Tensor('int64', attentionMask, dims),
      token_type_ids: new ort.Tensor('int64', tokenTypeIds, dims),
    };

    // OTA-1354 — capture the session like LlamaRuntime captures its context:
    // dispose() nulls the field, and the lock may hold this call briefly.
    const session = this.session;
    const results = await runExclusiveNativeMl(() => session.run(feeds), ML_PRIORITY_LLM);
    const output = results.last_hidden_state ?? results.token_embeddings ?? results.embeddings;
    if (!output) throw new Error('ONNX output missing expected tensor');

    const vector = this.meanPool(output.data as Float32Array, seqLen, attentionMask);
    this.l2Normalize(vector);

    this.cache.set(key, vector);
    return vector;
  }

  private meanPool(data: Float32Array, seqLen: number, mask: BigInt64Array): Float32Array {
    const pooled = new Float32Array(EMBEDDING_DIM);
    let totalWeight = 0;
    for (let i = 0; i < seqLen; i++) {
      const m = Number(mask[i] ?? 0n);
      if (m === 0) continue;
      const base = i * EMBEDDING_DIM;
      for (let j = 0; j < EMBEDDING_DIM; j++) {
        pooled[j] += (data[base + j] ?? 0) * m;
      }
      totalWeight += m;
    }
    if (totalWeight > 0) {
      for (let j = 0; j < EMBEDDING_DIM; j++) pooled[j] /= totalWeight;
    }
    return pooled;
  }

  private l2Normalize(vec: Float32Array): void {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += (vec[i] ?? 0) * (vec[i] ?? 0);
    norm = Math.sqrt(norm);
    if (norm === 0) return;
    for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / norm;
  }
}

export { EMBEDDING_DIM, MAX_SEQ_LEN };
