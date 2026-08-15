// OTA-1084 — THE LOG-EXPORT REINIT LOOP.
//
// The owner's 11-part device log ends with the watchdog burning 10+
// reinit attempts in a minute, status 'idle' every time. Root cause:
// exporting chunks means bouncing the app (copy → switch away to paste
// → return). Every switch-away disposes the ~400MB context (background
// → shutdownQwen → status 'idle'); every return let the 5s recovering
// cadence kick ANOTHER full context load, which the next bounce killed.
// Two engine defects made it worse:
//   1. forceReinitialize() reset status to 'idle' BEFORE initialize(),
//      defeating the 'already loading' guard — a dispose landing mid-load
//      let a second concurrent 400MB context load stack on the first.
//   2. A load that a dispose() interrupted still installed itself as
//      'ready' when it landed — resurrecting a full context in the
//      background that the dispose had just paid to free.
// Engine fixes here: initInFlight (one load at a time, joiners get the
// same promise) + lifecycleGen (dispose marks in-flight loads stale;
// stale results are torn down, status stays 'idle').
// Watchdog fixes (source-locked below): never kick while the app is
// backgrounded, and back off exponentially after the free retries.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve(); }),
    },
  };
});

jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 100 })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: 'file:///tmp/qwen.gguf' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

import * as fs from 'fs';
import * as path from 'path';
import { QwenGenerativeEngine } from '../app/ai/generation/QwenGenerativeEngine';

type InitOpts = NonNullable<Parameters<QwenGenerativeEngine['initialize']>[0]>;

/** Fake runtime whose initialize() blocks until the test releases it. */
class GatedRuntime {
  private alive = false;
  private release!: () => void;
  private gate = new Promise<void>((res) => { this.release = res; });
  initCalls = 0;
  disposeCalls = 0;
  initialize = jest.fn(async () => { this.initCalls += 1; await this.gate; this.alive = true; });
  isReady() { return this.alive; }
  dispose = jest.fn(async () => { this.disposeCalls += 1; this.alive = false; });
  generate = jest.fn(async () => '{}');
  finishLoad() { this.release(); }
}

const optsFor = (runtime: GatedRuntime): InitOpts => ({
  runtime: runtime as unknown as InitOpts['runtime'],
  downloader: { ensureQwenGguf: jest.fn(async () => '/tmp/qwen.gguf') },
} as InitOpts);

describe('OTA-1084 — one context load at a time', () => {
  it('forceReinitialize during an in-flight load JOINS it instead of stacking a second load', async () => {
    const runtime = new GatedRuntime();
    const engine = new QwenGenerativeEngine();
    const first = engine.forceReinitialize(optsFor(runtime));
    // The bounce: a second kick lands while the first load is still going.
    const second = engine.forceReinitialize(optsFor(new GatedRuntime()));
    runtime.finishLoad();
    await Promise.all([first, second]);
    expect(runtime.initCalls).toBe(1); // the joiner did not start its own load
    expect(engine.isReady()).toBe(true);
  });

  it('initialize during an in-flight load joins it too', async () => {
    const runtime = new GatedRuntime();
    const engine = new QwenGenerativeEngine();
    const first = engine.initialize(optsFor(runtime));
    const second = engine.initialize(optsFor(new GatedRuntime()));
    runtime.finishLoad();
    await Promise.all([first, second]);
    expect(runtime.initCalls).toBe(1);
    expect(engine.isReady()).toBe(true);
  });
});

/** Spin microtasks until the gated runtime's load has actually started —
 *  dispose() marks staleness synchronously, so the interesting case is a
 *  dispose landing while runtime.initialize is genuinely in flight. */
async function untilLoading(runtime: GatedRuntime): Promise<void> {
  for (let i = 0; i < 50 && runtime.initCalls === 0; i++) await Promise.resolve();
  expect(runtime.initCalls).toBe(1);
}

