// ⚠⚠ OTA-1261 — NARRATION TRACK N6: A JS CRASH IS NOT AN ML CRASH.
//
// Owner: *"let's work on n1-6 in order."*
//
// From the 4.29.173 device report, taken right after the OTA-1245 JS RENDER crash:
//
//     Last JS crash — stage: screen-render · undefined is not a function
//     ML runtime health — Status: recovering — detected a crash on previous launch
//
// The render crash had nothing to do with the native ML libraries, and ML health
// took the blame for it.
//
// ⚠⚠ THE BREADCRUMB CANNOT TELL THEM APART ON ITS OWN. `markMLInitAttempted`
// writes a timestamp before init and `markMLInitSucceeded` writes one after; a
// next boot that finds "attempted, never succeeded" concludes the process died
// during init. That is true **whenever the process died in that window, for any
// reason at all** — a JS bug, an OS kill, a force-quit.
//
// ⚠⚠ AND IT IS NOT COSMETIC: `MAX_CRASHES_BEFORE_DISABLE` is 2. **Two unrelated JS
// bugs would auto-disable on-device generation for the whole install**, dropping
// the player to template narration because of a screen bug. That is the same class
// as arb124's false-disable (a Pixel benched at 74 "crashes" with zero real
// failures), arriving by a different door.
//
// ⚠ THE FIX IS EVIDENCE, NOT A GUESS. The global ErrorUtils handler already
// stashes a fatal JS crash with a timestamp (`@tartaria/lastCrash`). If one is on
// record from AFTER the init attempt, the dangling breadcrumb is accounted for and
// the native guard does not take the blame.
//
// ⚠ AND IT IS SAID OUT LOUD. "We found a breadcrumb and chose not to count it" is
// a different fact from "nothing happened"; swallowing it is how a real native
// crash would later read as a quiet boot.
//
// ⚠⚠ ONE PLAN STEP WAS ALREADY DONE, AND SAYING SO BEAT DOING IT TWICE. N6 step 1
// read: *"stamp the breadcrumb as soon as the model reports ready, not at the end
// of the first successful generation."* Measured against App.tsx, it already is —
// `markMLInitSucceeded()` fires on `qwenStatus === 'ready'` (OTA-1180 tightened
// exactly that). No change was needed and none was invented.

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
    multiRemove: jest.fn(async (ks: string[]) => { for (const k of ks) delete mockStore[k]; }),
    getAllKeys: jest.fn(async () => Object.keys(mockStore)),
  },
}));

import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const K = {
  attempted: 'tartaria.ml.lastInitAttempt',
  succeeded: 'tartaria.ml.lastInitSuccess',
  crash: 'tartaria.ml.crashCount',
  disabled: 'tartaria.ml.disabledByCrash',
  lastCrash: '@tartaria/lastCrash',
};

interface Health {
  crashCount: number;
  detectedCrashThisBoot: boolean;
  initCrashExplainedByJsThisBoot: boolean;
  disabledByCrash: boolean;
}

async function boot(): Promise<{ health: Health; summary: string }> {
  let out: { health: Health; summary: string } | undefined;
  await jest.isolateModulesAsync(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ml = require('../app/diagnostics/mlHealth');
    const health = (await ml.loadMLHealth()) as Health;
    out = { health, summary: ml.mlHealthSummary() as string };
  });
  return out!;
}

/** A dangling init breadcrumb — attempted, never marked succeeded. */
const danglingInit = (at: string): void => { mockStore[K.attempted] = at; };
/** A fatal JS crash on record at `ms`. */
const jsFatalAt = (ms: number): void => {
  mockStore[K.lastCrash] = JSON.stringify({
    stage: 'screen-render', message: 'undefined is not a function',
    isFatal: true, timestamp: ms,
  });
};

const T0 = Date.parse('2026-08-13T22:00:00.000Z');

beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; });

