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

/** ⚠⚠⚠ OTA-1460 — GAMEPLAY COGNITION OUTRANKS GENERATIVE WORK.
 *
 *  ⚠⚠ THE MEASUREMENT, from the owner's device log. The cognitive classifier —
 *  the ONNX embedding + intent + emotion stack that decides WHAT THE PLAYER JUST
 *  DID — normally answers in about 100ms. In one session it logged:
 *
 *      [cognitive] REST    (4954ms)
 *      [cognitive] REST    (2380ms)
 *      [cognitive] TRAVEL  (1474ms)
 *
 *  Fifty times its own runtime, because `SemanticEmbeddingService` queued at
 *  `ML_PRIORITY_LLM` — THE SAME RANK AS QWEN — and a 100ms classification sat
 *  behind a multi-second generation. FIFO within a rank did the rest.
 *
 *  ⚠⚠ THE TWO ARE NOT THE SAME KIND OF WORK, WHICH IS THE WHOLE ARGUMENT.
 *  Cognition is part of RESOLVING THE ACTION THE PLAYER JUST TOOK — the game is
 *  waiting on it to know what happened. Qwen generation is elaboration ON an
 *  action already resolved. Sharing a rank made "what did they do" wait behind
 *  "what should we say about it", which is backwards.
 *
 *  ⚠ IT STAYS BELOW VOICE. The voice is the one thing a player perceives as late
 *  — OTA-1130 established that with arithmetic, and nothing here disturbs it.
 *  Cognition slots between: above elaboration, below performance.
 *
 *  ⚠ AND IT IS EXEMPT FROM THE VOICE RESERVATION — see `pumpMl`. That hold exists
 *  to stop unrelated speculative work slipping into the gap between a line
 *  appearing and the request to speak it. Cognition is not unrelated speculative
 *  work; it is the current action still resolving. Holding a ~100ms inference for
 *  up to 350ms on the chance audio might arrive is the same inversion one rank
 *  lower. */
export const ML_PRIORITY_COGNITION = 1.5;
export const ML_PRIORITY_LLM = 1;

/** ⚠⚠⚠ OTA-1452 — GIVING BACK ~425MB OUTRANKS EVERYTHING, INCLUDING THE VOICE.
 *
 *  ⚠⚠ THE MEASUREMENT, off the owner's crash ledger — a gap between two
 *  breadcrumbs, which is the one thing a dead process still tells you:
 *      PROCESS KILLED — no JS ran
 *      last checkpoint: ctx-release (+9152ms)
 *  `dispose()` stamps `ctx-release`, frees the context, then stamps
 *  `ctx-release-done`. The second crumb never landed. So the free was asked for,
 *  did not finish for NINE SECONDS, and the process died mid-teardown —
 *  backgrounded, still holding the whole model, which is precisely the state
 *  Android's low-memory killer reaps first.
 *
 *  ⚠⚠ AND THE TEARDOWN WAS QUEUED AT `ML_PRIORITY_LLM` BY DEFAULT, because it
 *  passed no priority at all. Two things follow from that one omission, and both
 *  make a backgrounded app hold 425MB for longer:
 *
 *    1. It sits BELOW voice, so any queued Kokoro synth — up to three whole
 *       lines, per OTA-634's cap — runs before the free does.
 *    2. Worse, it trips OTA-1144's reservation hold. `pumpMl` defers anything
 *       BELOW `ML_PRIORITY_VOICE` while a voice slot is reserved, so the
 *       teardown can be parked waiting on a line that has not arrived yet and
 *       may never arrive.
 *
 *  Both behaviours are right for narration and wrong for a free. The app has
 *  been told to go away; a voice line nobody is present to hear cannot outrank
 *  handing back the largest allocation in the process.
 *
 *  ⚠ IT ALSO PREEMPTS. Ranking above everything means `priority > runningPriority`
 *  holds against whatever is running, so an op that offered an `onPreempt` hook
 *  is cut short the moment a teardown is enqueued instead of being waited out.
 *  `dispose()` separately calls llama.cpp's `stopCompletion()` outside the lock
 *  for the ops that offer no hook.
 *
 *  ⚠ NOTHING ELSE MAY USE THIS RANK. It does not mean "important work", it means
 *  "the process is going away". A generation that gave itself this rank would
 *  starve the voice permanently — the exact failure OTA-634 spent an OTA
 *  undoing. */
