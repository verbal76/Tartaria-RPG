/**
 * OTA-1705 — THE DEVICE TRIES AGAIN BY ITSELF, AND SAYS WHERE IT STANDS.
 *
 * Owner, after the old iPhone's logs: "devices should try to reset the AI
 * themselves periodically" and "if that phone doesn't have full capability make
 * it know to the user somewhere."
 *
 * OTA-1704 made the general init guard real — before it, one past success
 * exempted a device forever, and his iPhone rode that exemption into eight
 * failed loads and a process kill. A guard that genuinely benches a device needs
 * a way back that does not depend on the player finding a button, so the general
 * guard gets the boot-count amnesty OTA-414 already built for the completion
 * guard: cool down, spend ONE boot trying, recover or relapse with a doubling
 * backoff, on its own three keys.
 *
 * And the player is told, once per session, in their own language.
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
  genAt: 'tartaria.ml.genRetryAtBoot',
  genPending: 'tartaria.ml.genRetryPending',
  genBackoff: 'tartaria.ml.genBackoffBoots',
  qwenAt: 'tartaria.ml.qwenRetryAtBoot',
  qwenPending: 'tartaria.ml.qwenRetryPending',
};

interface Boot { qwen: boolean; retrying: boolean; nextIn: number | null; reason: string; capability: string | null }

/** One cold boot: loadMLHealth bumps the boot counter, so calling it again is
 *  the next launch. */
async function boot(): Promise<Boot> {
  let out: Boot | undefined;
  await jest.isolateModulesAsync(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ml = require('../app/diagnostics/mlHealth');
    const h = await ml.loadMLHealth();
    out = {
      qwen: ml.shouldAttemptQwen(),
      retrying: h.genRetryingThisBoot,
      nextIn: h.genNextRetryInBoots,
      reason: ml.qwenGateReason(),
      capability: ml.deviceCapabilityLine(),
    };
  });
  return out!;
}

/** A device the general guard has benched: never loaded, over the threshold. */
function benchedDevice(): void {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockStore[K.crash] = '3';
  mockStore[K.disabled] = 'true';
}

beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; });

describe('OTA-1705 — the general guard gets a way back that needs no button', () => {
  it('⚠⚠ a benched device counts down and takes its amnesty on the scheduled boot', async () => {
    benchedDevice();
    const first = await boot();
    expect({ qwen: first.qwen, retrying: first.retrying, nextIn: first.nextIn })
      .toEqual({ qwen: false, retrying: false, nextIn: 5 });
    // Boots 2..5: still shut, counting down.
    for (const expected of [4, 3, 2, 1]) {
      const b = await boot();
      expect({ qwen: b.qwen, nextIn: b.nextIn }).toEqual({ qwen: false, nextIn: expected });
    }
    // Boot 6 is the amnesty: the gate opens for exactly this session.
    const amnesty = await boot();
    expect({ qwen: amnesty.qwen, retrying: amnesty.retrying }).toEqual({ qwen: true, retrying: true });
    expect(mockStore[K.genPending]).toBe('1');
    expect(amnesty.reason.includes('periodic attempt')).toBe(true);
  });

  it('a failed amnesty relapses with a DOUBLED backoff, and the doubling is capped', async () => {
    benchedDevice();
    for (let i = 0; i < 6; i++) await boot();          // through the first amnesty
    expect(mockStore[K.genPending]).toBe('1');
    // Next boot: still benched with the flag set → the attempt did not land.
    const relapse = await boot();
    expect({ qwen: relapse.qwen, nextIn: relapse.nextIn }).toEqual({ qwen: false, nextIn: 10 });
    expect(mockStore[K.genBackoff]).toBe('10');
    expect(mockStore[K.genPending]).toBeUndefined();
    // And it keeps doubling to the ceiling rather than forever.
    mockStore[K.genBackoff] = '40';
    mockStore[K.genPending] = '1';
    await boot();
    expect(Number(mockStore[K.genBackoff])).toBe(40);
  });

  it('⚠⚠ an amnesty that LOADS heals the device: the gate stays open and the flag clears', async () => {
    benchedDevice();
    for (let i = 0; i < 6; i++) await boot();
    expect(mockStore[K.genPending]).toBe('1');
    // The session loaded the model — markMLInitSucceeded zeroes the count and
    // clears the disable, which is what "recovered" means here.
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.loadMLHealth();
      await ml.markMLInitSucceeded();
    });
    const after = await boot();
    expect(after.qwen).toBe(true);
    expect(after.capability).toBeNull();               // nothing to tell the player
    expect(mockStore[K.genPending]).toBeUndefined();   // no relapse pending
  });

  it('the two ladders are independent — the general amnesty never touches the completion guard keys', async () => {
    benchedDevice();
    for (let i = 0; i < 7; i++) await boot();
    expect(mockStore[K.genAt]).toBeDefined();
    expect(mockStore[K.qwenAt]).toBeUndefined();
    expect(mockStore[K.qwenPending]).toBeUndefined();
  });

  it('RELOAD AI wipes the general ladder too, so the button really is a clean slate', async () => {
    benchedDevice();
    await boot();
    expect(mockStore[K.genAt]).toBeDefined();
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.loadMLHealth();
      await ml.resetMLHealth();
    });
    for (const k of [K.genAt, K.genPending, K.genBackoff, K.crash, K.disabled]) {
      expect({ key: k, value: mockStore[k] }).toEqual({ key: k, value: undefined });
    }
  });
});

describe('OTA-1705 — the player is told, in their language', () => {
  it('⚠⚠ a benched device gets one sentence: what it is doing, the way back, and that nothing is closed', async () => {
    benchedDevice();
    const b = await boot();
    const line = b.capability!;
    expect(line).toBeTruthy();
    expect(line.includes('written lines rather than the generative model')).toBe(true);
    expect(line.includes('try it again on its own in 5 launches')).toBe(true);
    expect(line.includes('RELOAD AI')).toBe(true);
    expect(line.includes('Nothing in the game is closed to you')).toBe(true);
  });

  it('a healthy device is told nothing at all', async () => {
    mockStore[K.succeeded] = '2026-09-06T01:00:00.000Z';
    const b = await boot();
    expect({ qwen: b.qwen, capability: b.capability }).toEqual({ qwen: true, capability: null });
  });

  it('the sentence reaches the SYSTEM channel from the skip branch, not just the debug one', () => {
    const slice = src('app', 'state', 'slices', 'aiLifecycleSlice.ts');
    expect(slice.includes('const cap = deviceCapabilityLine();')).toBe(true);
    expect(slice.includes("if (cap) get().appendLog('system', cap);")).toBe(true);
    // It sits inside the gate's early return, after the debug line and before it.
    const at = slice.indexOf('const cap = deviceCapabilityLine();');
    expect(at).toBeGreaterThan(slice.indexOf('qwen: SKIPPED'));
    expect(at).toBeLessThan(slice.indexOf('set({ qwenStatus: \'downloading\''));
  });
});
