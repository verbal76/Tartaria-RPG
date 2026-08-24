/**
 * app/ai/qwenWatchdog.ts — THE QWEN WATCHDOG.
 *
 * OTA-1396+1 (slice 6 of the gameStore split). The supervisor that keeps the
 * ~400MB local model alive across a session: it polls Qwen's health, revives a
 * context the OS reclaimed, backs off when reviving is not working, refuses to
 * revive at all when the device is telling us it has no room, and gives up
 * entirely rather than allocate a phone to death.
 *
 * ⚠⚠ THIS IS NOT A "SLICE" IN THE STORE SENSE, AND THE DISTINCTION MATTERS.
 * Slices 1-4 moved store ACTIONS into `app/state/slices/`, keeping the same
 * object with the same keys. This is the second move of the other kind (slice 5
 * moved the freeze instruments the same way): module-level code that never
 * belonged to the store's shape, going DOWN to a leaf the store imports.
 *
 * ⚠⚠ IT TAKES NOTHING FROM gameStore — NO DEPS OBJECT AT ALL, A FIRST.
 * Every slice so far handed in between one and seven private helpers. This one
 * needs zero: `get`/`set` already arrive as parameters, the engine singleton
 * came down in slice 2, the memory latches came down in slice 5, and everything
 * else it touches (AppState, Platform, the breadcrumb stamp) was already a leaf.
 * The dependency scan flagged exactly one name — `narrateViaArbiter` — and its
 * only appearance in these 268 lines is a comment noting that narration reads
 * `qwen.isReady()` directly and therefore does NOT go through here. A dep
 * nothing calls is a lie about coupling, so it was dropped. That is the third
 * time (`arbiterAddress` in slice 3, `startRuntimePressureWatch` in slice 4).
 *
 * ⚠⚠ AND SLICE 5's HOOK IS WHY THIS IS NOT A CYCLE.
 * The watchdog and the freeze instruments share the memory-pressure latches;
 * slice 5 put them in `app/diagnostics/runtimePressureWatch.ts` behind
 * accessors, which this file imports. The traffic in the other direction —
 * the pressure watch wants the reload COUNT for its warning line — does not
 * come from an import. It is injected as a getter by gameStore, which imports
 * both. So the edge between these two leaves runs ONE WAY:
 *
 *     gameStore  ──imports──▶  qwenWatchdog  ──imports──▶  runtimePressureWatch
 *          └─────injects the reload-count getter────────────────▶
 *
 * Had slice 5 imported the counter directly instead of taking a hook, this
 * slice would have created a two-leaf cycle — and a cycle between leaves is
 * worse than one through the store, because neither file looks like the guilty
 * party when a binding resolves to `undefined` on a device.
 *
 * ⚠ WHY MOVING A LIVE TIMER AND A LIVE SUBSCRIPTION IS SAFE HERE.
 * Same check as slice 5, and it has to be made every time: this file creates a
 * setTimeout poll and an AppState subscription, and WHEN those begin is
 * behaviour, not bookkeeping. Nothing here runs at module load — every
 * assignment to `qwenWatchdogTimer` and `qwenAppStateSub` sits inside
 * `startQwenWatchdog`, which is called from `bootQwen` (slice 2) and nowhere
 * else. Importing this module starts nothing.
 *
 * ⚠ WHAT DID NOT CHANGE. Not one line of logic, one threshold, or one log
 * string. The proof is nine existing suites that covered this code before the
 * move and cover it unchanged after: qwenWatchdog, ota1032IndoorAmbushWatchdog,
 * ota1084QwenWatchdogBackoff, ota1173MemoryDefence, ota1175MemoryInterlock,
 * ota1176, ota1228DesktopFirstRun, ota1278WatchdogRespectsDebounce and
 * ota1181WhyItFailed. A refactor that also edits is a refactor nobody can
 * review, and this one does not improve the code it moves.
 */
import { AppState, Platform } from 'react-native';
import { qwen } from './engines';
import { stampBreadcrumbPhase } from '../engine/saveSystem';
import {
  MEMORY_PRESSURE_QUIET_MS,
  clearMemoryPressureLatches,
  memoryQuietAlreadyLogged,
  memoryWarningCount,
  noteMemoryQuietLogged,
  noteStandDownLogged,
  qwenStoodDownForMemory,
  standDownAlreadyLogged,
  underMemoryPressure,
} from '../diagnostics/runtimePressureWatch';
// ⚠ TYPE-ONLY, AND THAT IS THE LOAD-BEARING PART. gameStore imports this file;
// a VALUE import back is a cycle that resolves to `undefined` for whichever
// module the bundler reaches second — on a device, in a path a one-sided unit
// test never runs. `import type` is erased entirely at compile time.
import type { GameStore } from '../state/gameStore';


