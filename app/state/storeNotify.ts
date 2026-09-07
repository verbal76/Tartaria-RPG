import type { StateCreator, StoreApi } from 'zustand';

/* ⚠⚠⚠ LAG-2 — ONE ACTION'S LOG LINES ARE ONE SUBSCRIBER SWEEP, NOT ONE EACH.
 *
 * Fable's 91C4B8 audit counted the store notifications a single player action
 * produces: ~30-35 for an attack, 16-33 for a movement step, 81-90 across five
 * rapid steps. Every one of them is a full sweep of every mounted selector —
 * Exploration alone holds ~57 — and the largest single contributor is the game
 * log, because `appendLog` is called several times per beat and each call was
 * its own `set()`.
 *
 * ⚠ WHAT THIS IS, PRECISELY. Log writes still land in the store SYNCHRONOUSLY.
 * Nothing about the state is deferred, and that matters: dozens of call sites
 * read `get().gameLog` in the same turn they wrote to it (the "have I already
 * said this line" guards, the talk transcript window, the arbiter dedup right
 * inside appendLog), and a staged log would have quietly broken every one of
 * them. What is deferred is only the NOTIFICATION, and only for a write marked
 * log-only, and only until the very next thing that would notify anyway:
 *
 *   - the next ordinary `set()` in the same action publishes the log with it,
 *     so subscribers still see every gameplay change, in order, and see the log
 *     lines that preceded it; or
 *   - a microtask at the end of the current synchronous turn publishes it.
 *
 * ⚠⚠ SO NO NOTIFICATION IS SUPPRESSED — the redundant per-line sweeps are
 * folded into the sweep the action was going to perform anyway. A subscriber
 * that observed N log notifications now observes one, carrying the same final
 * state, with `previousState` reaching back to before the first of them.
 *
 * ⚠ HOW IT REACHES ZUSTAND. `createStore` closes over its own listener Set and
 * hands the raw `setState` to the state creator, so a wrapper installed after
 * `create()` would be bypassed by every action in the store. A middleware is
 * the only seam: it runs while the store is being built — before any subscriber
 * exists — swaps `api.subscribe` for one that registers with OUR listener set,
 * swaps `api.setState` for the wrapper below, and hands that wrapper to the
 * config as its `set`. The original `setState` still updates the state; its own
 * listener set is empty forever, because nothing ever subscribes through it.
 */

let logWriteDepth = 0;

/** Mark a store write as an ORDINARY LOG WRITE: it may ride along with the next
 *  notification instead of forcing its own. Only the game-log append uses this;
 *  a gameplay mutation must never be wrapped in it. */
export function asLogOnlyWrite<T>(fn: () => T): T {
  logWriteDepth++;
  try {
    return fn();
  } finally {
    logWriteDepth--;
  }
}

let flushHeld: (() => void) | null = null;
/** Publish any log write still waiting for a sweep. Tests and any caller that
 *  must observe the feed from outside a turn can force the boundary. */
export function flushLogNotify(): void {
  flushHeld?.();
}

/** Diagnostics / tests: is a log write waiting to be published? */
let heldForTest = false;
export function logNotifyPending(): boolean {
  return heldForTest;
}

export function coalesceLogNotifications<T>(
  config: StateCreator<T, [], []>,
): StateCreator<T, [], []> {
  return (_set, get, api) => {
    const listeners = new Set<(state: T, prev: T) => void>();
    const origSetState = api.setState;

    // The state as it stood before the first still-unpublished log write.
    let heldPrev: T | null = null;
    const flush = (): void => {
      if (heldPrev === null) return;
      const prev = heldPrev;
      heldPrev = null;
      heldForTest = false;
      const next = api.getState();
      if (Object.is(prev, next)) return;
      listeners.forEach((l) => l(next, prev));
    };
    flushHeld = flush;

    api.subscribe = ((listener: (state: T, prev: T) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }) as StoreApi<T>['subscribe'];

    api.setState = ((partial: unknown, replace?: boolean) => {
      const prev = api.getState();
      (origSetState as unknown as (p: unknown, r?: boolean) => void)(partial, replace);
      const next = api.getState();
      if (Object.is(prev, next)) return;
      if (logWriteDepth > 0) {
        // Hold the sweep. The state is already live for every `get()`.
        if (heldPrev === null) {
          heldPrev = prev;
          heldForTest = true;
          queueMicrotask(flush);
        }
        return;
      }
      // An ordinary write: it publishes itself AND anything held behind it, so
      // the held log lines are never lost and never arrive out of order.
      const from = heldPrev ?? prev;
      heldPrev = null;
      heldForTest = false;
      listeners.forEach((l) => l(next, from));
    }) as StoreApi<T>['setState'];

    return config(api.setState as unknown as typeof _set, get, api);
  };
}
