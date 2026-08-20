/**
 * OTA-1396 — SLICE 5: the freeze instruments leave gameStore.
 *
 * The memory-warning counter, the AppState trail, both freeze clocks (an
 * requestAnimationFrame tick and a setTimeout sample) and the verdict that
 * compares them. Everything that answers "was the app wedged, and for how long"
 * after a freeze nobody can reproduce on demand.
 *
 * ⚠⚠ THE PLAN SAID SLICES 5 AND 6 WERE SEPARATE. MEASURING SAID OTHERWISE, and
 * that is the fourth time in five slices that measuring has corrected the plan.
 *
 * Slice 5 was "the freeze instruments (~19 lets)" and slice 6 "the Qwen watchdog
 * (~12 lets)". Five of those variables are read AND written by both, because the
 * memory-pressure quiet window is where the two subsystems meet: when the OS says
 * memory is tight, the watchdog stands Qwen down instead of reloading a ~400MB
 * context into a process the OS is about to kill.
 *
 * ⚠⚠ SO THIS SLICE INTRODUCED THE PATTERN THE REST OF PART 4 WILL NEED.
 * `lastWelcomeBackAt` (slice 3) had ONE owner and travelled with it. These five
 * have TWO, and shared mutable state cannot travel with either — whichever
 * module it left would be assigning to an imported binding, which is a compile
 * error. It moves DOWN, and both owners reach it through accessors.
 *
 *     single-owner state moves WITH its owner
 *     shared state moves DOWN behind accessors
 *
 * ⚠ AND THE MOVE PAID FOR ITSELF IMMEDIATELY: `noteSaveKb` went down with the
 * instruments, so `persistSlice` — which had it injected since slice 1 because it
 * lived in gameStore — now imports it directly. That deps object shrank by one
 * with nothing redesigned. Moving shared things down makes the next move smaller.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

const store = src('app', 'state', 'gameStore.ts');
const watch = src('app', 'diagnostics', 'runtimePressureWatch.ts');
// ⚠ OTA-1397 — SLICE 6 moved the OTHER owner of the five shared latches out of
// gameStore, to `app/ai/qwenWatchdog.ts`. Three assertions here named gameStore
// as "the watchdog side" and now name the watchdog itself. Nothing about the
// accessor pattern changed — if anything this is the pattern paying off again,
// since the latches did not have to move a second time to let the watchdog go.
const watchdog = src('app', 'ai', 'qwenWatchdog.ts');

describe('OTA-1396 — the instruments live in diagnostics now', () => {
  it('⚠⚠ every runtime-pressure variable left gameStore', () => {
    // If one stayed behind, the two copies would drift and the freeze report
    // would describe a session that never happened.
    const rp = [...watch.matchAll(/^let (rp[A-Z]\w*)/gm)].map((m) => m[1]);
    expect(rp.length).toBeGreaterThanOrEqual(19);
    for (const name of rp) {
      expect(store).not.toMatch(new RegExp(`^let ${name}\\b`, 'm'));
    }
  });

  it('⚠ the module is a leaf — it imports no VALUE from the store', () => {
    for (const line of watch.split('\n')) {
      if (!/from\s+['"]\.\.\/state\/gameStore['"]/.test(line)) continue;
      expect(line.trim().startsWith('import type ')).toBe(true);
    }
  });

  it('⚠⚠ nothing runs at module load — the timers start only when asked', () => {
    // This file creates an rAF loop, a setTimeout poll and two native
    // subscriptions. WHEN those begin is behaviour, not bookkeeping, so a
    // relocation is only safe if none of them happen at import time.
    expect(watch).toContain('WHY MOVING LIVE TIMERS IS SAFE HERE');
    // every subscription/timer assignment sits inside a function body (indented)
    // ⚠ `?? ''` is not defensive padding — a capture group that somehow did not
    // participate must FAIL this check, not skip it, so the fallback is the
    // empty string rather than a `continue`.
    const indents = [...watch.matchAll(/^(\s*)(rpSampleTimer|rpFrameRaf|rpMemorySub|rpAppStateSub)\s*=/gm)]
      .map((m) => (m[1] ?? '').length);
    expect(indents.length).toBeGreaterThan(0);   // a loop over nothing asserts nothing
    for (const width of indents) expect(width).toBeGreaterThan(0);
  });

  it('⚠ the starter still reuses the stopper, so the two cannot drift', () => {
    const i = watch.indexOf('export function startRuntimePressureWatch(');
    expect(i).toBeGreaterThan(-1);
    expect(watch.slice(i, i + 900)).toContain('stopRuntimePressureWatch();');
  });
});

describe('OTA-1396 — the five shared latches, and how both owners reach them', () => {
  const SHARED = [
    'rpMemoryWarnings',
    'rpMemoryPressureUntil',
    'rpMemoryQuietLogged',
    'rpQwenStoodDownForMemory',
    'rpStandDownLogged',
  ];

  it.each(SHARED)('%s is declared exactly once, in the leaf', (name) => {
    expect(watch).toMatch(new RegExp(`^let ${name}\\b`, 'm'));
    expect(store).not.toContain(`${name} =`);
  });

  it('⚠⚠ the watchdog reaches them through ACCESSORS, never directly', () => {
    // A `let` can be read across a module boundary through a live binding but
    // never assigned. The watchdog does both, so it needs functions.
    for (const fn of [
      'qwenStoodDownForMemory()',
      'underMemoryPressure()',
      'memoryWarningCount()',
      'memoryQuietAlreadyLogged()',
      'noteMemoryQuietLogged()',
      'standDownAlreadyLogged()',
      'noteStandDownLogged()',
    ]) {
      expect(watchdog).toContain(fn);
    }
  });

  it('⚠⚠ the four latches are cleared by ONE call, not four assignments', () => {
    // Clearing three of four was always the bug waiting to happen — the reset
    // lived in the watchdog and the variables lived elsewhere. One owner now.
    expect(watch).toContain('export function clearMemoryPressureLatches(): void {');
    expect(watchdog).toContain('clearMemoryPressureLatches();');
  });

  it('⚠ the accessor surface is deliberately small, and says so', () => {
    // Every accessor is a piece of this module's internals something else now
    // depends on. The reason the instruments were worth extracting is that
    // almost nothing outside needed them.
    expect(watch).toContain('Keep this surface small');
    const exported = [...watch.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
    expect(exported.length).toBeLessThanOrEqual(12);
  });
});

describe('OTA-1396 — what stayed, and what the move simplified', () => {
  it('⚠⚠ logUiTap stayed in gameStore, and the reason is not "it was easier"', () => {
    // It sits in the middle of this block and touches NO pressure state — it
    // writes a log line and a save breadcrumb. Moving it would have meant
    // injecting a whole store accessor for one call.
    expect(store).toContain('export function logUiTap(');
    expect(watch).not.toContain('export function logUiTap(');
    expect(watch).toContain('WHAT STAYED, AND WHY');
  });

  it('⚠⚠ persistSlice LOST a dependency — it imports noteSaveKb directly now', () => {
    // It was injected since slice 1 only because noteSaveKb lived in gameStore.
    // The instruments moving to a leaf made the injection unnecessary.
    const persist = src('app', 'state', 'slices', 'persistSlice.ts');
    expect(persist).toContain("import { noteSaveKb } from '../../diagnostics/runtimePressureWatch';");
    expect(persist).not.toContain('noteSaveKb: (kb: number) => void;');
    expect(store).toContain('...createPersistSlice(set, get, { makeRoomKey }),');
  });

  it('⚠ the bug-report exporter follows the snapshot it reads', () => {
    expect(src('app', 'diagnostics', 'aboutSummary.ts'))
      .toContain("import { runtimePressureSnapshot } from './runtimePressureWatch';");
  });

  it('⚠⚠ the wrapper in gameStore is NAMED DIFFERENTLY, on purpose', () => {
    // Calling it `startRuntimePressureWatch` too would put two same-named
    // functions in the tree, and the suites that pin this subsystem read both
    // files as text — an indexOf for the declaration found the wrapper and
    // asserted against the wrong body.
    expect(store).toMatch(/^function startPressureWatchWithHooks\(/m);
    expect(store).not.toMatch(/^function startRuntimePressureWatch\(/m);
    expect(store).toContain('startRuntimePressureWatch: startPressureWatchWithHooks,');
  });

  it('⚠ …and the hook is a GETTER, because the count changes while it runs', () => {
    // A value captured at start-up would always read zero.
    expect(watch).toContain('qwenReinitAttempts: () => number;');
    // ⚠ OTA-1397 — the counter moved to the watchdog, so the getter gameStore
    // injects is now that module's accessor rather than an inline arrow over a
    // local `let`. Passing the function ITSELF is the same guarantee: read at
    // call time, not at start-up, where it would always be zero.
    expect(store).toContain('{ qwenReinitAttempts: qwenReinitAttemptCount }');
    expect(watchdog).toContain('export function qwenReinitAttemptCount(): number {');
  });
});

describe('OTA-1396 — the source pins, and the limit slice 5 found in the helper', () => {
  /**
   * ⚠⚠ EIGHT SUITES WENT RED, AND ONE OF THEM COULD NOT BE FIXED THE SLICE-4 WAY.
   *
   * Slice 4 answered twenty-four stale pins with `test-utils/storeSource.ts` — read the
   * store AND its slices, because a pin was never a claim about a FILE. That works
   * because a slice is still the store: same object, same keys, same 473 importers.
   *
   * Slice 5 moved code DOWN instead — out of the store's neighbourhood entirely, into a
   * diagnostics leaf that the store now imports. `storeSource()` does not see it, and
   * WIDENING IT TO SEE IT WOULD HAVE BEEN THE WRONG FIX: a helper that reads "wherever
   * the code went" makes every pin in the repo unfalsifiable, which is the exact failure
   * the helper's own header warns about.
   *
   * So all eight were re-pointed by hand, each to the file that now owns its claim — and
   * three assertions came out STRONGER for it, because a claim that spans two files has
   * to say which half it means.
   */
  const helper = src('test-utils', 'storeSource.ts');

  it('⚠⚠ storeSource was NOT widened to cover the diagnostics leaf', () => {
    // The one-line change that would have turned eight red tests green, and cost the
    // suite its ability to notice a deletion.
    expect(helper).not.toContain('diagnostics');
    expect(helper).toContain('WHEN NOT TO USE IT');
  });

  it('⚠ the suites that pin these instruments name this file, not a concatenation', () => {
    const RE_POINTED = [
      'ota1172RuntimePressure.test.ts',
      'ota1179HonestMemoryLine.test.ts',
      'ota1181WhyItFailed.test.ts',
      'ota1276FreezeForensics.test.ts',
      'ota1357LifecyclePhases.test.ts',
      'ota1360VoiceLoadKiller.test.ts',
      'ota1377OrderlyExit.test.ts',
    ];
    for (const f of RE_POINTED) {
      expect(src('__tests__', f)).toContain('runtimePressureWatch');
    }
  });

  it('⚠⚠ and the ONE claim that was really app-wide is now counted app-wide', () => {
    // ota1377 pinned "clearLiveBreadcrumb has exactly two callers" against the store
    // text. Two of its callers ended up in different files, and the honest repair was
    // not a bigger string to search — it was to count the callers across `app/`, which
    // would also catch a third one added in a screen.
    const orderly = src('__tests__', 'ota1377OrderlyExit.test.ts');
    expect(orderly).toContain('always a claim about the application and never about a file');
    expect(orderly).not.toMatch(/store\.match\(\/clearLiveBreadcrumb/);
  });
});

describe('OTA-1396 — five slices in', () => {
  it('gameStore is under 43,300 lines', () => {
    // 45,050 → 44,891 → 44,816 → 44,160 → 43,542 → here.
    expect(store.split('\n').length).toBeLessThan(43300);
  });

  it('⚠ the leaf exists where the engine-side helpers already lived', () => {
    expect(existsSync(path('app', 'diagnostics', 'runtimePressureWatch.ts'))).toBe(true);
    expect(existsSync(path('app', 'diagnostics', 'runtimePressure.ts'))).toBe(true);
    expect(watch).toContain("from './runtimePressure'");
  });
});
