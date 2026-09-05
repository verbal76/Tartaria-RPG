// ⚠⚠ OTA-1692 — THE JS HEARTBEAT UNDER A MODEL CALL. Thirteen freeze-watch
// stalls across the owner's logs (2026-09-01 → 09-05); eleven land within half
// a second after a `qwen⏱ … ok` line and run as long as that completion's
// read or write phase. llama.rn 0.4.8 runs the completion on a native thread
// (AsyncTask.THREAD_POOL_EXECUTOR) and nothing in the store runs per token, so
// the JS thread is not BLOCKED by our code during inference — it is STARVED:
// the freeze watch's five-second sampler cannot say by how much, and it only
// speaks after the fact. This measures it from inside the call: a short
// setTimeout chain while the native call is in flight, reporting the worst
// lateness. A healthy thread reads a few ms late; a starved one reads seconds.
// The number rides the qwen⏱ line beside the thread count the call used, so
// the next log can compare lanes on one device (see LlamaRuntime.generate).

export interface JsHeartbeat {
  /** Stop sampling and return the worst lateness seen (ms) and the sample count. */
  stop(): { maxLateMs: number; samples: number };
}

export const JS_HEARTBEAT_INTERVAL_MS = 250;

/** Start a lateness sampler. Pure timers, no store, never throws; `stop()`
 *  is idempotent. `now` is injectable for tests. */
export function startJsHeartbeat(intervalMs: number = JS_HEARTBEAT_INTERVAL_MS, now: () => number = Date.now): JsHeartbeat {
  let maxLateMs = 0;
  let samples = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    if (stopped) return;
    const due = now() + intervalMs;
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      const late = Math.max(0, now() - due);
      if (late > maxLateMs) maxLateMs = late;
      samples++;
      arm();
    }, intervalMs);
  };
  arm();
  return {
    stop() {
      if (!stopped) {
        stopped = true;
        if (timer) { clearTimeout(timer); timer = null; }
      }
      return { maxLateMs: Math.round(maxLateMs), samples };
    },
  };
}

/** ⚠ OTA-1692 — THE LEVER. Homework (idle-time work nobody asked for: the
 *  ambient aside, item descriptions, scene-intro fills) runs at ONE thread;
 *  the player's own narration keeps the loaded count. llama.rn takes
 *  `n_threads` per completion, so the lane can be chosen per call. */
export const HOMEWORK_THREADS = 1;
export function threadsForLane(loadedThreads: number, homework: boolean | undefined): number {
  const base = Math.max(1, Math.floor(loadedThreads || 1));
  return homework ? Math.min(base, HOMEWORK_THREADS) : base;
}
