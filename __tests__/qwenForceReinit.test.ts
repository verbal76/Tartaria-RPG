// OTA-222 — verifies the dormant-detection + forceReinitialize path.
//
// Android can kill the LlamaContext to reclaim memory; when that
// happens, QwenGenerativeEngine.status stays 'ready' but
// runtime.isReady() returns false. Calling initialize() short-
// circuits because status is still 'ready', leaving the engine
// permanently dormant.
//
// isDormant() detects this case (status === 'ready' AND runtime is
// gone or runtime.isReady() returns false). forceReinitialize()
// resets status to 'idle' so initialize() will actually re-run.

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
  private alive = true;
  initialize = jest.fn(async () => {});
  isReady() { return this.alive; }
  /** Simulate Android killing the context. */
  kill() { this.alive = false; }
  generate = jest.fn(async () => '{}');
  release = jest.fn(async () => { this.alive = false; });
}

describe('OTA-222 — isDormant + forceReinitialize', () => {
  it('a fresh engine is not dormant', () => {
    const engine = new QwenGenerativeEngine();
    expect(engine.isDormant()).toBe(false);
  });

  it('after init, isReady is true and isDormant is false', async () => {
    const runtime = new FakeRuntime();
    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      runtime: runtime as unknown as Parameters<QwenGenerativeEngine['initialize']>[0]['runtime'],
      downloader: { ensureQwenGguf: jest.fn(async () => '/tmp/qwen.gguf') },
    } as Parameters<QwenGenerativeEngine['initialize']>[0]);
    expect(engine.isReady()).toBe(true);
    expect(engine.isDormant()).toBe(false);
  });

  it('after the runtime dies, isReady=false and isDormant=true', async () => {
    const runtime = new FakeRuntime();
    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      runtime: runtime as unknown as Parameters<QwenGenerativeEngine['initialize']>[0]['runtime'],
      downloader: { ensureQwenGguf: jest.fn(async () => '/tmp/qwen.gguf') },
    } as Parameters<QwenGenerativeEngine['initialize']>[0]);
    runtime.kill(); // Android OOM-killed the LlamaContext
    expect(engine.isReady()).toBe(false);
    expect(engine.isDormant()).toBe(true);
  });

  it('forceReinitialize resets the engine and runs a fresh init', async () => {
    const runtime1 = new FakeRuntime();
    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      runtime: runtime1 as unknown as Parameters<QwenGenerativeEngine['initialize']>[0]['runtime'],
      downloader: { ensureQwenGguf: jest.fn(async () => '/tmp/qwen.gguf') },
    } as Parameters<QwenGenerativeEngine['initialize']>[0]);
    runtime1.kill();
    expect(engine.isDormant()).toBe(true);
    const runtime2 = new FakeRuntime();
    await engine.forceReinitialize({
      runtime: runtime2 as unknown as Parameters<QwenGenerativeEngine['initialize']>[0]['runtime'],
      downloader: { ensureQwenGguf: jest.fn(async () => '/tmp/qwen.gguf') },
    } as Parameters<QwenGenerativeEngine['initialize']>[0]);
    expect(engine.isReady()).toBe(true);
    expect(engine.isDormant()).toBe(false);
  });
});
