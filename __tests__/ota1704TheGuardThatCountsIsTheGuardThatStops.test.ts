/**
 * OTA-1704 — THE GUARD THAT COUNTS HAS TO BE THE GUARD THAT STOPS.
 *
 * The owner's old iPhone (iOS 18.7.10, 414×896 @2x), bundles #mtp4z19wukma and
 * #mtp58dsz2z9x, 2026-09-06, on OTA-1703. Its own health record said:
 *
 *     Status: auto-disabled after 8 crashes (template narration in use)
 *     Crashes-before-disable threshold: 2
 *     Last init success: 2026-08-23T17:58:47.877Z     ← thirteen days earlier
 *     Last init attempt: 2026-09-06T01:32:39.497Z     ← forty-seven seconds earlier
 *
 * and the log, on the same session, said:
 *
 *     qwen: loading (was idle) — the Arbiter speaks templates until it is ready
 *     qwen: LOAD FAILED — Failed to load the model (after 3489ms; gguf 468.6MB
 *       on disk (~398MB nominal); sentinel ok; disk free 43.0GB)
 *
 * Disabled, and loading anyway — 3.5 seconds of blocking work and a ~400MB
 * allocation attempt per session on a phone already at the jetsam line. The
 * crash ledger recorded the answer at 01:38:34: PROCESS KILLED at boot stage
 * voice:play:unload, twelve seconds into the process. Owner: "I've had a few
 * small freezes, but this was a freeze that I had to do a hard reset on."
 *
 * TWO HOLES, both closed here:
 *
 *   A. `shouldAttemptQwen()` let ONE past success exempt the device from the
 *      general guard forever (arb124). Has-loaded is not can-load: this phone
 *      loaded in August and has failed every boot since. The exemption is now
 *      bounded by the failures accrued since that success.
 *   B. App.tsx checks the gate at its two boot warms but NOT at the settled-
 *      foreground re-warm, which calls `bootQwen()` directly — and the watchdog
 *      lands there too. `bootQwen` itself now consults the gate, which covers
 *      every path at once and leaves the watchdog unstarted on a gated device.
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
  crash: 'tartaria.ml.crashCount',
  disabled: 'tartaria.ml.disabledByCrash',
  succeeded: 'tartaria.ml.lastInitSuccess',
  attempted: 'tartaria.ml.lastInitAttempt',
  qwenCrash: 'tartaria.ml.qwenCompletionCrashCount',
};

/** The iPhone's own numbers, from the 2026-09-06 bundles. */
const IPHONE = { crashCount: '8', lastSuccess: '2026-08-23T17:58:47.877Z' };

async function gates(): Promise<{ qwen: boolean; mlInit: boolean; reason: string }> {
  let out: { qwen: boolean; mlInit: boolean; reason: string } | undefined;
  await jest.isolateModulesAsync(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ml = require('../app/diagnostics/mlHealth');
    await ml.loadMLHealth();
    out = { qwen: ml.shouldAttemptQwen(), mlInit: ml.shouldAttemptMLInit(), reason: ml.qwenGateReason() };
  });
  return out!;
}

beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; });

describe('OTA-1704 — a past success rents the exemption, it does not own it', () => {
  it('⚠⚠ the iPhone: loaded once thirteen days ago, eight failures since — the gate SHUTS', async () => {
    mockStore[K.crash] = IPHONE.crashCount;
    mockStore[K.disabled] = 'true';
    mockStore[K.succeeded] = IPHONE.lastSuccess;
    const g = await gates();
    expect(g.mlInit).toBe(false);
    expect(g.qwen).toBe(false); // before OTA-1704 this was true, every session, forever
  });

  it('the reason names both numbers, so the next bug report reads itself', async () => {
    mockStore[K.crash] = IPHONE.crashCount;
    mockStore[K.disabled] = 'true';
    mockStore[K.succeeded] = IPHONE.lastSuccess;
    const { reason } = await gates();
    expect(reason.includes(IPHONE.lastSuccess)).toBe(true);
    // ⚠ OTA-1709 RE-ANCHORED — the CLAIM is unchanged (the reason names the past
    // success and the failures since, so a bug report reads itself); the wording
    // got more precise. It now says which KIND of evidence those failures are,
    // because there are two kinds: boots that never came back, and loads the app
    // watched fail in the open.
    expect(reason.includes('8 failures since')).toBe(true);
    expect(reason.includes('8 boots that never came back')).toBe(true);
  });

  it('⚠ arb124 is PRESERVED under the ceiling: a proven device riding OS-kill noise still loads', async () => {
    // The defect arb124 fixed — the general counter false-positives whenever the
    // OS kills the app mid-load — is absorbed exactly as before, three times the
    // general threshold of 2 deep.
    for (const count of ['1', '3', '5']) {
      for (const k of Object.keys(mockStore)) delete mockStore[k];
      mockStore[K.crash] = count;
      mockStore[K.disabled] = 'true';
      mockStore[K.succeeded] = '2026-09-06T01:00:00.000Z';
      const g = await gates();
      expect({ count, mlInit: g.mlInit, qwen: g.qwen }).toEqual({ count, mlInit: false, qwen: true });
    }
  });

  it('the ceiling is where it says it is: 5 exempt, 6 gated', async () => {
    for (const [count, expected] of [['5', true], ['6', false]] as const) {
      for (const k of Object.keys(mockStore)) delete mockStore[k];
      mockStore[K.crash] = count;
      mockStore[K.disabled] = 'true';
      mockStore[K.succeeded] = '2026-09-06T01:00:00.000Z';
      expect({ count, qwen: (await gates()).qwen }).toEqual({ count, qwen: expected });
    }
  });

  it('a real success re-zeroes the count, so the way back is still open', async () => {
    mockStore[K.crash] = IPHONE.crashCount;
    mockStore[K.disabled] = 'true';
    mockStore[K.succeeded] = IPHONE.lastSuccess;
    expect((await gates()).qwen).toBe(false);
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.loadMLHealth();
      await ml.markMLInitSucceeded();
    });
    expect(mockStore[K.crash]).toBeUndefined();
    expect((await gates()).qwen).toBe(true);
  });

  it('the completion-crash guard still hard-gates regardless of the count, and an unloaded cache is permissive', async () => {
    mockStore[K.qwenCrash] = '3';
    mockStore[K.succeeded] = '2026-09-06T01:00:00.000Z';
    expect((await gates()).qwen).toBe(false);
    // Never loaded → the gate must never be the reason a healthy device is benched.
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      expect(ml.shouldAttemptQwen()).toBe(true);
      expect(ml.qwenGateReason()).toBe('health not loaded yet');
    });
  });
});