// OTA-223 — background dormancy watchdog. Polls every 60s; if Qwen isn't
// healthy, kicks forceReinitialize() in the background so it warms back up
// before the next narration/fusion — the player never waits on it.
//
// OTA-777 — the watchdog used to only recover the NARROW dormant case
// (isDormant(): status==='ready' but the native runtime OOM-died). But
// forceReinitialize() resets status to idle→loading→ then EITHER 'ready'
// (success) or 'failed' (if the reload throws under memory pressure). A
// SINGLE failed revival left status='failed', where isDormant() is FALSE —
// so the old `if (!isDormant()) return` short-circuited forever and Qwen
// stayed not-ready for the rest of the session (whole-session qwen-not-ready,
// 2026-07-13 device log: one "detected dormant" line, then hours of template
// fallback). Now the watchdog revives from ANY unhealthy-and-not-progressing
// state (idle / failed / dormant), keeps retrying every tick, and unwedges a
// reinit that hangs in loading/downloading past a generous window.
//
// Held at module scope so startQwenWatchdog() can replace it on
// re-entry without leaking handles.
let qwenWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

let qwenAppStateSub: { remove: () => void } | null = null;
// ⚠⚠ OTA-1278 — the shared settle gate. App.tsx debounces its re-warm; the
// watchdog must observe the SAME quiet period or it simply re-opens the door
// App.tsx just closed. Mirrors QWEN_REWARM_DELAY_MS in App.tsx.
const QWEN_FOREGROUND_SETTLE_MS = 8_000;
/** ⚠⚠ OTA-1462 — MUST EQUAL `BACKGROUND_SETTLE_MS` in App.tsx, and `ota1462`
 *  fails if it does not. How long a `background` must last before this module
 *  believes it. Kept as a local constant because the edge to App.tsx would be a
 *  cycle; kept honest by the pin rather than by hope. See the app-state handler
 *  below for the measurement that chose 1500. */