export const ML_PRIORITY_TEARDOWN = 3;

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
 *  schedules starts, it does not overlap them.
 *
 *  ⚠ OTA-1145 — 1200 → 350, ON THE OWNER'S OBJECTION, AND HE IS RIGHT.
 *  *"now we fixed something until it was broke. we reintroduced a delay on the
 *  js side."* A reservation is a DELAY on LLM work, and 1200 ms of it was the
 *  wrong shape of fix: it arbitrated a collision instead of removing it, and
 *  bought the voice its second by making narration wait.
 *
 *  OTA-1145 removes the collision at the source — the item-synthesis requester
 *  no longer fires during save-load hydration, which is what was taking this
 *  lock 160 ms into a load with nobody waiting on it. With the cause gone this
 *  reservation is a guard rail, not a mechanism, so it is cut to the size of
 *  the thing it actually covers: the handoff is tens of milliseconds (a model
 *  lookup and a breadcrumb write), never a second. At 350 ms it still closes
 *  the race and can no longer be felt as latency in its own right. */
export const VOICE_RESERVATION_MS = 350;

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

// ⚠⚠⚠ OTA-1546 — THE DYING BREATH LEARNS WHAT THE NATIVE SIDE WAS DOING.
//
// All three post-1526 process deaths on the owner's device share one shape:
// PROCESS KILLED with no JS crash, no memory warning, freeze watch clean — and
// every one during a model-invoking action (investigate x2, missions), with the
// same session logging "Native queue: worst wait 10.5s · 12 generations thrown
// away (91.3s)". The freeze watch is JS clocks only; the one witness we cannot
// hear from is the native inference that was (or wasn't) on the CPU when
// Android reaped the process. Native code can't be changed by OTA, but the
// dying breath can testify: every native-ML op already funnels through this ONE
// lock, so stamping the breadcrumb phase on start and settle means the crash
// ledger's next post-mortem reads either
//
//   last checkpoint: native:llm:start q1 (+8342ms)   -> died INSIDE inference
//   last checkpoint: native:llm:done (+241ms)        -> native side exonerated
//
// Either answer moves #81. Priority already names the job class, so no caller
// changes and no new API: -1 homework, 1 llm, 1.5 cognition, 2 voice,
// 3 teardown. Queue depth rides along — a death with q3 backed up is a
// different fact from a death on an idle queue. Lazy-required so this file
// stays importable in isolation, and wrapped so a broken stamp can never
// wedge the ML chain it is observing.
/** The lane a priority names — the ledger's vocabulary, shared by the dying
 *  breath (OTA-1546) and the freeze-watch line (OTA-1634). */
function laneOf(priority: number): string {
  return priority <= ML_PRIORITY_HOMEWORK ? 'homework'
    : priority >= ML_PRIORITY_TEARDOWN ? 'teardown'
    : priority >= ML_PRIORITY_VOICE ? 'voice'
    : priority >= ML_PRIORITY_COGNITION ? 'cognition'
    : 'llm';
}

/** ⚠ OTA-1634 — what the native side is doing RIGHT NOW, for the freeze-watch
 *  line. The JS clocks can say the thread went quiet; only this lock knows
 *  whether a model call was running underneath it, in which lane, and how many
 *  were queued behind it. Cheap, synchronous, never throws. */
export function nativeMlSnapshot(): { running: boolean; lane: string; queued: number } {
  return { running, lane: running ? laneOf(runningPriority) : 'idle', queued: pending.length };
}

