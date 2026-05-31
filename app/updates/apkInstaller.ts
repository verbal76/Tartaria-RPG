// In-app .apk download + install flow. Bypasses the browser entirely
// — downloads the binary into FileSystem.documentDirectory with a
// progress callback, converts file:// → content:// via
// getContentUriAsync, then hands the content URI to Android's
// PackageInstaller via expo-intent-launcher.
//
// Why this exists: tapping a direct .apk URL in Chrome / Samsung
// Internet on Android 13+ quarantines the download into a sandboxed
// cache the package installer can't see — download "completes" but
// the file is invisible. This flow keeps the file in our app's
// documents dir, where Android's content provider can grant
// PackageInstaller read access via FLAG_GRANT_READ_URI_PERMISSION.
//
// Compatibility: expo-intent-launcher is a native module added in
// the next APK rebuild. Older APKs without the module hit the
// guarded require() at the top and bail. Callers must check
// isInAppInstallAvailable() before exposing the INSTALL NOW button.

import * as FileSystem from 'expo-file-system';

let cachedAvailability: boolean | null = null;

/** Lazy + guarded probe — returns true only when expo-intent-launcher
 *  is actually loadable. On older APKs that predate the dep the
 *  require throws (no JS bridge to the native module). Cached after
 *  first call. */
export function isInAppInstallAvailable(): boolean {
  if (cachedAvailability !== null) return cachedAvailability;
  try {
    // require so the module isn't pulled into the bundle's static
    // graph — old APKs that don't have it survive the import.
    const IntentLauncher = require('expo-intent-launcher');
    cachedAvailability = !!(IntentLauncher && typeof IntentLauncher.startActivityAsync === 'function');
  } catch {
    cachedAvailability = false;
  }
  return cachedAvailability;
}

export interface InstallProgress {
  /** 0..1, undefined when totalBytesExpected isn't reported yet. */
  fraction: number | null;
  /** Bytes received so far. */
  received: number;
  /** Total bytes expected, or 0 when not yet known. */
  total: number;
  /** Human-readable phase label for the banner. */
  phase: 'starting' | 'downloading' | 'handing-off' | 'done' | 'failed';
  /** Error message when phase === 'failed'. */
  error?: string;
}

/** Downloads the APK to documents dir and launches Android's
 *  package installer on it. Calls onProgress with phase updates and
 *  byte counters so the banner can render a progress bar. Resolves
 *  when the installer has been launched (NOT when install
 *  completes — Android takes over from that point). Rejects only on
 *  download / FS errors; install rejection by the user is silent. */
export async function downloadAndInstallApk(
  assetUrl: string,
  build: number,
  onProgress?: (p: InstallProgress) => void,
): Promise<void> {
  if (!isInAppInstallAvailable()) {
    throw new Error('expo-intent-launcher not available on this APK');
  }
  if (!assetUrl) {
    throw new Error('No .apk asset URL — cannot download');
  }
  onProgress?.({ fraction: null, received: 0, total: 0, phase: 'starting' });

  const docDir = FileSystem.documentDirectory;
  if (!docDir) {
    throw new Error('No documentDirectory on this platform');
  }
  const localPath = `${docDir}tartaria-realms-apk-build-${build}.apk`;

  // Wipe any prior download so progress / verification starts clean.
  try {
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) await FileSystem.deleteAsync(localPath, { idempotent: true });
  } catch {
    // Best-effort cleanup; downloadAsync below will overwrite anyway.
  }

  const resumable = FileSystem.createDownloadResumable(
    assetUrl,
    localPath,
    {},
    (progress) => {
      const total = progress.totalBytesExpectedToWrite ?? 0;
      const received = progress.totalBytesWritten ?? 0;
      const fraction = total > 0 ? received / total : null;
      onProgress?.({ fraction, received, total, phase: 'downloading' });
    },
  );

  let result: { uri: string } | null = null;
  try {
    const downloaded = await resumable.downloadAsync();
    if (!downloaded?.uri) {
      throw new Error('Download produced no URI');
    }
    result = downloaded;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress?.({ fraction: null, received: 0, total: 0, phase: 'failed', error: msg });
    throw err;
  }

  onProgress?.({ fraction: 1, received: 0, total: 0, phase: 'handing-off' });

  // Convert file:// URI → content:// URI so the package installer
  // (a different app) can read our private file under granted
  // permission flags.
  let contentUri: string;
  try {
    contentUri = await FileSystem.getContentUriAsync(result.uri);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress?.({ fraction: null, received: 0, total: 0, phase: 'failed', error: `Content URI: ${msg}` });
    throw err;
  }

  // Launch the package installer. ACTION_VIEW + the apk MIME type
  // is the legacy contract; modern Android (24+) routes that to
  // PackageInstaller. flags: 1 = FLAG_GRANT_READ_URI_PERMISSION so
  // PackageInstaller can read our content URI.
  try {
    const IntentLauncher = require('expo-intent-launcher');
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      type: 'application/vnd.android.package-archive',
      data: contentUri,
      flags: 1,
    });
    onProgress?.({ fraction: 1, received: 0, total: 0, phase: 'done' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress?.({ fraction: null, received: 0, total: 0, phase: 'failed', error: `Launch installer: ${msg}` });
    throw err;
  }
}

/** Test-only: clear the cached availability probe so the next call
 *  re-runs require(). Production code never needs this. */
export function __resetInstallerAvailabilityCache(): void {
  cachedAvailability = null;
}
