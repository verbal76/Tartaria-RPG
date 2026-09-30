// P5 proof — presentation is released by real dismissal, not the fallback.
//
// Proves test-utils/canonical/presentation.ts's completeChapterDismissal() /
// completeForkDismissal() / completeSheetDismissal() release a pending
// handoff with release reason 'dismiss-complete' (the same door a native
// Modal's onDismiss would call), and do so BEFORE app/state/
// presentationHandoff.ts's HANDOFF_FALLBACK_MS (400ms) safety-valve timer
// would have fired — proving the canonical run never relies on the fallback.
//
// presentationHandoff.ts "holds no store reference and imports nothing from
// the app" (its own header), so this test needs no gameStore mocks at all.
//
// Run focused: npx jest __tests__/canonicalPresentationDismissal.test.ts

import {
  armPresentationHandoff,
  handoffPending,
  HANDOFF_FALLBACK_MS,
  _resetHandoffForTest,
  type HandoffRelease,
} from '../app/state/presentationHandoff';
import { completeChapterDismissal, completeForkDismissal, completeSheetDismissal } from '../test-utils/canonical/presentation';

describe('P5 proof — presentation released by real dismissal, not the fallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    _resetHandoffForTest();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('completeChapterDismissal() releases with dismiss-complete, strictly before the 400ms fallback would fire', () => {
    let how: HandoffRelease | null = null;
    armPresentationHandoff('chapter', (release) => { how = release; });
    expect(handoffPending()).toBe('chapter');

    // Advance almost to, but not past, the fallback deadline — the real
    // dismissal must win the race, not the timer.
    jest.advanceTimersByTime(HANDOFF_FALLBACK_MS - 50);
    expect(how).toBeNull(); // not yet released by anything

    const result = completeChapterDismissal();
    expect(result).toEqual({ surface: 'chapter', releasedBy: 'dismiss-complete' });
    expect(how).toBe('dismiss-complete');
    expect(handoffPending()).toBeNull();

    // Advancing past the deadline now must not fire the fallback a second time.
    jest.advanceTimersByTime(HANDOFF_FALLBACK_MS + 100);
    expect(how).toBe('dismiss-complete');
  });

  it('completeForkDismissal() and completeSheetDismissal() do the same for their surfaces', () => {
    let forkHow: HandoffRelease | null = null;
    armPresentationHandoff('fork', (release) => { forkHow = release; });
    expect(completeForkDismissal()).toEqual({ surface: 'fork', releasedBy: 'dismiss-complete' });
    expect(forkHow).toBe('dismiss-complete');

    let sheetHow: HandoffRelease | null = null;
    armPresentationHandoff('sheet', (release) => { sheetHow = release; });
    expect(completeSheetDismissal()).toEqual({ surface: 'sheet', releasedBy: 'dismiss-complete' });
    expect(sheetHow).toBe('dismiss-complete');
  });

  it('a speculative call with nothing pending for that surface is a safe no-op (returns null, releases nothing)', () => {
    expect(handoffPending()).toBeNull();
    expect(completeChapterDismissal()).toBeNull();
    expect(completeForkDismissal()).toBeNull();
    expect(completeSheetDismissal()).toBeNull();
  });

  it('calling the WRONG surface\'s completion while a different one is pending is a no-op (does not release it)', () => {
    let how: HandoffRelease | null = null;
    armPresentationHandoff('chapter', (release) => { how = release; });
    expect(completeForkDismissal()).toBeNull();
    expect(how).toBeNull();
    expect(handoffPending()).toBe('chapter');
  });
});
