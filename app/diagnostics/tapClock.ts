// OTA-1695 — THE TAP HAS A CLOCK. Owner: "I hit Dodge and it hangs for 4 or 5
// seconds before it lets me touch anything else. I hit approach, it hangs for
// 5 or 6 seconds … you don't see those button presses and the lags between
// inputs." He is right: `ui: tap` is stamped when the JS thread RUNS the
// handler, not when the finger landed, so a touch that waited five seconds in
// the queue reads in the log as a tap that happened five seconds later. The
// 09-04 log shows dodge → next tap at a 1.5s median and a 2.8s median silence
// before each dodge; neither number can tell a player reading the feed from a
// screen that would not take the touch.
//
// The native side stamps every touch with the OS monotonic clock
// (Android: MotionEvent.getEventTime → SystemClock.uptimeMillis; RN forwards it
// as nativeEvent.timestamp in ms). JS `performance.now()` is the same clock
// (JSExecutor::performanceNow → std::chrono::steady_clock = CLOCK_MONOTONIC).
// So `performance.now() - nativeEvent.timestamp`, read the moment the DOWN
// event reaches JS, is how long the touch waited for the app: the render
// queue, a starved JS thread, a blocked UI thread — all of it, in one number.
//
// Wiring: every ledgered control gets `onPressIn={noteTouchDown}`; logUiTap
// (which stays `logUiTap(label)` — its call sites are pinned as the freeze
// signal) reads the last fresh touch and rides `⏱+Nms` on the tap line, with
// ` late Nms` once the wait clears the session floor by TAP_LATE_FLAG_MS.
// The floor is the smallest wait seen this process: the two clocks share a
// base on Android, but the reader should not have to trust that — a constant
// offset cancels out of the flag.

/** A wait this far above the session floor is called late. */
export const TAP_LATE_FLAG_MS = 250;
/** A touch older than this is not the one the tap line is about. */
export const TOUCH_FRESH_MS = 3000;

interface TouchNote { lateMs: number; jsAt: number }

let lastTouch: TouchNote | null = null;
let floorMs = Number.POSITIVE_INFINITY;

const jsNow = (): number =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Number.NaN;

/**
 * The wait between the OS stamping the touch and JS learning of it. Null when
 * either clock is unusable or the two do not share a base (a wait under -100ms
 * or over ten minutes is a base mismatch, not a delay).
 */
export function touchLateMs(nativeTs: unknown, now: number = jsNow()): number | null {
  if (typeof nativeTs !== 'number' || !Number.isFinite(nativeTs) || !Number.isFinite(now)) return null;
  const late = now - nativeTs;
  if (late < -100 || late > 600_000) return null;
  return Math.max(0, Math.round(late));
}

/** onPressIn on every ledgered control: note the DOWN event's wait. */
export function noteTouchDown(e?: { nativeEvent?: { timestamp?: unknown } } | null): void {
  try {
    const late = touchLateMs(e?.nativeEvent?.timestamp);
    if (late === null) { lastTouch = null; return; }
    lastTouch = { lateMs: late, jsAt: Date.now() };
    if (late < floorMs) floorMs = late;
  } catch { lastTouch = null; }
}

/** The tap line's suffix for the last fresh touch — consumed, so a control
 *  without onPressIn never inherits another's number. '' when there is none. */
export function takeTouchLateSuffix(now: number = Date.now()): string {
  const t = lastTouch;
  lastTouch = null;
  if (!t || now - t.jsAt > TOUCH_FRESH_MS) return '';
  return tapLateSuffix(t.lateMs, floorMs);
}

/** `⏱+37ms`, or `⏱+4237ms late 4200ms` once the wait clears the floor by the flag. */
export function tapLateSuffix(lateMs: number, floor: number): string {
  const over = Number.isFinite(floor) ? lateMs - floor : 0;
  return ` ⏱+${lateMs}ms${over >= TAP_LATE_FLAG_MS ? ` late ${over}ms` : ''}`;
}

/** Tests only. */
export function resetTapClock(): void { lastTouch = null; floorMs = Number.POSITIVE_INFINITY; }
