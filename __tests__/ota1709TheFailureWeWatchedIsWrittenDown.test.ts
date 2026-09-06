/**
 * OTA-1709 — THE FAILURE WE WATCHED IS WRITTEN DOWN.
 *
 * The guard that decides whether to load the narration model has always run on
 * ONE kind of evidence: a breadcrumb saying "init was attempted and never marked
 * succeeded". That is an INFERENCE, and it is the right one for a native crash —
 * the process died, so nobody was left to report anything.
 *
 * ⚠⚠⚠ BUT A LOAD CAN ALSO FAIL IN THE OPEN, AND THAT WAS BEING THROWN AWAY.
 * `qwen.initialize()` swallows its errors and reports `status: 'failed'` with a
 * cause; bootQwen logs it and moves on:
 *
 *     qwen: LOAD FAILED — Failed to load the model (after 3489ms; gguf 468.6MB)
 *
 * Nothing died. The app is running, it knows the model did not load, and it is
 * holding the reason. It wrote none of that down, which cost three things:
 *
 *   1. A BOOT OF LATENCY. The guard could not act until the next launch
 *      reconstructed, by inference, a fact it had already been told outright.
 *   2. A PARDON. OTA-1261 clears the dangling breadcrumb when a fatal JS error
 *      is on record after the attempt — correct when the missing success is an
 *      inference, wrong when we watched the load fail. Any unrelated JS fatal
 *      later in the session bought a full pardon for a diagnosed failure.
 *   3. A LIE IN THE DIAGNOSTIC. It arrived a boot later as an inferred crash and
 *      was reported as "crashes detected this install" — a caught, non-fatal,
 *      fully-explained failure described as a process crash, in the one place we
 *      go to read what happened.
 */

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    getItem: jest.fn(async (k: string) => (k in mockStore ? mockStore[k] : null)),
    removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
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
  failCount: 'tartaria.ml.qwenLoadFailCount',
  failAt: 'tartaria.ml.qwenLoadFailAt',
  failWhy: 'tartaria.ml.qwenLoadFailWhy',
  lastCrash: '@tartaria/lastCrash',
};

type ML = typeof import('../app/diagnostics/mlHealth');

/** One launch: fresh module registry, so `cached` is rebuilt from storage the
 *  way a real cold boot rebuilds it. */
async function boot(run: (ml: ML) => Promise<void> | void): Promise<void> {
  await jest.isolateModulesAsync(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ml = require('../app/diagnostics/mlHealth') as ML;
    await ml.loadMLHealth();
    await run(ml);
  });
}

beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; });

