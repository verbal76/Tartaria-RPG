// PiperDownloader — fetches the Piper voice model + sherpa-onnx
// runtime data on first use. Mirrors the MiniLM / Qwen download
// pattern (ModelDownloader.ts) so the UX is consistent: progress
// bar in the Voice settings card, files cached in documentDirectory,
// idempotent across launches.
//
// Voice: en_US-amy-medium (per the TTS recon spike). The
// sherpa-onnx team publishes Piper voices as tarballs at GitHub
// Releases — we extract them on-device once.

import * as FileSystem from 'expo-file-system';
import { getModelDir, resetPiperAvailability } from './PiperTTSManager';

/** sherpa-onnx publishes prebuilt Piper voice tarballs at:
 *  https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/
 *  Each tarball contains:
 *    <voice>/<voice>.onnx          ← the VITS model (~63 MB)
 *    <voice>/tokens.txt            ← phoneme IDs
 *    <voice>/espeak-ng-data/...    ← rule-based G2P data
 *  The tarball is ~64 MB compressed; extracts to ~70 MB. */
const DEFAULT_PIPER_TARBALL_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-medium.tar.bz2';

const DEFAULT_PIPER_VERSION = 'en_US-amy-medium';

export interface PiperDownloadStatus {
  /** 0 = idle, 0–1 during download, 1 = installed. */
  fraction: number;
  /** Brief human-readable label for the settings UI. */
  label: string;
  /** Final installed state — true means the voice is ready to speak. */
  installed: boolean;
  /** Set when something went wrong. UI can surface this in red. */
  error: string | null;
}

export interface PiperDownloaderOptions {
  url?: string;
  voiceId?: string;
  onProgress?: (status: PiperDownloadStatus) => void;
}

/** True when the model directory already contains the expected files.
 *  Cheap check used at boot to skip the network round-trip. */
export async function isPiperInstalled(): Promise<boolean> {
  const dir = getModelDir();
  try {
    const info = await FileSystem.getInfoAsync(dir + 'tokens.txt');
    return info.exists;
  } catch {
    return false;
  }
}

/** Download + install the Piper voice. No-op if already installed.
 *  Tarball extraction on-device requires a native helper that we
 *  don't have yet in this codebase — for the first ship we surface
 *  a clear "not yet implemented" error so the UI can route the
 *  player to a manual install path (sideload + adb push, or wait
 *  for a future bundled-asset APK). Wiring the actual extraction
 *  lands in a follow-up commit once we pick a tar.bz2 reader. */
export async function downloadPiperVoice(
  opts: PiperDownloaderOptions = {},
): Promise<PiperDownloadStatus> {
  const onProgress = opts.onProgress;
  const status: PiperDownloadStatus = {
    fraction: 0,
    label: 'Preparing…',
    installed: false,
    error: null,
  };
  const emit = (patch: Partial<PiperDownloadStatus>) => {
    Object.assign(status, patch);
    if (onProgress) onProgress({ ...status });
  };

  if (await isPiperInstalled()) {
    emit({ fraction: 1, label: 'Installed', installed: true });
    resetPiperAvailability();
    return status;
  }

  // Placeholder — the actual fetch + extraction is staged for a
  // follow-up commit. For now, surface a clear message so the
  // settings UI can render an error instead of pretending to work.
  emit({
    fraction: 0,
    label: 'Bundled voice install not yet wired',
    installed: false,
    error:
      'Bundled Piper voice download is staged for the next build. ' +
      'Use the system TTS toggle for now — switching back to bundled ' +
      'will pick up the model once a release ships it.',
  });
  return status;
}

export function getDefaultPiperVoiceId(): string {
  return DEFAULT_PIPER_VERSION;
}

export function getDefaultPiperTarballUrl(): string {
  return DEFAULT_PIPER_TARBALL_URL;
}
