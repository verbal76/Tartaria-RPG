import * as FileSystem from 'expo-file-system';

// ---------------------------------------------------------------------------
// LlamaRuntime — thin wrapper around the llama.rn native module
// ---------------------------------------------------------------------------
//
// llama.rn ships llama.cpp wrapped as a React Native native module. It runs
// real LLM inference on-device on Android/iOS without WASM, without
// onnxruntime, and without the @huggingface/transformers bundling problem.
// We use the Q4_K_M GGUF build of Qwen 2.5 0.5B Instruct (~398 MB) which
// bundles its own tokenizer — single file, no extras.
//
// This module is loaded LAZILY via require() rather than statically
// imported. Metro will still resolve the package at bundle time (it's in
// package.json), but the indirection keeps the engine class type-safe even
// if the native module ever fails to register at runtime. On any failure
// the runtime reports null and QwenGenerativeEngine reports 'failed' —
// templates carry the Arbiter as before.

// Minimal shape of the llama.rn API surface we touch. Kept locally so we
// don't take a hard type dependency on the package across version bumps.
export interface LlamaCompletionParams {
  prompt: string;
  n_predict?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
}
export interface LlamaCompletionResult {
  text: string;
  tokens_predicted: number;
  truncated?: boolean;
}
export interface LlamaTokenEvent {
  token: string;
}
export interface LlamaContext {
  completion(
    params: LlamaCompletionParams,
    onToken?: (data: LlamaTokenEvent) => void,
  ): Promise<LlamaCompletionResult>;
  release(): Promise<void>;
}
export interface LlamaModule {
  initLlama(params: {
    model: string;
    n_ctx?: number;
    n_gpu_layers?: number;
    use_mlock?: boolean;
    n_threads?: number;
  }): Promise<LlamaContext>;
  releaseAllLlama(): Promise<void>;
}

declare const require: (id: string) => unknown;

let llamaCache: LlamaModule | null = null;
let llamaLoadAttempted = false;

export function loadLlama(): LlamaModule | null {
  if (llamaLoadAttempted) return llamaCache;
  llamaLoadAttempted = true;
  try {
    const moduleName = 'llama.rn';
    llamaCache = require(moduleName) as LlamaModule;
  } catch {
    llamaCache = null;
  }
  return llamaCache;
}

/** Test hook — inject a fake module so unit tests don't hit the real native. */
export function __setLlamaModuleForTests(mod: LlamaModule | null): void {
  llamaCache = mod;
  llamaLoadAttempted = true;
}

/** Test hook — clear the cached module so the next load tries again. */
export function __resetLlamaLoaderForTests(): void {
  llamaCache = null;
  llamaLoadAttempted = false;
}

// ---------------------------------------------------------------------------
// Chat template
// ---------------------------------------------------------------------------
// Qwen 2.5 Instruct uses ChatML — system/user/assistant turns wrapped in
// `<|im_start|>role` ... `<|im_end|>` markers. The GGUF doesn't apply this
// automatically when we call completion() with a raw prompt, so we render
// it ourselves before handing the prompt over to llama.rn.

export interface QwenChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const QWEN_STOP_TOKENS: readonly string[] = ['<|im_end|>', '<|endoftext|>'];

export function renderChatML(messages: readonly QwenChatMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    parts.push(`<|im_start|>${m.role}\n${m.content}<|im_end|>`);
  }
  // Open the assistant turn so the model continues from there.
  parts.push('<|im_start|>assistant\n');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// LlamaRuntime — the class QwenGenerativeEngine actually uses
// ---------------------------------------------------------------------------

export interface LlamaInitOptions {
  modelPath: string;
  /** Context window. Qwen 2.5 supports up to 32K but we only need ~2K for
   *  Arbiter narration. Smaller context = less RAM. */
  contextSize?: number;
  /** Threads to use for inference. Mobile CPUs usually pick 4 well. */
  threads?: number;
}

export interface LlamaGenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  /** Per-token callback for streaming. Receives just the new token text. */
  onToken?: (token: string) => void;
}

export class LlamaRuntime {
  private context: LlamaContext | null = null;
  private modelPath: string | null = null;

  isReady(): boolean {
    return this.context !== null;
  }

  getModelPath(): string | null {
    return this.modelPath;
  }

  async initialize(opts: LlamaInitOptions): Promise<void> {
    const mod = loadLlama();
    if (!mod) {
      throw new Error('llama.rn not available in this build');
    }
    // Verify the file exists before handing it to the native loader — the
    // native side throws cryptic errors when the path is missing.
    const info = await FileSystem.getInfoAsync(opts.modelPath);
    if (!info.exists) {
      throw new Error(`GGUF model file not found at ${opts.modelPath}`);
    }
    this.context = await mod.initLlama({
      model: opts.modelPath,
      n_ctx: opts.contextSize ?? 2048,
      n_gpu_layers: 0, // mobile CPU only — GPU offload is desktop territory
      n_threads: opts.threads ?? 4,
      use_mlock: false, // lets the OS swap weights out under memory pressure
    });
    this.modelPath = opts.modelPath;
  }

  async generate(
    messages: readonly QwenChatMessage[],
    opts: LlamaGenerateOptions = {},
  ): Promise<string> {
    if (!this.context) throw new Error('LlamaRuntime not initialized');
    const prompt = renderChatML(messages);
    let assembled = '';
    // OTA-351 — completion-crash breadcrumb. On newer high-end ARM cores
    // llama.rn's SVE kernels can SIGSEGV inside `completion()` (ggml graph
    // compute) — a native abort no JS try/catch can see. We durably flush a
    // breadcrumb before the call and clear it after; if it survives to the next
    // boot, mlHealth counts a completion crash and (after a few) disables Qwen.
    // require()'d lazily to avoid a hard import cycle at module load.
    let markDone: (() => Promise<void>) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ml = require('../../diagnostics/mlHealth') as typeof import('../../diagnostics/mlHealth');
      await ml.markQwenCompletionStart();
      markDone = ml.markQwenCompletionDone;
    } catch { /* guard module unavailable — proceed without the breadcrumb */ }
    try {
      const result = await this.context.completion(
        {
          prompt,
          n_predict: opts.maxTokens ?? 120,
          temperature: opts.temperature ?? 0.8,
          top_p: opts.topP ?? 0.9,
          top_k: opts.topK ?? 40,
          stop: [...QWEN_STOP_TOKENS],
        },
        opts.onToken
          ? (evt) => {
              if (typeof evt.token === 'string') {
                assembled += evt.token;
                try { opts.onToken?.(evt.token); } catch { /* swallow user errors */ }
              }
            }
          : undefined,
      );
      // Prefer assembled tokens (already stripped of prompt) but fall back to
      // the final text the native side returns.
      return (assembled || result.text || '').trim();
    } finally {
      // Clears on success OR a JS throw. A NATIVE crash never reaches here —
      // that's the whole point; the breadcrumb survives for next-boot detection.
      try { await markDone?.(); } catch { /* ignore */ }
    }
  }

  async dispose(): Promise<void> {
    if (this.context) {
      try {
        await this.context.release();
      } catch {
        // best effort — native side may already be torn down
      }
      this.context = null;
    }
    this.modelPath = null;
  }
}
