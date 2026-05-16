import {
  QwenGenerativeEngine,
  __setTransformersModuleForTests,
  __resetTransformersLoaderForTests,
  DEFAULT_QWEN_MODEL_ID,
  DEFAULT_QWEN_DTYPE,
  type ChatMessage,
} from '../app/ai/generation/QwenGenerativeEngine';

afterEach(() => {
  __resetTransformersLoaderForTests();
});

describe('QwenGenerativeEngine — initial state', () => {
  it('starts idle and not ready', () => {
    const engine = new QwenGenerativeEngine();
    expect(engine.getStatus()).toBe('idle');
    expect(engine.isReady()).toBe(false);
    expect(engine.getDownloadFraction()).toBe(0);
    expect(engine.getLastError()).toBeNull();
    expect(engine.getModelId()).toBe(DEFAULT_QWEN_MODEL_ID);
  });

  it('exposes the expected defaults', () => {
    expect(DEFAULT_QWEN_MODEL_ID).toBe('onnx-community/Qwen2.5-0.5B-Instruct');
    expect(DEFAULT_QWEN_DTYPE).toBe('q4');
  });
});

describe('QwenGenerativeEngine — initialize failure paths', () => {
  it('moves to failed when transformers.js is not available', async () => {
    __setTransformersModuleForTests(null);
    const engine = new QwenGenerativeEngine();
    await engine.initialize();
    expect(engine.getStatus()).toBe('failed');
    expect(engine.isReady()).toBe(false);
    expect(engine.getLastError()).toMatch(/not available/i);
  });

  it('moves to failed when pipeline() throws', async () => {
    const fakeMod = {
      pipeline: jest.fn().mockRejectedValue(new Error('model corrupt')),
      TextStreamer: class {} as any,
      env: {},
    };
    __setTransformersModuleForTests(fakeMod);
    const engine = new QwenGenerativeEngine();
    await engine.initialize();
    expect(engine.getStatus()).toBe('failed');
    expect(engine.getLastError()).toMatch(/model corrupt/);
  });

  it('honors a custom modelId / dtype passed to initialize', async () => {
    const fakeMod = {
      pipeline: jest.fn().mockResolvedValue({
        tokenizer: {},
      }),
      TextStreamer: class {} as any,
      env: {},
    };
    __setTransformersModuleForTests(fakeMod);
    const engine = new QwenGenerativeEngine();
    await engine.initialize({ modelId: 'onnx-community/Qwen2.5-1.5B', dtype: 'q8' });
    expect(engine.getStatus()).toBe('ready');
    expect(engine.getModelId()).toBe('onnx-community/Qwen2.5-1.5B');
    const [task, modelId, opts] = fakeMod.pipeline.mock.calls[0]!;
    expect(task).toBe('text-generation');
    expect(modelId).toBe('onnx-community/Qwen2.5-1.5B');
    expect((opts as { dtype: string }).dtype).toBe('q8');
  });
});

describe('QwenGenerativeEngine — successful initialize', () => {
  it('moves through downloading → ready and emits onProgress', async () => {
    const stages: Array<[string, number]> = [];
    const pipelineMock = jest.fn().mockImplementation(async (_task, _id, opts) => {
      const cb = (opts as { progress_callback?: (d: unknown) => void }).progress_callback;
      cb?.({ status: 'progress', progress: 25 });
      cb?.({ status: 'progress', progress: 75 });
      cb?.({ status: 'done', progress: 100 });
      return { tokenizer: {} };
    });
    __setTransformersModuleForTests({
      pipeline: pipelineMock,
      TextStreamer: class {} as any,
      env: {},
    });

    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      onProgress: (status, frac) => stages.push([status, frac]),
    });

    expect(engine.getStatus()).toBe('ready');
    expect(engine.isReady()).toBe(true);
    expect(engine.getDownloadFraction()).toBe(1);

    const statusOrder = stages.map(([s]) => s);
    expect(statusOrder[0]).toBe('downloading');
    expect(statusOrder).toContain('loading');
    expect(statusOrder[statusOrder.length - 1]).toBe('ready');
  });

  it('is idempotent — second initialize while ready is a no-op', async () => {
    const pipelineMock = jest.fn().mockResolvedValue({ tokenizer: {} });
    __setTransformersModuleForTests({
      pipeline: pipelineMock,
      TextStreamer: class {} as any,
      env: {},
    });
    const engine = new QwenGenerativeEngine();
    await engine.initialize();
    await engine.initialize();
    await engine.initialize();
    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });
});

