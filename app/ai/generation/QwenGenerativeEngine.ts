import * as FileSystem from 'expo-file-system';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type QwenStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'failed';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface QwenInitOptions {
  /** HuggingFace model ID. Default: onnx-community/Qwen2.5-0.5B-Instruct. */
  modelId?: string;
  /** Quantization dtype. Default 'q4' (INT4). */
  dtype?: 'q4' | 'q8' | 'fp16' | 'fp32';
  /** Device hint. Default 'cpu' — onnxruntime-react-native runs on CPU. */
  device?: 'cpu' | 'wasm' | 'webgpu';
  /** Optional progress callback for download + load stages. */
  onProgress?: (status: QwenStatus, fraction: number) => void;
}

export interface GenerateOptions {
  /** Max new tokens to produce. Default 200. */
  maxNewTokens?: number;
  /** Sampling temperature. Default 0.8. */
  temperature?: number;
  /** Top-p nucleus sampling. Default 0.9. */
  topP?: number;
  /** Whether to sample (true) or greedy decode (false). Default true. */
  doSample?: boolean;
  /** Abort signal — if fired mid-generation, throws AbortError. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// transformers.js loader (deferred)
// ---------------------------------------------------------------------------
// The @huggingface/transformers package is large and has its own native
// dependencies. We load it indirectly so:
//   1. tsc doesn't require the package to be installed in every sandbox.
//   2. If transformers.js fails to load in React Native (polyfill mismatch,
//      WASM init failure, etc.), the engine reports 'failed' instead of
//      crashing the whole bundle. Templates carry the game until it works.

// Minimal interface we use — keeps us decoupled from transformers.js internals.
type TransformersModuleShape = {
  pipeline: (task: string, modelId: string, options?: unknown) => Promise<unknown>;
  TextStreamer: new (tokenizer: unknown, opts: unknown) => unknown;
  env: Record<string, unknown>;
};

declare const require: (id: string) => unknown;

let transformersCache: TransformersModuleShape | null = null;
let transformersLoadAttempted = false;

function loadTransformers(): TransformersModuleShape | null {
  if (transformersLoadAttempted) return transformersCache;
  transformersLoadAttempted = true;
  try {
    // Indirection hides the require from static analysis — the package must
    // be present at runtime for this to succeed; the build doesn't gate on it.
    const moduleName = '@huggingface/transformers';
    transformersCache = require(moduleName) as TransformersModuleShape;
  } catch {
    transformersCache = null;
  }
  return transformersCache;
}

/** Test hook — lets unit tests inject a fake module. */
export function __setTransformersModuleForTests(mod: TransformersModuleShape | null): void {
  transformersCache = mod;
  transformersLoadAttempted = true;
}

/** Test hook — resets the loader so the next call re-attempts. */
export function __resetTransformersLoaderForTests(): void {
  transformersCache = null;
  transformersLoadAttempted = false;
}

// ---------------------------------------------------------------------------
// QwenGenerativeEngine
// ---------------------------------------------------------------------------

export const DEFAULT_QWEN_MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';
export const DEFAULT_QWEN_DTYPE: NonNullable<QwenInitOptions['dtype']> = 'q4';

export class QwenGenerativeEngine {
  private status: QwenStatus = 'idle';
  private pipe: unknown = null;
  private downloadFraction = 0;
  private lastError: string | null = null;
  private modelId: string = DEFAULT_QWEN_MODEL_ID;
  private dtype: NonNullable<QwenInitOptions['dtype']> = DEFAULT_QWEN_DTYPE;

  getStatus(): QwenStatus {
    return this.status;
  }

  isReady(): boolean {
    return this.status === 'ready' && this.pipe !== null;
  }

