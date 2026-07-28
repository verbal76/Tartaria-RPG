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
// OTA-1008 — the build stamp the voice-crash count is scoped to. buildInfo imports
// nothing, so this cannot cycle.
import { OTA_BUILD_ID } from '../buildInfo';

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
// arb128 — threshold back to 1, PLUS a permanent give-up ceiling. The hard lesson
// of OTA 557-561: this guard's whole PURPOSE is real — the Pixel 10 Pro XL / Tensor
// G5 genuinely SIGSEGVs during Qwen token generation and drops to the home screen
// (and thrashes the JS narration pipeline into a "Maximum update depth exceeded"
// render loop). "I never crash" was true only because the guard had ALREADY
// disabled Qwen. So: (1) MAX = 1 again — one real completion crash disables Qwen
// fast (a benign mid-generation close is rare and clearInFlightBreadcrumbs clears
// it on an orderly exit; OTA-414 auto-retry still re-tries a flaky-but-capable
// device). (2) After QWEN_PERMA_DISABLE_AT total completion crashes the device is
// judged genuinely incapable and Qwen is disabled PERMANENTLY — auto-retry stops,
// so the player isn't re-crashed every few boots — until they manually Reset AI in
// Settings. Template narration is fully playable; Kokoro voice is unaffected.
const MAX_QWEN_COMPLETION_CRASHES = 1;
const QWEN_PERMA_DISABLE_AT = 3;

// OTA-413 — VOICE (TTS) crash breadcrumb. Same trick as the Qwen completion guard,
// scoped to the bundled neural TTS (executorch Kokoro/Piper): the native synth +
// playback can SIGSEGV mid-utterance AFTER a clean voice init, so the init guards
// never fire and the process just dies. We write a breadcrumb (with a label naming
// the voice) before each utterance and clear it after; if it survives to the next
// boot, a voice op crashed the process — and we now KNOW it was voice, not Qwen.
// OTA-463 wired an auto-disable here; OTA-464 REVERTED it. The breadcrumb-survives
// detection can't distinguish a real Kokoro SIGSEGV from a benign app termination
// (an OTA reload mid-utterance, OS backgrounding, or the user swiping the app away
// all leave the same breadcrumb), so a threshold of 1 false-tripped on the OTA-reload
// churn of a testing session and dropped a perfectly healthy Kokoro to the system
// voice — which the user explicitly does not want. We keep COUNTING + NAMING voice
// crashes for the diagnostic (genuinely useful triage signal), but never auto-disable.
// KEY_TTS_DISABLED is retained only so loadMLHealth can self-heal (clear) a flag left
// on a device by OTA-463.
const KEY_TTS_IN_PROGRESS = 'tartaria.ml.ttsInProgress';
const KEY_TTS_CRASH_COUNT = 'tartaria.ml.ttsCrashCount';
const KEY_TTS_DISABLED = 'tartaria.ml.ttsDisabledByCrash';
// OTA-1008 — which build the voice-crash count was accumulated under. When this stops
// matching OTA_BUILD_ID the count is describing code that is no longer installed,
// so it is re-zeroed. See the block in loadMLHealth for why this is safe here and
// deliberately NOT done for the Qwen / init guards.
const KEY_TTS_COUNT_BUILD = 'tartaria.ml.ttsCrashCountBuild';

