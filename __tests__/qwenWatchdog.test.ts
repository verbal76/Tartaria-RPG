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
