import * as FileSystem from 'expo-file-system';

const MODEL_DIR_NAME = 'tartaria-models/';
const MODEL_FILE_NAME = 'model_quantized.onnx';
const VOCAB_FILE_NAME = 'vocab.txt';
/** Subdirectory the Qwen GGUF lives in once downloaded. */
const QWEN_CACHE_SUBDIR = 'tartaria-models/qwen/';
/** File name (matches the HF release). The download lands here verbatim. */
const QWEN_GGUF_FILE_NAME = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';

export const DEFAULT_MODEL_URL =
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx';
export const DEFAULT_VOCAB_URL =
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/vocab.txt';

/** Q4_K_M GGUF of Qwen 2.5 0.5B Instruct — ~398 MB. Tokenizer baked in. */
export const DEFAULT_QWEN_GGUF_URL =
  'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';

export interface DownloaderOptions {
  modelUrl?: string;
  vocabUrl?: string;
  onProgress?: (fraction: number) => void;
}

export interface ResolvedModelFiles {
  modelPath: string;
  vocabText: string;
}

/**
 * Maps a single-file download progress fraction into the overall 0–1 progress
 * reported to the UI, depending on which files this boot needs to fetch.
 * Pure function so it's testable without a filesystem.
 */
export function allocateProgress(
  stage: 'model' | 'vocab',
  frac: number,
  needModel: boolean,
  needVocab: boolean,
): number {
  const clamped = Math.max(0, Math.min(1, frac));
  if (stage === 'model') return needVocab ? clamped * 0.95 : clamped;
  return needModel ? 0.95 + clamped * 0.05 : clamped;
}

export class ModelDownloader {
  async ensureFiles(opts: DownloaderOptions = {}): Promise<ResolvedModelFiles> {
    const modelUrl = opts.modelUrl ?? DEFAULT_MODEL_URL;
    const vocabUrl = opts.vocabUrl ?? DEFAULT_VOCAB_URL;
    const onProgress = opts.onProgress;

    const root = FileSystem.documentDirectory;
    if (!root) throw new Error('expo-file-system: documentDirectory unavailable');
    const dir = root + MODEL_DIR_NAME;
    await this.ensureDir(dir);

    const modelPath = dir + MODEL_FILE_NAME;
    const vocabPath = dir + VOCAB_FILE_NAME;

    // v2.4.1 — size-floor reuse check, parity with the Qwen path
    // and the executorch Kokoro recovery (OTA 23-018). A truncated
    // partial download would pass `exists()` but fail at init time.
    // MiniLM model_quantized.onnx is ~22 MB nominal; require ≥ 15 MB
    // before reusing. Vocab is ~100 KB; require ≥ 30 KB. Below either
    // threshold → delete + re-download.
    const MIN_MODEL_BYTES = 15 * 1024 * 1024;
    const MIN_VOCAB_BYTES = 30 * 1024;
    const needModel = !(await this.existsWithMinSize(modelPath, MIN_MODEL_BYTES));
    const needVocab = !(await this.existsWithMinSize(vocabPath, MIN_VOCAB_BYTES));

    if (!needModel && !needVocab) {
      onProgress?.(1);
    } else {
      onProgress?.(0);
    }

    if (needModel) {
      await this.downloadWithProgress(modelUrl, modelPath, (frac) => {
        onProgress?.(allocateProgress('model', frac, needModel, needVocab));
      });
    }

    if (needVocab) {
      await this.downloadWithProgress(vocabUrl, vocabPath, (frac) => {
        onProgress?.(allocateProgress('vocab', frac, needModel, needVocab));
      });
    }

    onProgress?.(1);

    const vocabText = await FileSystem.readAsStringAsync(vocabPath);
    return { modelPath, vocabText };
  }

