// ⚠⚠ OTA-1228 — THE 51% THAT NEVER MOVED, EXTRACTED SO IT CAN BE PROVEN.
//
// Owner, on the PC build: *"I think the arbiter first time setup has frozen, it
// did this before on my Steam Deck. it's been a few minutes and it's hanging at
// 51%."* The freeze itself is fixed at its two sources (PiperTTSManager's
// desktop guard, and gameStore's watchdog guard). This file is the third piece:
// the title screen's progress arithmetic, which used to live inline in the JSX
// where nothing could reach it, and which had a real defect of its own.
//
// ⚠ THE DEFECT. Kokoro's half always treated 'error' as DONE — nothing more is
// coming, so it scores 1. Qwen's half did not: 'failed' and 'skipped' are just
// as final, and they fell through to the 0.1 "not started" value. So on the
// desktop build, where Qwen fails within milliseconds and correctly hands the
// Arbiter to template narration, the bar reported that finished engine as
// barely begun — and held the total 45 points below the truth for as long as
// the other engine kept the bar on screen.
//
// ⚠ AND 51% IS EXACTLY THAT SUM, WHICH IS WHY THIS IS WORTH ITS OWN FILE:
//     qwen 'failed'  → 0.10  (should have been 1.00)
//     kokoro 'loading' → 0.92 (wedged forever — the real freeze)
//     (0.10 + 0.92) / 2 = 0.51
// Two independent faults landing on one number nobody could test. The test
// suite now pins that arithmetic against both.

export type QwenBootStatus =
  | 'idle' | 'downloading' | 'loading' | 'ready' | 'failed' | 'skipped' | (string & {});

export type KokoroBootPhase =
  | { phase: 'idle' }
  | { phase: 'downloading'; fraction: number }
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

/** ⚠ SETTLED IS SETTLED. An engine that has finished — however it finished —
 *  contributes a full share. Only work still genuinely in flight scores less. */
export function qwenBootShare(status: QwenBootStatus, fraction: number): number {
  if (status === 'ready' || status === 'failed' || status === 'skipped') return 1;
  if (status === 'downloading') return clamp01(fraction);
  if (status === 'loading') return 0.92;
  return 0.1;
}

export function kokoroBootShare(state: KokoroBootPhase): number {
  if (state.phase === 'ready' || state.phase === 'error') return 1;
  if (state.phase === 'downloading') return clamp01(state.fraction);
  if (state.phase === 'loading') return 0.92;
  return 0.1;
}

/** The percentage the title screen prints. Both engines weigh the same. */
export function modelBootPercent(
  status: QwenBootStatus,
  fraction: number,
  kokoro: KokoroBootPhase,
): number {
  return Math.round(((qwenBootShare(status, fraction) + kokoroBootShare(kokoro)) / 2) * 100);
}

/** Whether the compact "Preparing the Arbiter" bar should be on screen at all.
 *  ⚠ Only ACTIVE work qualifies. A settled engine — ready, failed, skipped,
 *  errored — is never a reason to keep a progress bar up. */
export function modelsStillLoading(status: QwenBootStatus, kokoro: KokoroBootPhase): boolean {
  return status === 'downloading' || status === 'loading'
    || kokoro.phase === 'downloading' || kokoro.phase === 'loading';
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
