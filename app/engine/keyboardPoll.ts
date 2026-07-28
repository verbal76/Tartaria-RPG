// OTA-956 — pure decision logic for the KeyboardInputBar reliability poll, extracted so
// the per-tick rules are unit-testable (the failure mode needs real OS keyboard timing,
// so the component wiring stays thin and the decisions live here).
//
// The poll exists because Android/Fabric drops the keyboardDidShow / changeFrame height
// events ~half the time while the NATIVE keyboard state stays correct. Each tick reads
// that native state and decides:
//   'stop'     — the keyboard is confirmed NOT visible: a dismissal is in flight (or
//                done). The poll's job is over; it must not touch the bar, so a stale
//                non-zero metrics height read mid-dismiss-animation (the arb71 quirk)
//                can never strand the bar mid-screen.
//   'apply'    — a settled positive height is available and the keyboard is not known
//                to be hidden: snap the bar to it and stop polling.
//   'continue' — nothing conclusive yet (metrics unavailable / height not settled):
//                keep polling to the caller's cap.
// `visible` is null when Keyboard.isVisible() is unavailable (older RN) — unknown is
// NOT treated as hidden, so the net still works there; the caller's other safeguards
// (the poll cannot cancel the hide retract) cover the stale-height edge.

export type KeyboardPollAction = 'apply' | 'stop' | 'continue';

export function keyboardPollAction(
  visible: boolean | null,
  height: number | null | undefined,
): KeyboardPollAction {
  if (visible === false) return 'stop';
  if (typeof height === 'number' && height > 0) return 'apply';
  return 'continue';
}
