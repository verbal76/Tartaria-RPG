// Which kind of input the player is using RIGHT NOW. Valve's Deck/Machine rule: on-screen glyphs must
// match the active input, and a player driving the game with the controller must never be shown
// mouse/keyboard prompts. This is the one place that fact lives; GamepadNav writes it, the hints bar and
// the cursor-hiding CSS read it. Pure and DOM-free so it is testable on its own.
export type InputMode = 'gamepad' | 'kbm';

let mode: InputMode = 'kbm';
const subscribers = new Set<(m: InputMode) => void>();

export function getInputMode(): InputMode { return mode; }

export function setInputMode(next: InputMode): void {
  if (next === mode) return;
  mode = next;
  subscribers.forEach((fn) => { try { fn(next); } catch { /* a subscriber never breaks input */ } });
}

export function subscribeInputMode(fn: (m: InputMode) => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/** Test seam. */
export function resetInputModeForTest(): void { mode = 'kbm'; subscribers.clear(); }

/** A real person at a real mouse/keyboard/touchscreen — not an event our own code dispatched (B sends a
 *  synthetic Escape; that must never flip the mode back to keyboard/mouse). */
export function isHumanInput(e: { isTrusted?: boolean } | null | undefined): boolean {
  return !!e && e.isTrusted === true;
}
