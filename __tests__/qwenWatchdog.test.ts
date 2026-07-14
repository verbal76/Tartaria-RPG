// OTA-223 — verifies the background Qwen dormancy watchdog mechanism.
// Tested via the same isDormant() / forceReinitialize() surface the
// watchdog uses internally; the watchdog itself is glued in gameStore
// and triggered by setInterval (60s in prod, hard to integration-
// test without a full store harness).
//
// What we verify here:
//   - A dormant engine returns true from isDormant().
//   - Calling forceReinitialize() resets status to 'idle' so the
//     re-init can complete.
//   - The cycle (dormant → kick → ready) works for many iterations
//     so the watchdog can run for the life of the session without
//     leaking state.

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

import { QwenGenerativeEngine } from '../app/ai/generation/QwenGenerativeEngine';

class FakeRuntime {
  alive = true;
  initialize = jest.fn(async () => {});
  isReady() { return this.alive; }
  kill() { this.alive = false; }
  generate = jest.fn(async () => '{}');
  release = jest.fn(async () => { this.alive = false; });
}

const initOpts = (runtime: FakeRuntime) => ({
  runtime: runtime as unknown as Parameters<QwenGenerativeEngine['initialize']>[0]['runtime'],
  downloader: { ensureQwenGguf: jest.fn(async () => '/tmp/qwen.gguf') },
}) as Parameters<QwenGenerativeEngine['initialize']>[0];

describe('OTA-223 — Qwen dormancy detection + recovery cycle (watchdog primitives)', () => {
  it('a watchdog tick on a healthy engine does nothing', async () => {
    const runtime = new FakeRuntime();
    const engine = new QwenGenerativeEngine();
    await engine.initialize(initOpts(runtime));
    // Simulate the watchdog tick.
    expect(engine.isDormant()).toBe(false);
    // forceReinitialize wouldn't fire — verify by counting init calls.
    expect(runtime.initialize).toHaveBeenCalledTimes(1);
  });

  it('a watchdog tick on a dormant engine triggers re-init', async () => {
    const runtime1 = new FakeRuntime();
    const engine = new QwenGenerativeEngine();
    await engine.initialize(initOpts(runtime1));
    runtime1.kill();
    expect(engine.isDormant()).toBe(true);
    const runtime2 = new FakeRuntime();
    await engine.forceReinitialize(initOpts(runtime2));
    expect(engine.isReady()).toBe(true);
    expect(engine.isDormant()).toBe(false);
  });

  // OTA-1083 regression — the whole-session qwen-not-ready bug (2026-07-13 log).
  // A FAILED revival attempt lands the engine in status='failed', where
  // isDormant() returns FALSE — so the OLD watchdog (which only re-kicked when
  // isDormant() was true) short-circuited forever and never retried. The engine
  // must still be recoverable by a later forceReinitialize (which the broadened
  // watchdog now issues from any not-ready/not-loading state).
  it('a FAILED reinit lands in "failed" (NOT dormant) and stays recoverable', async () => {
    const good = new FakeRuntime();
    const engine = new QwenGenerativeEngine();
    await engine.initialize(initOpts(good));
    expect(engine.isReady()).toBe(true);
    good.kill();
    expect(engine.isDormant()).toBe(true);

    // First revival FAILS (native context alloc throws under memory pressure).
    const bad = new FakeRuntime();
    bad.initialize = jest.fn(async () => { throw new Error('OOM: context alloc failed'); });
    await engine.forceReinitialize(initOpts(bad));

    // Now stuck: not ready, and CRITICALLY not dormant (status is 'failed', and
    // isDormant() only fires on status==='ready'). This is exactly the blind
    // spot the old watchdog fell into.
    expect(engine.isReady()).toBe(false);
    expect(engine.getStatus()).toBe('failed');
    expect(engine.isDormant()).toBe(false);

    // The broadened watchdog re-kicks anyway; a later reinit recovers cleanly.
    const good2 = new FakeRuntime();
    await engine.forceReinitialize(initOpts(good2));
    expect(engine.isReady()).toBe(true);
    expect(engine.getStatus()).toBe('ready');
  });

  it('survives many dormant → recover cycles', async () => {
    const engine = new QwenGenerativeEngine();
    for (let i = 0; i < 5; i++) {
      const runtime = new FakeRuntime();
      if (i === 0) {
        await engine.initialize(initOpts(runtime));
      } else {
        await engine.forceReinitialize(initOpts(runtime));
      }
      expect(engine.isReady()).toBe(true);
      runtime.kill();
      expect(engine.isDormant()).toBe(true);
    }
  });
});
