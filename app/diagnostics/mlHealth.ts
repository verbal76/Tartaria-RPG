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
// OTA-287 — mid-use crash detection. Same breadcrumb pattern as init,
// but wraps Qwen generate/stream calls. A SIGSEGV in
// lm_ggml_graph_compute_thread (the Pixel 10 Pro XL / Android 16 Beta
// signature) crashes during inference AFTER init succeeded — the
// existing init counter doesn't catch it. These keys close that gap.
const KEY_GEN_ATTEMPTED = 'tartaria.ml.lastGenerateAttempt';
const KEY_GEN_SUCCEEDED = 'tartaria.ml.lastGenerateSuccess';
const KEY_MIDUSE_CRASH_COUNT = 'tartaria.ml.midUseCrashCount';
const MAX_CRASHES_BEFORE_DISABLE = 2;

interface MLHealthState {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  crashCount: number;
  disabledByCrash: boolean;
  /** True if we DETECTED a previous-session crash on THIS load
   *  (informational; affects what the summary line reads). */
  detectedCrashThisBoot: boolean;
  // OTA-287 — mid-use generate-crash tracking. Separate from init
  // crashes because they fire AFTER markMLInitSucceeded — i.e.,
  // Qwen booted clean, then crashed during a generate() call. Total
  // disable threshold combines both counts (crashCount + midUseCrashCount).
  lastGenerateAttemptAt: string | null;
  lastGenerateSuccessAt: string | null;
  midUseCrashCount: number;
  detectedMidUseCrashThisBoot: boolean;
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
  let genAttempted: string | null = null;
  let genSucceeded: string | null = null;
  let midUseCountStr: string | null = null;
  try {
    [attempted, succeeded, crashCountStr, disabledStr, genAttempted, genSucceeded, midUseCountStr] = await Promise.all([
      AsyncStorage.getItem(KEY_ATTEMPTED),
      AsyncStorage.getItem(KEY_SUCCEEDED),
      AsyncStorage.getItem(KEY_CRASH_COUNT),
      AsyncStorage.getItem(KEY_DISABLED),
      AsyncStorage.getItem(KEY_GEN_ATTEMPTED),
      AsyncStorage.getItem(KEY_GEN_SUCCEEDED),
      AsyncStorage.getItem(KEY_MIDUSE_CRASH_COUNT),
    ]);
  } catch {
    // AsyncStorage failed — defensive default to "all clean, attempt ML."
  }

  let crashCount = Number.parseInt(crashCountStr ?? '0', 10);
  if (!Number.isFinite(crashCount) || crashCount < 0) crashCount = 0;
  let midUseCrashCount = Number.parseInt(midUseCountStr ?? '0', 10);
  if (!Number.isFinite(midUseCrashCount) || midUseCrashCount < 0) midUseCrashCount = 0;
  let disabledByCrash = disabledStr === 'true';

  // Detect previous-session INIT crash: attempted exists and either
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
  }

  // OTA-287 — detect previous-session MID-USE crash: generate
  // attempted exists and either generate succeeded doesn't exist, OR
  // generate succeeded predates the attempt. Same pattern, different
  // keys. Pixel 10 Pro XL on Android 16 Beta hits SIGSEGV in
  // lm_ggml_graph_compute_thread during inference — survives init,
  // dies on first/Nth generate. Without this, the init counter never
  // ticks and Qwen keeps crashing on every narration attempt.
  let detectedMidUseCrashThisBoot = false;
  if (genAttempted && (!genSucceeded || genSucceeded < genAttempted)) {
    detectedMidUseCrashThisBoot = true;
    midUseCrashCount += 1;
    try {
      await AsyncStorage.setItem(KEY_MIDUSE_CRASH_COUNT, String(midUseCrashCount));
    } catch {
      // ignore
    }
  }

  // Combined disable check — total crashes (init + mid-use) against
  // the same threshold. So a player with 1 init crash + 1 mid-use
  // crash auto-disables at the next launch, same as 2 of either.
  const totalCrashes = crashCount + midUseCrashCount;
  if (totalCrashes >= MAX_CRASHES_BEFORE_DISABLE && !disabledByCrash) {
    disabledByCrash = true;
    try {
      await AsyncStorage.setItem(KEY_DISABLED, 'true');
    } catch {
      // ignore
    }
  }

  cached = {
    lastAttemptAt: attempted,
    lastSuccessAt: succeeded,
    crashCount,
    disabledByCrash,
    detectedCrashThisBoot,
    lastGenerateAttemptAt: genAttempted,
    lastGenerateSuccessAt: genSucceeded,
    midUseCrashCount,
    detectedMidUseCrashThisBoot,
  };
  return cached;
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
 * OTA-287 — call BEFORE each Qwen generate/stream call. Writes a
 * mid-use breadcrumb that's checked next launch the same way init
 * is. Lightweight (single AsyncStorage write per generate).
 */
export async function markMLGenerateAttempted(): Promise<void> {
  const now = new Date().toISOString();
  try {
    await AsyncStorage.setItem(KEY_GEN_ATTEMPTED, now);
  } catch {
    // ignore — best effort
  }
  if (cached) cached.lastGenerateAttemptAt = now;
}

/**
 * OTA-287 — call AFTER a Qwen generate/stream completes successfully.
 * Clears the mid-use suspicion for the breadcrumb pair. Safe to call
 * multiple times per session.
 */
export async function markMLGenerateSucceeded(): Promise<void> {
  const now = new Date().toISOString();
  try {
    await AsyncStorage.setItem(KEY_GEN_SUCCEEDED, now);
  } catch {
    // ignore — best effort
  }
  if (cached) cached.lastGenerateSuccessAt = now;
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
      AsyncStorage.removeItem(KEY_MIDUSE_CRASH_COUNT),
    ]);
  } catch {
    // ignore
  }
  if (cached) {
    cached.crashCount = 0;
    cached.midUseCrashCount = 0;
    cached.disabledByCrash = false;
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
  const totalCrashes = state.crashCount + state.midUseCrashCount;
  let status: string;
  if (state.disabledByCrash) {
    status = `auto-disabled after ${totalCrashes} crashes (template narration in use)`;
  } else if (state.detectedCrashThisBoot || state.detectedMidUseCrashThisBoot) {
    const kind = state.detectedMidUseCrashThisBoot ? 'mid-use' : 'init';
    status = `recovering — detected a ${kind} crash on previous launch (${totalCrashes}/${MAX_CRASHES_BEFORE_DISABLE} before auto-disable)`;
  } else if (totalCrashes > 0) {
    status = `degraded — ${totalCrashes}/${MAX_CRASHES_BEFORE_DISABLE} crashes detected this install`;
  } else {
    status = `active (no crashes detected)`;
  }
  return [
    `ML runtime health`,
    `  Status: ${status}`,
    `  Init crash count: ${state.crashCount}`,
    `  Mid-use crash count: ${state.midUseCrashCount}`,
    `  Last init attempt: ${state.lastAttemptAt ?? 'never'}`,
    `  Last init success: ${state.lastSuccessAt ?? 'never'}`,
    `  Last generate attempt: ${state.lastGenerateAttemptAt ?? 'never'}`,
    `  Last generate success: ${state.lastGenerateSuccessAt ?? 'never'}`,
    `  Crashes-before-disable threshold: ${MAX_CRASHES_BEFORE_DISABLE}`,
  ].join('\n');
}
