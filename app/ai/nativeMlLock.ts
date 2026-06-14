// arb159 — Native-ML serialization lock.
//
// On Tensor G5 (Pixel 10 Pro XL / Android 16) the on-device LLM (llama.cpp via
// llama.rn) and the bundled Kokoro TTS (ONNX) are BOTH heavy native-ML
// workloads. Running a Qwen completion and a voice synth at the same time
// contends for CPU/memory on the same big cores — observed as a process SIGSEGV
// the moment generation started firing concurrently with `am_michael`
// synthesis (build 290 / OTA-577 log: a Qwen completion crash + a Kokoro voice
// crash co-flagged on the SAME launch).
//
// This is one global FIFO chain that BOTH paths funnel their native call
// through, so they are guaranteed to run one-at-a-time, never overlapping. Each
// op runs after the previous settles (success OR failure), so a single failed
// op can't wedge the chain. No nested acquisition (a completion never triggers a
// synth from inside the locked fn, or vice versa), so it can't deadlock.
//
// Cost: while one is running the other waits — e.g. the spoken line lands after
// the model finishes generating it, which is the natural order anyway.

let chain: Promise<unknown> = Promise.resolve();

/** Run `fn` exclusively with respect to every other native-ML call routed
 *  through this lock (Qwen completion + Kokoro synth). FIFO; never overlaps. */
export function runExclusiveNativeMl<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  // Keep the chain alive whether this op resolves or rejects.
  chain = run.then(() => undefined, () => undefined);
  return run as Promise<T>;
}