describe('QwenGenerativeEngine — generate', () => {
  function makeReadyEngine(pipeImpl: jest.Mock): QwenGenerativeEngine {
    const pipelineMock = jest.fn().mockImplementation(async () => {
      const fn = (msgs: unknown, opts: unknown) => pipeImpl(msgs, opts);
      (fn as unknown as { tokenizer: unknown }).tokenizer = {};
      return fn;
    });
    __setTransformersModuleForTests({
      pipeline: pipelineMock,
      TextStreamer: class {
        constructor(_t: unknown, _o: unknown) {}
      } as any,
      env: {},
    });
    return new QwenGenerativeEngine();
  }

  it('throws when called before initialize', async () => {
    const engine = new QwenGenerativeEngine();
    await expect(engine.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      /not ready/,
    );
  });

  it('passes through to the pipeline and extracts string-shaped text', async () => {
    const pipeImpl = jest.fn().mockResolvedValue([{ generated_text: '  Quiet stones.  ' }]);
    const engine = makeReadyEngine(pipeImpl);
    await engine.initialize();

    const out = await engine.generate(
      [
        { role: 'system', content: 'You are the Arbiter.' },
        { role: 'user', content: 'look around' },
      ],
      { maxNewTokens: 50, temperature: 0.5 },
    );
    expect(out).toBe('Quiet stones.');
    const [messages, opts] = pipeImpl.mock.calls[0]!;
    expect(messages).toEqual([
      { role: 'system', content: 'You are the Arbiter.' },
      { role: 'user', content: 'look around' },
    ]);
    expect((opts as { max_new_tokens: number }).max_new_tokens).toBe(50);
    expect((opts as { temperature: number }).temperature).toBe(0.5);
  });

  it('extracts assistant text from chat-shaped output', async () => {
    const chatShape = [
      {
        generated_text: [
          { role: 'system', content: 'You are the Arbiter.' },
          { role: 'user', content: 'go north' },
          { role: 'assistant', content: 'The mud parts under your boots.' },
        ] as ChatMessage[],
      },
    ];
    const pipeImpl = jest.fn().mockResolvedValue(chatShape);
    const engine = makeReadyEngine(pipeImpl);
    await engine.initialize();
    const out = await engine.generate([{ role: 'user', content: 'go north' }]);
    expect(out).toBe('The mud parts under your boots.');
  });

  it('returns empty string when the pipeline returns nothing useful', async () => {
    const pipeImpl = jest.fn().mockResolvedValue([{ generated_text: null }]);
    const engine = makeReadyEngine(pipeImpl);
    await engine.initialize();
    const out = await engine.generate([{ role: 'user', content: 'x' }]);
    expect(out).toBe('');
  });
});

describe('QwenGenerativeEngine — stream', () => {
  it('assembles tokens emitted via the streamer callback', async () => {
    // Capture the callback the engine hands to TextStreamer so the fake pipe
    // can replay tokens through it.
    let captured: ((token: string) => void) | null = null;
    class FakeStreamer {
      constructor(_t: unknown, opts: { callback_function?: (s: string) => void }) {
        captured = opts.callback_function ?? null;
      }
    }
    const pipeImpl = jest.fn().mockImplementation(async () => {
      ['The ', 'mud ', 'hisses.'].forEach((tok) => captured?.(tok));
      return [{ generated_text: 'The mud hisses.' }];
    });
    const pipelineMock = jest.fn().mockImplementation(async () => {
      const fn = (msgs: unknown, opts: unknown) => pipeImpl(msgs, opts);
      (fn as unknown as { tokenizer: unknown }).tokenizer = {};
      return fn;
    });
    __setTransformersModuleForTests({
      pipeline: pipelineMock,
      TextStreamer: FakeStreamer as any,
      env: {},
    });

    const engine = new QwenGenerativeEngine();
    await engine.initialize();

    const tokens: string[] = [];
    const out = await engine.stream(
      [{ role: 'user', content: 'look' }],
      (t) => tokens.push(t),
    );

    expect(tokens).toEqual(['The ', 'mud ', 'hisses.']);
    expect(out).toBe('The mud hisses.');
  });

  it('falls back to extractAssistantText if the streamer never fires', async () => {
    class SilentStreamer {
      constructor(_t: unknown, _o: unknown) {}
    }
    const pipeImpl = jest.fn().mockResolvedValue([{ generated_text: 'fallback prose' }]);
    const pipelineMock = jest.fn().mockImplementation(async () => {
      const fn = (msgs: unknown, opts: unknown) => pipeImpl(msgs, opts);
      (fn as unknown as { tokenizer: unknown }).tokenizer = {};
      return fn;
    });
    __setTransformersModuleForTests({
      pipeline: pipelineMock,
      TextStreamer: SilentStreamer as any,
      env: {},
    });
    const engine = new QwenGenerativeEngine();
    await engine.initialize();
    const out = await engine.stream(
      [{ role: 'user', content: 'x' }],
      () => undefined,
    );
    expect(out).toBe('fallback prose');
  });
});

describe('QwenGenerativeEngine — dispose', () => {
  it('moves status back to idle and clears the pipe', async () => {
    const pipelineMock = jest.fn().mockResolvedValue({
      tokenizer: {},
      dispose: jest.fn().mockResolvedValue(undefined),
    });
    __setTransformersModuleForTests({
      pipeline: pipelineMock,
      TextStreamer: class {} as any,
      env: {},
    });
    const engine = new QwenGenerativeEngine();
    await engine.initialize();
    expect(engine.isReady()).toBe(true);
    await engine.dispose();
    expect(engine.getStatus()).toBe('idle');
    expect(engine.isReady()).toBe(false);
  });
});
