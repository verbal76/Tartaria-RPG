import * as FileSystem from 'expo-file-system';
import { runExclusiveNativeMl } from '../nativeMlLock';
import { recordQwenCall } from './qwenTelemetry';

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
    n_batch?: number;
    n_ubatch?: number;
    flash_attn?: boolean;
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
  /** OTA-459 — logical prompt batch (llama.cpp n_batch). Default 512. */
  batch?: number;
  /** OTA-459 — physical micro-batch (llama.cpp n_ubatch); sizes the compute
   *  buffer. Smaller = smaller faulting region on crash-prone ARM kernels.
   *  Default 128. */
  ubatch?: number;
}

export interface LlamaGenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  /** Per-token callback for streaming. Receives just the new token text. */
  onToken?: (token: string) => void;
  /** OTA-1105 — telemetry label for this call ('flourish', 'forge_name', a
   *  narration intent…). Unlabeled calls record as 'unlabeled' so a new
   *  consumer that forgets the tag still shows up in the stats instead of
   *  vanishing from them. */
  job?: string;
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
      // OTA-459 — shrink the compute batch. llama.cpp defaults (n_batch 2048 /
      // n_ubatch 512) allocate a large compute graph/buffer; on newer ARM cores
      // (Pixel 10 Pro XL / Tensor G5) the SVE-optimized kernels SIGSEGV a few
      // tokens into generation. n_ubatch sizes that pre-allocated buffer, so a
      // smaller physical batch shrinks the faulting region. Cost is purely a hair
      // more prompt-prefill latency (decode speed + output text are unchanged);
      // peak RAM drops too. Conservative values that keep prefill throughput sane.
      n_batch: opts.batch ?? 512,
      n_ubatch: opts.ubatch ?? 128,
    });
    this.modelPath = opts.modelPath;
    // arb129 — record which native kernel variant llama.rn selected + the CPU/SoC
    // signature (forwarded by the patched llama.rn) into mlHealth, so the copyable
    // bug report shows it (no adb logcat needed). Diagnostics only — never throw.
    try {
      const ctx = this.context as unknown as { loadedVariant?: string; cpuDiag?: string };
      const variant = ctx?.loadedVariant ?? '';
      const diag = ctx?.cpuDiag ?? '';
      if (variant || diag) {
        const ml = require('../../diagnostics/mlHealth') as typeof import('../../diagnostics/mlHealth');
        void ml.recordQwenRuntime(variant, diag);
      }
    } catch { /* diagnostics only */ }
  }

  async generate(
    messages: readonly QwenChatMessage[],
    opts: LlamaGenerateOptions = {},
  ): Promise<string> {
    if (!this.context) throw new Error('LlamaRuntime not initialized');
    // Capture the context locally. dispose() (fired on BACKGROUND) sets
    // this.context = null BEFORE it acquires the native-ML lock, so a lambda that
    // read `this.context!` at execution time could dereference null once dispose has
    // run — right when the app is being backgrounded (the square-button path). The
    // captured ctx is the same one that passed the guard above; release() is still
    // serialized behind this completion by the shared lock.
    const ctx = this.context;
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
    // OTA-1105 — telemetry. Measured HERE, at the one boundary every consumer
    // crosses, so nine call sites get timing without nine hand-rolled timers.
    // The wait/generate split is the point: this call queues behind the shared
    // native-ML lock (arb159), so a "29-second generation" can be four seconds
    // of generating behind twenty-five of queue — and the fix for each is
    // completely different.
    const telT0 = Date.now();
    let telLockAt = telT0;
    try {
      // arb159 — run the completion through the shared native-ML lock so it
      // never overlaps a Kokoro TTS synth (the two heavy native workloads
      // contending crashed the process on Tensor G5).
      const result = await runExclusiveNativeMl(() => {
        telLockAt = Date.now();
        return ctx.completion(
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
      });
      // Prefer assembled tokens (already stripped of prompt) but fall back to
      // the final text the native side returns.
      const text = (assembled || result.text || '').trim();
      // ⚠ OTA-1107 — llama.cpp has been computing the exact read/write split
      // this whole time and we were throwing the object away. OTA-1106's whole
      // diagnosis (prefill dominates) was INFERRED from wall-clock; `timings`
      // states it outright, per call, for free. Optional-chained throughout:
      // the field is absent in older llama.rn builds and in the jest mock, and
      // a missing number must never cost a generation.
      const t = (result as { timings?: {
        prompt_ms?: number; predicted_ms?: number;
        prompt_n?: number; predicted_n?: number;
      } }).timings;
      const r = result as {
        tokens_evaluated?: number; tokens_predicted?: number;
        tokens_cached?: number; stopped_eos?: boolean;
        stopped_limit?: number; stopping_word?: string;
      };
      recordQwenCall({
        job: opts.job ?? 'unlabeled',
        totalMs: Date.now() - telT0,
        waitMs: Math.max(0, telLockAt - telT0),
        chars: text.length,
        // ⚠ OTA-1119 — DISTINGUISH "the model said nothing" FROM "there was no
        // model". Both used to record as `empty`, and the device log had one of
        // each: a real silent generation, and `empty 8809ms read 0ms/write 0ms
        // in 309t→out 0t` — 8.8 seconds of wall time with ZERO prefill and ZERO
        // decode, moments after an OTA session start, three seconds before the
        // watchdog announced dormancy. That second one never touched the native
        // side at all; it ran against a context that had already been detached.
        // `this.context` is nulled synchronously the moment dispose() begins, so
        // checking it HERE — after the await, when we know what we got back —
        // says whether the context outlived the call. A prompt problem and a
        // lifecycle problem get investigated in opposite directions, so filing
        // them under one word cost a whole round of guessing.
        outcome: text.length > 0 ? 'ok' : (this.context === null ? 'dormant' : 'empty'),
        at: telT0,
        prefillMs: typeof t?.prompt_ms === 'number' ? Math.round(t.prompt_ms) : undefined,
        decodeMs: typeof t?.predicted_ms === 'number' ? Math.round(t.predicted_ms) : undefined,
        promptTokens: r.tokens_evaluated ?? t?.prompt_n,
        outTokens: r.tokens_predicted ?? t?.predicted_n,
        cachedTokens: r.tokens_cached,
        stop: r.stopped_eos ? 'eos'
          : r.stopped_limit ? 'limit'
          : r.stopping_word ? 'word'
          : 'unknown',
        promptChars: prompt.length,
      });
      return text;
    } catch (err) {
      recordQwenCall({
        job: opts.job ?? 'unlabeled',
        totalMs: Date.now() - telT0,
        waitMs: Math.max(0, telLockAt - telT0),
        chars: 0,
        // Same split on the throw path: a native call that blew up because the
        // context vanished under it is a lifecycle event, not a model error.
        outcome: this.context === null ? 'dormant' : 'error',
        at: telT0,
        promptChars: prompt.length,
      });
      throw err;
    } finally {
      // Clears on success OR a JS throw. A NATIVE crash never reaches here —
      // that's the whole point; the breadcrumb survives for next-boot detection.
      try { await markDone?.(); } catch { /* ignore */ }
    }
  }

  async dispose(): Promise<void> {
    // CRASH FIX (librnllama isPredicting SIGSEGV, Play Console / 2.4.1 internal
    // testing). `completion()` runs under the native-ML lock, but release() did
    // NOT — so if dispose() fired while a prediction was still running on the
    // native thread (model switch, screen unmount, app backgrounding, OTA-apply
    // teardown), release() freed the llama context out from under the running
    // completion. llama.rn's internal isPredicting() check then dereferenced the
    // freed context and SIGSEGV'd (Java_com_rnllama_LlamaContext_isPredicting).
    //
    // The fix: (1) detach the context first so no NEW completion can start on it;
    // (2) ask any in-flight prediction to stop so the lock frees promptly; (3)
    // release THROUGH the same runExclusiveNativeMl lock as completion(), so the
    // free is serialized behind the running prediction and the window is closed.
    const ctx = this.context;
    this.context = null;
    this.modelPath = null;
    if (!ctx) return;
    try {
      await (ctx as unknown as { stopCompletion?: () => unknown }).stopCompletion?.();
    } catch {
      // stopCompletion unsupported / nothing running — fine; the lock still guards us.
    }
    try {
      await runExclusiveNativeMl(() => Promise.resolve(ctx.release()));
    } catch {
      // best effort — native side may already be torn down
    }
  }
}
