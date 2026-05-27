// checkAndApplyOTA — shared OTA check + fetch + reload sequence.
//
// Used by the CHECK FOR OTA UPDATE button in AboutScreen and by the
// boot-time auto-check fired from App.tsx. Living in one place means
// the careful teardown sequence (persist save → release audio /
// cognitive / Qwen → reload) only exists once and can't drift.
//
// Callers provide optional callbacks for status + errors. The boot
// auto-check passes `silent: true` so a network error or
// "already up to date" never surfaces to the player.

import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { useGameStore } from '../state/gameStore';
import { disposeAudio } from '../audio/AudioManager';
import { stopTTSController } from '../voice/TTSController';
import { stopAndClear as stopTTS } from '../voice/TTSManager';
import { disposePiperEngine } from '../voice/PiperTTSManager';

/** 2026-05-25 — race a promise against a timeout. expo-updates
 *  doesn't expose any built-in cancel/timeout for checkForUpdateAsync
 *  or fetchUpdateAsync, so a dropped network can leave the call
 *  pending indefinitely. This wrapper rejects after `ms` so the
 *  caller can surface a clean error instead of a forever-spinning
 *  button. The underlying expo-updates call keeps running (no real
 *  cancellation API) but its eventual resolution is discarded. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`OTA ${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export interface CheckAndApplyOptions {
  /** Called as the sequence progresses. The button on AboutScreen
   *  uses this to swap the button label between "Checking…",
   *  "Downloading update…", etc. Boot auto-check omits it. */
  onStatus?: (status: string) => void;
  /** Called once with a human-readable error message if the
   *  sequence fails. Boot auto-check omits it (errors are
   *  swallowed — the next manual tap will resurface them). */
  onError?: (detail: string) => void;
  /** True for boot auto-check. Suppresses the disabled-environment
   *  short-circuit message (dev builds simply skip). */
  silent?: boolean;
  /** Download the update but DO NOT reload. Used by the silent
   *  boot-time auto-check — auto-applying mid-boot crashes the
   *  process because native modules (executorch Kokoro, llama.rn
   *  Qwen, ONNX MiniLM, expo-av Sound) are still spinning up while
   *  reloadAsync swaps the JS bundle in. The boot path sets the
   *  pendingOTAUpdate store flag instead; the TitleScreen banner
   *  offers the player a one-tap apply that runs the full reload
   *  sequence from a clean state. */
  fetchOnly?: boolean;
  /** OTA 047 — skip the check + fetch and go straight to teardown
   *  + reloadAsync. Used by the title-screen tap-to-apply path
   *  when a bundle has already been pre-staged by the boot
   *  fetchOnly pass (pendingOTAUpdate flag is true). Without this,
   *  a transient network hiccup at apply time threw
   *  ERR_UPDATES_FETCH 'Failed to download new update' even
   *  though the bundle was already on disk and ready to load. */
  skipFetch?: boolean;
}

/** Result the caller can inspect. `applied` means we triggered a
 *  reload (this call won't return cleanly — the JS bridge restarts).
 *  `pending` means we downloaded the update but stopped short of
 *  reloading (fetchOnly mode); the caller's banner / button should
 *  invite the player to apply on their own tap. `noUpdate` means we
 *  checked successfully and there was nothing to apply. `skipped`
 *  means we didn't even check (Updates disabled in dev). `errored`
 *  means the sequence failed. */
export type CheckAndApplyResult = 'applied' | 'pending' | 'noUpdate' | 'skipped' | 'errored';

