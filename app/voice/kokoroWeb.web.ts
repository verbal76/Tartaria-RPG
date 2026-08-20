// kokoroWeb (web/desktop) — Kokoro TTS via ONNX, using the `kokoro-js` library
// (which runs onnxruntime-web under the hood). This is the desktop/PC voice path:
// the native executorch Kokoro engine doesn't exist on web, so TTSManager routes
// the "bundled" voice here on Platform.OS === 'web'.
//
// The model (~80MB at q8) downloads from the HuggingFace CDN on first speak and
// caches in IndexedDB, so the first line is slow and subsequent ones are fast.
// Everything is best-effort: any failure logs to the console (which the Electron
// wrapper mirrors into the Desktop diagnostic log) and the game falls back to
// silent text — never a crash.
/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DEFAULT_VOICE = 'am_michael';

let ttsPromise: Promise<any> | null = null;
let queue: Array<{ text: string; voice: string }> = [];
let processing = false;
let currentAudio: HTMLAudioElement | null = null;

async function getTTS(): Promise<any> {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      // Load kokoro-js (+ transformers.js + onnxruntime-web) from a CDN at
      // RUNTIME rather than bundling it. The library is hostile to Metro's web
      // bundler, so bundling risks failing `expo export` outright; Electron has a
      // full Chromium + network, so a native dynamic import of an ESM URL is
      // clean. The `new Function` wrapper hides the import() from Metro's static
      // analyzer so it isn't pulled into the bundle. (For a Steam release, vendor
      // this locally instead of a CDN.)
      const dynamicImport = new Function('u', 'return import(u)') as (u: string) => Promise<any>;
      const mod: any = await dynamicImport('https://esm.sh/kokoro-js@^1.1.0');
      const KokoroTTS = mod.KokoroTTS ?? mod.default?.KokoroTTS ?? mod.default;
      console.log('[kokoroWeb] loading model', MODEL_ID);
      // Prefer WebGPU — GPU inference frees the main thread (responsive UI) and is
      // far faster than WASM; fall back to WASM if WebGPU isn't available.
      try {
        const gpu = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'fp32', device: 'webgpu' });
        console.log('[kokoroWeb] model ready (webgpu)');
        return gpu;
      } catch (gpuErr) {
        console.warn('[kokoroWeb] webgpu unavailable, using wasm:', (gpuErr as any)?.message ?? gpuErr);
        const cpu = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' });
        console.log('[kokoroWeb] model ready (wasm)');
        return cpu;
      }
    })();
  }
  return ttsPromise;
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    currentAudio = el;
    const done = (): void => {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      if (currentAudio === el) currentAudio = null;
      resolve();
    };
    el.onended = done;
    el.onerror = done;
    el.play().catch(done);
  });
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const tts = await getTTS();
    const genBlob = async (it: { text: string; voice: string }): Promise<Blob | null> => {
      try {
        const audio: any = await tts.generate(it.text, { voice: it.voice });
        return typeof audio.toBlob === 'function'
          ? audio.toBlob()
          : new Blob([audio.toWav()], { type: 'audio/wav' });
      } catch (e) {
        console.warn('[kokoroWeb] generate failed:', (e as any)?.message ?? e);
        return null;
      }
    };
    // Pipeline: synthesize the NEXT line while the current one PLAYS, so the
    // synthesis time is hidden behind playback instead of added between lines.
    let pending = queue.length ? genBlob(queue.shift()!) : null;
    while (pending) {
      const cur = pending;
      pending = queue.length ? genBlob(queue.shift()!) : null; // prefetch next
      const blob = await cur;
      if (blob) await playBlob(blob);
      if (!pending && queue.length) pending = genBlob(queue.shift()!); // late arrivals
    }
  } catch (e) {
    console.warn('[kokoroWeb] model load failed:', (e as any)?.message ?? e);
    queue = [];
    ttsPromise = null;
  } finally {
    processing = false;
    // Re-run for any lines that arrived in the race after the loop emptied.
    if (queue.length) void processQueue();
  }
}

export function speakWeb(text: string, voiceId?: string | null): void {
  const t = (text ?? '').trim();
  if (!t) return;
  queue.push({ text: t, voice: voiceId || DEFAULT_VOICE });
  void processQueue();
}

export function stopWeb(): void {
  queue = [];
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* ignore */ }
    currentAudio = null;
  }
}