// OTA-414 — AUTO-RETRY with backoff for the Qwen completion guard. The disable is
// no longer permanent: once it trips, Qwen gets another attempt after a cooldown
// measured in COLD BOOTS. If the retry session survives (no completion crash), Qwen
// RECOVERS (re-enabled, crash count cleared). If it crashes again, the cooldown
// doubles (capped) so a genuinely-incapable device retries less and less often
// while a flaky-but-capable one heals on the first good run.
const KEY_BOOT_COUNT = 'tartaria.ml.bootCount';
const KEY_QWEN_RETRY_AT = 'tartaria.ml.qwenRetryAtBoot';
const KEY_QWEN_RETRY_PENDING = 'tartaria.ml.qwenRetryPending';
const KEY_QWEN_BACKOFF = 'tartaria.ml.qwenBackoffBoots';
const QWEN_RETRY_BASE_BOOTS = 5;  // first cooldown after a disable
const QWEN_RETRY_MAX_BOOTS = 40;  // cap — a bad device retries at most every 40 boots

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
  /** arb128 — total completion crashes reached QWEN_PERMA_DISABLE_AT; the device
   *  is judged genuinely unable to run on-device generation, so Qwen is disabled
   *  permanently (auto-retry stops) until a manual Reset AI. */
  qwenPermaDisabled: boolean;
  // OTA-413 — voice (TTS) crash breadcrumb. OTA-463 wired the auto-disable.
  ttsCrashCount: number;
  detectedTtsCrashThisBoot: boolean;
  /** OTA-463 — bundled neural TTS (Kokoro) disabled after a confirmed native
   *  crash; the Arbiter falls back to the system device voice (expo-speech). */
  ttsDisabledByCrash: boolean;
  /** The breadcrumb label (voice id) that was in-flight when the process died
   *  last session, if a TTS crash was detected this boot. */
  lastTtsOpBeforeCrash: string | null;
  /** OTA-1008 — this boot is the first on a new build, so the voice-crash count was
   *  re-zeroed (it described the previous build's code). Surfaced in the
   *  diagnostic so a reset is visible rather than silent. */
  ttsCountResetThisBoot: boolean;
  // OTA-414 — Qwen auto-retry/backoff state (for the diagnostic + UX).
  /** This boot is a scheduled retry of a crash-disabled Qwen. */
  qwenRetryingThisBoot: boolean;
  /** A prior retry survived a full run; Qwen was re-enabled this boot. */
  qwenRecoveredThisBoot: boolean;
  /** Cold boots until the next Qwen retry while disabled, or null when enabled /
   *  retrying this boot. */
  qwenNextRetryInBoots: number | null;
  /** arb129 — last-loaded Qwen native kernel variant (e.g. rnllama_v8_4_fp16_dotprod_i8mm)
   *  + the one-line CPU/SoC/kernel diagnostic, reported by LlamaRuntime after init.
   *  Persisted so the copyable bug report names the variant even after a crash. */
  qwenVariant: string | null;
  qwenCpuDiag: string | null;
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
  let ttsInProgress: string | null = null;
  let ttsCrashCountStr: string | null = null;
  let ttsDisabledStr: string | null = null;
  let ttsCountBuildStr: string | null = null;
  let bootCountStr: string | null = null;
  let qwenRetryAtStr: string | null = null;
  let qwenRetryPendingStr: string | null = null;
  let qwenBackoffStr: string | null = null;
  try {
    [attempted, succeeded, crashCountStr, disabledStr, completionInProgress, qwenCrashCountStr, qwenDisabledStr, ttsInProgress, ttsCrashCountStr, ttsDisabledStr, ttsCountBuildStr, bootCountStr, qwenRetryAtStr, qwenRetryPendingStr, qwenBackoffStr] = await Promise.all([
      AsyncStorage.getItem(KEY_ATTEMPTED),
      AsyncStorage.getItem(KEY_SUCCEEDED),
      AsyncStorage.getItem(KEY_CRASH_COUNT),
      AsyncStorage.getItem(KEY_DISABLED),
      AsyncStorage.getItem(KEY_COMPLETION_IN_PROGRESS),
      AsyncStorage.getItem(KEY_QWEN_CRASH_COUNT),
      AsyncStorage.getItem(KEY_QWEN_DISABLED),
      AsyncStorage.getItem(KEY_TTS_IN_PROGRESS),
      AsyncStorage.getItem(KEY_TTS_CRASH_COUNT),
      AsyncStorage.getItem(KEY_TTS_DISABLED),
      AsyncStorage.getItem(KEY_TTS_COUNT_BUILD),
      AsyncStorage.getItem(KEY_BOOT_COUNT),
      AsyncStorage.getItem(KEY_QWEN_RETRY_AT),
      AsyncStorage.getItem(KEY_QWEN_RETRY_PENDING),
      AsyncStorage.getItem(KEY_QWEN_BACKOFF),
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
      // arb125 — CLEAR the attempted breadcrumb after counting, so this same
      // stale "attempted, no success" record can't re-count a PHANTOM crash on
      // every subsequent boot. Without this, a device that stopped attempting
      // (qwen:skipped) climbs its crash count forever just by booting — observed
      // 74 → 78 over four launches with zero real init attempts. A genuine next
      // attempt writes a fresh KEY_ATTEMPTED.
      await AsyncStorage.removeItem(KEY_ATTEMPTED);
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

  // arb128 — re-assert the disable from the STANDING count, not only on the boot a
  // fresh breadcrumb is detected. A device whose count is already at/over the
  // threshold must stay disabled on EVERY boot (its disable flag may have been
  // cleared by a prior recovery/amnesty), BEFORE it attempts another crash-prone
  // completion. And once the count reaches the perma ceiling the device is judged
  // genuinely incapable — Qwen is disabled permanently and auto-retry is skipped.
  const qwenPermaDisabled = qwenCompletionCrashCount >= QWEN_PERMA_DISABLE_AT;
  if (qwenCompletionCrashCount >= MAX_QWEN_COMPLETION_CRASHES) {
    qwenDisabledByCrash = true;
  }

  // OTA-414 — AUTO-RETRY with backoff. Increment the monotonic boot counter, then
  // drive the disable→retry→recover/relapse state machine (cooldown in cold boots).
  let bootCount = Number.parseInt(bootCountStr ?? '0', 10);
  if (!Number.isFinite(bootCount) || bootCount < 0) bootCount = 0;
  bootCount += 1;
  try { await AsyncStorage.setItem(KEY_BOOT_COUNT, String(bootCount)); } catch { /* ignore */ }

  let qwenRetryingThisBoot = false;
  let qwenRecoveredThisBoot = false;
  let qwenNextRetryInBoots: number | null = null;
  const retryWasPending = qwenRetryPendingStr === '1';
  let backoff = Number.parseInt(qwenBackoffStr ?? '0', 10);
  if (!Number.isFinite(backoff) || backoff < QWEN_RETRY_BASE_BOOTS) backoff = QWEN_RETRY_BASE_BOOTS;

  if (qwenDisabledByCrash && qwenPermaDisabled) {
    // arb128 — permanently disabled: never schedule or fire a retry. Clear any
    // pending-retry flag so it can't fire later, and leave Qwen off until a manual
    // Reset AI (resetMLHealth) clears the count.
    if (retryWasPending) {
      try { await AsyncStorage.removeItem(KEY_QWEN_RETRY_PENDING); } catch { /* ignore */ }
    }
  } else if (qwenDisabledByCrash) {
    if (retryWasPending && detectedQwenCompletionCrashThisBoot) {
      // The retry session crashed → grow the backoff and push the next retry out.
      backoff = Math.min(backoff * 2, QWEN_RETRY_MAX_BOOTS);
      const retryAt = bootCount + backoff;
      try {
        await AsyncStorage.setItem(KEY_QWEN_BACKOFF, String(backoff));
        await AsyncStorage.setItem(KEY_QWEN_RETRY_AT, String(retryAt));
        await AsyncStorage.removeItem(KEY_QWEN_RETRY_PENDING);
      } catch { /* ignore */ }
      qwenNextRetryInBoots = retryAt - bootCount;
    } else if (retryWasPending && !detectedQwenCompletionCrashThisBoot) {
      // The retry session SURVIVED a full run → recover: re-enable Qwen + clear its
      // crash count + cooldown. Keep the grown backoff so a future relapse stays
      // cautious.
      qwenDisabledByCrash = false;
      qwenCompletionCrashCount = 0;
      qwenRecoveredThisBoot = true;
      try {
        await AsyncStorage.removeItem(KEY_QWEN_DISABLED);
        await AsyncStorage.removeItem(KEY_QWEN_CRASH_COUNT);
        await AsyncStorage.removeItem(KEY_QWEN_RETRY_PENDING);
        await AsyncStorage.removeItem(KEY_QWEN_RETRY_AT);
      } catch { /* ignore */ }
    } else {
      // Not a retry boot — has the cooldown elapsed? Schedule one if missing.
      let retryAt = Number.parseInt(qwenRetryAtStr ?? '0', 10);
      if (!Number.isFinite(retryAt) || retryAt <= 0) {
        retryAt = bootCount + backoff;
        try {
          await AsyncStorage.setItem(KEY_QWEN_RETRY_AT, String(retryAt));
          await AsyncStorage.setItem(KEY_QWEN_BACKOFF, String(backoff));
        } catch { /* ignore */ }
      }
      if (bootCount >= retryAt) {
        // Cooldown elapsed → attempt Qwen THIS session. Mark the retry pending so
        // next boot can judge whether it survived (recover) or crashed (relapse).
        qwenDisabledByCrash = false;
        qwenRetryingThisBoot = true;
        try { await AsyncStorage.setItem(KEY_QWEN_RETRY_PENDING, '1'); } catch { /* ignore */ }
      } else {
        qwenNextRetryInBoots = retryAt - bootCount;
      }
    }
  } else if (retryWasPending) {
    // Defensive: a pending retry but Qwen isn't disabled — clear the flag.
    try { await AsyncStorage.removeItem(KEY_QWEN_RETRY_PENDING); } catch { /* ignore */ }
  }

  // OTA-413 — voice (TTS) completion-crash detection. If the TTS breadcrumb
  // survived to this boot, a voice utterance crashed the process last session.
  let ttsCrashCount = Number.parseInt(ttsCrashCountStr ?? '0', 10);
  if (!Number.isFinite(ttsCrashCount) || ttsCrashCount < 0) ttsCrashCount = 0;
  // OTA-1008 — a new build means the count describes code that is no longer here, so
  // it starts over. The surviving breadcrumb is dropped in the same breath: the
  // reload that APPLIED the OTA is the textbook benign termination this counter
  // cannot distinguish from a crash (OTA-464's whole reason for pulling the voice
  // auto-disable), so counting it would immediately re-inflate the number we just
  // reset. Anything the voice does wrong on the new build is counted normally
  // from the next utterance onward.
  let ttsCountResetThisBoot = false;
  if (ttsCountBuildStr !== OTA_BUILD_ID) {
    ttsCountResetThisBoot = ttsCrashCount > 0 || !!ttsInProgress;
    ttsCrashCount = 0;
    ttsInProgress = null;
    try {
      await AsyncStorage.removeItem(KEY_TTS_CRASH_COUNT);
      await AsyncStorage.removeItem(KEY_TTS_IN_PROGRESS);
      await AsyncStorage.setItem(KEY_TTS_COUNT_BUILD, OTA_BUILD_ID);
    } catch { /* retried next boot — the stamp write is the only durable part */ }
  }
  let detectedTtsCrashThisBoot = false;
  let lastTtsOpBeforeCrash: string | null = null;
  // OTA-464 — voice auto-disable REVERTED to detection-only (was OTA-463). The
  // breadcrumb can't distinguish a real Kokoro SIGSEGV from a benign app
  // termination (OTA reload mid-utterance, backgrounding, swipe-away), so a
  // threshold of 1 false-tripped on reload churn and forced a healthy Kokoro to
  // the system voice. We keep COUNTING + naming for the diagnostic, but never
  // disable. ttsDisabledByCrash is pinned false, and any stale disable flag a
  // device picked up under OTA-463 is cleared here so Kokoro self-heals on load.
  const ttsDisabledByCrash = false;
  if (ttsDisabledStr === 'true') {
    try { await AsyncStorage.removeItem(KEY_TTS_DISABLED); } catch { /* ignore */ }
  }
  if (ttsInProgress) {
    detectedTtsCrashThisBoot = true;
    ttsCrashCount += 1;
    // The breadcrumb is `{"label":<voice>,"at":<iso>}`; surface the label.
    try { lastTtsOpBeforeCrash = (JSON.parse(ttsInProgress) as { label?: string }).label ?? ttsInProgress; }
    catch { lastTtsOpBeforeCrash = ttsInProgress; }
    try {
      await AsyncStorage.setItem(KEY_TTS_CRASH_COUNT, String(ttsCrashCount));
      await AsyncStorage.removeItem(KEY_TTS_IN_PROGRESS);
    } catch { /* re-detected next launch if the write fails */ }
  }

  // arb129 — last-loaded Qwen kernel variant + CPU/SoC diag (best-effort; read
  // separately so a failure here can't disturb the core health load).
  let qwenVariant: string | null = null;
  let qwenCpuDiag: string | null = null;
  try {
    [qwenVariant, qwenCpuDiag] = await Promise.all([
      AsyncStorage.getItem('tartaria.ml.qwenVariant'),
      AsyncStorage.getItem('tartaria.ml.qwenCpuDiag'),
    ]);
  } catch { /* diagnostics only */ }

  cached = {
    lastAttemptAt: attempted,
    lastSuccessAt: succeeded,
    crashCount,
    disabledByCrash,
    detectedCrashThisBoot,
    qwenCompletionCrashCount,
    qwenDisabledByCrash,
    detectedQwenCompletionCrashThisBoot,
    qwenPermaDisabled,
    ttsCrashCount,
    detectedTtsCrashThisBoot,
    ttsDisabledByCrash,
    lastTtsOpBeforeCrash,
    ttsCountResetThisBoot,
    qwenRetryingThisBoot,
    qwenRecoveredThisBoot,
    qwenNextRetryInBoots,
    qwenVariant,
    qwenCpuDiag,
  };
  return cached;
}

/**
 * arb129 — record the native Qwen kernel variant + CPU/SoC diagnostic that
 * LlamaRuntime captured from the patched llama.rn selector after a successful
 * init. Persisted so the copyable bug report shows which kernel this device ran
 * (e.g. confirming the SVE-disable workaround steered it to a non-SVE variant),
 * and so the variant survives into the NEXT boot's report after a crash.
 */
export async function recordQwenRuntime(variant: string, diag: string): Promise<void> {
  try {
    if (variant) await AsyncStorage.setItem('tartaria.ml.qwenVariant', variant);
    if (diag) await AsyncStorage.setItem('tartaria.ml.qwenCpuDiag', diag);
  } catch { /* best effort — diagnostics only */ }
  if (cached) {
    if (variant) cached.qwenVariant = variant;
    if (diag) cached.qwenCpuDiag = diag;
  }
}

/**
 * OTA-351 — should we attempt to BOOT Qwen this session? False once the
 * completion-crash guard has tripped (so the generative model stays off and the
 * Arbiter uses template narration), OR if the broad ML guard is disabled.
 * Independent of the classifier / Kokoro, which use a different native lib.
 */
export function shouldAttemptQwen(): boolean {
  // Qwen's OWN reliable failure signal — a breadcrumb wrapped tight around the
  // completion call — is the hard gate. (0 for the reporting device.)
  if (cached?.qwenDisabledByCrash) return false;
  // arb124 — the GENERAL ml-init crash guard (MAX_CRASHES_BEFORE_DISABLE) exists
  // to stop a device that genuinely can't load the model from boot-looping. But
  // its "attempted, never recorded a success" breadcrumb false-positives every
  // time the OS kills the app mid-load, so it inflated to 74 on a device that
  // had ALREADY loaded the model fine and never had a real Qwen failure. If ML
  // has EVER initialized successfully on this install, the device demonstrably
  // CAN load it — so don't let the polluted general counter permanently bench
  // Qwen. (markMLInitSucceeded also resets that counter on each success.)
  if (cached?.lastSuccessAt) return true;
  // Never succeeded → honor the general boot-resilience guard.
  return shouldAttemptMLInit();
}

/**
 * OTA-464 — ALWAYS true. The OTA-463 voice auto-disable was reverted (its
 * breadcrumb detection false-tripped on OTA-reload churn and dropped a healthy
 * Kokoro to the system voice). The bundled neural voice is no longer gated on a
 * crash counter; this is kept as a stable hook returning true. Voice crashes are
 * still counted + named in the diagnostic, just never acted on.
 */
export function shouldAttemptBundledTTS(): boolean {
  return true;
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
 *  breadcrumb so a clean completion is never counted as a crash.
 *  arb128 — a single clean completion does NOT wipe the standing crash count (the
 *  OTA-559 success-reset was removed): a device that crashes INTERMITTENTLY would
 *  keep resetting and never reach the give-up ceiling, so it would re-crash forever.
 *  The legitimate recovery signal is a full clean RETRY SESSION (handled in
 *  loadMLHealth's auto-retry block), not one completion. */
export async function markQwenCompletionDone(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_COMPLETION_IN_PROGRESS);
  } catch { /* ignore — re-detected only if a crash also occurs, which it didn't */ }
}

/** OTA-413 — call BEFORE each bundled-TTS utterance (neural synth + playback).
 *  AWAITED so the breadcrumb is durably flushed before the native call; a SIGSEGV
 *  mid-utterance then leaves it for the next boot to detect + NAME (the label is
 *  the voice id). Best-effort. */
export async function markTTSStart(label: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_TTS_IN_PROGRESS, JSON.stringify({ label, at: new Date().toISOString() }));
  } catch { /* best effort — lose detection for this one utterance */ }
}