describe('OTA-1709 — the observed failure is recorded, this session', () => {
  it('⚠⚠⚠ a load that fails in the open is counted NOW, not next boot', async () => {
    await boot(async (ml) => {
      await ml.markMLInitAttempted();
      expect(ml.shouldAttemptQwen()).toBe(true);
      await ml.markQwenLoadFailed('Failed to load the model (after 3489ms; gguf 468.6MB)');
      // Durable, immediately.
      expect(mockStore[K.failCount]).toBe('1');
      expect(mockStore[K.failWhy]).toContain('gguf 468.6MB');
      expect(mockStore[K.failAt]).toBeTruthy();
    });
  });

  it('⚠⚠⚠ it clears the attempt breadcrumb, so ONE failure cannot be counted TWICE', async () => {
    // The arb125 lesson. The attempt is now accounted for by direct observation;
    // leaving the breadcrumb would let the next boot ALSO infer a native crash
    // from it — one failure, two marks against the same budget.
    await boot(async (ml) => {
      await ml.markMLInitAttempted();
      await ml.markQwenLoadFailed('out of memory');
    });
    expect(mockStore[K.attempted]).toBeUndefined();
    await boot((ml) => {
      const h = ml.mlHealthSummary();
      expect(mockStore[K.crash]).toBeUndefined();        // no inferred crash invented
      expect(mockStore[K.failCount]).toBe('1');          // still exactly one
      expect(h.includes('failed in the open')).toBe(true);
    });
  });

  it('⚠⚠⚠ and an unrelated JS crash can no longer PARDON it', async () => {
    // Before OTA-1709 the breadcrumb survived the failure, and OTA-1261's alibi
    // then cleared it uncounted whenever any fatal JS error was on record after
    // the attempt. A render bug erased a diagnosed load failure.
    await boot(async (ml) => {
      await ml.markMLInitAttempted();
      await ml.markQwenLoadFailed('Failed to load the model');
    });
    // A fatal JS crash later in that same session — the alibi's trigger.
    mockStore[K.lastCrash] = JSON.stringify({ isFatal: true, timestamp: Date.now() + 5_000 });
    await boot((ml) => {
      expect(mockStore[K.failCount]).toBe('1');   // survived the alibi
      // And it is still on the books as what it was, rather than erased or
      // re-described. (The gate reason only names failures once the guard is
      // actually engaged, so the summary is where a single failure shows.)
      expect(ml.mlHealthSummary().includes('failed in the open')).toBe(true);
    });
  });

  it('two observed failures bench the model, on the same threshold as two lost boots', async () => {
    await boot(async (ml) => {
      await ml.markQwenLoadFailed('one');
    });
    expect(mockStore[K.disabled]).toBeUndefined();
    await boot(async (ml) => {
      expect(ml.shouldAttemptQwen()).toBe(true);   // one is not a pattern
      await ml.markQwenLoadFailed('two');
      // ⚠ The verdict moves THIS session — App.tsx re-warms on a settled
      // foreground and the watchdog re-inits, so a next-boot-only verdict would
      // let the same session keep retrying a load it has twice watched fail.
      expect(ml.shouldAttemptQwen()).toBe(false);
    });
    expect(mockStore[K.disabled]).toBe('true');
  });

  it('⚠⚠ the two halves of the ledger are ADDED against the past-success ceiling', async () => {
    // OTA-1704 lets a past success excuse the polluted inferred counter, but only
    // up to 6 failures since. An observed failure is the better evidence of the
    // two, so it would be strange for it to be the half the ceiling ignores.
    mockStore[K.succeeded] = new Date().toISOString();
    mockStore[K.crash] = '4';
    // ⚠ The disable flag belongs with that count: a device reaches 4 inferred
    // crashes by passing the threshold of 2, which sets it. Without it the state
    // is one no device can actually be in, and the test would be measuring the
    // exemption in isolation rather than the gate.
    mockStore[K.disabled] = 'true';
    mockStore[K.failCount] = '1';
    await boot((ml) => expect(ml.shouldAttemptQwen()).toBe(true));    // 5 < 6
    mockStore[K.failCount] = '2';
    await boot((ml) => {
      expect(ml.shouldAttemptQwen()).toBe(false);                    // 6 >= 6
      expect(ml.qwenGateReason().includes('6 failures since')).toBe(true);
    });
  });

  it('⚠ ONE PER SESSION — the unit of every threshold here is a launch', async () => {
    // bootQwen runs several times per session (settled-foreground re-warm; the
    // watchdog drives up to 8 re-inits). Counting each would put 8 on a ceiling
    // calibrated for 6 launches, and the same number would mean two different
    // things depending on which path incremented it.
    await boot(async (ml) => {
      for (const why of ['a', 'b', 'c', 'd']) await ml.markQwenLoadFailed(why);
      expect(mockStore[K.failCount]).toBe('1');
      expect(mockStore[K.failWhy]).toBe('a');
    });
  });

  it('a success wipes the observed half too, and re-opens the session cap', async () => {
    // arb124's reason: a load that landed proves this device can load the model,
    // so the failures before it describe a device that no longer exists.
    await boot(async (ml) => {
      await ml.markQwenLoadFailed('one');
      await ml.markMLInitSucceeded();
      expect(mockStore[K.failCount]).toBeUndefined();
      expect(ml.shouldAttemptQwen()).toBe(true);
      // The cap lifts: a later failure is a new statement about a device that
      // has now demonstrably loaded once.
      await ml.markQwenLoadFailed('after the success');
      expect(mockStore[K.failCount]).toBe('1');
    });
  });

  it('RELOAD AI forgets the observed failures and the cause', async () => {
    await boot(async (ml) => {
      await ml.markQwenLoadFailed('x');
      await ml.markQwenLoadFailed('y');
      await ml.resetMLHealth();
    });
    for (const k of [K.failCount, K.failAt, K.failWhy, K.disabled, K.crash]) {
      expect({ k, v: mockStore[k] }).toEqual({ k, v: undefined });
    }
  });
});

