// P5 proof — a throwing telemetry listener must never abort the game action
// it's attached to.
//
// Proves storeDiffer.ts's attachStoreDiffer() listener (Phase 2B, UNK-P2-08:
// "try/catch around the listener body — never throw into the game action")
// swallows an exception raised while building a diff entry, so the store's
// own notification/action completes normally regardless of what telemetry
// does with it.
//
// Uses a minimal fake store (attachStoreDiffer's parameter type is just
// `{ subscribe: (l) => () => void }`), so this needs no gameStore mocks.
//
// Run focused: npx jest __tests__/canonicalListenerSafety.test.ts

import { attachStoreDiffer, detachStoreDiffer, resetStoreDiffLog, getStoreDiffLog } from '../test-utils/canonical/storeDiffer';
import type { GameStore } from '../app/state/gameStore';

type Listener = (next: GameStore, prev: GameStore) => void;

function makeFakeStore() {
  let listener: Listener | null = null;
  let notifyCount = 0;
  return {
    subscribe(l: Listener) {
      listener = l;
      return () => { listener = null; };
    },
    /** Simulates the real store's own notification firing after a `set()` —
     *  the thing that must complete regardless of what the listener does. */
    fireAction(next: GameStore, prev: GameStore): { completed: boolean; notifyCount: number } {
      // A real store's notify loop calls every subscriber and then returns —
      // it does NOT let one subscriber's exception stop the others or abort
      // the action. Mirror that here: call the listener, and if IT throws
      // uncaught (i.e., attachStoreDiffer failed to catch), that failure
      // must be visible to this test as a thrown error, not silently eaten
      // by this harness.
      listener?.(next, prev);
      notifyCount += 1;
      return { completed: true, notifyCount };
    },
  };
}

/** An object that throws the instant any property is read — the worst case
 *  for a telemetry listener that reads `next.player`, `next.currentScene`, etc. */
function poisonedState(): GameStore {
  return new Proxy({}, {
    get() {
      throw new Error('poisoned state — reading any field throws');
    },
  }) as unknown as GameStore;
}

describe('P5 proof — throwing telemetry listener never aborts the game action', () => {
  afterEach(() => {
    detachStoreDiffer();
    resetStoreDiffLog();
  });

  it('a notification whose next/prev throw on every property read does not throw out of the store\'s own notify call', () => {
    const store = makeFakeStore();
    attachStoreDiffer(store);
    const poisoned = poisonedState();
    expect(() => store.fireAction(poisoned, poisoned)).not.toThrow();
  });

  it('the action reports itself completed even though the listener body failed internally', () => {
    const store = makeFakeStore();
    attachStoreDiffer(store);
    const poisoned = poisonedState();
    const result = store.fireAction(poisoned, poisoned);
    expect(result.completed).toBe(true);
  });

  it('a failed diff attempt is simply absent from the log — not a partial/corrupt entry', () => {
    const store = makeFakeStore();
    attachStoreDiffer(store);
    resetStoreDiffLog();
    const poisoned = poisonedState();
    store.fireAction(poisoned, poisoned);
    expect(getStoreDiffLog()).toHaveLength(0);
  });

  it('subsequent, non-poisoned notifications still record normally after a prior one failed', () => {
    const store = makeFakeStore();
    attachStoreDiffer(store);
    resetStoreDiffLog();
    const poisoned = poisonedState();
    store.fireAction(poisoned, poisoned);
    const good = { player: { hp: 10 }, currentScene: null, pendingRolls: null, currentScreen: 'exploration' } as unknown as GameStore;
    store.fireAction(good, good);
    expect(getStoreDiffLog()).toHaveLength(1);
    expect(getStoreDiffLog()[0]!.player.after).toMatchObject({ hp: 10 });
  });
});