describe('OTA-1084 — dispose() mid-load wins', () => {
  it('a load interrupted by dispose is discarded: status stays idle, the fresh context is torn down', async () => {
    const runtime = new GatedRuntime();
    const engine = new QwenGenerativeEngine();
    const load = engine.initialize(optsFor(runtime));
    await untilLoading(runtime);
    // App backgrounds mid-load: shutdownQwen → dispose().
    await engine.dispose();
    runtime.finishLoad();
    await load;
    // The straggler must NOT resurrect a ~400MB context in the background.
    expect(engine.getStatus()).toBe('idle');
    expect(engine.isReady()).toBe(false);
    expect(runtime.disposeCalls).toBe(1); // the fresh context was released
  });

  it('after a discarded stale load, the NEXT reinit works normally', async () => {
    const stale = new GatedRuntime();
    const engine = new QwenGenerativeEngine();
    const load = engine.initialize(optsFor(stale));
    await untilLoading(stale);
    await engine.dispose();
    stale.finishLoad();
    await load;
    const fresh = new GatedRuntime();
    const revive = engine.forceReinitialize(optsFor(fresh));
    fresh.finishLoad();
    await revive;
    expect(engine.isReady()).toBe(true);
    expect(fresh.initCalls).toBe(1);
  });
});

describe('OTA-1084 — SOURCE LOCKS (watchdog rules)', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const store = read('app', 'state', 'gameStore.ts');
  const engine = read('app', 'ai', 'generation', 'QwenGenerativeEngine.ts');

  it('rule 1 — no revival kicks while the app is backgrounded, logged once per stretch', () => {
    expect(store).toMatch(/const s = AppState\.currentState;/);
    expect(store).toMatch(/appActive = s !== 'background' && s !== 'inactive';/);
    expect(store).toMatch(/holding revival until foreground/);
    expect(store).toMatch(/qwenHeldWhileBackgroundLogged/);
  });

  it('rule 2 — free retries then exponential backoff capped at the healthy interval', () => {
    expect(store).toMatch(/QWEN_WATCHDOG_FREE_RETRIES = 4/);
    expect(store).toMatch(/Math\.min\(QWEN_WATCHDOG_HEALTHY_MS, QWEN_WATCHDOG_RECOVERING_MS \* 2 \*\* qwenBackoffLevel\)/);
    expect(store).toMatch(/if \(qwenReinitAttempts > QWEN_WATCHDOG_FREE_RETRIES\) qwenBackoffLevel \+= 1;/);
    expect(store).toMatch(/schedule\(healthy \? QWEN_WATCHDOG_HEALTHY_MS : qwenRecoveringDelayMs\(\)\)/);
  });

  it('the backoff resets on recovery AND on a fresh return to foreground', () => {
    // ⚠ RETARGETED BY OTA-1173, NOT WEAKENED — and the CLAIM in this test's own name is
    // what survives. "A fresh return to foreground" still resets the ladder; OTA-1173 only
    // made "fresh return" mean an actual one. iOS fires `active` for a notification
    // banner, a Control Center pull and a peek at the app switcher, so the old spelling
    // reset the ladder — and bought a ~400MB reload — on incidental twitches. The owner's
    // freeze log caught three, each ~350ms after a "holding revival" line.
    expect(store).toMatch(/if \(next === 'background'\) \{[\s\S]{0,200}?qwenTrulyBackgrounded = true;/);
    expect(store).toMatch(/if \(!qwenTrulyBackgrounded\) return;/);
    // The reset itself is intact behind that gate — this is a narrower trigger, not a
    // removed behaviour.
    const fg = store.indexOf('if (!qwenTrulyBackgrounded) return;');
    const gated = store.slice(fg, fg + 700);
    expect(gated).toMatch(/qwenBackoffLevel = 0;/);
    expect(gated).toMatch(/tick\(\);/);
    // Recovery path zeroes the whole ledger.
    const start = store.indexOf('function runQwenHealthCheck(');
    const body = store.slice(start, start + 2500);
    expect(body).toMatch(/qwenReinitAttempts = 0;\s*\n\s*qwenBackoffLevel = 0;/);
  });

  it('engine — dispose marks in-flight loads stale; joiners share one load', () => {
    expect(engine).toMatch(/this\.lifecycleGen \+= 1;/);
    expect(engine).toMatch(/if \(this\.initInFlight\) return this\.initInFlight;/);
    expect(engine).toMatch(/if \(this\.lifecycleGen !== gen\)/);
  });
});
