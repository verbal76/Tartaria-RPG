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

/** ⚠ OTA-1144 — THE HANDOFF WINDOW: PRIORITY CANNOT RANK WORK THAT HASN'T
 *  ARRIVED YET.
 *
 *  OTA-1130 put the voice above the LLM and OTA-1134 made item synthesis
 *  interruptible, and the device log still showed this on a save load:
 *
 *    [:25.994] arbiter  "Welcome back, Verbal. …"        ← text on screen
 *    [:29.722] qwen⏱   item_synthesis preempted 3565ms  in 328t→out 0t
 *    [:30.714] voice⏱  gap 4720ms (wait 3604ms + synth 849ms)
 *
 *  Two facts, and together they explain the whole 4.7 s:
 *
 *  1. THE JOB STARTED AFTER THE LINE WAS QUEUED. The greeting is stamped
 *     `queuedAt` and handed to drain(), which then AWAITS the voice model and a
 *     durable crash breadcrumb before it ever calls runExclusiveNativeMl. The
 *     synthesis grabbed the lock inside that gap. Priority never got a say: at
 *     the moment pumpMl chose, the voice was not in the pending set.
 *
 *  2. `out 0t` — THE PREEMPT COULD NOT LAND. stopCompletion() is checked in
 *     llama.cpp's DECODE loop, and this job never reached decode: all 3565 ms
 *     was PREFILL of a 328-token prompt (~11 ms/token on a Tensor G5). The hook
 *     fired, the outcome is correctly filed as `preempted`, and it saved ~40 ms
 *     of a ~3.6 s wait. OTA-1134's note — "when the voice arrives mid-generation
 *     llama.cpp is asked to stop" — holds only once tokens are being written.
 *     Prefill is uninterruptible, and prefill is where this model spends its
 *     time.
 *
 *  So the fix cannot be another reordering or another interrupt. It has to stop
 *  the job from STARTING: a voice line that has been accepted for speech RESERVES
 *  the lock for the few hundred milliseconds it needs to get here, and anything
 *  below voice waits that out instead of claiming a slot it will hold for
 *  seconds.
 *
 *  ⚠ BOUNDED BY CONSTRUCTION, because a reservation that leaks would starve the
 *  LLM outright: it carries a deadline (VOICE_RESERVATION_MS), it is released
 *  the moment the line's audio is in hand, and it is only taken when a line
 *  actually needs synthesis — a pre-synthesised (OTA-1130 banked) line plays
 *  without the lock and never reserves it. Exclusivity is untouched; this
 *  schedules starts, it does not overlap them. */
export const VOICE_RESERVATION_MS = 1200;

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
/** OTA-1144 — epoch (ms) until which a queued-but-not-yet-arrived voice line
 *  holds the lock open. 0 = no reservation. */
let voiceReservedUntil = 0;
/** The single pending re-pump scheduled for when a reservation expires. One
 *  timer at a time — a deferred pump re-evaluates the whole queue anyway. */
let deferTimer: ReturnType<typeof setTimeout> | null = null;

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
  // ⚠ OTA-1144 — hold the slot for a voice line that is on its way but has not
  // reached the lock yet (see VOICE_RESERVATION_MS). Only work BELOW voice
  // waits: a voice op is the thing being waited for, and homework already
  // yields to everything. The deadline makes this self-clearing, so a line that
  // never arrives costs the LLM one short deferral and nothing more.
  if (pending[bestIdx]!.priority < ML_PRIORITY_VOICE) {
    const holdMs = voiceReservedUntil - Date.now();
    if (holdMs > 0) {
      if (deferTimer === null) {
        deferTimer = setTimeout(() => { deferTimer = null; pumpMl(); }, holdMs + 1);
      }
      return;
    }
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

/** ⚠ OTA-1144 — a voice line has been accepted for speech and is on its way to
 *  this lock. Hold the slot: work below voice defers until the line arrives or
 *  the deadline passes, whichever comes first. Call ONLY for lines that will
 *  actually be synthesised — a banked (pre-synthesised) line never takes the
 *  lock, so reserving for it would stall the LLM for nothing. */
export function reserveVoiceSlot(ms: number = VOICE_RESERVATION_MS): void {
  voiceReservedUntil = Math.max(voiceReservedUntil, Date.now() + ms);
}

/** OTA-1144 — the reserved line has its audio (it acquired the lock, or the
 *  bank had it, or it was dropped). Release immediately and pump, so the LLM
 *  waits the real handoff and not the whole deadline. */
export function releaseVoiceSlot(): void {
  voiceReservedUntil = 0;
  if (deferTimer !== null) { clearTimeout(deferTimer); deferTimer = null; }
  pumpMl();
}

/** Tests only — the lock is module state. */
export function _mlLockState(): {
  running: boolean; queued: number; runningPriority: number; voiceReserved: boolean;
} {
  return {
    running, queued: pending.length, runningPriority,
    voiceReserved: Date.now() < voiceReservedUntil,
  };
}

/** Tests only — drop any reservation so suites don't leak state into each other. */
export function _clearVoiceReservation(): void {
  voiceReservedUntil = 0;
  if (deferTimer !== null) { clearTimeout(deferTimer); deferTimer = null; }
}
