// OTA-1863 — NATIVE DISMISSAL COMPLETION OWNS THE HANDOFF.
//
// ⚠⚠⚠ WHY THIS SUITE EXISTS, from the device and from production's own words.
// OTA-1497 wrote the diagnosis into ExplorationScreen in August, off four
// iPhone freezes: *"On iOS, presenting one modal while another is mid-dismissal
// wedges the window ... JS alive, screen dead, force-close."* Its mitigation
// deferred sheet submits by SHEET_SETTLE_MS — which proves 400ms elapsed and
// nothing else.
//
// ⚠⚠ THE 2026-09-21 GUARDIAN FREEZE then reproduced the shape on a path the
// mitigation never saw: `chapter:cores (mount:native)` — the only unbalanced
// presentation edge in the whole diagnostic corpus — a touch reaching the app
// root and never reaching admission, JS running for a further 8.8 seconds, and
// a force-close. `dismissChapterCard()` was tearing down the chapter <Modal>
// and raising the story fork's <Modal> in ONE synchronous call.
//
// ⚠ WHAT IS PROVEN HERE is ORDERING, not the native wedge. Jest has no native
// window: react-native under jest-expo renders <Modal> as a React subtree, so
// no test in this file may ever be read as reproducing the iOS fault. What the
// harness CAN hold production to is the invariant the fault demands —
//
//   NO NEXT IMPLICATED PRESENTATION MAY BE REQUESTED WHILE THE PREVIOUS ONE IS
//   BETWEEN REACT TEARDOWN AND NATIVE DISMISSAL COMPLETE.
//
// ⚠ AND THE PLATFORM FACT THE DESIGN RESTS ON, checked against the installed
// runtime rather than assumed: react-native 0.81.5's Libraries/Modal/Modal.js
// fires `onDismiss` ONLY under `Platform.OS === 'ios'`. Android never calls it,
// so there the bounded deadline is the normal release — which is why tests 8
// and 9 below are not edge cases but Android's everyday path.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...a: unknown[]) => Promise<any> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { ALL_FORKS, dueFork, PHASE_ORDER, forkById } from '../app/engine/storyForks';
import { chapterCardFor } from '../app/engine/chapters';
import {
  armPresentationHandoff,
  notePresentationDismissed,
  handoffPending,
  HANDOFF_FALLBACK_MS,
  _handoffCountsForTest,
  _resetHandoffForTest,
} from '../app/state/presentationHandoff';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
beforeEach(() => { _resetHandoffForTest(); });
afterEach(() => { _resetHandoffForTest(); });

const SRC = (p: string) => readFileSync(join(__dirname, '..', 'app', p), 'utf8');

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Handoff', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

/** A motive + phase the shipped game actually reaches where a fork is due. */
function armable(): { motive: string; phase: string; forkId: string } {
  for (const fork of ALL_FORKS) {
    if ((fork as any).minCores) continue;
    for (const phase of PHASE_ORDER) {
      if (PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf(fork.minPhase)) continue;
      const motive = (fork as any).motive as string | undefined;
      if (!motive) continue;
      const probe = { storyMotive: motive, storyChoices: {}, mainQuest: { phase, coresRecovered: [] } } as any;
      if (!dueFork(probe)) continue;
      if (!chapterCardFor(phase as any, motive)) continue;
      return { motive, phase, forkId: fork.id };
    }
  }
  throw new Error('no armable motive/phase — fixture cannot be built');
}

/** Put the store in the state the device was in: mid-run, no intro, no tutorial.
 *  `raiseDueFork` legitimately refuses while either is up; that guard is correct
 *  and is NOT what this suite is testing. */
