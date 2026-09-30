// P3 — presentation handoff, driven legitimately (Phase 2B, UNK-P2-11 / T3).
//
// app/state/gameStore.ts's dismissChapterCard() and answerFork() each call
// armPresentationHandoff(surface, run) (gameStore.ts:29619-29621, 29669) and
// then WAIT for notePresentationDismissed(surface) — which in production is
// called by the native <Modal>'s onDismiss callback once the platform
// reports the window is actually gone (app/state/presentationHandoff.ts).
// A headless run renders no Modal, so nothing ever calls that back, and the
// only thing that releases the continuation is the 400ms HANDOFF_FALLBACK_MS
// safety valve (presentationHandoff.ts:44).
//
// The owner's ruling: "call the same production continuation/dismissal door
// the UI would call... journal the synthetic UI gesture as PLAYER-LEGITIMATE
// PRESENTATION DISMISSAL. It is not a gameplay cheat." presentationHandoff.ts
// itself documents that it "holds no store reference and imports nothing
// from the app" — its contract is exactly "surface X is dismissed", which is
// what the Modal's onDismiss reports. Calling notePresentationDismissed(...)
// immediately after the store action, instead of waiting on the fallback
// timer, changes only WHEN the (identical) continuation runs, never WHAT it
// does — the continuation itself (raiseDueFork) is untouched.

import { notePresentationDismissed, handoffPending, type HandoffSurface } from '../../app/state/presentationHandoff';

export interface PresentationDismissal {
  surface: HandoffSurface;
  releasedBy: 'dismiss-complete';
}

/**
 * Dismiss a chapter card the way the UI's Modal onDismiss would, right after
 * calling the same production door (`dismissChapterCard`) a tap on the card
 * calls. Returns null if nothing was actually pending for that surface (so a
 * caller can tell a no-op from a real dismissal).
 */
export function completeChapterDismissal(): PresentationDismissal | null {
  if (handoffPending() !== 'chapter') return null;
  notePresentationDismissed('chapter');
  return { surface: 'chapter', releasedBy: 'dismiss-complete' };
}

/** Same pattern for the fork's own re-check handoff (answerFork). */
export function completeForkDismissal(): PresentationDismissal | null {
  if (handoffPending() !== 'fork') return null;
  notePresentationDismissed('fork');
  return { surface: 'fork', releasedBy: 'dismiss-complete' };
}

export function completeSheetDismissal(): PresentationDismissal | null {
  if (handoffPending() !== 'sheet') return null;
  notePresentationDismissed('sheet');
  return { surface: 'sheet', releasedBy: 'dismiss-complete' };
}