describe('OTA-1261 N6 — the JS crash no longer takes the ML guard down with it', () => {
  it('⚠⚠ THE OWNER\'S REPORT: a fatal JS crash AFTER the init attempt is not counted', () => {
    danglingInit(new Date(T0).toISOString());
    jsFatalAt(T0 + 30_000); // the render crash, half a minute into the session
    return boot().then(({ health, summary }) => {
      expect(health.crashCount).toBe(0);
      expect(health.detectedCrashThisBoot).toBe(false);
      expect(health.initCrashExplainedByJsThisBoot).toBe(true);
      // ⚠ And it SAYS so — a silent skip would be indistinguishable from a clean
      // boot, which is exactly the ambiguity this whole item is about.
      expect(summary).toContain('explained by a JS crash');
      expect(summary).not.toContain('recovering');
    });
  });

  it('⚠⚠ ...and a REAL native init crash is still counted — the guard is not gutted', async () => {
    // No JS crash on record: the process died during init and nothing else
    // explains it. That is what the guard exists for.
    danglingInit(new Date(T0).toISOString());
    const { health, summary } = await boot();
    expect(health.crashCount).toBe(1);
    expect(health.detectedCrashThisBoot).toBe(true);
    expect(health.initCrashExplainedByJsThisBoot).toBe(false);
    expect(summary).toContain('recovering');
  });

  it('⚠⚠ a JS crash from BEFORE the attempt is no alibi', () => {
    // Ordering is the whole discrimination. A crash that happened before init was
    // even attempted cannot explain a breadcrumb written after it — treating it as
    // cover would let a real native crash hide behind last week's bug.
    danglingInit(new Date(T0).toISOString());
    jsFatalAt(T0 - 60_000);
    return boot().then(({ health }) => {
      expect(health.crashCount).toBe(1);
      expect(health.detectedCrashThisBoot).toBe(true);
      expect(health.initCrashExplainedByJsThisBoot).toBe(false);
    });
  });

  it('⚠⚠ a NON-FATAL JS error is no alibi either', async () => {
    // A caught-and-logged error did not kill the process, so it explains nothing.
    danglingInit(new Date(T0).toISOString());
    mockStore[K.lastCrash] = JSON.stringify({
      stage: 'ambient', message: 'handled', isFatal: false, timestamp: T0 + 30_000,
    });
    const { health } = await boot();
    expect(health.crashCount).toBe(1);
    expect(health.detectedCrashThisBoot).toBe(true);
  });

  it('⚠⚠ the excused breadcrumb is CLEARED, so it cannot be re-examined every boot', async () => {
    // arb125 fixed exactly this shape for the counted path: a stale record that is
    // never removed re-triggers on every later launch. The excused path needs the
    // same hygiene or it re-reads the same crash forever.
    danglingInit(new Date(T0).toISOString());
    jsFatalAt(T0 + 30_000);
    await boot();
    expect(mockStore[K.attempted]).toBeUndefined();
  });

  it('⚠ a clean boot is unchanged — success after attempt, nothing detected', async () => {
    mockStore[K.attempted] = new Date(T0).toISOString();
    mockStore[K.succeeded] = new Date(T0 + 1_000).toISOString();
    jsFatalAt(T0 + 30_000); // a JS crash that has nothing to do with ML at all
    const { health, summary } = await boot();
    expect(health.detectedCrashThisBoot).toBe(false);
    expect(health.initCrashExplainedByJsThisBoot).toBe(false);
    expect(summary).toContain('active (no crashes detected)');
  });

  it('⚠ an unreadable crash record is no alibi — the guard behaves exactly as before', async () => {
    danglingInit(new Date(T0).toISOString());
    mockStore[K.lastCrash] = '{not json';
    const { health } = await boot();
    expect(health.crashCount).toBe(1);
  });
});

describe('OTA-1261 N6 — the threshold this protects', () => {
  it('⚠⚠ TWO unrelated JS crashes would have auto-disabled on-device generation', () => {
    // The measurement that makes this worth fixing rather than noting. The guard
    // disables at 2, so two screen bugs across two launches were enough to bench
    // the model for the install — on a device with zero native failures.
    const ml = src('app', 'diagnostics', 'mlHealth.ts');
    const m = /const MAX_CRASHES_BEFORE_DISABLE = (\d+)/.exec(ml);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(2);
  });

  it('⚠ step 1 of the plan was ALREADY DONE — the success mark fires on ready', () => {
    // ⚠ N6 step 1 asked to stamp success when the model reports ready rather than
    // after a first generation. It already does — OTA-1180 tightened exactly that
    // when it found `bootQwen()` resolving on failure and being recorded as a
    // success. **Checking beat re-implementing.**
    const app = src('App.tsx');
    expect(app).toContain("const ok = useGameStore.getState().qwenStatus === 'ready';");
    expect(app).toContain('if (ok) void markMLInitSucceeded();');
  });
});
