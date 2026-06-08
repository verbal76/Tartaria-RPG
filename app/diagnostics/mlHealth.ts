// OTA-272 — ML runtime health tracker.
//
// Player context: on certain Android devices (Snapdragon 865-era —
// Galaxy S20 family, Pixel 5, OnePlus 8, etc.) native ML libraries
// `llama.rn` (Qwen) and `react-native-executorch` (Kokoro / vision)
// crash with SIGSEGV / SIGILL during init or first use. Root cause
// is upstream CPU-variant-selection bugs we can't patch in an OTA.
// What we CAN do: detect when ML init has crashed before and skip
// it on subsequent launches, so the app boots cleanly and falls
// back to template narration silently.
//
// Mechanism:
//   1. BEFORE attempting ML init each session, we write
//      `lastInitAttempt = <ISO timestamp>` to AsyncStorage.
//   2. AFTER ML init succeeds, we write
//      `lastInitSuccess = <ISO timestamp>`.
//   3. ON NEXT BOOT, we read both. If `lastInitAttempt` exists but
//      either `lastInitSuccess` doesn't or `lastInitSuccess <
//      lastInitAttempt`, the previous session crashed mid-init. We
//      increment `crashCount`.
//   4. If `crashCount >= MAX_CRASHES_BEFORE_DISABLE` (2), we set
//      `disabledByCrash = true` and `shouldAttemptMLInit()` returns
//      false from then on — the app stops attempting ML init,
//      template narration is used permanently for this install
//      until the player manually resets via a future Settings
//      toggle.
//
// Why two crashes before disable: one crash could be a transient
// download issue / OOM in a weird state. Two consecutive crashes is
// a strong signal that this device/install profile genuinely can't
// support the native lib.
//
// Native crashes (SIGSEGV / SIGILL) abort the process before JS
// try/catch can run, so the only reliable detection signal is the
// "attempted but never succeeded" breadcrumb in AsyncStorage. This
// gives us coverage even when the crash is in C++ land.
//
// Health summary (mlHealthSummary) is wired into the bug-report /
// log COPY/SHARE output via app/diagnostics/aboutSummary.ts, so
// when a tester sends a bug report we immediately see if they're
// in the auto-disabled state, how many crashes they've hit, and
// when the last attempt/success was.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_ATTEMPTED = 'tartaria.ml.lastInitAttempt';
const KEY_SUCCEEDED = 'tartaria.ml.lastInitSuccess';
const KEY_CRASH_COUNT = 'tartaria.ml.crashCount';
const KEY_DISABLED = 'tartaria.ml.disabledByCrash';
const MAX_CRASHES_BEFORE_DISABLE = 2;

// OTA-351 — Qwen COMPLETION-crash guard. The init guard above only catches
// crashes during init. But on newer high-end ARM cores (e.g. Pixel 10 Pro XL /
// Tensor G5) llama.rn's SVE-optimized kernels can SIGSEGV during token
// generation — AFTER a clean init (`qwen:done`), so the init guard never fires
// and the process just dies mid-narration and relaunches. Same breadcrumb trick,
// scoped to completions: write a breadcrumb before each completion, clear it
// after; if it survives to the next boot, a completion crashed the process.
// After MAX_QWEN_COMPLETION_CRASHES we disable ONLY Qwen (the classifier /
// Kokoro are a different native lib and stay on) — the Arbiter falls back to
// template narration, fully playable.
const KEY_COMPLETION_IN_PROGRESS = 'tartaria.ml.qwenCompletionInProgress';
const KEY_QWEN_CRASH_COUNT = 'tartaria.ml.qwenCompletionCrashCount';
const KEY_QWEN_DISABLED = 'tartaria.ml.qwenDisabledByCrash';
const MAX_QWEN_COMPLETION_CRASHES = 3; // completions recover, so a touch more tolerant than init (2)

interface MLHealthState {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  crashCount: number;
  disabledByCrash: boolean;
  /** True if we DETECTED a previous-session crash on THIS load
   *  (informational; affects what the summary line reads). */
  detectedCrashThisBoot: boolean;
  // OTA-351 — Qwen completion-crash guard (independent of the init guard above).
  qwenCompletionCrashCount: number;
  qwenDisabledByCrash: boolean;
  detectedQwenCompletionCrashThisBoot: boolean;
}

let cached: MLHealthState | null = null;

/**
 * Read ML health state from AsyncStorage. Called once on boot,
 * BEFORE any ML init runs. Detects "previous session crashed"
 * and increments crashCount accordingly. Subsequent reads return
 * the cached value (no re-read of AsyncStorage).
 */
