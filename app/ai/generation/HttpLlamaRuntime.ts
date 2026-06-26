// Dev_engine_PC — DESKTOP generation backend.
//
// The mobile build runs the Qwen narrator on-device (llama.rn). The PC/Electron
// build can't load those native modules, so this runtime conforms to the same
// ILlamaRuntime seam but talks to a LOCAL LLM server over an OpenAI-compatible
// /v1/chat/completions endpoint. That covers Ollama (default, 127.0.0.1:11434),
// llama.cpp's server, and LM Studio — the player runs one locally and the full
// game (narrator included) works on the desktop, fully offline.
//
// Nothing in the engine changes: QwenGenerativeEngine talks only to ILlamaRuntime,
// and runtimeFactory.web.ts hands it this on the web/Electron target.

import type {
  ILlamaRuntime,
  LlamaInitOptions,
  LlamaGenerateOptions,
  QwenChatMessage,
} from './LlamaRuntime';
import { QWEN_STOP_TOKENS } from './LlamaRuntime';

export interface HttpLlamaConfig {
  /** OpenAI-compatible base URL. Default Ollama: http://127.0.0.1:11434/v1 */
  baseUrl?: string;
  /** Model name the local server serves. Default a small Qwen instruct model. */
  model?: string;
  /** Bearer token, if the local server requires one (usually not). */
  apiKey?: string;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1';
const DEFAULT_MODEL = 'qwen2.5:1.5b-instruct';

export class HttpLlamaRuntime implements ILlamaRuntime {
  private baseUrl: string;
  private model: string;
  private apiKey?: string;
  private ready = false;

  constructor(cfg: HttpLlamaConfig = {}) {
    this.baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.model = cfg.model ?? DEFAULT_MODEL;
    this.apiKey = cfg.apiKey;
  }

  isReady(): boolean { return this.ready; }

  /** "Initialize" = confirm the local server is reachable. No download/load on
   *  desktop (the server owns the model). LlamaInitOptions is accepted for
   *  interface parity but unused here. */
  async initialize(_opts: LlamaInitOptions): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, { headers: this.headers() });
      this.ready = res.ok;
    } catch {
      this.ready = false;
    }
  }

  async generate(
    messages: readonly QwenChatMessage[],
    opts: LlamaGenerateOptions = {},
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers() },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: opts.maxTokens ?? 120,
        temperature: opts.temperature ?? 0.8,
        top_p: opts.topP ?? 0.9,
        stop: [...QWEN_STOP_TOKENS],
        stream: false,
      }),
    });
    if (!res.ok) {
      throw new Error(`HttpLlamaRuntime: server returned ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (data?.choices?.[0]?.message?.content ?? '').trim();
    // Single-shot (non-stream); fire the onToken callback once so streaming callers
    // still get their text.
    if (opts.onToken && text) opts.onToken(text);
    return text;
  }

  async dispose(): Promise<void> {
    this.ready = false;
  }

  private headers(): Record<string, string> {
    return this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
  }
}