/** OTA-413 — call AFTER a TTS utterance finishes (success OR a JS-caught error —
 *  either way the process survived, so it wasn't a native crash). Clears the
 *  breadcrumb so a clean utterance is never counted. */
export async function markTTSDone(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_TTS_IN_PROGRESS);
  } catch { /* ignore */ }
}

// arb126 — ROOT-CAUSE fix for the Qwen completion guard re-disabling a healthy
// device. The completion + TTS breadcrumbs (KEY_COMPLETION_IN_PROGRESS /
// KEY_TTS_IN_PROGRESS) can't, on their own, distinguish a real native SIGSEGV
// mid-generation from a perfectly benign app termination — the user swiping the
// app away, the OS backgrounding it to reclaim memory, or an OTA reload — all of
// which leave the SAME surviving breadcrumb. OTA-464 already conceded this for
// the VOICE guard (so it's detection-only). But the Qwen completion guard still
// AUTO-DISABLES at a threshold of 1, so a single backgrounding-while-narrating
// benched the Arbiter on a device with ZERO real crashes (observed: 1 Qwen
// "completion crash" + 1 Kokoro "voice crash" recorded on the SAME launch — the
// same benign close, double-counted by two guards).
//
// The distinguisher: a real foreground SIGSEGV kills the process with NO warning,
// but a benign exit fires an AppState 'background'/'inactive' transition FIRST.
// So the moment the app leaves the foreground (an orderly exit), we wipe the
// in-flight breadcrumbs. Anything that survives to the next boot therefore died
// while still in the foreground mid-op = a genuine crash, which is exactly the
// signal both guards want. Generation + narration only ever run in the
// foreground (driven by player actions), so this never masks a real failure.
// Wired into the existing App.tsx AppState handler (which already persists the
// save + shuts down Qwen/cognitive on background).
export async function clearInFlightBreadcrumbs(): Promise<void> {
  try {
    // arb127 — use removeItem (the pattern the rest of this module + resetMLHealth
    // use), NOT multiRemove. multiRemove silently did nothing on the device's
    // AsyncStorage build (the jest mocks implement it, so this went unnoticed) —
    // so OTA-559's breadcrumb-clear never actually fired and benign closes kept
    // being mis-counted. removeItem is proven to work here.
    await Promise.all([
      AsyncStorage.removeItem(KEY_COMPLETION_IN_PROGRESS),
      AsyncStorage.removeItem(KEY_TTS_IN_PROGRESS),
    ]);
  } catch { /* best effort — a stale breadcrumb at worst counts one benign exit */ }
}

