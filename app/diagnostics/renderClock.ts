// OTA-1696 — THE RENDER HAS A CLOCK. The 13:32 stalls begin at `engine-done
// +487ms` and run for seconds while frames keep coming: the engine had
// finished, and what followed on the JS thread was the render of the new
// state — a feed of up to 500 rich rows re-mapped on every log line through a
// synchronous external-store subscription. The exploration screen already
// stamps `rendered` after every commit (OTA-1356); this reads the crumb it is
// about to stamp over and names the gap from `engine-done` to the first commit
// after it, once per engine action, when it is long enough to feel.
//
// Pure: the screen owns the ref and the appendLog; this owns the arithmetic.

/** A commit this long after engine-done is worth a line. */
export const RENDER_SLOW_MS = 300;

export interface RenderCrumb { phase?: string; phaseAt?: number }

export interface RenderLag {
  /** The engine-done stamp this measurement belongs to — the caller remembers it so the gap prints once. */
  measuredAt: number;
  line: string | null;
}

/**
 * Null when the crumb is not an unmeasured engine-done. Otherwise the stamp to
 * remember and, past RENDER_SLOW_MS, the line: `render⏱ 3210ms after engine-done · feed 500`.
 */
export function renderLagAfterEngine(
  crumb: RenderCrumb | null | undefined,
  lastMeasuredAt: number,
  feedLen: number,
  now: number = Date.now(),
): RenderLag | null {
  if (!crumb || crumb.phase !== 'engine-done' || !crumb.phaseAt) return null;
  if (crumb.phaseAt === lastMeasuredAt) return null;
  const ms = Math.max(0, Math.round(now - crumb.phaseAt));
  return {
    measuredAt: crumb.phaseAt,
    line: ms >= RENDER_SLOW_MS ? `render⏱ ${ms}ms after engine-done · feed ${feedLen}` : null,
  };
}
