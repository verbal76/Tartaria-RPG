// OTA-956 — the KeyboardInputBar reliability poll's per-tick decisions.
// Audit finding on the first cut (OTA-951): the poll called the same applyHeight the
// event path uses, which CANCELS the pending hide retract — so tapping in and
// dismissing within the ~1s window could read a stale non-zero metrics height
// mid-dismiss-animation and strand the bar mid-screen. The rework routes every tick
// through this pure helper (hide wins, always) and the component keeps the poll
// outside the hideTimer closure so it structurally cannot cancel a retract.
import { keyboardPollAction } from '../app/engine/keyboardPoll';

describe('OTA-956 keyboardPollAction', () => {
  it('a confirmed-hidden keyboard stops the poll even with a stale positive height', () => {
    // the exact strand case: dismissal in flight, metrics still reporting the old height
    expect(keyboardPollAction(false, 301)).toBe('stop');
    expect(keyboardPollAction(false, 0)).toBe('stop');
    expect(keyboardPollAction(false, null)).toBe('stop');
  });

  it('a settled positive height applies (visible, or visibility unknown on older RN)', () => {
    expect(keyboardPollAction(true, 301)).toBe('apply');
    expect(keyboardPollAction(null, 301)).toBe('apply');
  });

  it('keeps polling while nothing is conclusive', () => {
    expect(keyboardPollAction(true, 0)).toBe('continue');
    expect(keyboardPollAction(true, null)).toBe('continue');
    expect(keyboardPollAction(null, 0)).toBe('continue');
    expect(keyboardPollAction(null, undefined)).toBe('continue');
  });
});
