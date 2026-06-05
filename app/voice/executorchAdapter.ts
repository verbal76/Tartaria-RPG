// ExpoFileSystemResourceFetcherAdapter — minimal ResourceFetcherAdapter
// for react-native-executorch using expo-file-system.
//
// Replaces the official react-native-executorch-expo-resource-fetcher
// (which requires Expo SDK 54). We're on SDK 52, but the adapter
// interface is tiny — two methods. We implement them on top of the
// expo-file-system primitives we already use for MiniLM + Qwen.
//
// Wired at boot via initExecutorch({ resourceFetcher: createAdapter() })
// — see app/App.tsx.

import * as FileSystem from 'expo-file-system';

type ResourceSource = string | number | object;

const CACHE_DIR = (FileSystem.documentDirectory ?? '') + 'tartaria-executorch/';

async function ensureCacheDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
  } catch {
    /* swallow */
  }
}

// OTA 23-018 — nuke the entire bundled-voice cache directory so a
// corrupt-on-disk model (the most likely root cause behind a
// "downloaded but failed to load" report — a prior partial write
// leaves a non-zero-size file that the cache check happily reuses
// forever) forces a fresh download on next attempt. Wired to a
// CLEAR BUNDLED VOICE CACHE button in SFX settings.
export async function clearExecutorchCache(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    }
  } catch {
    /* swallow — best-effort */
  }
}

// OTA 23-018 — inventory of the executorch cache for the
// diagnostic. Returns each cached file's name + size + last
// modified so a tester pasting COPY VOICE INFO surfaces whether
// the model file on disk is truncated (Kokoro-Medium is ~100 MB;
// anything under ~95 MB is the smoking gun for a partial write).
export interface ExecutorchCacheEntry {
  name: string;
  sizeMB: number;
  modificationTimeMs: number;
}
export async function inspectExecutorchCache(): Promise<ExecutorchCacheEntry[]> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) return [];
    const names = await FileSystem.readDirectoryAsync(CACHE_DIR);
    const out: ExecutorchCacheEntry[] = [];
    for (const n of names) {
      try {
        const fi = await FileSystem.getInfoAsync(CACHE_DIR + n);
        if (!fi.exists) continue;
        out.push({
          name: n,
          sizeMB: typeof fi.size === 'number' ? Math.round((fi.size / (1024 * 1024)) * 10) / 10 : -1,
          modificationTimeMs: typeof fi.modificationTime === 'number' ? Math.round(fi.modificationTime * 1000) : 0,
        });
      } catch { /* skip */ }
    }
    return out;
  } catch {
    return [];
  }
}

/** Produce a stable filename for a given URL or local path. We hash
 *  the source-string to a hex-ish id so two distinct URLs with the
 *  same basename land in different cache files. */
function cacheNameFor(source: string): string {
  // Cheap stable hash — not cryptographic. Good enough for cache keying.
  let h = 2166136261;
  for (let i = 0; i < source.length; i++) {
    h = (h ^ source.charCodeAt(i)) * 16777619;
    h = h >>> 0;
  }
  const id = h.toString(16);
  // Preserve extension when present.
  const dot = source.lastIndexOf('.');
  const ext = dot > 0 && source.length - dot < 8 ? source.slice(dot) : '';
  return `${id}${ext}`;
}

/** Resolve a single source string to a local file path. Downloads
 *  http/https URLs into the cache directory (idempotent — re-runs
 *  reuse the existing file); returns file:// paths as-is. */