export async function checkAndApplyOTA(opts: CheckAndApplyOptions = {}): Promise<CheckAndApplyResult> {
  const { onStatus, onError, silent = false, fetchOnly = false, skipFetch = false } = opts;
  try {
    if (!Updates.isEnabled) {
      if (!silent) onStatus?.('Disabled (dev build / Expo Go)');
      return 'skipped';
    }
    // OTA 047 — skipFetch path: the boot pass already downloaded
    // the bundle and set pendingOTAUpdate. Re-running check+fetch
    // here was redundant AND failing on transient network hiccups
    // (ERR_UPDATES_FETCH 'Failed to download new update') even
    // though the bundle was already staged. Go straight to
    // teardown + reload; expo-updates' reloadAsync boots into the
    // most recently fetched update on disk.
    if (!skipFetch) {
      onStatus?.('Checking…');
      // 2026-05-25 — added timeouts. Playtester reported the check
      // "runs a prolonged time and doesn't always resolve." expo-
      // updates' checkForUpdateAsync / fetchUpdateAsync have NO
      // built-in timeout — on a dropped network the promise can
      // hang forever, leaving the button stuck on "Checking…".
      // 10s for the lightweight version check, 60s for the bundle
      // download. Timeout throws an error which falls through to
      // the catch below and surfaces as a clean 'errored' return.
      const result = await withTimeout(
        Updates.checkForUpdateAsync(),
        10_000,
        'check',
      );
      if (!result.isAvailable) {
        onStatus?.('Already up to date');
        return 'noUpdate';
      }
      onStatus?.('Downloading update…');
      await withTimeout(
        Updates.fetchUpdateAsync(),
        60_000,
        'download',
      );
      // fetchOnly path — silent boot check. Don't reload mid-boot;
      // native modules are still initialising and reloadAsync at
      // this point reliably crashes the process to home screen.
      // The boot caller flips the pendingOTAUpdate store flag so the
      // title screen can offer a one-tap apply from a clean state.
      if (fetchOnly) {
        onStatus?.('Update downloaded — restart to apply');
        return 'pending';
      }
    }
    // Flush the player's progress to disk BEFORE handing control to
    // expo-updates. If reloadAsync starts while AsyncStorage is still
    // mid-write, the slot can end up persisted with player=null —
    // which is exactly what was corrupting saves across updates.
    onStatus?.('Saving progress…');
    try {
      await useGameStore.getState().persist();
    } catch (persistErr) {
      // Don't block the update on persist failure, but record it.
      const m = persistErr instanceof Error ? persistErr.message : String(persistErr);
      onError?.(`Save flush warning: ${m}`);
    }

    // Tear down native resources BEFORE reloadAsync. expo-av Sound,
    // ONNX runtime session, AND llama.rn (Qwen) all hold native
    // handles that block the JS bridge from cleanly restarting —
    // reloadAsync was hanging on a black screen forever. Releasing
    // these explicitly lets the bridge finish reload. iOS is
    // especially sensitive to lingering native modules.
    onStatus?.('Releasing resources…');
    try { await disposeAudio(); } catch { /* ignore */ }
    try { await useGameStore.getState().shutdownCognitive(); } catch { /* ignore */ }
    try { await useGameStore.getState().shutdownQwen(); } catch { /* ignore */ }
    // Voice native handles — both engines AND the controller's store
    // subscription. Without these, the executorch (Kokoro) module's
    // PyTorch handle and the expo-av Sound created by playPcm can
    // keep the bridge from cleanly tearing down on reloadAsync.
    try { stopTTSController(); } catch { /* ignore */ }
    try { stopTTS(); } catch { /* ignore */ }
    try { await disposePiperEngine(); } catch { /* ignore */ }
    if (Platform.OS === 'ios') {
      // iOS belt-and-suspenders: give the native side an extra
      // event-loop tick to fully release.
      await new Promise((r) => setTimeout(r, 250));
    }

    onStatus?.('Restarting to apply…');
    try {
      await Updates.reloadAsync();
      return 'applied';
    } catch (reloadErr) {
      const m = reloadErr instanceof Error ? reloadErr.message : String(reloadErr);
      onStatus?.('Restart failed');
      onError?.(`reloadAsync error: ${m}. Please restart the app manually — your progress was saved.`);
      return 'errored';
    }
  } catch (err) {
    // Capture as much detail as possible — name, message, stack head,
    // any wrapped code property. expo-updates' generic 'Failed to
    // check for update' isn't actionable on its own.
    let detail: string;
    let errCode: string | undefined;
    if (err instanceof Error) {
      errCode = (err as Error & { code?: string }).code;
      const parts = [err.name, errCode ? `[${errCode}]` : '', err.message]
        .filter(Boolean)
        .join(' ');
      const stackHead = err.stack ? err.stack.split('\n').slice(0, 2).join(' | ') : '';
      detail = stackHead ? `${parts}\n      ${stackHead}` : parts;
    } else {
      detail = String(err);
    }
    // v2.4.1 (OTA 044) — ERR_UPDATES_FETCH is what expo-updates throws
    // when there is no new update to fetch (the server has nothing
    // newer to serve). It is NOT a real failure; surfacing it as an
    // error scared the playtester. Treat it as a clean "noUpdate"
    // result with a friendly status, no error banner.
    if (errCode === 'ERR_UPDATES_FETCH' || /Failed to download new update/i.test(detail)) {
      onStatus?.('Already up to date');
      return 'noUpdate';
    }
    onStatus?.('Error');
    onError?.(detail);
    return 'errored';
  }
}