function midRun(store: ReturnType<typeof useGameStore>, a: ReturnType<typeof armable>, extra: Record<string, unknown>) {
  store.setState((s) => ({
    player: {
      ...s.player!,
      storyMotive: a.motive,
      storyChoices: {},
      mainQuest: { ...(s.player as any).mainQuest, phase: a.phase, coresRecovered: [] },
    } as any,
    storyIntro: null,
    tutorialStep: null,
    pendingFork: null,
    chapterCard: null,
    ...extra,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAPTER CARD → STORY FORK
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1863 — the chapter card hands off on native dismissal, not on the same tick', () => {
  it('⚠⚠⚠ 1. THE FREEZE ORDERING IS GONE: dismiss requested → fork NOT raised yet', async () => {
    const a = armable();
    const store = await boot();
    midRun(store, a, { chapterCard: chapterCardFor(a.phase as any, a.motive) });
    expect(store.getState().chapterCard).not.toBeNull();

    store.getState().dismissChapterCard();

    // React teardown requested — the <Modal> is now DISMISSING, not gone.
    expect(store.getState().chapterCard).toBeNull();
    // and nothing has been told to present into that dismissal.
    expect(store.getState().pendingFork).toBeNull();
    expect(handoffPending()).toBe('chapter');
  });

  it('⚠⚠ 2. the due fork is raised once the card says its window is gone', async () => {
    const a = armable();
    const store = await boot();
    midRun(store, a, { chapterCard: chapterCardFor(a.phase as any, a.motive) });

    store.getState().dismissChapterCard();
    expect(store.getState().pendingFork).toBeNull();

    notePresentationDismissed('chapter');   // <Modal onDismiss> on iOS

    expect(store.getState().pendingFork).not.toBeNull();
    expect(handoffPending()).toBeNull();
    expect(_handoffCountsForTest().byDismiss).toBe(1);
  });

  it('⚠⚠ 3. a repeated or late dismissal callback cannot raise the fork twice', async () => {
    const a = armable();
    const store = await boot();
    midRun(store, a, { chapterCard: chapterCardFor(a.phase as any, a.motive) });

    store.getState().dismissChapterCard();
    notePresentationDismissed('chapter');
    const first = store.getState().pendingFork;
    expect(first).not.toBeNull();

    // The same surface reporting again, and a stale report from another one.
    notePresentationDismissed('chapter');
    notePresentationDismissed('sheet');
    notePresentationDismissed('fork');

    expect(store.getState().pendingFork).toBe(first);   // same object, not re-raised
    expect(_handoffCountsForTest().byDismiss).toBe(1);
  });

  it('⚠ 4. a stale callback from another surface does not release the chapter handoff early', async () => {
    const a = armable();
    const store = await boot();
    midRun(store, a, { chapterCard: chapterCardFor(a.phase as any, a.motive) });

    store.getState().dismissChapterCard();
    notePresentationDismissed('sheet');   // a sheet that closed elsewhere
    notePresentationDismissed('fork');

    expect(store.getState().pendingFork).toBeNull();
    expect(handoffPending()).toBe('chapter');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STORY FORK → STORY FORK
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1863 — answering a fork waits for its own window before asking the next', () => {
  it('⚠⚠⚠ 5. answer fork A → fork B NOT raised before dismissal completes', async () => {
    const a = armable();
    const store = await boot();
    const fork = forkById(a.forkId)!;
    midRun(store, a, { pendingFork: fork });

    store.getState().answerFork(fork.options[0]!.id);

    expect(store.getState().pendingFork).toBeNull();   // A torn down
    expect(handoffPending()).toBe('fork');             // B is waiting, not presented
  });

  it('⚠⚠ 6. on dismissal complete the next due fork is raised exactly once', async () => {
    const a = armable();
    const store = await boot();
    const fork = forkById(a.forkId)!;
    midRun(store, a, { pendingFork: fork });

    store.getState().answerFork(fork.options[0]!.id);
    notePresentationDismissed('fork');
    const after = store.getState().pendingFork;

    notePresentationDismissed('fork');   // late/duplicate
    expect(store.getState().pendingFork).toBe(after);
    expect(_handoffCountsForTest().byDismiss).toBe(1);
  });

  it('⚠ 7. NO-NEXT-FORK CASE: the machinery never invents a presentation', async () => {
    const a = armable();
    const store = await boot();
    const fork = forkById(a.forkId)!;
    midRun(store, a, { pendingFork: fork });

    store.getState().answerFork(fork.options[0]!.id);
    // Answer every remaining fork on the record so none is due.
    store.setState((s) => ({
      player: {
        ...s.player!,
        storyChoices: Object.fromEntries(ALL_FORKS.map((f) => [f.id, f.options[0]!.id])),
      } as any,
    }));
    notePresentationDismissed('fork');

    expect(store.getState().pendingFork).toBeNull();
    expect(dueFork(store.getState().player as any)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE HANDOFF PRIMITIVE — fallback, exactly-once, and the negative control
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1863 — the handoff primitive', () => {
  it('⚠⚠⚠ 8. the continuation does NOT run before the sheet reports dismissal', () => {
    jest.useFakeTimers();
    try {
      let ran = 0;
      armPresentationHandoff('sheet', () => { ran += 1; });
      expect(ran).toBe(0);
      jest.advanceTimersByTime(HANDOFF_FALLBACK_MS - 1);
      expect(ran).toBe(0);               // not yet: neither signal nor deadline

      notePresentationDismissed('sheet');
      expect(ran).toBe(1);
      jest.advanceTimersByTime(10_000);  // the deadline must have been cancelled
      expect(ran).toBe(1);
      expect(_handoffCountsForTest()).toEqual({ byDismiss: 1, byFallback: 0, superseded: 0 });
    } finally { jest.useRealTimers(); }
  });

  it('⚠⚠ 9. ANDROID / MISSING-CALLBACK PATH: the bounded deadline releases exactly once', () => {
    // On Android RN never fires onDismiss (Modal.js gates it on Platform.OS ===
    // \'ios\'), so this is not an edge case there — it is the normal release.
    jest.useFakeTimers();
    try {
      let ran = 0;
      let how: string | null = null;
      armPresentationHandoff('sheet', (release) => { ran += 1; how = release; });
      jest.advanceTimersByTime(HANDOFF_FALLBACK_MS);
      expect(ran).toBe(1);
      expect(how).toBe('fallback');      // identifiable in the trace
      jest.advanceTimersByTime(10_000);
      expect(ran).toBe(1);
      expect(_handoffCountsForTest()).toEqual({ byDismiss: 0, byFallback: 1, superseded: 0 });
    } finally { jest.useRealTimers(); }
  });

  it('⚠⚠ 10. a LATE onDismiss after the fallback already released does NOT act twice', () => {
    jest.useFakeTimers();
    try {
      let ran = 0;
      armPresentationHandoff('sheet', () => { ran += 1; });
      jest.advanceTimersByTime(HANDOFF_FALLBACK_MS);
      expect(ran).toBe(1);
      notePresentationDismissed('sheet');   // iOS answering long after the deadline
      expect(ran).toBe(1);
      expect(handoffPending()).toBeNull();
    } finally { jest.useRealTimers(); }
  });

  it('⚠ 11. NEGATIVE CONTROL: a dismissal with nothing waiting creates nothing', async () => {
    const a = armable();
    const store = await boot();
    midRun(store, a, { dedicationCard: { title: 'x', body: 'x' } as any });

    expect(handoffPending()).toBeNull();
    notePresentationDismissed('chapter');
    notePresentationDismissed('fork');
    notePresentationDismissed('sheet');

    expect(store.getState().pendingFork).toBeNull();
    expect(store.getState().chapterCard).toBeNull();
    expect(_handoffCountsForTest()).toEqual({ byDismiss: 0, byFallback: 0, superseded: 0 });
    // and the fork really was available — otherwise this control proves nothing
    expect(dueFork(store.getState().player as any)).not.toBeNull();

    // A teardown that chains nothing still chains nothing.
    store.getState().dismissDedication();
    expect(store.getState().pendingFork).toBeNull();
    expect(handoffPending()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE WIRING — that the surfaces actually report, and that no timer was simply
// made longer. These are source pins in the OTA-1497 tradition, kept because
// the wedge lives in JSX the harness cannot exercise natively.
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1863 — the wiring is real', () => {
  it('⚠⚠⚠ 12. every implicated surface reports its own native dismissal', () => {
    const wired: Array<[string, string]> = [
      ['components/ChapterCardOverlay.tsx', 'chapter'],
      ['components/StoryForkOverlay.tsx', 'fork'],
      ['components/GatherModal.tsx', 'sheet'],
      ['components/SearchModal.tsx', 'sheet'],
    ];
    for (const [file, surface] of wired) {
      const src = SRC(file);
      expect(src).toContain("import { notePresentationDismissed } from '../state/presentationHandoff';");
      expect(src).toMatch(new RegExp(`onDismiss=\\{\\(\\) => notePresentationDismissed\\('${surface}'\\)\\}`));
    }
  });

  it('⚠⚠ 13. the two chained store sites no longer raise in the dismissing tick', () => {
    const src = SRC('state/gameStore.ts');
    // dismissChapterCard hands off instead of calling raiseDueFork inline
    expect(src).toMatch(/dismissChapterCard\(\) \{\s*set\(\{ chapterCard: null \}\);[\s\S]{0,900}?armPresentationHandoff\('chapter', \(\) => raiseDueFork\(get, set\)\);/);
    expect(src).not.toMatch(/set\(\{ chapterCard: null \}\);\s*(\/\/[^\n]*\n\s*)*raiseDueFork\(get, set\);/);
    // answerStoryFork likewise
    expect(src).toContain("armPresentationHandoff('fork', () => raiseDueFork(get, set));");
  });

  it('⚠⚠ 14. THE SHEET IS NO LONGER TIMER-AUTHORIZED — and 400ms was not raised', () => {
    const src = SRC('screens/ExplorationScreen.tsx');
    // the bare deferral OTA-1497 pinned is gone
    expect(src).not.toContain('setTimeout(() => { submit(text); after?.(); }, SHEET_SETTLE_MS);');
    // replaced by the handoff, with the old constant demoted to a fallback
    expect(src).toContain("armPresentationHandoff('sheet', (release) => {");
    expect(src).toContain('{ fallbackMs: SHEET_SETTLE_MS }');
    // ⚠ THE ANTI-CHEAT. "Make the timer longer" was the tempting non-repair.
    const m = /const SHEET_SETTLE_MS = (\d+);/.exec(src);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(400);
  });

  it('⚠ 15. the diagnostic pair still separates a lost tap from unrun work', () => {
    const src = SRC('screens/ExplorationScreen.tsx');
    expect(src).toContain("reason: 'dismiss-wait-armed'");
    expect(src).toContain("'dismiss-complete-release' : 'fallback-release'");
    expect(src).toContain("control: 'sheet:deferred'");
  });
});
