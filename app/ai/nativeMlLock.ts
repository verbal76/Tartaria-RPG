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

/** ⚠ OTA-1123 — HOMEWORK IS BELOW EVERYTHING, AND IT CAN BE CUT OFF.
 *
 *  Owner, on whether idle-time generation costs the player anything: *"if done
 *  right, it should cost us [no] time correct?"* Not automatically — and the
 *  difference is the whole engineering problem.
 *
 *  OTA-634 made this lock priority-aware, but read its own note carefully: *"a
 *  native call already in flight can't be preempted — `running` guards that —
 *  so priority only reorders the WAITING set."* That is exactly right for voice
 *  vs narration, where both are work someone asked for and the only question is
 *  order. It is NOT enough for homework, which nobody asked for: a homework
 *  generation six seconds into a ten-second job makes the player's next tap
 *  wait four seconds, and priority cannot help because the job is already
 *  running.
 *
 *  So homework gets two things:
 *   1. A priority BELOW voice, so it never jumps any queue; and
 *   2. an `onPreempt` hook, called the moment higher-priority work arrives.
 *      llama.cpp's `stopCompletion()` ends the generation early, the promise
 *      settles with whatever it had, the lock frees, and the player's call
 *      runs. Partial homework is discarded — it was free work; losing it costs
 *      nothing, and making the player wait costs the only thing that matters.
 *
 *  ⚠ EXCLUSIVITY IS UNTOUCHED. Preemption does not overlap two native ops: it
 *  asks the running one to FINISH EARLY, and the chain still waits for it to
 *  settle before pumping. The arb159 crash guarantee is exactly as strong. */
export const ML_PRIORITY_HOMEWORK = -1;
/** ⚠ OTA-1130 — THE VOICE NOW OUTRANKS THE LLM, REVERSING OTA-634.
 *
 *  This is not a bug fix. It is a design call being overruled by the person who
 *  has to live with it. OTA-634 wrote its trade down plainly — *"LLM narration
 *  jumps ahead of voice synth so the words land promptly and the voice fills in
 *  behind"* — and that reasoning is coherent on its own terms. The owner,
 *  playing the result:
 *
 *    *"do we need to see the text and then hear it? that's what makes the voice
 *     feel late sometimes, you read it then hear it 10 seconds later."*
 *
 *  ⚠ THE ARITHMETIC SETTLES IT. OTA-1128 measured one scene_intro generation at
 *  19.3 s. Under the old order a line ALREADY ON SCREEN had to wait behind that
 *  entire generation before a single syllable could be synthesised — so the
 *  voice did not merely trail, it trailed by the length of the NEXT narration.
 *  That is the reported ten seconds, and it is structural rather than
 *  occasional.
 *
 *  And the two sides are not symmetrical, which is the thing OTA-634 could not
 *  see from where it stood: a narration delayed two seconds is INVISIBLE,
 *  because nothing is shown until it completes anyway. A voice delayed ten
 *  seconds is the most obvious defect in the game — you have already read the
 *  line it is reading to you.
 *
 *  ⚠ WHAT MAKES THE REVERSAL SAFE, and did not exist in OTA-634's day: the
 *  total queue cap (three whole lines — OTA-634's own mitigation), and
 *  OTA-1130's stale-line drop, which refuses to speak a line the player has
 *  already read past. Together those bound how long the voice can hold the
 *  lock, which is the failure mode OTA-634 was actually defending against.
 *
 *  Homework stays below everything, so idle work still yields to both. */
export const ML_PRIORITY_VOICE = 2;
export const ML_PRIORITY_LLM = 1;

interface PendingMl {
  fn: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  priority: number;
  seq: number;
  /** OTA-1123 — cut this op short if higher-priority work arrives. Only
   *  interruptible work (homework) supplies one; everything else is work
   *  someone is waiting for, and finishing it IS the point. */
  onPreempt?: () => void;
}

const pending: PendingMl[] = [];
let running = false;
let seqCounter = 0;
/** The running op's priority and its cut-it-short hook, when it offered one.
 *  Exactly one op runs at a time, so a single slot is the whole registry. */
let runningPriority = ML_PRIORITY_LLM;
let runningPreempt: (() => void) | null = null;

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
  runningPriority = task.priority;
  runningPreempt = task.onPreempt ?? null;
  Promise.resolve()
    .then(task.fn)
    .then(task.resolve, task.reject)
    .then(() => {
      running = false;
      runningPreempt = null;
      pumpMl();
    });
}

/** Run `fn` exclusively with respect to every other native-ML call routed
 *  through this lock (Qwen completion + Kokoro synth). Never overlaps. Higher
 *  `priority` waiters run first when the lock frees; equal priority is FIFO. */
export function runExclusiveNativeMl<T>(
  fn: () => Promise<T>,
  priority: number = ML_PRIORITY_LLM,
  onPreempt?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.push({
      fn: fn as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
      priority,
      seq: seqCounter++,
      onPreempt,
    });
    // ⚠ OTA-1123 — ask the running op to finish early if this one outranks it.
    // Fired on ENQUEUE, not on pump: the whole point is to shorten a wait that
    // has already started, and by pump time the running op has finished anyway.
    // Idempotent by construction — the hook is cleared when the op settles, and
    // llama.cpp's stopCompletion is safe to call twice.
    if (running && runningPreempt && priority > runningPriority) {
      const cut = runningPreempt;
      runningPreempt = null;
      try { cut(); } catch { /* a broken hook must never wedge the chain */ }
    }
    pumpMl();
  });
}

/** Tests only — the lock is module state. */
export function _mlLockState(): { running: boolean; queued: number; runningPriority: number } {
  return { running, queued: pending.length, runningPriority };
}
