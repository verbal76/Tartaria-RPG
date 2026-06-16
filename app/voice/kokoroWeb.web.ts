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
/* eslint-disable @typescript-eslint/no-explicit-any */

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
      // eslint-disable-next-line no-console
      console.log('[kokoroWeb] loading model', MODEL_ID);
      const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' });
      // eslint-disable-next-line no-console
      console.log('[kokoroWeb] model ready');
      return tts;
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
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      try {
        const audio: any = await tts.generate(item.text, { voice: item.voice });
        const blob: Blob = typeof audio.toBlob === 'function'
          ? audio.toBlob()
          : new Blob([audio.toWav()], { type: 'audio/wav' });
        await playBlob(blob);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[kokoroWeb] generate/play failed:', (e as any)?.message ?? e);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[kokoroWeb] model load failed:', (e as any)?.message ?? e);
    // Drop the backlog so we don't pile up if the model can't load.
    queue = [];
    ttsPromise = null;
  } finally {
    processing = false;
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