// arb128 — the OTA-560 "amnesty" (healStaleGuardState) was REMOVED. It forgave the
// completion-crash history once per install, built on the false premise that the
// counts were benign-close phantoms. They were REAL: this device SIGSEGVs on Qwen
// generation, and the amnesty re-enabled Qwen → crash-to-home loop + a "Maximum
// update depth exceeded" render loop. Forgiving a genuinely-incapable device just
// re-crashes it. The guard's job is to KEEP Qwen off here; the player can still
// manually re-enable via Settings → Reset AI (resetMLHealth) if they want to retry.

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
    // arb124 — a successful init PROVES this device can load the model, so wipe
    // any GENERAL init-crash suspicion. That breadcrumb false-positives whenever
    // the OS kills the app mid-load (backgrounding during the slow model load),
    // and was permanently benching Qwen on devices that actually run it fine
    // (e.g. a Pixel 10 Pro XL sitting at 74 "crashes" with 0 real Qwen failures).
    // The Qwen-COMPLETION guard (KEY_QWEN_*) is intentionally left intact.
    await AsyncStorage.removeItem(KEY_CRASH_COUNT);
    await AsyncStorage.removeItem(KEY_DISABLED);
  } catch {
    // ignore — best effort
  }
  if (cached) {
    cached.lastSuccessAt = now;
    cached.crashCount = 0;
    cached.disabledByCrash = false;
  }
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
      // OTA-413/463 — also clear the voice (TTS) crash breadcrumb + count + disable.
      AsyncStorage.removeItem(KEY_TTS_CRASH_COUNT),
      AsyncStorage.removeItem(KEY_TTS_IN_PROGRESS),
      AsyncStorage.removeItem(KEY_TTS_DISABLED),
      // OTA-1008 — drop the build stamp as well, so the next load re-stamps against
      // the running build instead of leaving a count scoped to nothing.
      AsyncStorage.removeItem(KEY_TTS_COUNT_BUILD),
      // OTA-414 — clear the Qwen auto-retry/backoff schedule.
      AsyncStorage.removeItem(KEY_QWEN_RETRY_AT),
      AsyncStorage.removeItem(KEY_QWEN_RETRY_PENDING),
      AsyncStorage.removeItem(KEY_QWEN_BACKOFF),
    ]);
  } catch {
    // ignore
  }
  if (cached) {
    cached.crashCount = 0;
    cached.disabledByCrash = false;
    cached.qwenCompletionCrashCount = 0;
    cached.qwenDisabledByCrash = false;
    cached.qwenPermaDisabled = false;
    cached.ttsCrashCount = 0;
    cached.detectedTtsCrashThisBoot = false;
    cached.ttsCountResetThisBoot = false;
    cached.ttsDisabledByCrash = false;
    cached.lastTtsOpBeforeCrash = null;
    cached.qwenRetryingThisBoot = false;
    cached.qwenRecoveredThisBoot = false;
    cached.qwenNextRetryInBoots = null;
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
  // OTA-351/414 — Qwen completion-crash guard line, now with auto-retry/backoff.
  let qwenStatus: string;
  if (state.qwenPermaDisabled) {
    qwenStatus = `permanently disabled after ${state.qwenCompletionCrashCount} completion crashes — this device can't run on-device generation; template narration in use (Settings → Reset AI to retry)`;
  } else if (state.qwenRecoveredThisBoot) {
    qwenStatus = `RECOVERED — a retry survived a clean run; AI narration re-enabled`;
  } else if (state.qwenRetryingThisBoot) {
    qwenStatus = `retrying this boot (cooldown elapsed after ${state.qwenCompletionCrashCount} completion crashes)`;
  } else if (state.qwenDisabledByCrash) {
    qwenStatus = `auto-disabled after ${state.qwenCompletionCrashCount} completion crashes (template narration in use`
      + (state.qwenNextRetryInBoots != null ? `; auto-retry in ${state.qwenNextRetryInBoots} boot${state.qwenNextRetryInBoots === 1 ? '' : 's'})` : ')');
  } else if (state.detectedQwenCompletionCrashThisBoot) {
    qwenStatus = `recovering — completion crash on previous launch (${state.qwenCompletionCrashCount}/${MAX_QWEN_COMPLETION_CRASHES} before auto-disable)`;
  } else if (state.qwenCompletionCrashCount > 0) {
    qwenStatus = `${state.qwenCompletionCrashCount}/${MAX_QWEN_COMPLETION_CRASHES} completion crashes this install`;
  } else {
    qwenStatus = `clean (no completion crashes)`;
  }
  // OTA-413 — voice (TTS) crash line. Names voice as the culprit when a TTS
  // breadcrumb survived a crash, so a native death during narration is no longer
  // ambiguous with the Qwen path.
  let ttsStatus: string;
  if (state.detectedTtsCrashThisBoot) {
    ttsStatus = `⚠ VOICE CRASH detected on previous launch (${state.ttsCrashCount} total)${state.lastTtsOpBeforeCrash ? ` — last voice: ${state.lastTtsOpBeforeCrash}` : ''}`;
  } else if (state.ttsCrashCount > 0) {
    ttsStatus = `${state.ttsCrashCount} voice crash(es) on this build`;
  } else if (state.ttsCountResetThisBoot) {
    // OTA-1008 — say so out loud, so a reset reads as a reset and not as luck.
    ttsStatus = `clean (count reset — it described a previous build)`;
  } else {
    ttsStatus = `clean (no voice crashes on this build)`;
  }
  return [
    `ML runtime health`,
    `  Status: ${status}`,
    `  Crash count: ${state.crashCount}`,
    `  Last init attempt: ${state.lastAttemptAt ?? 'never'}`,
    `  Last init success: ${state.lastSuccessAt ?? 'never'}`,
    `  Crashes-before-disable threshold: ${MAX_CRASHES_BEFORE_DISABLE}`,
    `  Qwen completion guard: ${qwenStatus}`,
    // arb129 — which native kernel variant this device loaded + its CPU/SoC
    // signature. `sveUsed=false` with `sveRaw=true` confirms the SVE-disable
    // workaround steered an SVE-reporting chip (e.g. Tensor G5) off the crashing
    // variant. Surfaced here so it lands in every copied bug report (no adb).
    `  Qwen kernel variant: ${state.qwenVariant ?? '(not yet loaded this install)'}`,
    `  Qwen CPU/SoC: ${state.qwenCpuDiag ?? '(not yet loaded this install)'}`,
    `  Voice (TTS) guard: ${ttsStatus}`,
  ].join('\n');
}
