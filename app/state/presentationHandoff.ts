// ⚠⚠⚠ OTA-1863 — NATIVE DISMISSAL COMPLETION OWNS THE HANDOFF.
//
// THE WOUND, in production's own words since OTA-1497 (ExplorationScreen.tsx):
// *"On iOS, presenting one modal while another is mid-dismissal wedges the
// window ... JS alive, screen dead, force-close."* Four iPhone freezes in
// August, and the 2026-09-21 guardian freeze in the same shape: a touch reaches
// the app root, never reaches admission, JS keeps running for ~8.8s, and the
// owner force-closes.
//
// ⚠⚠ WHAT WAS ACTUALLY WRONG. Two things asked for the next presentation before
// the previous one was gone, and NEITHER could know that it was gone:
//
//   dismissChapterCard()  →  set({ chapterCard: null }); raiseDueFork(...)
//   answerStoryFork()     →  set({ pendingFork: null });  ... raiseDueFork(...)
//
// one synchronous call each: the old <Modal> begins a ~300ms native dismissal
// and the new one is told to present inside it. The sheet path had a mitigation
// — `setTimeout(..., SHEET_SETTLE_MS)` — but 400ms is a GUESS at the animation,
// not a fact about it. React state going null is not dismissal. Elapsed time is
// not dismissal. Only the platform knows when the window is actually gone.
//
// ⚠ THE FIX IS ONE SLOT, NOT A FRAMEWORK. At most one continuation is ever
// pending, because that is the whole invariant: while a presentation is between
// "React asked it to go" and "native says it is gone", nothing else may present.
// Requests are armed here; the dismissing surface reports completion here; the
// continuation runs exactly once.
//
// ⚠⚠⚠ PLATFORM TRUTH, CHECKED AGAINST THE INSTALLED RUNTIME (react-native
// 0.81.5, Libraries/Modal/Modal.js): `onDismiss` fires ONLY when
// `Platform.OS === 'ios'` — the listener at line 249 and the handler at 316 are
// both inside `Platform.OS === 'ios'` guards. ANDROID NEVER CALLS IT. So:
//
//   iOS      — onDismiss is the authority. The deadline below is a safety valve
//              that should not normally fire.
//   Android  — there is no dismissal-complete callback in RN at all, so the
//              deadline IS the normal release. That is stated, not hidden: the
//              wedge this repair closes is an iOS window fault, and Android has
//              never shown it. What Android must never do is deadlock, and a
//              bounded deadline is exactly what prevents that.
//
// This module holds no store reference and imports nothing from the app, so it
// can be reasoned about — and tested — on its own.

/** The surfaces whose dismissal can gate a following presentation. Narrow on
 *  purpose: only the paths the freeze evidence implicates are serialized. */
export type HandoffSurface = 'chapter' | 'fork' | 'sheet';

/** The safety valve, and on Android the normal release. Deliberately the same
 *  400ms OTA-1497 chose for the sheet: that number was never the problem — the
 *  problem was that it was the AUTHORITY. Demoting it is the repair; raising it
 *  would not have been one. */
export const HANDOFF_FALLBACK_MS = 400;

/** Why a continuation ran. Carried into the diagnostic line so a log can tell a
 *  real dismissal from a deadline — which is the difference between "iOS
 *  answered" and "nobody did". */
export type HandoffRelease = 'dismiss-complete' | 'fallback';

interface Pending {
  surface: HandoffSurface;
  run: (release: HandoffRelease) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** AT MOST ONE. Serialization is the invariant; a queue would be a different,
 *  larger design and nothing in the evidence asks for one. */
let pending: Pending | null = null;

/** Counts only, for tests and for a future diagnostic. Never load-bearing. */
let released = { byDismiss: 0, byFallback: 0, superseded: 0 };

function fire(p: Pending, how: HandoffRelease): void {
  // ⚠ CLEARED BEFORE IT RUNS. `run` can arm the next handoff (a fork that
  // raises a fork), and if the slot were still occupied that arm would be
  // treated as superseding itself. Exactly-once lives on this line.
  if (p.timer !== null) clearTimeout(p.timer);
  if (pending === p) pending = null;
  if (how === 'dismiss-complete') released.byDismiss += 1;
  else released.byFallback += 1;
  try { p.run(how); } catch { /* a handoff may never break the screen it serves */ }
}

/**
 * Hold `run` until `surface`'s native presentation reports it is gone.
 *
 * Arming while another handoff is pending releases the older one first: the
 * alternative is dropping a continuation on the floor, and a lost fork or a
 * lost submit is a worse bug than an early one. In practice this cannot happen
 * on the serialized paths — that is what serializing them means.
 */
export function armPresentationHandoff(
  surface: HandoffSurface,
  run: (release: HandoffRelease) => void,
  opts?: { fallbackMs?: number },
): void {
  if (pending) {
    const older = pending;
    pending = null;
    released.superseded += 1;
    fire(older, 'fallback');
  }
  const ms = opts?.fallbackMs ?? HANDOFF_FALLBACK_MS;
  const p: Pending = { surface, run, timer: null };
  pending = p;
  p.timer = setTimeout(() => {
    // ⚠ The deadline only ever releases the entry it was armed for. A timer
    // that outlived its handoff must not touch whatever is pending now.
    if (pending === p) fire(p, 'fallback');
  }, ms);
}

/**
 * The dismissing surface reporting that its native window is gone.
 *
 * ⚠⚠ STALE AND LATE CALLBACKS ARE NO-OPS, BY CONSTRUCTION. A callback releases
 * only the entry armed for ITS OWN surface. If the fallback already fired, the
 * slot is empty and this does nothing — so a late iOS `onDismiss` can never run
 * an action a second time.
 */
export function notePresentationDismissed(surface: HandoffSurface): void {
  const p = pending;
  if (!p || p.surface !== surface) return;
  fire(p, 'dismiss-complete');
}

/** Is a handoff waiting? The serialization invariant, readable. */
export function handoffPending(): HandoffSurface | null {
  return pending?.surface ?? null;
}

/** Tests only. */
export function _handoffCountsForTest(): { byDismiss: number; byFallback: number; superseded: number } {
  return { ...released };
}
/** Tests only. */
export function _resetHandoffForTest(): void {
  if (pending?.timer != null) clearTimeout(pending.timer);
  pending = null;
  released = { byDismiss: 0, byFallback: 0, superseded: 0 };
}