export async function loadMLHealth(): Promise<MLHealthState> {
  if (cached) return cached;

  let attempted: string | null = null;
  let succeeded: string | null = null;
  let crashCountStr: string | null = null;
  let disabledStr: string | null = null;
  let completionInProgress: string | null = null;
  let qwenCrashCountStr: string | null = null;
  let qwenDisabledStr: string | null = null;
  try {
    [attempted, succeeded, crashCountStr, disabledStr, completionInProgress, qwenCrashCountStr, qwenDisabledStr] = await Promise.all([
      AsyncStorage.getItem(KEY_ATTEMPTED),
      AsyncStorage.getItem(KEY_SUCCEEDED),
      AsyncStorage.getItem(KEY_CRASH_COUNT),
      AsyncStorage.getItem(KEY_DISABLED),
      AsyncStorage.getItem(KEY_COMPLETION_IN_PROGRESS),
      AsyncStorage.getItem(KEY_QWEN_CRASH_COUNT),
      AsyncStorage.getItem(KEY_QWEN_DISABLED),
    ]);
  } catch {
    // AsyncStorage failed — defensive default to "all clean, attempt ML."
  }

  let crashCount = Number.parseInt(crashCountStr ?? '0', 10);
  if (!Number.isFinite(crashCount) || crashCount < 0) crashCount = 0;
  let disabledByCrash = disabledStr === 'true';

  // Detect previous-session crash: attempted exists and either
  // succeeded doesn't exist, OR succeeded predates attempted.
  let detectedCrashThisBoot = false;
  if (attempted && (!succeeded || succeeded < attempted)) {
    detectedCrashThisBoot = true;
    crashCount += 1;
    try {
      await AsyncStorage.setItem(KEY_CRASH_COUNT, String(crashCount));
    } catch {
      // Best-effort — if AsyncStorage write fails the counter stays
      // in-memory; we'll re-detect next launch.
    }
    if (crashCount >= MAX_CRASHES_BEFORE_DISABLE) {
      disabledByCrash = true;
      try {
        await AsyncStorage.setItem(KEY_DISABLED, 'true');
      } catch {
        // ignore
      }
    }
  }

  // OTA-351 — Qwen completion-crash detection. If the completion breadcrumb
  // survived to this boot, a completion crashed the process last session.
  let qwenCompletionCrashCount = Number.parseInt(qwenCrashCountStr ?? '0', 10);
  if (!Number.isFinite(qwenCompletionCrashCount) || qwenCompletionCrashCount < 0) qwenCompletionCrashCount = 0;
  let qwenDisabledByCrash = qwenDisabledStr === 'true';
  let detectedQwenCompletionCrashThisBoot = false;
  if (completionInProgress) {
    detectedQwenCompletionCrashThisBoot = true;
    qwenCompletionCrashCount += 1;
    try {
      await AsyncStorage.setItem(KEY_QWEN_CRASH_COUNT, String(qwenCompletionCrashCount));
      await AsyncStorage.removeItem(KEY_COMPLETION_IN_PROGRESS);
    } catch { /* re-detected next launch if the write fails */ }
    if (qwenCompletionCrashCount >= MAX_QWEN_COMPLETION_CRASHES) {
      qwenDisabledByCrash = true;
      try { await AsyncStorage.setItem(KEY_QWEN_DISABLED, 'true'); } catch { /* ignore */ }
    }
  }

  cached = {
    lastAttemptAt: attempted,
    lastSuccessAt: succeeded,
    crashCount,
    disabledByCrash,
    detectedCrashThisBoot,
    qwenCompletionCrashCount,
    qwenDisabledByCrash,
    detectedQwenCompletionCrashThisBoot,
  };
  return cached;
}

/**
 * OTA-351 — should we attempt to BOOT Qwen this session? False once the
 * completion-crash guard has tripped (so the generative model stays off and the
 * Arbiter uses template narration), OR if the broad ML guard is disabled.
 * Independent of the classifier / Kokoro, which use a different native lib.
 */
export function shouldAttemptQwen(): boolean {
  if (!shouldAttemptMLInit()) return false;
  return !(cached?.qwenDisabledByCrash ?? false);
}

/** OTA-351 — call BEFORE each Qwen completion. AWAITED so the breadcrumb is
 *  durably flushed before the native call (a SIGSEGV mid-completion then leaves
 *  it behind for the next boot to detect). No-op if Qwen is already disabled. */
export async function markQwenCompletionStart(): Promise<void> {
  if (cached?.qwenDisabledByCrash) return;
  try {
    await AsyncStorage.setItem(KEY_COMPLETION_IN_PROGRESS, new Date().toISOString());
  } catch { /* best effort — lose detection for this one completion */ }
}

/** OTA-351 — call AFTER a Qwen completion returns (success). Clears the
 *  breadcrumb so a clean completion is never counted as a crash. */