  private async ensureDir(path: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(path, { intermediates: true });
    }
  }

  private async exists(path: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  }

  /** True if the file exists AND its size is at least `minBytes`. If
   *  the file exists but is too small (truncated partial download),
   *  delete it so the caller will re-download cleanly. Parity with
   *  the Qwen and Kokoro recovery paths. */
  private async existsWithMinSize(path: string, minBytes: number): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(path, { size: true });
    if (!info.exists) return false;
    const size = (info as { size?: number }).size ?? 0;
    if (size >= minBytes) return true;
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      // Swallow — re-download will overwrite anyway.
    }
    return false;
  }

  /**
   * Returns true if the Qwen GGUF has already been downloaded to the device.
   * Used by boot UI to decide whether to show a "first-run download" message
   * (the file is large — ~398 MB) or a faster "loading model" message. Best
   * effort; the authoritative readiness check belongs to LlamaRuntime.
   *
   * OTA-294 — integrity gate. Size > 200 MB alone wasn't enough: if the
   * player swiped the app away mid-download (file is 398 MB nominal but
   * a 250 MB partial would still pass the size check), the partial file
   * got reused on next launch and crashed llama.cpp trying to parse a
   * truncated GGUF. We now also require a sentinel file alongside the
   * GGUF — only written after the download completes cleanly. Missing
   * sentinel + present GGUF = partial download → delete and re-fetch.
   */
  async isQwenCached(): Promise<boolean> {
    const root = FileSystem.documentDirectory;
    if (!root) return false;
    const ggufPath = root + QWEN_CACHE_SUBDIR + QWEN_GGUF_FILE_NAME;
    const sentinelPath = ggufPath + '.complete';
    try {
      const [ggufInfo, sentinelInfo] = await Promise.all([
        FileSystem.getInfoAsync(ggufPath),
        FileSystem.getInfoAsync(sentinelPath),
      ]);
      if (!ggufInfo.exists) return false;
      const size = 'size' in ggufInfo && typeof ggufInfo.size === 'number' ? ggufInfo.size : 0;
      // Size floor still applies — a 0-byte file with the sentinel is
      // obviously broken too.
      if (size <= 200 * 1024 * 1024) return false;
      // No sentinel = partial download (or pre-OTA-294 install that
      // doesn't have the sentinel yet). Force a re-download to be safe.
      // The cost is one ~398 MB download per existing player; subsequent
      // launches reuse the sentinel-validated cache.
      if (!sentinelInfo.exists) {
        try {
          await FileSystem.deleteAsync(ggufPath, { idempotent: true });
        } catch {
          // ignore — even if delete fails, ensureQwenGguf will
          // overwrite on next download.
        }
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * OTA-1501 — the facts the LOAD FAILED line needs, gathered where the file
   * lives. `Failed to load the model` is llama.rn's one message for BOTH a
   * GGUF llama.cpp cannot parse AND an allocation it cannot make, so the log
   * line has to carry the discriminating evidence itself: the exact bytes on
   * disk (full ≈398 MB = the file is whole, memory is the suspect; short =
   * the cache is poisoned), whether the completion sentinel is standing, and
   * how much disk is left (a full disk is the one way a download goes short).
   * Best effort — every probe failure reports null rather than throwing,
   * because this runs inside a failure path that must still fail cleanly.
   */
  async statQwenGguf(): Promise<{
    sizeBytes: number | null;
    sentinel: boolean;
    freeDiskBytes: number | null;
  }> {
    let sizeBytes: number | null = null;
    let sentinel = false;
    let freeDiskBytes: number | null = null;
    const root = FileSystem.documentDirectory;
    if (root) {
      const ggufPath = root + QWEN_CACHE_SUBDIR + QWEN_GGUF_FILE_NAME;
      try {
        const info = await FileSystem.getInfoAsync(ggufPath, { size: true });
        if (info.exists) {
          sizeBytes = (info as { size?: number }).size ?? null;
        }
      } catch { /* unknown stays null */ }
      try {
        const s = await FileSystem.getInfoAsync(ggufPath + '.complete');
        sentinel = s.exists;
      } catch { /* unknown reads as no sentinel */ }
    }
    try {
      freeDiskBytes = await FileSystem.getFreeDiskStorageAsync();
    } catch { /* unknown stays null */ }
    return { sizeBytes, sentinel, freeDiskBytes };
  }

  /**
   * Ensures the Qwen GGUF is present on the device. Downloads from
   * HuggingFace on first run, caches under
   *   documentDirectory/tartaria-models/qwen/qwen2.5-0.5b-instruct-q4_k_m.gguf
   *
   * Idempotent — second call returns instantly if the file is already there
   * with the right size.
   *
   * Pure download logic only. Initializing the llama.cpp context belongs to
   * LlamaRuntime; this just ensures the bytes are on disk.
   */
  async ensureQwenGguf(opts: {
    url?: string;
    onProgress?: (fraction: number) => void;
  } = {}): Promise<string> {
    const root = FileSystem.documentDirectory;
    if (!root) throw new Error('expo-file-system: documentDirectory unavailable');
    const dir = root + QWEN_CACHE_SUBDIR;
    await this.ensureDir(dir);
    const ggufPath = dir + QWEN_GGUF_FILE_NAME;

    const cached = await this.isQwenCached();
    if (cached) {
      opts.onProgress?.(1);
      return ggufPath;
    }

    const url = opts.url ?? DEFAULT_QWEN_GGUF_URL;
    opts.onProgress?.(0);
    await this.downloadWithProgress(url, ggufPath, (frac) => opts.onProgress?.(frac));
    // OTA-294 — write the completion sentinel ONLY after the download
    // promise resolved. If the download was interrupted (process killed
    // mid-fetch), this line never runs, the sentinel never appears, and
    // the next isQwenCached() call detects the partial state and
    // re-downloads. Sentinel content is just a JSON record of the
    // completion event for debugging; presence is what matters.
    try {
      await FileSystem.writeAsStringAsync(
        ggufPath + '.complete',
        JSON.stringify({ completed: new Date().toISOString(), url }),
      );
    } catch {
      // If sentinel write fails the next launch will re-download — not
      // ideal but safe. Log nothing to avoid noisy logs on storage
      // pressure devices.
    }
    opts.onProgress?.(1);
    return ggufPath;
  }

  private async downloadWithProgress(
    url: string,
    dest: string,
    onChunk: (fraction: number) => void,
  ): Promise<void> {
    const dl = FileSystem.createDownloadResumable(url, dest, {}, (progress) => {
      const total = progress.totalBytesExpectedToWrite;
      if (total > 0) onChunk(progress.totalBytesWritten / total);
    });
    const result = await dl.downloadAsync();
    if (!result || !result.uri) {
      throw new Error(`Model download produced no result: ${url}`);
    }
  }
}