export const QWEN_BACKGROUND_SETTLE_MS = 1_500;
let qwenBackgroundSettleTimer: ReturnType<typeof setTimeout> | null = null;
let qwenForegroundSince: number | null = null;
let qwenUnsettledLogged = false;
function qwenForegroundSettled(): boolean {
  // Unknown (tests / headless) reads as settled — the gate must never be the
  // reason a legitimate recovery cannot happen.
  if (qwenForegroundSince === null) return true;
  return Date.now() - qwenForegroundSince >= QWEN_FOREGROUND_SETTLE_MS;
}
export function _qwenSetForegroundSince(t: number | null): void { qwenForegroundSince = t; }
export function _qwenForegroundSettled(): boolean { return qwenForegroundSettled(); }
// OTA-1032 — ADAPTIVE CADENCE. A flat 60s poll made recovery feel broken: the
// owner's log spends ~2 minutes on canned templates because every step of the
// dance waits a full tick (notice at :48, retry at :47, confirm ready at :47).
// Healthy, 60s is plenty; while recovering, poll fast so a retry and the
// all-clear land in seconds, not minutes.
const QWEN_WATCHDOG_HEALTHY_MS = 60_000;
const QWEN_WATCHDOG_RECOVERING_MS = 5_000;
// How long a re-init may sit in 'loading'/'downloading' before the watchdog
// treats it as wedged and re-kicks. Generous: once dormancy is even possible
// the GGUF is already cached, so a warm reload is ~5-30s; a legit in-flight
// load is never interrupted.
const QWEN_REINIT_HANG_MS = 150_000;
// OTA-1084 — BOUNDED, FOREGROUND-ONLY REVIVAL. The 11-part log-export
// session showed the failure mode: exporting chunks means bouncing the app
// (copy → switch away to paste → return), and every switch-away disposes
// the ~400MB context ('background' → shutdownQwen → status 'idle') while
// every return let the 5s recovering cadence kick ANOTHER full context
// load — 10+ attempts inside a minute, each one killed by the next bounce.
// Two rules end the loop:
//   1. Never kick a reload while the app isn't foregrounded — the same
//      backgrounding that caused 'idle' will kill the reload too, and both
//      App.tsx's unpark hook and the watchdog's 'active' listener re-check
//      the moment the player is back.
//   2. After QWEN_WATCHDOG_FREE_RETRIES straight attempts without reaching
//      ready, the retry cadence doubles per attempt up to the healthy 60s —
//      so even a pathological state costs one reload a minute, not twelve.
//      A fresh return to foreground resets the backoff for one fast retry.
const QWEN_WATCHDOG_FREE_RETRIES = 4;
// ⚠⚠ OTA-1173 — A LIFETIME CEILING ON RELOADS, BECAUSE QWEN OFF BEATS THE APP DEAD.
// The backoff ladder spreads retries out but never stops them, so a device that simply
// cannot hold the ~400MB context retries forever — each attempt a fresh allocation spike,
// on the platform whose response to that is to kill the process. The owner's iPhone took
// a crash straight to the home screen with "Last JS crash: none recorded" (a NATIVE
// death) and, on the run before, a hard freeze. After this many failures we stop asking
// and play on templates, which is a game that works rather than a game that dies.
// ⚠ Reset on a REAL foreground return, so a later session is never punished for this one.
const QWEN_MAX_REINITS_PER_STRETCH = 8;
let qwenReinitInFlightSince = 0;
let qwenReinitCeilingLogged = false;
// ⚠ OTA-1173 — 'inactive' IS NOT 'background'. iOS reports `inactive` for a notification
// banner, a Control Center pull and a peek at the app switcher; only `background` means
// the app was genuinely put away and the context genuinely disposed. Tracking the two
// separately is what stops an incidental twitch from buying a 400MB reload.
let qwenTrulyBackgrounded = false;
let qwenReinitAttempts = 0;
let qwenBackoffLevel = 0;
let qwenHeldWhileBackgroundLogged = false;
function qwenRecoveringDelayMs(): number {
  if (qwenBackoffLevel <= 0) return QWEN_WATCHDOG_RECOVERING_MS;
  return Math.min(QWEN_WATCHDOG_HEALTHY_MS, QWEN_WATCHDOG_RECOVERING_MS * 2 ** qwenBackoffLevel);
}
/** OTA-1032 — one health check. Returns TRUE when Qwen is healthy, which is what
 *  drives the adaptive poll: healthy → back to the slow cadence, anything else →
 *  keep checking fast until it recovers. */