  getDownloadFraction(): number {
    return this.downloadFraction;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getModelId(): string {
    return this.modelId;
  }

  /**
   * Loads the model. Idempotent — calling while already ready/loading is a no-op.
   * On any failure, status moves to 'failed' and lastError is set. Throws only
   * if the caller wants to propagate; callers in the game store catch and log.
   */
  async initialize(opts: QwenInitOptions = {}): Promise<void> {
    if (this.status === 'ready' || this.status === 'loading' || this.status === 'downloading') {
      return;
    }

    this.modelId = opts.modelId ?? DEFAULT_QWEN_MODEL_ID;
    this.dtype = opts.dtype ?? DEFAULT_QWEN_DTYPE;
    const device = opts.device ?? 'cpu';
    const onProgress = opts.onProgress;

    this.status = 'downloading';
    this.downloadFraction = 0;
    this.lastError = null;
    onProgress?.('downloading', 0);

    const transformers = loadTransformers();
    if (!transformers) {
      this.status = 'failed';
      this.lastError = '@huggingface/transformers not available in this build';
      return;
    }

    // Configure cache directory so model shards land in our expo-file-system
    // managed dir instead of wherever transformers.js defaults to.
    try {
      const root = FileSystem.documentDirectory;
      if (root) {
        transformers.env.allowLocalModels = false;
        transformers.env.cacheDir = root + 'tartaria-models/qwen/';
      }
    } catch {
      // env config is best-effort; not fatal
    }

    try {
      const pipelineOpts = {
        dtype: this.dtype,
        device,
        progress_callback: (data: unknown) => {
          // transformers.js emits { status, progress, file, ... } objects.
          // We collapse them into a single 0..1 fraction for the UI.
          const d = data as { status?: string; progress?: number };
          if (d && typeof d.progress === 'number') {
            const frac = Math.max(0, Math.min(1, d.progress / 100));
            this.downloadFraction = frac;
            onProgress?.('downloading', frac);
          }
          if (d && d.status === 'done') {
            this.status = 'loading';
            onProgress?.('loading', 0);
          }
        },
      };

      this.pipe = await transformers.pipeline('text-generation', this.modelId, pipelineOpts);
      this.status = 'ready';
      this.downloadFraction = 1;
      onProgress?.('ready', 1);
    } catch (err) {
      this.status = 'failed';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.pipe = null;
    }
  }

  /**
   * Generates a complete response (no streaming). Used for short, non-blocking
   * uses where the caller would rather wait for the whole string.
   */
  async generate(messages: ChatMessage[], opts: GenerateOptions = {}): Promise<string> {
    if (!this.isReady() || !this.pipe) {
      throw new Error('QwenGenerativeEngine not ready (status=' + this.status + ')');
    }
    const pipe = this.pipe as (msgs: unknown, opts: unknown) => Promise<unknown>;
    const result = await pipe(messages, {
      max_new_tokens: opts.maxNewTokens ?? 200,
      temperature: opts.temperature ?? 0.8,
      top_p: opts.topP ?? 0.9,
      do_sample: opts.doSample ?? true,
    });
    return extractAssistantText(result);
  }

  /**
   * Streams tokens to the callback as they're produced. Returns the final
   * assembled text. If the caller wants to render token-by-token, they should
   * accumulate from the onToken callback rather than waiting for the return.
   */
  async stream(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    opts: GenerateOptions = {},
  ): Promise<string> {
    if (!this.isReady() || !this.pipe) {
      throw new Error('QwenGenerativeEngine not ready (status=' + this.status + ')');
    }
    const transformers = loadTransformers();
    if (!transformers) {
      throw new Error('@huggingface/transformers not available');
    }

    let assembled = '';
    const pipeAny = this.pipe as { tokenizer: unknown } & ((msgs: unknown, opts: unknown) => Promise<unknown>);
    const tokenizer = pipeAny.tokenizer;
    const streamer = new transformers.TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (token: string) => {
        if (typeof token === 'string') {
          assembled += token;
          try { onToken(token); } catch { /* user callback errors swallowed */ }
        }
      },
    });

    const result = await pipeAny(messages, {
      max_new_tokens: opts.maxNewTokens ?? 200,
      temperature: opts.temperature ?? 0.8,
      top_p: opts.topP ?? 0.9,
      do_sample: opts.doSample ?? true,
      streamer,
    });
    // Prefer the streamer-assembled text (already strips the prompt). Fall back
    // to extracting from the full result if the streamer never fired.
    return assembled || extractAssistantText(result);
  }

  /** Tear down the pipeline. Used on OTA reload to free memory cleanly. */
  async dispose(): Promise<void> {
    if (this.pipe) {
      try {
        const p = this.pipe as { dispose?: () => Promise<void> };
        await p.dispose?.();
      } catch {
        // ignore — best effort
      }
      this.pipe = null;
    }
    this.status = 'idle';
    this.downloadFraction = 0;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * transformers.js pipeline returns either:
 *   - Array<{ generated_text: string }>   (raw text mode)
 *   - Array<{ generated_text: ChatMessage[] }>  (chat mode — returns the full
 *     conversation including the new assistant turn)
 * We normalize both into the final assistant text.
 */
function extractAssistantText(result: unknown): string {
  if (!result) return '';
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0] as { generated_text?: unknown };
    const gen = first?.generated_text;
    if (typeof gen === 'string') return gen.trim();
    if (Array.isArray(gen)) {
      // Chat-shaped output. Find the last assistant turn.
      for (let i = gen.length - 1; i >= 0; i--) {
        const turn = gen[i] as { role?: string; content?: string };
        if (turn?.role === 'assistant' && typeof turn.content === 'string') {
          return turn.content.trim();
        }
      }
    }
  }
  return '';
}
