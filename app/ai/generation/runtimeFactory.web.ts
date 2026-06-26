// Dev_engine_PC — WEB / ELECTRON override of the generation-backend factory.
//
// React Native's bundler picks this `.web.ts` file over runtimeFactory.ts for the
// web/Electron target, so the desktop build runs the narrator through a local LLM
// server (HttpLlamaRuntime) instead of the on-device llama.rn modules (which don't
// exist on desktop). The mobile build never sees this file — its sibling
// runtimeFactory.ts (returns undefined → on-device LlamaRuntime) is byte-identical
// on both branches, so engine_Dev merges in cleanly.
//
// Config: defaults to Ollama at 127.0.0.1:11434. Override via the EXPO_PUBLIC_LLM_*
// env vars at build time if the player runs a different local server / model.

import type { ILlamaRuntime } from './LlamaRuntime';
import { HttpLlamaRuntime } from './HttpLlamaRuntime';

declare const process: { env?: Record<string, string | undefined> } | undefined;
const env = (typeof process !== 'undefined' && process?.env) || {};

export function resolveGenerationRuntime(): ILlamaRuntime | undefined {
  return new HttpLlamaRuntime({
    baseUrl: env.EXPO_PUBLIC_LLM_BASE_URL,
    model: env.EXPO_PUBLIC_LLM_MODEL,
    apiKey: env.EXPO_PUBLIC_LLM_API_KEY,
  });
}