async function resolveSource(
  source: ResourceSource,
  onProgress: (frac: number) => void,
): Promise<string | null> {
  if (typeof source !== 'string') {
    // Numeric (require()) and object sources aren't used by Kokoro's
    // built-in model constants; if they ever surface we'd need to
    // resolve via Expo's Asset.fromModule. Return null so executorch
    // surfaces an error rather than silently failing.
    return null;
  }
  if (source.startsWith('file://') || source.startsWith('/')) {
    // Already a local path. Strip file:// per adapter contract.
    return source.replace(/^file:\/\//, '');
  }
  if (!/^https?:\/\//i.test(source)) {
    // Unknown scheme — pass through. Executorch's native side may
    // know how to handle it.
    return source;
  }
  await ensureCacheDir();
  const target = CACHE_DIR + cacheNameFor(source);
  const marker = target + '.complete'; // written ONLY after a finished download

  // arb56 — reuse is gated on a completion MARKER, not a size guess. The old
  // ">= 50 MB looks done" heuristic had two failures the player hit as
  // "downloads every time":
  //   (1) every model file UNDER 50 MB (the voice + tokenizer/config) failed
  //       the check and re-downloaded on EVERY launch — never cached.
  //   (2) a large partial (e.g. 71 MB) PASSED the 50 MB check, got trusted as
  //       complete, then failed to load.
  // Now: a download writes `<file>.complete` (holding the final byte size) only
  // when it actually finishes. We reuse the cached file only when that marker
  // exists AND its recorded size matches the file on disk — so partials of any
  // size are never trusted, and complete files of any size are always reused.
  const info = await FileSystem.getInfoAsync(target);
  if (info.exists && typeof info.size === 'number' && info.size > 0) {
    try {
      const m = await FileSystem.getInfoAsync(marker);
      if (m.exists) {
        const recorded = parseInt(await FileSystem.readAsStringAsync(marker), 10);
        if (Number.isFinite(recorded) && recorded === info.size) {
          onProgress(1);
          return target.replace(/^file:\/\//, '');
        }
      }
    } catch { /* marker unreadable → fall through and re-fetch */ }
  }

  // Not verified-complete. Keep any partial on disk so the retry loop can
  // RESUME it (HTTP Range) within this session instead of restarting; on a
  // single mid-transfer drop ("Software caused connection abort") we retry
  // with exponential backoff rather than failing the whole voice install.
  const progressCb = (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
    if (!p.totalBytesExpectedToWrite) return;
    const frac = p.totalBytesWritten / p.totalBytesExpectedToWrite;
    onProgress(Math.max(0, Math.min(1, frac)));
  };
  const markComplete = async (): Promise<void> => {
    try {
      const fin = await FileSystem.getInfoAsync(target);
      const size = fin.exists && typeof fin.size === 'number' ? fin.size : 0;
      if (size > 0) await FileSystem.writeAsStringAsync(marker, String(size));
    } catch { /* best-effort: if we can't mark, we just re-fetch next time */ }
  };
  const MAX_ATTEMPTS = 5;
  let handle = FileSystem.createDownloadResumable(source, target, {}, progressCb);
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Attempt 1 starts fresh; later attempts resume the partial via the
      // Range header carried in the handle's resume data.
      const result = attempt === 1
        ? await handle.downloadAsync()
        : await handle.resumeAsync();
      if (result?.uri) {
        await markComplete();
        return result.uri.replace(/^file:\/\//, '');
      }
      lastErr = new Error('download returned no uri');
    } catch (e) {
      lastErr = e;
      // Rebuild the handle from its savable snapshot so the next attempt
      // carries resumeData (the byte offset already written). Falls back to
      // the existing handle if savable() isn't available.
      try {
        const s = handle.savable();
        handle = FileSystem.createDownloadResumable(
          s.url, s.fileUri, s.options, progressCb, s.resumeData,
        );
      } catch { /* keep existing handle */ }
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1))); // 1s,2s,4s,8s
    }
  }
  throw lastErr ?? new Error('download failed after retries');
}

/** Adapter instance handed to initExecutorch at boot. */
export function createExpoFileSystemAdapter(): {
  fetch: (
    callback: (downloadProgress: number) => void,
    ...sources: ResourceSource[]
  ) => Promise<string[] | null>;
  readAsString: (path: string) => Promise<string>;
} {
  return {
    async fetch(callback, ...sources) {
      const fractions = new Array<number>(sources.length).fill(0);
      const report = (idx: number, f: number) => {
        fractions[idx] = f;
        const avg = fractions.reduce((a, b) => a + b, 0) / sources.length;
        try { callback(avg); } catch { /* ignore */ }
      };
      const paths: string[] = [];
      for (let i = 0; i < sources.length; i++) {
        const path = await resolveSource(sources[i]!, (f) => report(i, f));
        if (path == null) return null;
        paths.push(path);
        report(i, 1);
      }
      return paths;
    },
    async readAsString(path) {
      const uri = path.startsWith('file://') ? path : `file://${path}`;
      return FileSystem.readAsStringAsync(uri);
    },
  };
}
