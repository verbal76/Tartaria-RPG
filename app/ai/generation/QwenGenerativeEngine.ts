import { ModelDownloader } from '../ota/ModelDownloader';
import {
  LlamaRuntime,
  type QwenChatMessage,
} from './LlamaRuntime';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type QwenStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'failed';

/**
 * Chat-shaped message. Aliased from LlamaRuntime so callers don't have to
 * import from two places. Same shape as Qwen's ChatML schema.
 */
export type ChatMessage = QwenChatMessage;

export interface QwenInitOptions {
  /** Override the HF URL the GGUF is downloaded from. */
  modelUrl?: string;
  /** Override the on-device cache path (test hook). */
  modelPath?: string;
  /** Inject a custom downloader for tests. */
  downloader?: { ensureQwenGguf(opts: { url?: string; onProgress?: (f: number) => void }): Promise<string> };
  /** Inject a custom LlamaRuntime instance for tests. */
  runtime?: LlamaRuntime;
  /** Optional progress callback fired during download + load. */
  onProgress?: (status: QwenStatus, fraction: number) => void;
  /** Context window in tokens. Default 2048 (plenty for Arbiter prompts). */
  contextSize?: number;
  /** Inference threads. OTA-288 — default dropped from 4 → 2.
   *  Pixel 10 Pro XL / Tensor G4 / Android 16 Beta hit SIGSEGV in
   *  lm_ggml_graph_compute_thread (worker thread). Fewer workers
   *  reduce concurrent SIMD-memcpy pressure. Modest perf cost
   *  (~10-20%), large reliability win on affected devices.
   *  Modern CPUs (Pixel 8+, S24+) still benefit from the remaining
   *  concurrency. */
  threads?: number;
}

export interface GenerateOptions {
  /** Cap on tokens the model will emit. Default 120. */
  maxNewTokens?: number;
  /** Sampling temperature. Default 0.8. */
  temperature?: number;
  /** Top-p nucleus sampling. Default 0.9. */
  topP?: number;
  /** Top-k sampling. Default 40. */
  topK?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Label shown in About / debug surfaces. Not a registry id. */
export const DEFAULT_QWEN_MODEL_ID = 'Qwen2.5-0.5B-Instruct (Q4_K_M GGUF)';

// ---------------------------------------------------------------------------
// QwenGenerativeEngine
// ---------------------------------------------------------------------------
//
// Bridge between the game's narration code (gameStore.narrateViaArbiter)
// and whatever inference backend we wire up underneath. Currently uses
// llama.rn + a Q4_K_M GGUF of Qwen 2.5 0.5B Instruct, downloaded on first
// run via ModelDownloader and held in memory by LlamaRuntime.
//
// Public API (initialize / generate / stream / isReady / getStatus / etc.)
// is intentionally stable — earlier iterations used @huggingface/transformers
// (broken on RN — see commit 0492434) and the next backend swap should
// only touch the inside of this file.

export class QwenGenerativeEngine {
  private status: QwenStatus = 'idle';
  private downloadFraction = 0;
  private lastError: string | null = null;
  private runtime: LlamaRuntime | null = null;
  private modelId: string = DEFAULT_QWEN_MODEL_ID;

  getStatus(): QwenStatus {
    return this.status;
  }

  isReady(): boolean {
    return this.status === 'ready' && this.runtime !== null && this.runtime.isReady();
  }

  /** OTA-222 — true when the engine THINKS it's ready (status==='ready')
   *  but the underlying runtime is gone. This happens when Android
   *  kills the LlamaContext to reclaim memory: the JS status field
   *  doesn't get notified. `isReady()` returns false, but
   *  `initialize()` short-circuits because status is still 'ready'.
   *  Callers use this to detect the case and trigger
   *  `forceReinitialize()`. */
  isDormant(): boolean {
    if (this.status !== 'ready') return false;
    if (this.runtime === null) return true;
    return !this.runtime.isReady();
  }

