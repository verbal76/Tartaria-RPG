// arb159 / OTA-634 — Native-ML serialization lock, now PRIORITY-aware.
//
// On Tensor G5 (Pixel 10 Pro XL / Android 16) the on-device LLM (llama.cpp via
// llama.rn) and the bundled Kokoro TTS (ONNX) are BOTH heavy native-ML
// workloads. Running a Qwen completion and a voice synth at the same time
// contends for CPU/memory on the same big cores — observed as a process SIGSEGV
// the moment generation started firing concurrently with `am_michael` synthesis
// (build 290 / OTA-577 log). So every native-ML op funnels through this ONE lock
// and runs strictly one-at-a-time, never overlapping — that exclusivity is what
// stopped the crash and MUST be preserved.
//
// OTA-634 — added PRIORITY. The lock used to be pure FIFO, so a slow voice synth
// (or a backlog of them) could sit ahead of an interactive LLM narration and make
// "responses" feel slow. Now each waiter carries a priority; when the running op
// SETTLES, the highest-priority waiter goes next (FIFO within the same priority).
// LLM narration (ML_PRIORITY_LLM) jumps ahead of voice synth (ML_PRIORITY_VOICE)
// so the words land promptly and the voice fills in behind (its own queue drops
// stale lines so it can't fall rounds behind). Still exactly one op at a time.
//
// Safety: each op runs after the previous SETTLES (success OR failure), so a
// failed op can't wedge the chain. No nested acquisition (an op never triggers
// another native-ML op from inside its own locked fn), so it can't deadlock.

/** Lower number = lower priority. Voice yields to LLM narration. */
export const ML_PRIORITY_VOICE = 0;
export const ML_PRIORITY_LLM = 1;

interface PendingMl {
  fn: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  priority: number;
  seq: number;
}

const pending: PendingMl[] = [];
let running = false;
let seqCounter = 0;

function pumpMl(): void {
  if (running || pending.length === 0) return;
  // Pick the highest priority; FIFO (lowest seq) within the same priority. A
  // native call already in flight can't be preempted — `running` guards that —
  // so priority only reorders the WAITING set, never overlaps execution.
  let bestIdx = 0;
  for (let i = 1; i < pending.length; i++) {
    const a = pending[i]!;
    const b = pending[bestIdx]!;
    if (a.priority > b.priority || (a.priority === b.priority && a.seq < b.seq)) bestIdx = i;
  }
  const task = pending.splice(bestIdx, 1)[0]!;
  running = true;
  Promise.resolve()
    .then(task.fn)
    .then(task.resolve, task.reject)
    .then(() => {
      running = false;
      pumpMl();
    });
}

/** Run `fn` exclusively with respect to every other native-ML call routed
 *  through this lock (Qwen completion + Kokoro synth). Never overlaps. Higher
 *  `priority` waiters run first when the lock frees; equal priority is FIFO. */
export function runExclusiveNativeMl<T>(fn: () => Promise<T>, priority: number = ML_PRIORITY_LLM): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.push({
      fn: fn as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
      priority,
      seq: seqCounter++,
    });
    pumpMl();
  });
}
