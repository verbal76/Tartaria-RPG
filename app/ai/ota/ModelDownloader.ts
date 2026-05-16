import * as FileSystem from 'expo-file-system';

const MODEL_DIR_NAME = 'tartaria-models/';
const MODEL_FILE_NAME = 'model_quantized.onnx';
const VOCAB_FILE_NAME = 'vocab.txt';
/** Subdirectory transformers.js uses to cache Qwen shards. Mirrors QwenGenerativeEngine. */
const QWEN_CACHE_SUBDIR = 'tartaria-models/qwen/';

export const DEFAULT_MODEL_URL =
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx';
export const DEFAULT_VOCAB_URL =
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/vocab.txt';

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

    const needModel = !(await this.exists(modelPath));
    const needVocab = !(await this.exists(vocabPath));

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

  /**
   * Returns true if transformers.js has already cached at least one Qwen
   * artifact locally. Used by boot UI to decide whether to show a "first-run
   * download" message or a faster "loading model" one. Best-effort — the
   * actual readiness check still belongs to QwenGenerativeEngine.isReady().
   */
  async isQwenCached(): Promise<boolean> {
    const root = FileSystem.documentDirectory;
    if (!root) return false;
    const dir = root + QWEN_CACHE_SUBDIR;
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists || !info.isDirectory) return false;
      const entries = await FileSystem.readDirectoryAsync(dir);
      return entries.length > 0;
    } catch {
      return false;
    }
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