export function runQwenHealthCheck(
  get: () => GameStore,
  set: (u: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
): boolean {
    {
      const q = qwen;
      if (typeof q.forceReinitialize !== 'function' || typeof q.getStatus !== 'function') return true;
      // Healthy — nothing to do; clear any in-flight tracking.
      if (q.isReady()) {
        if (qwenReinitAttempts > 0) {
          get().appendLog('debug', `qwen-watchdog: Qwen ready again (recovered after ${qwenReinitAttempts} attempt${qwenReinitAttempts === 1 ? '' : 's'}).`);
          // Mirror the revived engine status onto the store so About/debug
          // surfaces don't stay stuck on 'failed' (narration itself already
          // recovers — narrateViaArbiter reads qwen.isReady() directly).
          set((s) => (s.qwenStatus === 'ready' ? {} : { qwenStatus: 'ready', qwenError: null }));
        }
        qwenReinitInFlightSince = 0;
        qwenReinitAttempts = 0;
        qwenBackoffLevel = 0;
        qwenHeldWhileBackgroundLogged = false;
        return true;
      }
      const st = q.getStatus();
      // A (re)init is genuinely in progress — let it finish, unless it has
      // been wedged past the hang window (then fall through to re-kick).
      if (st === 'downloading' || st === 'loading') {
        if (qwenReinitInFlightSince === 0 || Date.now() - qwenReinitInFlightSince < QWEN_REINIT_HANG_MS) return false;
        get().appendLog('debug', `qwen-watchdog: reinit wedged in '${st}' for >${Math.round(QWEN_REINIT_HANG_MS / 1000)}s — re-kicking.`);
      }
      // OTA-1084 — rule 1: hold revival while the app isn't foregrounded.
      // Kicking a ~400MB context load from the background is guaranteed
      // wasted work — the background dispose that produced this state kills
      // the reload too. Logged once per background stretch, not per tick.
      let appActive = true;
      try {
        const s = AppState.currentState;
        appActive = s !== 'background' && s !== 'inactive';
      } catch { /* AppState unavailable (headless/test) — treat as active */ }
      if (!appActive) {
        if (!qwenHeldWhileBackgroundLogged) {
          qwenHeldWhileBackgroundLogged = true;
          get().appendLog('debug', `qwen-watchdog: app is backgrounded — holding revival until foreground (status='${st}').`);
        }
        return false;
      }
      qwenHeldWhileBackgroundLogged = false;
      // ⚠⚠ OTA-1175 — THE MEMORY INTERLOCK, AND IT EXISTS BECAUSE OTA-1173 BUILT A LOOP.
      //
      // The owner's device log, 40 seconds of it, caught by the instruments OTA-1172 added:
      //     11:08.99  ⚠⚠ MEMORY WARNING #2 — qwen='loading' · reloads=3
      //     11:09.03  memory: released the Qwen context (~400MB)
      //     11:09.88  ⚠⚠ MEMORY WARNING #3 (0.9s later) — reloads=3
      //     11:12.02  reinitializing (attempt #4)
      //     11:12.41  ⚠⚠ MEMORY WARNING #4 — qwen='downloading' · reloads=4
      //     … through ⚠⚠ MEMORY WARNING #7 · reloads=7 at 11:47
      //
      // ⚠ EVERY reinit settled to 'idle' — `reinit #N settled in 2676ms → status='idle'` —
      // because the dispose OTA-1173 added marks an in-flight load STALE (OTA-1084's
      // lifecycleGen). So: watchdog loads → OS complains → we free it mid-load → watchdog
      // sees 'idle' → loads again. **Seven ~400MB allocations in forty seconds, and the
      // fix was the engine.** Freeing memory under pressure is still right; doing it with
      // nothing to stop the reload was not.
      //
      // ⚠ The ceiling below bounded it at 8 and the backoff stretched it to 40s, so it was
      // not unbounded — but bounded thrash is still thrash, and this is what stops it.
      if (qwenStoodDownForMemory() || underMemoryPressure()) {
        // ⚠⚠ OTA-1181 — TWO MESSAGES, TWO LIFETIMES, AND THEY WERE SHARING ONE FLAG.
        // `rpMemoryQuietLogged` is reset by EVERY memory warning, which is correct for the
        // 90-second quiet notice (each warning genuinely opens a new window) and wrong for
        // the permanent stand-down, whose whole claim is that it happens once. The owner's
        // 2026-08-09 log on build 1203 shows it three times:
        //     03:53:17.845  qwen-watchdog: 3 memory warnings this session — STANDING DOWN for good.
        //     03:53:52.943  qwen-watchdog: 5 memory warnings this session — STANDING DOWN for good.
        //     03:53:57.963  qwen-watchdog: 6 memory warnings this session — STANDING DOWN for good.
        // ⚠ The BEHAVIOUR was right — no reload followed any of them. Only the log repeated,
        // and a line that says "for good" three times reads as a loop that is not happening,
        // which is precisely the wrong thing for a log whose job is to be trusted.
        if (qwenStoodDownForMemory()) {
          if (!standDownAlreadyLogged()) {
            noteStandDownLogged();
            get().appendLog('debug',
              `qwen-watchdog: ${memoryWarningCount()} memory warnings this session — STANDING DOWN for good. `
              + `This device will not hold the context; narration stays on templates.`);
          }
        } else if (!memoryQuietAlreadyLogged()) {
          noteMemoryQuietLogged();
          get().appendLog('debug',
            `qwen-watchdog: holding reloads for ${Math.round(MEMORY_PRESSURE_QUIET_MS / 1000)}s — `
            + `the OS just asked for memory back and a reload is the biggest thing we could do to it.`);
        }
        return false;
      }
      // ⚠⚠ OTA-1173 — THE CEILING. See QWEN_MAX_REINITS_PER_STRETCH: past this many
      // failed reloads we stop allocating and let the game run on templates. Logged once,
      // not per tick, so the log says it plainly and then goes quiet.
      if (qwenReinitAttempts >= QWEN_MAX_REINITS_PER_STRETCH) {
        if (!qwenReinitCeilingLogged) {
          qwenReinitCeilingLogged = true;
          get().appendLog('debug',
            `qwen-watchdog: ${qwenReinitAttempts} reloads without recovery — STANDING DOWN. `
            + `Each attempt is a ~400MB allocation and this device is refusing them; `
            + `narration stays on templates until the app is backgrounded and returns.`);
        }
        return false;
      }
      // ⚠⚠ OTA-1278 — THE WATCHDOG WAS WALKING THROUGH OTA-1275's DEBOUNCE.
      // Measured on the owner's 4.29.199 log, and the ORDER is the proof — the
      // watchdog fired 2ms BEFORE the appstate line it was reacting to:
      //     14:45:26.813 qwen-watchdog: Qwen not ready (status='idle'); reinitializing
      //     14:45:26.815 appstate: background → active
      //     14:45:27.382 ctx: OPENED ≈425MB
      //     14:45:29.898 qwen: re-warm cancelled (left the foreground first)
      // The debounce cancelled a re-warm that had ALREADY happened by another
      // door: three ~425MB loads across three 3-second foreground visits, with
      // both cancels landing and neither preventing anything. App.tsx owns the
      // re-warm policy; this owns recovery DURING play. They must agree, and a
      // rule enforced in one place only is not a rule.
      if (!qwenForegroundSettled()) {
        if (!qwenUnsettledLogged) {
          qwenUnsettledLogged = true;
          get().appendLog('debug',
            'qwen-watchdog: holding reinit — foreground has not settled '
            + `(${QWEN_FOREGROUND_SETTLE_MS}ms). App-switching must not cost a ~425MB load.`);
        }
        return false;
      }
      qwenUnsettledLogged = false;
      // Not ready and not making progress (idle / failed / dormant ready-but-
      // dead / wedged): kick a fresh reinit. Keeps retrying so a transient
      // memory-pressure failure doesn't strand Qwen for the session — but
      // rule 2 spreads the retries out once the free ones are spent.
      qwenReinitAttempts += 1;
      if (qwenReinitAttempts > QWEN_WATCHDOG_FREE_RETRIES) qwenBackoffLevel += 1;
      qwenReinitInFlightSince = Date.now();
      // OTA-909 — name the DORMANT case distinctly so the log doesn't read as a
      // self-contradiction. Dormant = status==='ready' but the native llama
      // context was released (dispose() on app-BACKGROUND frees the ~398MB
      // context to reclaim memory; the JS status field isn't notified). That's
      // the watchdog working AS DESIGNED, not a "ready-but-not-ready" bug — the
      // old wording ("Qwen not ready (status='ready')") looked like a defect.
      const dormant = typeof q.isDormant === 'function' && q.isDormant();
      get().appendLog(
        'debug',
        dormant
          ? `qwen-watchdog: Qwen dormant (status='${st}' but the native context was released — usually app-backgrounding); reinitializing (attempt #${qwenReinitAttempts}).`
          : `qwen-watchdog: Qwen not ready (status='${st}'); reinitializing (attempt #${qwenReinitAttempts}).`,
      );
      if (qwenBackoffLevel > 0) {
        get().appendLog('debug', `qwen-watchdog: ${qwenReinitAttempts} attempts without recovery — backing off (next check in ~${Math.round(qwenRecoveringDelayMs() / 1000)}s).`);
      }
      // ⚠ OTA-1172 — TIME THE RELOAD AND NAME WHAT IT SETTLED INTO. The reported freeze
      // showed six attempts that each went idle → idle, i.e. possibly costing a ~400MB
      // allocation and achieving nothing. Whether a reload is expensive-and-working or
      // expensive-and-futile is the difference between tuning the cadence and removing
      // the call, and the old log could not tell them apart.
      const rpAttemptNo = qwenReinitAttempts;
      const rpReinitStarted = Date.now();
      // OTA-1357 — the ~425MB reload is a lifecycle suspect in its own right.
      stampBreadcrumbPhase('qwen-reinit', `attempt#${rpAttemptNo}`);
      void q.forceReinitialize()
        .then(() => {
          qwenReinitInFlightSince = 0;
          let after = '?';
          try { after = typeof q.getStatus === 'function' ? q.getStatus() : '?'; } catch { /* best effort */ }
          get().appendLog('debug', `qwen-watchdog: reinit #${rpAttemptNo} settled in ${Date.now() - rpReinitStarted}ms → status='${after}'.`);
        })
        .catch((err: unknown) => {
          qwenReinitInFlightSince = 0;
          get().appendLog('debug', `qwen-watchdog: reinit attempt #${rpAttemptNo} threw after ${Date.now() - rpReinitStarted}ms: ${String(err)}`);
        });
      return false;
    }
}
// ⚠ OTA-1228 — NOT ON DESKTOP. The watchdog exists to revive a Qwen context that
// Android's OOM killer reclaimed; on web there is no context to revive, because
// llama.rn is a native module that does not exist in the bundle. So it re-tried a
// load that cannot ever succeed, on a timer, forever. From the owner's PC log:
//     qwen-watchdog: Qwen not ready (status='failed'); reinitializing (attempt #2).
//     qwen-watchdog: reinit #2 settled in 18ms → status='failed'.
//     ...#3 ...#4 ...#5 — backing off ... #6 — backing off ...
// and then the backoff RESET to attempt #1 on the next foreground, so it never
// stopped. 16 lines of a 4.4k-character bug report were this loop talking to
// itself, which is the real cost: it buries the report the owner actually sent.
//
// ⚠ The guard is ONE LINE inside the function on purpose. Two older suites
// (ota1173, ota1175) pin the reset block by slicing a fixed 1400/1600 characters
// from this function's opening — a long comment at the top of the body pushes
// what they check out of reach and fails them for no behavioural reason. The
// explanation lives out here where it costs those slices nothing.
export function startQwenWatchdog(
  get: () => GameStore,
  set: (u: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
): void {
  if (Platform.OS === 'web') return; // OTA-1228 — see the note above this function
  if (qwenWatchdogTimer !== null) {
    clearTimeout(qwenWatchdogTimer);
    qwenWatchdogTimer = null;
  }
  if (qwenAppStateSub) {
    qwenAppStateSub.remove();
    qwenAppStateSub = null;
  }
  // ⚠ OTA-1462 — the settle latch is a timer like the others, and a pending one
  // outliving the subscription would flip `trulyBackgrounded` for a listener
  // that no longer exists. Cleared with everything else it lives beside.
  if (qwenBackgroundSettleTimer !== null) {
    clearTimeout(qwenBackgroundSettleTimer);
    qwenBackgroundSettleTimer = null;
  }
  qwenReinitInFlightSince = 0;
  qwenReinitAttempts = 0;
  qwenBackoffLevel = 0;
  qwenHeldWhileBackgroundLogged = false;
  // OTA-1173 — the ceiling and the true-background flag reset with everything else, so a
  // re-hydrate starts from a clean slate rather than inheriting the last run's refusals.
  qwenReinitCeilingLogged = false;
  qwenTrulyBackgrounded = false;
  // OTA-1175 — the memory interlock resets with the rest of the ledger.
  // ⚠ OTA-1396 — one call now, because the four latches live together in
  // runtimePressureWatch and clearing three of four was always the bug waiting
  // to happen. See clearMemoryPressureLatches there.
  clearMemoryPressureLatches();

  const schedule = (ms: number): void => {
    if (qwenWatchdogTimer !== null) clearTimeout(qwenWatchdogTimer);
    qwenWatchdogTimer = setTimeout(tick, ms);
  };
  function tick(): void {
    let healthy = true;
    try {
      healthy = runQwenHealthCheck(get, set);
    } catch { /* watchdog should never crash the host */ }
    // OTA-1084 — recovering cadence honors the backoff ladder.
    schedule(healthy ? QWEN_WATCHDOG_HEALTHY_MS : qwenRecoveringDelayMs());
  }

  // OTA-1032 — DON'T WAIT FOR THE NEXT TICK. Dormancy is CAUSED by backgrounding
  // (App.tsx disposes the ~398MB native context to reclaim memory), so the app
  // knows the exact moment it matters: coming back to the foreground. Checking
  // there removes up to a full poll interval of dead narration before the
  // watchdog has even noticed.
  try {
    qwenAppStateSub = AppState.addEventListener('change', (next) => {
      // OTA-1084 — a fresh return to foreground clears the backoff ladder:
      // the player is present again, so the first retry should be fast even
      // if the last background stretch burned through the free attempts.
      // ⚠⚠ OTA-1173 — BUT ONLY AFTER A REAL BACKGROUND STRETCH, AND THIS IS THE DEFECT
      // THE PREVIOUS OTA DELIBERATELY LEFT IN PLACE TO MEASURE. `active` fires on iOS for
      // a notification banner, a Control Center pull, or a peek at the app switcher —
      // iOS bounces active → inactive → active for all of them, and Android does not. The
      // owner's freeze log caught it three times, each pair ~350ms apart:
      //     12:30:19.917  holding revival until foreground
      //     12:30:20.266  reinitializing (attempt #3)
      // Half his reloads that window were incidental twitches, not the player returning,
      // and OTA-1084's own comment says "kicking a ~400MB context load from the
      // background is guaranteed wasted work". iOS walked straight through that rule.
      // Requiring a genuine `background` first is what closes it.
      // ⚠⚠⚠ OTA-1462 — AND A BLIP MUST NOT REACH HERE EITHER. App.tsx now defers
      // the teardown past BACKGROUND_SETTLE_MS, so a ~300ms focus blip releases
      // nothing. If this half still latched on the raw event, the watchdog would
      // restart its settle clock and set `trulyBackgrounded` for a background
      // that never happened — and then, on the return, treat a live context as a
      // put-away-and-return worth a fresh ~425MB revival. Half a fix applied at
      // one of two readers is this codebase's most repeated lesson.
      //
      // ⚠ The window is duplicated rather than imported ON PURPOSE, and the
      // duplication is guarded: gameStore → watchdog is a one-way leaf edge (see
      // the header), and importing App.tsx here would be a cycle through the
      // component tree. `ota1462` asserts the two constants agree, so a change
      // to one that is not made to the other fails the suite rather than
      // silently re-opening exactly the gap this closes.
      if (next === 'background') {
        if (qwenBackgroundSettleTimer !== null) return;
        qwenBackgroundSettleTimer = setTimeout(() => {
          qwenBackgroundSettleTimer = null;
          qwenTrulyBackgrounded = true;
          qwenForegroundSince = null;   // OTA-1278 — the clock restarts on return
        }, QWEN_BACKGROUND_SETTLE_MS);
        return;
      }
      // ⚠ OTA-1462 — a return inside the window cancels the pending latch, so
      // the foreground clock is never disturbed and the app is treated, exactly
      // as it should be, as having been in the foreground the whole time.
      if (qwenBackgroundSettleTimer !== null) {
        clearTimeout(qwenBackgroundSettleTimer);
        qwenBackgroundSettleTimer = null;
      }
      if (next !== 'active') return; // `inactive` alone is a twitch, not a return.
      // ⚠ OTA-1278 — stamp the return, then let the gate above decide. The tick
      // still runs (backoff resets, health is still checked); what it may no
      // longer do is spend ~425MB on a foreground that has not settled.
      if (qwenForegroundSince === null) qwenForegroundSince = Date.now();
      if (!qwenTrulyBackgrounded) return;
      qwenTrulyBackgrounded = false;
      qwenBackoffLevel = 0;
      // ⚠ The ceiling resets HERE and only here: a genuine put-away-and-return is the
      // player asking for a fresh start, and it is also when iOS has actually reclaimed
      // whatever it needed. A twitch is not that.
      qwenReinitAttempts = 0;
      qwenReinitCeilingLogged = false;
      tick();
    }) as { remove: () => void } | null;
  } catch { /* AppState unavailable (headless/test) — the poll alone still recovers */ }

  schedule(QWEN_WATCHDOG_HEALTHY_MS);
}

/**
 * ⚠ THE ONE THING THIS MODULE HANDS BACK OUT, and it is a FUNCTION on purpose.
 *
 * The memory-warning line in `runtimePressureWatch` reports how many reloads
 * this session has attempted, because a warning is only actionable next to that
 * count — six ~400MB allocations inside ninety seconds is the story, not the
 * warning itself. That counter lives here, with the code that increments it.
 *
 * gameStore reads it through this accessor and injects it as a getter when it
 * starts the pressure watch, which is what keeps the edge between the two
 * leaves one-way (see the header). A VALUE captured at start-up would always
 * read zero, which is the whole reason it is a getter and not a number.
 *
 * ⚠ Keep this surface small. Every export here is an internal that something
 * else now depends on, and the reason the watchdog was worth extracting is that
 * almost nothing outside it needed to see in.
 */
export function qwenReinitAttemptCount(): number { return qwenReinitAttempts; }