function stampNativePhase(tag: 'start' | 'done', priority: number, queued: number): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { stampBreadcrumbPhase } = require('../engine/saveSystem') as typeof import('../engine/saveSystem');
    const cls = laneOf(priority);
    // ⚠⚠⚠ OTA-1567 — QUEUE DEPTH ON `done` TOO, and this is not a tidy-up. The
    // note above promises *"queue depth rides along — a death with q3 backed up
    // is a different fact from a death on an idle queue"* — but it was only ever
    // stamped on `start`, so a death at `:done` carried no queue information at
    // all. Both of the owner's most recent native deaths (2026-08-29 and
    // 2026-08-30 — the only two of all 32 receipts with a `native:*` phase) are
    // `native:cognition:done` with an empty detail. The one live lead in the
    // whole ledger is the exact shape the instrument declined to describe.
    stampBreadcrumbPhase(`native:${cls}:${tag}`, `q${queued}`);
  } catch { /* an instrument may never break the thing it measures */ }
}

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
  // ⚠ OTA-1460 — cognition is exempt: it is the player's current action still
  // resolving, not speculative work that could collide with the handoff.
  if (pending[bestIdx]!.priority < ML_PRIORITY_COGNITION) {
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
  stampNativePhase('start', task.priority, pending.length); // OTA-1546
  // ⚠⚠⚠ OTA-1675 — `done` IS STAMPED BEFORE THE CALLER IS RESOLVED. It used to
  // ride the `.then` AFTER `task.resolve`, one microtask late — and the caller's
  // continuation runs in between. Measured on kai's death (task #180): the
  // voice drain resumed, encoded the WAV and DISPATCHED expo-av's player load
  // before `native:voice:done` was written, so the ledger's last checkpoint
  // said "the synth finished" about a process that had already moved on to
  // playback. Any checkpoint the caller stamps in that continuation was
  // overwritten by a fact from the step before it. `done` now means what it
  // says — the native op settled — and nothing the caller does afterwards is
  // filed under it. Exclusivity is untouched: `running` still clears only
  // after the caller has been resolved, exactly as before.
  const settle = (): void => { stampNativePhase('done', task.priority, pending.length); }; // OTA-1546
  Promise.resolve()
    .then(task.fn)
    .then(
      (v) => { settle(); task.resolve(v); },
      (e) => { settle(); task.reject(e); },
    )
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

/**
 * ⚠⚠⚠ OTA-1472 — THE PLAYER ACTING IS ITSELF A PREEMPTION SIGNAL.
 *
 * From the owner's device log: a 3150 ms LOGIC STALL during a flee, immediately
 * after an 8.2 s `ambient_fill`. The freeze watch samples every
 * FREEZE_SAMPLE_MS (5000), and `jsGap = now - lastSample - 5000`, so a 3150 ms
 * gap means the sampler fired 8150 ms late — within 50 ms of the fill's own
 * 8.2 s runtime. The JS thread was not free for essentially the whole
 * generation, and the flee landed inside it.
 *
 * ⚠⚠ OTA-1123 ALREADY BUILT THE CURE AND WIRED IT TO THE WRONG TRIGGER. It
 * gave homework an `onPreempt` hook precisely so *"a homework generation six
 * seconds into a ten-second job"* could not make the player wait — but the hook
 * fires only from the enqueue path above, i.e. only when some OTHER native-ML
 * call arrives. A flee needs no model. A move needs no model. A tap on a chip
 * needs no model. So for every action that is pure logic — which is most of
 * them — an 8-second homework job ran to completion with the player waiting on
 * the other side of it, and the mechanism written to prevent exactly that never
 * got asked.
 *
 * ⚠ THE SPRINT GATE IS THE NEAR MISS, and its own OTA says why it cannot cover
 * this: it governs what STARTS, needs three actions in four seconds to trip,
 * and OTA-1405 notes that *"the first generation of a burst is always already
 * running by then"*. Nothing looked at what was ALREADY RUNNING when a single
 * deliberate action arrived. This is that.
 *
 * ⚠ HOMEWORK ONLY, and the guard is a floor rather than a name: anything at or
 * above ML_PRIORITY_LLM is work somebody asked for — the player's own narration,
 * cognition still resolving their action, a voice line, a teardown — and cutting
 * any of those to make the player's action land would be cutting the thing the
 * action is FOR. Only the lane that nobody asked for yields.
 *
 * ⚠ Exclusivity is untouched, exactly as OTA-1123 left it: this asks the running
 * op to finish EARLY, it does not overlap a second one. The arb159 crash
 * guarantee is unchanged.
 *
 * Returns whether a job was actually cut, so callers and tests can tell a real
 * preemption from a no-op — an instrument that cannot distinguish "nothing was
 * running" from "I did not look" is worth nothing.
 */
export function preemptHomeworkForPlayer(): boolean {
  if (!running || !runningPreempt) return false;
  if (runningPriority >= ML_PRIORITY_LLM) return false;
  const cut = runningPreempt;
  runningPreempt = null;
  homeworkCutsForPlayer += 1;
  try { cut(); } catch { /* a broken hook must never wedge the chain */ }
  return true;
}

/** ⚠ How many times a player action has cut a homework job this session. The
 *  telemetry already labels the generation `outcome: 'preempted'`, so the device
 *  log prices the other half; this counts the trigger, which is the half that
 *  says whether the new signal is firing at all. */
let homeworkCutsForPlayer = 0;
export function homeworkCutsForPlayerCount(): number { return homeworkCutsForPlayer; }

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
  homeworkCutsForPlayer: number;
} {
  return {
    running, queued: pending.length, runningPriority,
    voiceReserved: Date.now() < voiceReservedUntil,
    homeworkCutsForPlayer,
  };
}

/** Tests only — reset the OTA-1472 counter so suites don't leak into each other. */
export function _resetHomeworkCutsForTest(): void { homeworkCutsForPlayer = 0; }

/** Tests only — drop any reservation so suites don't leak state into each other. */
export function _clearVoiceReservation(): void {
  voiceReservedUntil = 0;
  if (deferTimer !== null) { clearTimeout(deferTimer); deferTimer = null; }
}
