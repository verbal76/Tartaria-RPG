import {
  QwenGenerativeEngine,
  DEFAULT_QWEN_MODEL_ID,
  type ChatMessage,
} from '../app/ai/generation/QwenGenerativeEngine';
import { LlamaRuntime } from '../app/ai/generation/LlamaRuntime';

// ---------------------------------------------------------------------------
// Test fakes
// ---------------------------------------------------------------------------

/**
 * A fake LlamaRuntime that records calls and produces canned output instead
 * of touching the native module. Constructed inline in tests as the runtime
 * passed via opts.runtime.
 */
function makeFakeRuntime(opts: {
  initShouldThrow?: Error;
  generateShouldThrow?: Error;
  generateReturns?: string;
  /** When set, emits these tokens through the onToken callback. */
  streamTokens?: string[];
} = {}): LlamaRuntime {
  const fake: Partial<LlamaRuntime> & { calls: { init: number; generate: number; dispose: number } } = {
    calls: { init: 0, generate: 0, dispose: 0 },
    isReady() { return (fake as { _ready?: boolean })._ready === true; },
    getModelPath() { return '/fake/model.gguf'; },
    async initialize(_o) {
      fake.calls.init++;
      if (opts.initShouldThrow) throw opts.initShouldThrow;
      (fake as { _ready?: boolean })._ready = true;
    },
    async generate(_messages, genOpts) {
      fake.calls.generate++;
      if (opts.generateShouldThrow) throw opts.generateShouldThrow;
      if (opts.streamTokens && genOpts?.onToken) {
        for (const tok of opts.streamTokens) genOpts.onToken(tok);
      }
      return opts.generateReturns ?? '';
    },
    async dispose() {
      fake.calls.dispose++;
      (fake as { _ready?: boolean })._ready = false;
    },
  };
  return fake as unknown as LlamaRuntime;
}

function makeFakeDownloader(opts: { shouldThrow?: Error; path?: string } = {}) {
  return {
    calls: 0,
    progressCalls: [] as number[],
    async ensureQwenGguf(o: { url?: string; onProgress?: (f: number) => void }) {
      this.calls++;
      o.onProgress?.(0.5);
      o.onProgress?.(1);
      if (opts.shouldThrow) throw opts.shouldThrow;
      return opts.path ?? '/fake/model.gguf';
    },
  };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('QwenGenerativeEngine — initial state', () => {
  it('starts idle and not ready', () => {
    const engine = new QwenGenerativeEngine();
    expect(engine.getStatus()).toBe('idle');
    expect(engine.isReady()).toBe(false);
    expect(engine.getDownloadFraction()).toBe(0);
    expect(engine.getLastError()).toBeNull();
    expect(engine.getModelId()).toBe(DEFAULT_QWEN_MODEL_ID);
  });

  it('exposes the GGUF label as the default model id', () => {
    expect(DEFAULT_QWEN_MODEL_ID).toMatch(/Qwen2\.5-0\.5B-Instruct/);
    expect(DEFAULT_QWEN_MODEL_ID).toMatch(/Q4_K_M/);
  });
});

// ---------------------------------------------------------------------------
// initialize — happy path + failure modes
// ---------------------------------------------------------------------------

describe('QwenGenerativeEngine — initialize success', () => {
  it('moves downloading → loading → ready and emits onProgress', async () => {
    const stages: Array<[string, number]> = [];
    const runtime = makeFakeRuntime();
    const downloader = makeFakeDownloader();
    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      downloader,
      runtime,
      onProgress: (status, frac) => stages.push([status, frac]),
    });
    expect(engine.getStatus()).toBe('ready');
    expect(engine.isReady()).toBe(true);
    expect(engine.getDownloadFraction()).toBe(1);
    const statusOrder = stages.map(([s]) => s);
    expect(statusOrder[0]).toBe('downloading');
    expect(statusOrder).toContain('loading');
    expect(statusOrder[statusOrder.length - 1]).toBe('ready');
    expect(downloader.calls).toBe(1);
  });

  it('is idempotent — second initialize while ready is a no-op', async () => {
    const runtime = makeFakeRuntime() as LlamaRuntime & { calls: { init: number } };
    const downloader = makeFakeDownloader();
    const engine = new QwenGenerativeEngine();
    await engine.initialize({ downloader, runtime });
    await engine.initialize({ downloader, runtime });
    await engine.initialize({ downloader, runtime });
    expect(runtime.calls.init).toBe(1);
    expect(downloader.calls).toBe(1);
  });

  it('skips the downloader when modelPath is provided directly', async () => {
    const runtime = makeFakeRuntime();
    const downloader = makeFakeDownloader();
    const engine = new QwenGenerativeEngine();
    await engine.initialize({ downloader, runtime, modelPath: '/already/here.gguf' });
    expect(engine.getStatus()).toBe('ready');
    expect(downloader.calls).toBe(0);
  });
});

