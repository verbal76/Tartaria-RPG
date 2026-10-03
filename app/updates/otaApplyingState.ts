// The "applying update" presentation state — one boolean, one frame-bounded wait.
//
// WHY THIS IS A MODULE AND NOT A GAME-STORE FIELD. The apply path runs on the
// boot-front, BEFORE the store is the thing anyone is looking at, and it must
// work on the pre-hydration render too. A zero-dependency subscribable has no
// import cycle with gameStore (which checkAndApplyOTA already imports) and costs
// the store-line ceiling nothing.
//
// The state follows the REAL updater transition: checkAndApplyOTA sets it at the
// instant the bundle is staged and the app is about to hand control to
// expo-updates, and clears it only if control comes back to this runtime
// (restart refused, or the sequence threw). A successful reload destroys the
// runtime, and the flag with it — that is the real transition, not a timer.

type Listener = () => void;

let applying = false;
let failsafe: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

/** How long the overlay may outlive a `reloadAsync` that RESOLVED. A reload that
 *  works replaces the process, so this timer never fires; it exists for the one
 *  case where the promise resolves and the old runtime keeps running — control
 *  is back with us and the player must not be left behind a spinner. It is a
 *  failure bound, not presentation timing. */
export const APPLY_FAILSAFE_MS = 30_000;

export function isOtaApplying(): boolean {
  return applying;
}

export function subscribeOtaApplying(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function emit(): void {
  for (const l of Array.from(listeners)) {
    try { l(); } catch { /* a bad listener never blocks an update */ }
  }
}

/** Mark the apply transition as begun. Returns false if one is already in
 *  flight — the caller must not start a second activation. */
export function beginOtaApplying(): boolean {
  if (applying) return false;
  applying = true;
  emit();
  return true;
}

/** Control came back to this runtime (reload refused / sequence failed). */
export function endOtaApplying(): void {
  if (failsafe) { clearTimeout(failsafe); failsafe = null; }
  if (!applying) return;
  applying = false;
  emit();
}

/** Call once `Updates.reloadAsync()` has resolved. If the process is replaced
 *  (the normal case) nothing more happens; if this runtime is somehow still
 *  alive after APPLY_FAILSAFE_MS, the overlay comes down. */
export function armApplyFailsafe(ms: number = APPLY_FAILSAFE_MS): void {
  if (failsafe) clearTimeout(failsafe);
  failsafe = setTimeout(() => { failsafe = null; endOtaApplying(); }, ms);
  (failsafe as unknown as { unref?: () => void }).unref?.();
}

/** Test seam — restore the module to its initial state. */
export function resetOtaApplyingForTest(): void {
  if (failsafe) { clearTimeout(failsafe); failsafe = null; }
  applying = false;
  listeners.clear();
}

/** Safety ceiling on the paint wait. Not a delay: the wait ends on the second
 *  frame callback, which on a live device is ~33 ms. The ceiling only exists so
 *  a runtime with no frame callbacks (a backgrounded app, a headless host) can
 *  never hold the update hostage. */
export const PAINT_WAIT_CAP_MS = 600;

/**
 * Resolve once the frame that carries the just-set applying state has been
 * presented — or after PAINT_WAIT_CAP_MS, whichever is first.
 *
 * WHY TWO FRAMES. `beginOtaApplying()` re-renders the overlay synchronously, but
 * the native views it mounts are only on screen after the next frame commits.
 * The first requestAnimationFrame callback runs BEFORE that frame is drawn; the
 * second runs after it. Awaiting the second is the smallest deterministic
 * statement of "the player has seen it" that React Native exposes.
 */
export function presentedFrame(capMs: number = PAINT_WAIT_CAP_MS): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(cap); resolve(); } };
    const cap = setTimeout(finish, capMs);
    const raf: ((cb: () => void) => unknown) | undefined =
      (globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => unknown }).requestAnimationFrame;
    if (typeof raf !== 'function') { finish(); return; }
    raf(() => { raf(finish); });
  });
}
