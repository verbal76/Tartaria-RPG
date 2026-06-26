// Dev_engine_PC — the desktop generation backend conforms to ILlamaRuntime and
// drives an OpenAI-compatible local server. Mocks fetch so it needs no real server.

import { HttpLlamaRuntime } from '../app/ai/generation/HttpLlamaRuntime';

describe('HttpLlamaRuntime (desktop backend)', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  test('initialize() marks ready when the server answers /models', async () => {
    global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    const rt = new HttpLlamaRuntime();
    expect(rt.isReady()).toBe(false);
    await rt.initialize({ modelPath: '' });
    expect(rt.isReady()).toBe(true);
  });

  test('initialize() stays not-ready when the server is unreachable', async () => {
    global.fetch = jest.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const rt = new HttpLlamaRuntime();
    await rt.initialize({ modelPath: '' });
    expect(rt.isReady()).toBe(false);
  });

  test('generate() posts chat messages and returns the assistant content', async () => {
    let captured: { url: string; body: any } | null = null;
    global.fetch = jest.fn(async (url: string, init: any) => {
      captured = { url, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '  The fog rolls in.  ' } }] }) };
    }) as unknown as typeof fetch;

    const rt = new HttpLlamaRuntime({ baseUrl: 'http://127.0.0.1:11434/v1/', model: 'qwen-test' });
    const tokens: string[] = [];
    const out = await rt.generate(
      [{ role: 'system', content: 'be terse' }, { role: 'user', content: 'describe the seam' }],
      { maxTokens: 64, temperature: 0.5, onToken: (t) => tokens.push(t) },
    );

    expect(out).toBe('The fog rolls in.'); // trimmed
    expect(tokens).toEqual(['The fog rolls in.']);
    expect(captured!.url).toBe('http://127.0.0.1:11434/v1/chat/completions'); // trailing slash normalized
    expect(captured!.body.model).toBe('qwen-test');
    expect(captured!.body.max_tokens).toBe(64);
    expect(captured!.body.messages).toHaveLength(2);
    expect(captured!.body.messages[1]).toEqual({ role: 'user', content: 'describe the seam' });
  });

  test('generate() throws on a non-ok server response', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, statusText: 'Internal Error' })) as unknown as typeof fetch;
    const rt = new HttpLlamaRuntime();
    await expect(rt.generate([{ role: 'user', content: 'hi' }])).rejects.toThrow(/500/);
  });
});