describe('QwenGenerativeEngine — initialize failure paths', () => {
  it('moves to failed when the download throws', async () => {
    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      downloader: makeFakeDownloader({ shouldThrow: new Error('network down') }),
      runtime: makeFakeRuntime(),
    });
    expect(engine.getStatus()).toBe('failed');
    expect(engine.isReady()).toBe(false);
    expect(engine.getLastError()).toMatch(/GGUF download failed.*network down/);
  });

  it('moves to failed when the llama context init throws', async () => {
    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      downloader: makeFakeDownloader(),
      runtime: makeFakeRuntime({ initShouldThrow: new Error('GGUF corrupt') }),
    });
    expect(engine.getStatus()).toBe('failed');
    expect(engine.getLastError()).toMatch(/Load failed.*GGUF corrupt/);
  });
});

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------

describe('QwenGenerativeEngine — generate', () => {
  it('throws when called before initialize', async () => {
    const engine = new QwenGenerativeEngine();
    await expect(engine.generate([{ role: 'user', content: 'hi' }])).rejects.toThrow(/not ready/);
  });

  it('forwards messages + sampling opts to the runtime and returns text', async () => {
    const runtime = makeFakeRuntime({ generateReturns: 'Quiet stones.' });
    const engine = new QwenGenerativeEngine();
    await engine.initialize({ downloader: makeFakeDownloader(), runtime });
    const out = await engine.generate(
      [
        { role: 'system', content: 'You are the Arbiter.' },
        { role: 'user', content: 'look around' },
      ],
      { maxNewTokens: 50, temperature: 0.5 },
    );
    expect(out).toBe('Quiet stones.');
  });
});

// ---------------------------------------------------------------------------
// stream
// ---------------------------------------------------------------------------

describe('QwenGenerativeEngine — stream', () => {
  it('emits tokens via the onToken callback and returns the assembled text', async () => {
    const runtime = makeFakeRuntime({
      streamTokens: ['The ', 'mud ', 'hisses.'],
      generateReturns: 'The mud hisses.',
    });
    const engine = new QwenGenerativeEngine();
    await engine.initialize({ downloader: makeFakeDownloader(), runtime });
    const tokens: string[] = [];
    const out = await engine.stream(
      [{ role: 'user', content: 'look' }],
      (t) => tokens.push(t),
    );
    expect(tokens).toEqual(['The ', 'mud ', 'hisses.']);
    expect(out).toBe('The mud hisses.');
  });

  it('throws cleanly when not ready', async () => {
    const engine = new QwenGenerativeEngine();
    await expect(
      engine.stream([{ role: 'user', content: 'x' }], () => undefined),
    ).rejects.toThrow(/not ready/);
  });
});

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

describe('QwenGenerativeEngine — dispose', () => {
  it('moves status back to idle and tears down the runtime', async () => {
    const runtime = makeFakeRuntime() as LlamaRuntime & { calls: { dispose: number } };
    const engine = new QwenGenerativeEngine();
    await engine.initialize({ downloader: makeFakeDownloader(), runtime });
    expect(engine.isReady()).toBe(true);
    await engine.dispose();
    expect(engine.getStatus()).toBe('idle');
    expect(engine.isReady()).toBe(false);
    expect(runtime.calls.dispose).toBe(1);
  });
});

// Reference imports so TS doesn't complain about unused imports for types
const _unusedChat: ChatMessage = { role: 'user', content: '' };
void _unusedChat;