describe('OTA-1704 — bootQwen is the door, and it asks', () => {
  const makeSlice = async (gateOpen: boolean) => {
    const logs: string[] = [];
    const state: { qwenStatus: string; qwenFraction: number; qwenError: string | null } = {
      qwenStatus: 'idle', qwenFraction: 0, qwenError: null,
    };
    const started: string[] = [];
    const initialize = jest.fn(async () => {});
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../app/diagnostics/mlHealth', () => ({
        shouldAttemptQwen: () => gateOpen,
        qwenGateReason: () => 'loaded once but eight boots have failed since',
      }));
      jest.doMock('../app/ai/engines', () => ({
        cognitive: {},
        qwen: {
          initialize,
          isReady: () => false,
          getStatus: () => 'idle',
          getLastError: () => null,
        },
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createAiLifecycleSlice } = require('../app/state/slices/aiLifecycleSlice');
      const get = () => ({
        ...state,
        appendLog: (_c: string, t: string) => { logs.push(t); },
      });
      const set = (patch: Record<string, unknown>) => { Object.assign(state, patch); };
      const slice = createAiLifecycleSlice(set, get, {
        startQwenWatchdog: () => { started.push('watchdog'); },
        startRuntimePressureWatch: () => { started.push('pressure'); },
      });
      await slice.bootQwen();
    });
    return { logs, state, started, initialize };
  };

  it('⚠⚠ gate shut: no model is loaded, the status says skipped, and the watchdog never starts', async () => {
    const { logs, state, started, initialize } = await makeSlice(false);
    expect(initialize).not.toHaveBeenCalled();      // the ~400MB never allocates
    expect(state.qwenStatus).toBe('skipped');
    expect(started).toEqual([]);                    // nothing left running to retry it
    const line = logs.find((l) => l.startsWith('qwen: SKIPPED'));
    expect(line).toBeTruthy();
    expect(line!.includes('eight boots have failed since')).toBe(true);
    expect(line!.includes('RELOAD AI')).toBe(true); // the way back is in the line
  });

  it('gate open: the load runs exactly as before and the watchdog starts', async () => {
    const { state, started, initialize, logs } = await makeSlice(true);
    expect(initialize).toHaveBeenCalled();
    expect(state.qwenStatus).not.toBe('skipped');
    expect(started).toEqual(['watchdog', 'pressure']);
    expect(logs.some((l) => l.startsWith('qwen: loading'))).toBe(true);
  });
});

describe('OTA-1704 — the paths that used to route around the gate', () => {
  it('⚠ the settled-foreground re-warm still calls bootQwen with no gate of its own — the door is what covers it', () => {
    const app = src('App.tsx');
    // If this line ever grows its own check the belt is still correct; the pin
    // exists so the reason bootQwen must ask is not forgotten.
    expect(app.includes('qwen: re-warming after')).toBe(true);
    const at = app.indexOf('qwen: re-warming after');
    expect(app.slice(at, at + 200).includes('void bootQwen();')).toBe(true);
  });

  it('the watchdog is still started from bootQwen and nowhere else, so a gated device stops asking', () => {
    const slice = src('app', 'state', 'slices', 'aiLifecycleSlice.ts');
    expect(slice.includes('deps.startQwenWatchdog(get, set);')).toBe(true);
    // The gate returns BEFORE the load and therefore before the watchdog start.
    expect(slice.indexOf('if (!shouldAttemptQwen())')).toBeLessThan(slice.indexOf('deps.startQwenWatchdog(get, set);'));
    const others = src('app', 'ai', 'qwenWatchdog.ts');
    expect(others.includes('called from `bootQwen`')).toBe(true);
  });
});