export async function markQwenCompletionDone(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_COMPLETION_IN_PROGRESS);
  } catch { /* ignore — re-detected only if a crash also occurs, which it didn't */ }
}

/**
 * Should we attempt ML init this session? Returns false when the
 * crash counter has tripped the auto-disable. Callers (App.tsx
 * boot orchestrator) check this BEFORE calling bootCognitive /
 * bootQwen / Piper init.
 */
export function shouldAttemptMLInit(): boolean {
  return !(cached?.disabledByCrash ?? false);
}

/**
 * Call BEFORE attempting ML init. Writes a breadcrumb that, if not
 * followed by markMLInitSucceeded before next launch, will be
 * detected as a crash on the next boot.
 */
export async function markMLInitAttempted(): Promise<void> {
  const now = new Date().toISOString();
  try {
    await AsyncStorage.setItem(KEY_ATTEMPTED, now);
  } catch {
    // ignore — best effort
  }
  if (cached) cached.lastAttemptAt = now;
}

/**
 * Call AFTER ML init completes successfully. Clears the
 * attempted-but-not-succeeded suspicion. Safe to call multiple
 * times per session (each ML subsystem can mark on its own).
 */
export async function markMLInitSucceeded(): Promise<void> {
  const now = new Date().toISOString();
  try {
    await AsyncStorage.setItem(KEY_SUCCEEDED, now);
  } catch {
    // ignore — best effort
  }
  if (cached) cached.lastSuccessAt = now;
}

/**
 * Manual re-enable. Resets crashCount + disabledByCrash. Called
 * from a future Settings toggle ("Restore AI features"); not wired
 * to any UI yet (flagged for OTA-273).
 */
export async function resetMLHealth(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(KEY_CRASH_COUNT),
      AsyncStorage.removeItem(KEY_DISABLED),
      // OTA-351 — also clear the Qwen completion-crash guard.
      AsyncStorage.removeItem(KEY_QWEN_CRASH_COUNT),
      AsyncStorage.removeItem(KEY_QWEN_DISABLED),
      AsyncStorage.removeItem(KEY_COMPLETION_IN_PROGRESS),
    ]);
  } catch {
    // ignore
  }
  if (cached) {
    cached.crashCount = 0;
    cached.disabledByCrash = false;
    cached.qwenCompletionCrashCount = 0;
    cached.qwenDisabledByCrash = false;
  }
}

/**
 * Multi-line summary for buildBasicDeviceSummary's bug-report
 * output. Wired in via app/diagnostics/aboutSummary.ts so every
 * COPY / SHARE log export carries this block — the dev sees at a
 * glance whether the tester self-disabled ML, how many crashes,
 * and the timestamps for triage.
 */
export function mlHealthSummary(): string {
  const state = cached;
  if (!state) {
    return [
      `ML runtime health`,
      `  Status: not yet loaded`,
    ].join('\n');
  }
  let status: string;
  if (state.disabledByCrash) {
    status = `auto-disabled after ${state.crashCount} crashes (template narration in use)`;
  } else if (state.detectedCrashThisBoot) {
    status = `recovering — detected a crash on previous launch (${state.crashCount}/${MAX_CRASHES_BEFORE_DISABLE} before auto-disable)`;
  } else if (state.crashCount > 0) {
    status = `degraded — ${state.crashCount}/${MAX_CRASHES_BEFORE_DISABLE} crashes detected this install`;
  } else {
    status = `active (no crashes detected)`;
  }
  // OTA-351 — Qwen completion-crash guard line (the SVE-on-Tensor-G5 class).
  let qwenStatus: string;
  if (state.qwenDisabledByCrash) {
    qwenStatus = `auto-disabled after ${state.qwenCompletionCrashCount} completion crashes (template narration in use)`;
  } else if (state.detectedQwenCompletionCrashThisBoot) {
    qwenStatus = `recovering — completion crash on previous launch (${state.qwenCompletionCrashCount}/${MAX_QWEN_COMPLETION_CRASHES} before auto-disable)`;
  } else if (state.qwenCompletionCrashCount > 0) {
    qwenStatus = `${state.qwenCompletionCrashCount}/${MAX_QWEN_COMPLETION_CRASHES} completion crashes this install`;
  } else {
    qwenStatus = `clean (no completion crashes)`;
  }
  return [
    `ML runtime health`,
    `  Status: ${status}`,
    `  Crash count: ${state.crashCount}`,
    `  Last init attempt: ${state.lastAttemptAt ?? 'never'}`,
    `  Last init success: ${state.lastSuccessAt ?? 'never'}`,
    `  Crashes-before-disable threshold: ${MAX_CRASHES_BEFORE_DISABLE}`,
    `  Qwen completion guard: ${qwenStatus}`,
  ].join('\n');
}
