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
  const info = await FileSystem.getInfoAsync(target);
  if (info.exists && info.size && info.size > 0) {
    onProgress(1);
    return target.replace(/^file:\/\//, '');
  }
  // Fresh download. Progress maps the resumable callback to the
  // 0–1 range the caller expects.
  const handle = FileSystem.createDownloadResumable(
    source,
    target,
    {},
    (p) => {
      if (!p.totalBytesExpectedToWrite) return;
      const frac = p.totalBytesWritten / p.totalBytesExpectedToWrite;
      onProgress(Math.max(0, Math.min(1, frac)));
    },
  );
  const result = await handle.downloadAsync();
  if (!result?.uri) return null;
  return result.uri.replace(/^file:\/\//, '');
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
