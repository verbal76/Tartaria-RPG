// engine_Dev — platform factory for the generation backend.
//
// MOBILE (this file): returns undefined, so QwenGenerativeEngine falls back to the
// on-device llama.rn LlamaRuntime — the normal phone build, unchanged.
//
// DESKTOP / PC: the Dev_engine_PC branch ships a `runtimeFactory.web.ts` sibling
// that React Native's bundler picks for the web/Electron target instead of this
// file; it returns an HttpLlamaRuntime that talks to a local LLM server. Keeping the
// override in a `.web.ts` file means the shared code (here + QwenGenerativeEngine)
// is byte-identical on both branches — only the PC-only files differ, so merges
// from engine_Dev never conflict.

import type { ILlamaRuntime } from './LlamaRuntime';

/** The platform's generation runtime, or undefined to use the on-device default. */
export function resolveGenerationRuntime(): ILlamaRuntime | undefined {
  return undefined;
}
