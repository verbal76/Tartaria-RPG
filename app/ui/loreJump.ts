/**
 * OTA-1783 — THE LOOK-UP JUMP, AND IT IS NOT STORE STATE.
 *
 * Owner, on the combat glyph reference: *"Back must return cleanly to the exact
 * active combat state. Do not dump the player onto another screen, character
 * selection, exploration, or the Lore root."*
 *
 * Keeping that promise needs one fact carried across one navigation: WHICH tab
 * to open, and WHERE the player was standing. That is the whole of it.
 *
 * ⚠⚠⚠ WHY THIS IS A MODULE AND NOT A STORE FIELD, AND THE SECOND REASON IS THE
 * BETTER ONE.
 *
 * The first reason is a wall: `gameStore.ts` is under a hard line ratchet that
 * two suites assert (`< 37,000`), and at 36,995 lines it has FOUR left. A field,
 * an action, an initialiser and a clear is five before a word of explanation, so
 * a store field could only have been bought by writing this pass with no
 * comments at all — in a file whose entire discipline is that decisions are
 * written down where they are made.
 *
 * The second reason is that the store was the wrong home anyway. Store state is
 * SAVED state; this is a hand-off between two renders that must never outlive
 * them. `giftMode` — the closest shape in the codebase — needed OTA-1280 to add
 * a guard in `setScreen` after a mode outlived its screen and silently changed a
 * later, unrelated visit. Here that failure is not guarded against, it is
 * IMPOSSIBLE: the value is CONSUMED by the read, so a second visit to the codex
 * finds nothing pending and lands on the ordinary default. A hazard you cannot
 * express beats a hazard you remembered to check.
 *
 * ⚠ THE WINDOW IS ONE STATEMENT WIDE. `arm` is followed immediately and
 * synchronously by `setScreen('lore')`, so nothing can navigate in between and
 * collect a jump meant for the codex.
 */
import type { ScreenName } from '../engine/types';

export interface LoreJump {
  /** The codex tab to open on — a section id, checked against the codex's own
   *  union by this pass's suite rather than trusted. */
  section: string;
  /** The screen the player was standing on. CAPTURED, never re-derived: a rule
   *  that recomputes the way back has to be right about every path that ever
   *  reaches it, and a record only has to be written down once. */
  returnTo: ScreenName;
}

let pending: LoreJump | null = null;

/** Arm the jump. Call immediately before navigating to `lore`. */
export function armLoreJump(jump: LoreJump): void {
  pending = jump;
}

/** Read the jump ONCE and clear it. Returns null on an ordinary visit — which
 *  is every visit that did not arm one, and every visit after the first. */
export function takeLoreJump(): LoreJump | null {
  const jump = pending;
  pending = null;
  return jump;
}
