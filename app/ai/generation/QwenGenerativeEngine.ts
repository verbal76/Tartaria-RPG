import { ModelDownloader } from '../ota/ModelDownloader';
import {
  LlamaRuntime,
  type QwenChatMessage,
} from './LlamaRuntime';
import { noteStragglerTornDown } from './contextLedger';

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
  /** Inference threads. OTA-295 — default 1 → 2. We dropped to 1 in
   *  OTA-293 to eliminate suspected worker-pool races; OTA-294 then
   *  identified the real freeze cause as mid-load cache corruption,
   *  not worker contention. With Lichen Anvil's sentinel-based cache
   *  validation + OTA gating preventing the mid-load kill scenario,
   *  we can move back up. 2 is the middle ground — half the perf
   *  cost of single-thread, still drops concurrent SIMD pressure
   *  significantly vs 4. */
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
  /** OTA-1128 — telemetry label for this call. See qwenTelemetry.ts. */
  job?: string;
  /** OTA-1146 — idle-time work nobody asked for: queues below voice AND is cut
   *  short the moment the player needs the model. See LlamaGenerateOptions. */
  homework?: boolean;
  /** OTA-1157 — keeps its priority but can be cut short when higher-priority
   *  work arrives. Item synthesis sets this; narration does not. See
   *  LlamaGenerateOptions.interruptible for the full reasoning. */
  interruptible?: boolean;
  /** ⚠ WEB-002 — "is this output still wanted?", asked by the CONSUMER
   *  at the door (lock won, native call not yet started) and again per token.
   *  Distinct from `interruptible`: that one cuts short work someone still
   *  wants; this one declines work already known to be discarded. Narration
   *  sets this and still refuses `interruptible`. See LlamaGenerateOptions. */
  shouldAbort?: () => boolean;
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
  // OTA-1107 — the two guards that stop background-bounce thrash (the
  // 11-part log-export session: every switch-away disposed the context,
  // every return kicked a fresh ~400MB load, 10+ overlapping attempts
  // in a minute):
  //   initInFlight — one load at a time. dispose() resets status to
  //     'idle' while a load is still awaiting, which used to defeat the
  //     'already loading' status guard and let forceReinitialize() stack
  //     a SECOND concurrent context load (double memory pressure).
  //   lifecycleGen — dispose() bumps it. A load that started before the
  //     bump is STALE when it lands: the backgrounding that disposed the
  //     old context must not be resurrected by a straggler, so the fresh
  //     runtime is discarded and status stays 'idle'.
  private initInFlight: Promise<void> | null = null;
  private lifecycleGen = 0;

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
    // OTA-1107 — a load is already warming up: join it instead of resetting
    // status underneath it and stacking a second concurrent context load.
    if (this.initInFlight) return this.initInFlight;
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
    if (this.initInFlight) return this.initInFlight;
    if (this.status === 'ready' || this.status === 'loading' || this.status === 'downloading') {
      return;
    }
    const run = this.runInitialize(opts);
    this.initInFlight = run;
    try {
      await run;
    } finally {
      if (this.initInFlight === run) this.initInFlight = null;
    }
  }

  private async runInitialize(opts: QwenInitOptions): Promise<void> {
    // OTA-1107 — snapshot the lifecycle generation. If dispose() runs while
    // this load is in flight (app backgrounded mid-reload), the result is
    // stale and must be thrown away, not installed as 'ready'.
    const gen = this.lifecycleGen;
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
      // Stale (disposed mid-download): the dispose already set the state it
      // wants ('idle'); don't overwrite it with 'failed'.
      if (this.lifecycleGen !== gen) return;
      this.status = 'failed';
      this.lastError = err instanceof Error ? `GGUF download failed: ${err.message}` : String(err);
      return;
    }
    if (this.lifecycleGen !== gen) { this.status = 'idle'; return; }

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
      if (this.lifecycleGen !== gen) {
        // OTA-1107 — dispose() landed while the context was loading. The app
        // wanted the memory back; a straggler load must not resurrect a
        // ~400MB context in the background. Tear the fresh one down.
        //
        // ⚠ OTA-1200 — COUNTED, BECAUSE READING THIS CODE IS NOT THE SAME AS WATCHING IT
        // RUN. This guard looks correct on the page, and it was still the leading orphan
        // suspect after the 1.9GB jetsam reports — precisely because nothing proved it
        // executes. If the device log shows orphans climbing while this counter sits at
        // 0, the guard is not running and the read was wrong.
        noteStragglerTornDown();
        try { await runtime.dispose(); } catch { /* best effort */ }
        this.status = 'idle';
        this.runtime = null;
        return;
      }
      this.runtime = runtime;
      this.status = 'ready';
      this.downloadFraction = 1;
      onProgress?.('ready', 1);
    } catch (err) {
      if (this.lifecycleGen !== gen) { this.status = 'idle'; this.runtime = null; return; }
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
      job: opts.job,
      homework: opts.homework,
      interruptible: opts.interruptible,
      shouldAbort: opts.shouldAbort,
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
      job: opts.job,
      homework: opts.homework,
      interruptible: opts.interruptible,
      shouldAbort: opts.shouldAbort,
    });
  }

  /**
   * Tears down the llama context. Used on backgrounding / OTA reload to
   * free memory cleanly.
   */
  async dispose(): Promise<void> {
    // OTA-1107 — mark any in-flight load stale (see lifecycleGen above).
    this.lifecycleGen += 1;
    // ⚠ OTA-1142 — STATUS LEAVES 'ready' FIRST, AND THIS IS THE WHOLE FIX.
    // `isDormant()` is defined as "status==='ready' but the runtime is gone",
    // and this method used to produce exactly that state for as long as its own
    // teardown took. LlamaRuntime.dispose() nulls its context SYNCHRONOUSLY on
    // entry (the OTA-arb crash fix: detach before release so nothing can start
    // a completion against a freed context) and then AWAITS the release behind
    // the native-ML lock. So from the first line of that await until this
    // function returned, the engine reported ready-over-dead — the watchdog's
    // exact dormancy signature — for however long the in-flight generation held
    // the lock. The owner's log has item synthesis holding it for 10.4s.
    // The device log then showed the cost outright:
    //   OTA session start … → item_synthesis empty 8809ms read 0ms/write 0ms
    //   in 309t→out 0t (0ch) → qwen-watchdog: Qwen dormant … reinitializing
    // 8.8 seconds of wall time with ZERO prefill and ZERO decode: a call that
    // entered a detached context, did no native work, and returned nothing —
    // and it happened seconds after an OTA session start, which is the one
    // shutdown path that runs in the FOREGROUND where OTA-1107's
    // don't-reload-while-backgrounded guard does not apply.
    // Setting status here costs nothing and closes the window entirely: an
    // engine that is shutting down now says 'idle', which is true, instead of
    // 'ready', which was never true once the context was detached.
    this.status = 'idle';
    this.downloadFraction = 0;
    if (this.runtime) {
      try { await this.runtime.dispose(); } catch { /* best effort */ }
      this.runtime = null;
    }
  }
}

/** Re-export so callers can use it as the parameter to opts.runtime. */
export { LlamaRuntime } from './LlamaRuntime';
