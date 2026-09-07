// ⚠⚠ OTA-1493 — THE WARM WAITS FOR THE PLAYER.
//
// Six server-side native-death reports (sentry-inbox/crash_*), four days,
// five builds, both product lines — and every one of them is the same death:
// "no action yet", killed at ctx-open / ctx-open-done / ctx-release /
// ctx-release-done / rendered. The 3s-after-boot Qwen warm held ~425MB
// against a boot that is already paying for the classifier, the voice and
// the first render, and the OS collected. Owner: "do the deferred warm."
//
// So the warm ARMS at boot and FIRES at the first player action — the single
// gameStore door every typed and chip action passes through (OTA-1276's
// breadcrumb door). By then boot pressure has passed and the player has
// proven the session is live. Until the model is ready the Arbiter speaks
// template/canned lines, exactly as it always has while qwen is not ready —
// the first line of a session simply warms instead of waiting.
//
// ⚠ ORDER CANNOT DROP THE WARM. If the first action somehow lands before the
// boot path arms (a race the 3s timer used to hide), the arm fires
// immediately rather than waiting for a second action that may never come.
// One warm per process, ever — the watchdog owns everything after that
// (startQwenWatchdog is called from bootQwen and nowhere else, so deferring
// the boot defers the watchdog with it).

let armedWarm: (() => void) | null = null;
let fired = false;

/** Boot path: hand over the warm instead of running it. */
export function armQwenWarm(warm: () => void): void {
  if (fired) { warm(); return; } // the action beat the arm — warm right now
  armedWarm = warm;
  // ⚠⚠⚠ OTA-1735 — AND SAY WHAT IS ACTUALLY TRUE NOW, because `qwen:deferred` was
  // the last word on five death records and it names a subsystem that has done
  // NOTHING. Arming stores a closure; bootQwen is not called until the player acts.
  //
  // ⚠ Worse, it is the LAST stamp of a fully successful boot — `boot:complete`,
  // `audio:*` and `tts:*` are all stamped synchronously before the mlhealth chain
  // resolves, so `qwen:deferred` lands after them and then nothing writes again
  // until the player reaches the exploration screen (the heartbeat's only home).
  // It is an absorbing state: a death one second later and a death five minutes
  // later both read `boot:qwen:deferred`, and it points the reader at Qwen for
  // both. Two investigations have now started at the wrong subsystem because of
  // this string.
  //
  // ⚠ Lazy require + swallow: an instrument may never break the thing it measures.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('../engine/saveSystem') as typeof import('../engine/saveSystem'))
      .stampBreadcrumbPhase('boot:idle:awaiting-first-action');
  } catch { /* ignore */ }
}

/** The action door: the first call runs the armed warm; every later call is
 *  a no-op costing one boolean check. */
export function fireQwenWarmOnPlayerAction(): void {
  if (fired) return;
  fired = true;
  const w = armedWarm;
  armedWarm = null;
  if (w) w();
}

/** Diagnostics: has the first action released the warm yet? */
export function qwenWarmReleased(): boolean { return fired; }

/** Tests only. */
export function _resetDeferredQwenWarmForTests(): void { armedWarm = null; fired = false; }