describe('OTA-1709 — the diagnostic stops calling it a crash', () => {
  it('⚠⚠⚠ an observed failure is described as one, with the cause the engine gave', async () => {
    await boot(async (ml) => {
      await ml.markQwenLoadFailed('Failed to load the model (after 3489ms; gguf 468.6MB)');
    });
    await boot((ml) => {
      const s = ml.mlHealthSummary();
      expect(s.includes('failed in the open')).toBe(true);
      expect(s.includes('gguf 468.6MB')).toBe(true);
      // The old wording claimed a process crash for something that never crashed.
      expect(s.includes('1/2 crashes detected this install')).toBe(false);
    });
  });

  it('an INFERRED crash is still described as its own thing — the two are not merged', async () => {
    // A real dangling breadcrumb with no observed failure: the native guard's
    // own case, and it must keep reading as a lost boot rather than borrowing
    // the new wording.
    mockStore[K.attempted] = new Date().toISOString();
    await boot((ml) => {
      const s = ml.mlHealthSummary();
      expect(s.includes('detected a crash on previous launch')).toBe(true);
      expect(s.includes('failed in the open')).toBe(false);
    });
  });

  it('the report carries the last cause verbatim, which is the point of keeping it', async () => {
    await boot(async (ml) => { await ml.markQwenLoadFailed('llama.rn: model file truncated'); });
    await boot((ml) => {
      const s = ml.mlHealthSummary();
      expect(s.includes('Observed load failures: 1')).toBe(true);
      expect(s.includes('Last load failure cause: llama.rn: model file truncated')).toBe(true);
    });
  });

  it('a very long native error is trimmed to its first line', async () => {
    await boot(async (ml) => {
      await ml.markQwenLoadFailed(`the real cause\n${'stack frame '.repeat(200)}`);
    });
    expect(mockStore[K.failWhy]).toBe('the real cause');
  });
});

describe('OTA-1709 — where it is called, and the branch it must never touch', () => {
  const slice = (): string => src('app', 'state', 'slices', 'aiLifecycleSlice.ts');

  it('both OBSERVED branches record', () => {
    const s = slice();
    expect(s.includes('void markQwenLoadFailed(why);')).toBe(true);       // LOAD FAILED
    expect(s.includes('void markQwenLoadFailed(message);')).toBe(true);   // LOAD THREW
  });

  it('⚠⚠⚠ a CANCELLED load is NOT a failed one — OTA-1405, now with a counter behind it', () => {
    // OTA-1405's lesson cost the owner a wrong reading of his own log: a load
    // abandoned because he switched away had `getLastError() === null` — the
    // engine had no complaint — and the code invented one. Spending the guard's
    // budget on that would be the same mistake made durable: every backgrounded
    // load would count, and a device that merely gets used would bench itself.
    const s = slice();
    const at = s.indexOf('qwen: LOAD CANCELLED');
    expect(at).toBeGreaterThan(0);
    const branch = s.slice(s.lastIndexOf('} else {', at), s.indexOf('} catch (err)', at));
    expect(branch.includes('markQwenLoadFailed')).toBe(false);
  });

  it('the recorder clears the attempt breadcrumb — the no-double-count contract, in source', () => {
    const ml = src('app', 'diagnostics', 'mlHealth.ts');
    const fn = ml.slice(ml.indexOf('export async function markQwenLoadFailed'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body.includes('AsyncStorage.removeItem(KEY_ATTEMPTED)')).toBe(true);
    expect(body.includes('loadFailCountedThisSession')).toBe(true);
  });
});