  /** OTA-222 — force a re-init when the runtime has been killed by
   *  the OS. Resets status to 'idle' so `initialize()` will actually
   *  re-run instead of short-circuiting on the "already ready" guard.
   *  Fire-and-forget from the caller's perspective; the engine warms
   *  back up in the background. Logs a debug line if we can find a
   *  logger; otherwise silent.
   *
   *  Usage: `void qwen.forceReinitialize();` — don't await unless you
   *  WANT to block on a 5-30s context reload. The player-facing
   *  fallback path (e.g., deterministic fusion) covers the current
   *  interaction; the warm-up is for the NEXT one. */
  async forceReinitialize(opts: QwenInitOptions = {}): Promise<void> {
    this.status = 'idle';
    this.runtime = null;
    return this.initialize(opts);
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
   * Downloads the GGUF (~398 MB on first launch, instant on subsequent
   * launches) and initializes the llama.rn context. Idempotent — calling
   * while already ready/loading/downloading is a no-op.
   *
   * On any failure: status moves to 'failed' and lastError is set. Doesn't
   * throw; gameStore.bootQwen catches and logs anyway. Templates carry the
   * Arbiter when the engine isn't ready.
   */
  async initialize(opts: QwenInitOptions = {}): Promise<void> {
    if (this.status === 'ready' || this.status === 'loading' || this.status === 'downloading') {
      return;
    }
    const onProgress = opts.onProgress;
    this.status = 'downloading';
    this.downloadFraction = 0;
    this.lastError = null;
    onProgress?.('downloading', 0);

    // ── 1) Ensure the GGUF is on disk ─────────────────────────────────────
    const downloader = opts.downloader ?? new ModelDownloader();
    let modelPath: string;
    try {
      if (opts.modelPath) {
        modelPath = opts.modelPath;
      } else {
        modelPath = await downloader.ensureQwenGguf({
          url: opts.modelUrl,
          onProgress: (frac) => {
            this.downloadFraction = frac;
            onProgress?.('downloading', frac);
          },
        });
      }
    } catch (err) {
      this.status = 'failed';
      this.lastError = err instanceof Error ? `GGUF download failed: ${err.message}` : String(err);
      return;
    }

    // ── 2) Load the model into a llama.cpp context ────────────────────────
    this.status = 'loading';
    onProgress?.('loading', 0);
    try {
      const runtime = opts.runtime ?? new LlamaRuntime();
      await runtime.initialize({
        modelPath,
        contextSize: opts.contextSize ?? 2048,
        threads: opts.threads ?? 2,
      });
      this.runtime = runtime;
      this.status = 'ready';
      this.downloadFraction = 1;
      onProgress?.('ready', 1);
    } catch (err) {
      this.status = 'failed';
      this.lastError = err instanceof Error ? `Load failed: ${err.message}` : String(err);
      this.runtime = null;
    }
  }

  /**
   * Generates a complete response (no streaming). Used when the caller would
   * rather wait for the whole string than render token-by-token.
   */
  async generate(messages: readonly ChatMessage[], opts: GenerateOptions = {}): Promise<string> {
    if (!this.runtime || !this.isReady()) {
      throw new Error('QwenGenerativeEngine not ready (status=' + this.status + ')');
    }
    return this.runtime.generate(messages, {
      maxTokens: opts.maxNewTokens ?? 120,
      temperature: opts.temperature ?? 0.8,
      topP: opts.topP ?? 0.9,
      topK: opts.topK ?? 40,
    });
  }

  /**
   * Streams tokens to the callback as they're emitted. Returns the final
   * assembled text once generation completes. Callers typically accumulate
   * from the onToken callback for live UI rather than waiting for the return.
   */
  async stream(
    messages: readonly ChatMessage[],
    onToken: (token: string) => void,
    opts: GenerateOptions = {},
  ): Promise<string> {
    if (!this.runtime || !this.isReady()) {
      throw new Error('QwenGenerativeEngine not ready (status=' + this.status + ')');
    }
    return this.runtime.generate(messages, {
      maxTokens: opts.maxNewTokens ?? 120,
      temperature: opts.temperature ?? 0.8,
      topP: opts.topP ?? 0.9,
      topK: opts.topK ?? 40,
      onToken,
    });
  }

  /**
   * Tears down the llama context. Used on backgrounding / OTA reload to
   * free memory cleanly.
   */
  async dispose(): Promise<void> {
    if (this.runtime) {
      try { await this.runtime.dispose(); } catch { /* best effort */ }
      this.runtime = null;
    }
    this.status = 'idle';
    this.downloadFraction = 0;
  }
}

/** Re-export so callers can use it as the parameter to opts.runtime. */
export { LlamaRuntime } from './LlamaRuntime';
