/**
 * OTA-1396 — SLICE 5 OF THE gameStore SPLIT: the freeze instruments.
 *
 * The runtime-pressure watcher — memory warnings, the AppState trail, the two
 * freeze clocks (a requestAnimationFrame tick and a setTimeout sample) and the
 * verdict that compares them. Everything that answers "was the app wedged, and
 * for how long" after a freeze nobody can reproduce on demand.
 *
 * ⚠⚠ THE PLAN SAID SLICES 5 AND 6 WERE SEPARATE. MEASURING SAID OTHERWISE.
 *
 * Slice 5 was "the freeze instruments (~19 lets)" and slice 6 "the Qwen watchdog
 * (~12 lets)". They are not separable as written: FIVE of these mutable
 * variables are read and written by the watchdog too —
 *
 *     rpMemoryWarnings · rpMemoryPressureUntil · rpMemoryQuietLogged
 *     rpQwenStoodDownForMemory · rpStandDownLogged
 *
 * — because the memory-pressure quiet window is precisely where the two meet:
 * when the OS says memory is tight, the watchdog stands Qwen down instead of
 * reloading a ~400MB context into a process the OS is about to kill.
 *
 * ⚠ SO THE SHARED STATE MOVED DOWN AND THE READERS GOT ACCESSORS. This is the
 * first time this segmentation has hit mutable state with TWO owners.
 * `lastWelcomeBackAt` (slice 3) had one owner and travelled with it; these five
 * cannot travel, because whichever module they left would then be assigning to
 * an imported binding — a compile error. They live here, and the watchdog reads
 * and writes them through the exported functions below.
 *
 * That is the general answer for the rest of Part 4: single-owner state moves
 * WITH its owner, shared state moves DOWN behind accessors.
 *
 * ⚠ WHAT STAYED, AND WHY: `logUiTap` sits in the middle of this block in
 * gameStore and did not come. It touches no runtime-pressure state at all — it
 * writes a log line and a save breadcrumb — so it is a store function that
 * happened to be typed next to the instruments. Moving it would have meant
 * injecting a whole store accessor for one call.
 *
 * ⚠ WHY MOVING LIVE TIMERS IS SAFE HERE. This module starts a
 * requestAnimationFrame loop, a setTimeout poll and two native subscriptions —
 * so WHEN it runs is behaviour, not bookkeeping. Nothing here executes at module
 * load: every one of those is created inside `startRuntimePressureWatch()`,
 * which is called from `bootQwen` and nowhere else. Relocating the file changes
 * the import order and nothing else.
 */
import { AppState } from 'react-native';
import {
  APPSTATE_TRAIL_MAX,
  FREEZE_SAMPLE_MS,
  appStateLine,
  freezeVerdict,
  freezeVerdictLine,
  memoryWarningLine,
  stallContextLine,
  type FreezeVerdict,
  type PressureSnapshot,
} from './runtimePressure';
import { clearLiveBreadcrumb, stampBreadcrumbPhase, noteForegrounded, peekLiveBreadcrumb } from '../engine/saveSystem';
import { nativeMlSnapshot } from '../ai/nativeMlLock';
import { qwen } from '../ai/engines';
import { nativePressure } from '../ai/generation/qwenTelemetry';
import { APPROX_CONTEXT_MB, contextLedger } from '../ai/generation/contextLedger';
import type { GameStore } from '../state/gameStore';

type SetState = (
  partial: Partial<GameStore> | ((state: GameStore) => Partial<GameStore>),
) => void;

/**
 * ⚠ The ONE thing this module needs back from the Qwen watchdog: how many
 * reinit attempts it has made this stretch, so a memory-warning line can report
 * it. Passed as a getter rather than a value — the count changes while the
 * watcher is running, and a snapshot taken at start-up would always read zero.
 */
export interface RuntimePressureHooks {
  qwenReinitAttempts: () => number;
}


// ── OTA-1172 — RUNTIME PRESSURE INSTRUMENTS ───────────────────────────────
// Owner: "add in memory warning codes to the log so you can track them, whatever debug
// information you need." Three holes in the freeze report, three instruments. See
// engine-side reasoning in app/diagnostics/runtimePressure.ts.
let rpMemoryWarnings = 0;
let rpLastMemoryWarningAt: number | null = null;
let rpAppStateTrail: string[] = [];
let rpAppState: string = 'active';
let rpAppStateSince = 0;
let rpLastVerdict: FreezeVerdict = 'ok';
let rpWorstFrameGapMs = 0;
let rpWorstJsGapMs = 0;
let rpUiStalls = 0;
let rpLastFrameAt = 0;
let rpLastJsAt = 0;
let rpFrameRaf: number | null = null;
let rpSampleTimer: ReturnType<typeof setTimeout> | null = null;
let rpMemorySub: { remove: () => void } | null = null;
let rpAppStateSub: { remove: () => void } | null = null;
let rpLastSaveKb: number | null = null;
// ⚠⚠ OTA-1175 — MEMORY-PRESSURE QUIET WINDOW. See the block in runQwenHealthCheck: the
// OTA-1173 dispose and the watchdog formed a loop that fired SEVEN ~400MB loads in 40
// seconds on the owner's device. This is the interlock between them.
let rpMemoryPressureUntil = 0;
let rpQwenStoodDownForMemory = false;
let rpMemoryQuietLogged = false;
/** ⚠ OTA-1181 — SEPARATE FROM `rpMemoryQuietLogged`, and that separation is the fix.
 *  A memory warning re-arms the quiet notice (a new window really did open) but must NOT
 *  re-arm the permanent one. Only the watchdog restart clears this. */
let rpStandDownLogged = false;
/** ⚠ After a warning, no reload for this long. Longer than the backoff ladder's first
 *  rungs on purpose — the point is to let the OS settle, not to shave a retry. */
const MEMORY_PRESSURE_QUIET_MS = 90_000;
/** ⚠ And after this many warnings in one session, stop asking for the session. A device
 *  that has refused three times is telling us something; the eighth ask is not going to
 *  be the one it says yes to, and each ask is another 400MB spike. */
const MEMORY_WARNINGS_BEFORE_STANDDOWN = 3;

/** Read by the bug-report exporter so the counts land in the HEADER, not only in 146 log
 *  lines someone has to reconstruct by hand. */
export function runtimePressureSnapshot(): PressureSnapshot {
  return {
    memoryWarnings: rpMemoryWarnings,
    lastMemoryWarningAt: rpLastMemoryWarningAt,
    appStateTrail: rpAppStateTrail,
    // OTA-1368 — the native-ML queue, so the report can say why a session
    // felt wedged while both JS clocks read clean.
    native: (() => { try { return nativePressure(); } catch { return undefined; } })(),
    lastVerdict: rpLastVerdict,
    worstFrameGapMs: rpWorstFrameGapMs,
    worstJsGapMs: rpWorstJsGapMs,
    uiStalls: rpUiStalls,
  };
}

/** ⚠ Called from the persist path so a memory-warning line can name the save size without
 *  rebuilding the blob — measuring it here would itself allocate, which is the last thing
 *  to do while the OS is asking for memory back. */
export function noteSaveKb(kb: number): void { rpLastSaveKb = kb; }


/** ⚠ OTA-1176 — the frame clock, hoisted so app-state can pause it. A self-recursing rAF
 *  is the cheapest way to notice frames stopping, but only while anyone is looking. */
function rpStartFrameClock(): void {
  if (rpFrameRaf !== null) return; // already running — never stack two loops
  if (typeof requestAnimationFrame !== 'function') return;
  const frameTick = (): void => {
    rpLastFrameAt = Date.now();
    try { rpFrameRaf = requestAnimationFrame(frameTick) as unknown as number; } catch { rpFrameRaf = null; }
  };
  try { rpFrameRaf = requestAnimationFrame(frameTick) as unknown as number; } catch { rpFrameRaf = null; }
}

function rpStopFrameClock(): void {
  if (rpFrameRaf === null) return;
  if (typeof cancelAnimationFrame === 'function') {
    try { cancelAnimationFrame(rpFrameRaf); } catch { /* ignore */ }
  }
  rpFrameRaf = null;
}

/** ⚠⚠ OTA-1176 — THE TEARDOWN OTA-1172 SHIPPED WITHOUT.
 *  Two AppState subscriptions, a rescheduling timer and an rAF loop, and nothing anywhere
 *  stopped any of them. It is a small leak in bytes — the listeners are two objects and
 *  Hermes reclaims the per-frame closure — but "started forever, stopped never" is the
 *  shape that becomes a real one the moment somebody calls the starter twice from a new
 *  place. Idempotence covered that; an explicit stop is what makes it true by construction
 *  rather than by the starter remembering to be careful. */
export function stopRuntimePressureWatch(): void {
  if (rpSampleTimer !== null) { clearTimeout(rpSampleTimer); rpSampleTimer = null; }
  rpStopFrameClock();
  if (rpMemorySub) { try { rpMemorySub.remove(); } catch { /* ignore */ } rpMemorySub = null; }
  if (rpAppStateSub) { try { rpAppStateSub.remove(); } catch { /* ignore */ } rpAppStateSub = null; }
}

export function startRuntimePressureWatch(
  get: () => GameStore,
  _set: SetState,
  hooks: RuntimePressureHooks,
): void {
  // Idempotent: a re-hydrate must not stack a second set of timers and listeners.
  // ⚠ OTA-1176 — goes through the SAME teardown a caller would use, so the two can never
  // drift. The hand-rolled copy this replaces already differed from what it should clear.
  stopRuntimePressureWatch();

  const now = Date.now();
  rpLastFrameAt = now;
  rpLastJsAt = now;
  rpAppStateSince = now;
  try { rpAppState = String(AppState.currentState ?? 'active'); } catch { rpAppState = 'active'; }

  // ⚠⚠ THE ONE THE OWNER ASKED FOR, AND NOTHING IN THIS APP LISTENED FOR IT BEFORE.
  // On iOS the OS warns before it stalls the app and again before it kills it, so this is
  // the highest-value signal available for a frozen-but-alive report — and it was being
  // discarded. React Native surfaces it on AppState for both platforms.
  try {
    rpMemorySub = AppState.addEventListener('memoryWarning', () => {
      rpMemoryWarnings += 1;
      const t = Date.now();
      const since = rpLastMemoryWarningAt == null ? null : t - rpLastMemoryWarningAt;
      rpLastMemoryWarningAt = t;
      let qwenStatus: string | undefined;
      try { qwenStatus = typeof qwen.getStatus === 'function' ? qwen.getStatus() : undefined; } catch { /* best effort */ }
      // OTA-1179 — the OTHER native model. Read lazily and behind its own guard so the
      // voice subsystem can never break the memory instrument.
      let kokoroPhase: string | undefined;
      try {
        const p = require('../voice/PiperTTSManager') as typeof import('../voice/PiperTTSManager');
        kokoroPhase = p.getKokoroState().phase;
        // ⚠ OTA-1360 — the warning doesn't just get LOGGED by the voice
        // subsystem, it gets OBEYED: no vendor-voice load may start during the
        // quiet window. The Aug-18 tombstones die inside exactly that load,
        // out of memory — this is the OS telling us, in advance, not to.
        if (typeof p.noteMemoryPressureForVoiceLoads === 'function') {
          p.noteMemoryPressureForVoiceLoads(MEMORY_PRESSURE_QUIET_MS);
        }
      } catch { /* best effort */ }
      try {
        get().appendLog('debug', memoryWarningLine(rpMemoryWarnings, since, {
          appState: rpAppState,
          qwenStatus,
          kokoroPhase,
          qwenReinitAttempts: hooks.qwenReinitAttempts(),
          saveKb: rpLastSaveKb ?? undefined,
        }));
      } catch { /* never let instrumentation throw into the host */ }
      // ⚠⚠ OTA-1173 — AND NOW WE ACTUALLY ANSWER IT. OTA-1172 logged the warning and did
      // NOTHING, which is only half a fix: iOS raises this precisely so an app can hand
      // memory back BEFORE the OS takes the process instead. The single largest thing we
      // hold is the ~400MB llama context, we have a `dispose()` for it, and narration
      // degrades to templates without it — the game keeps playing.
      // ⚠ Qwen switched off is enormously better than the app dying. The owner's report
      // is a crash straight to the home screen with "Last JS crash: none recorded", i.e.
      // a native death, and losing a session costs far more than losing prose.
      // ⚠ The watchdog is deliberately NOT suppressed here: it reads the real status and
      // will bring Qwen back once there is room, which is the behaviour we want — release
      // under pressure, recover when the pressure lifts.
      // ⚠⚠ OTA-1175 — AND TELL THE WATCHDOG TO STAND DOWN BEFORE FREEING ANYTHING.
      // Setting this BEFORE the dispose is load-bearing: the dispose marks any in-flight
      // load stale, the watchdog's next tick sees 'idle', and without this flag it kicks a
      // fresh ~400MB load straight back into the pressure that just fired the warning.
      rpMemoryPressureUntil = Date.now() + MEMORY_PRESSURE_QUIET_MS;
      rpMemoryQuietLogged = false;
      if (rpMemoryWarnings >= MEMORY_WARNINGS_BEFORE_STANDDOWN) rpQwenStoodDownForMemory = true;
      try {
        if (typeof (qwen as { dispose?: () => Promise<void> }).dispose === 'function') {
          // ⚠⚠ OTA-1179 — SNAPSHOT BEFORE, COMPARE AFTER. THIS LINE USED TO LIE, AND IT
          // LIED TO ME FOR A WEEK.
          //
          // It printed "released the Qwen context (~400MB)" unconditionally once dispose()
          // resolved — whether or not there was anything to release. The owner's 2026-08-09
          // report on OTA-1177 prints it FIVE TIMES, and every one of those warnings reads
          // `qwen='idle'` or `qwen='failed'`, i.e. no model was loaded and the call freed
          // nothing:
          //     02:50:45.915  ⚠⚠ MEMORY WARNING #1 — qwen='failed' · reloads=0
          //     02:50:45.964  memory: released the Qwen context (~400MB)   ← freed nothing
          //     02:51:36.232  ⚠⚠ MEMORY WARNING #5 — qwen='idle'  · reloads=0
          //     02:51:36.293  memory: released the Qwen context (~400MB)   ← freed nothing
          //
          // ⚠ I QUOTED THESE LINES AS EVIDENCE in the OTA-1175 analysis. A diagnostic that
          // states an outcome it never checked is worse than no diagnostic, because it is
          // read as measurement — which is the whole failure this week's rule exists to
          // stop, sitting inside the instrumentation itself.
          const before = contextLedger().released;
          const statusAtWarning = qwenStatus ?? 'unknown';
          void (qwen as { dispose: () => Promise<void> }).dispose()
            .then(() => {
              try {
                const freed = contextLedger().released > before;
                get().appendLog('debug', freed
                  ? `memory: released the Qwen context (~${APPROX_CONTEXT_MB}MB est) in response to the warning; narration falls back to templates until it recovers.`
                  // ⚠⚠ THE DIAGNOSTIC SENTENCE THIS WHOLE INVESTIGATION NEEDED. If the OS is
                  // asking for memory back while we hold no model, the model is not what it
                  // is asking about, and the search moves.
                  : `memory: NOTHING TO RELEASE — no model was loaded (qwen='${statusAtWarning}'), so this freed 0 bytes. `
                    + `The pressure is coming from something else.`);
              } catch { /* ignore */ }
            })
            .catch(() => { /* a failed release must never escalate a memory warning into a crash */ });
        }
      } catch { /* ditto */ }
    }) as { remove: () => void } | null;
  } catch { /* AppState unavailable (headless/test) */ }

  // ⚠ EVERY TRANSITION, `inactive` INCLUDED — that is the evidence, not the noise. The
  // reported freeze showed three `active` bounces ~350ms apart, each of which bought a
  // fresh ~400MB model reload, and without the transitions written down the watchdog log
  // read as a self-contradiction ("holding revival" then reinitializing 350ms later).
  try {
    rpAppStateSub = AppState.addEventListener('change', (next) => {
      const t = Date.now();
      const prev = rpAppState;
      const nextStr = String(next);
      if (nextStr === prev) return;
      // ⚠ OTA-1357 — LIFECYCLE PHASE STAMP, FIRST THING IN THE HANDLER. The third
      // B9 freeze died mid-write of the very appStateLine below — within 1ms of a
      // background→active transition, on a path no action/homework stamp covers.
      // Stamped before any other work so the crumb survives whatever follows.
      stampBreadcrumbPhase(`appstate:${prev}→${nextStr}`);
      try { get().appendLog('debug', appStateLine(prev, nextStr, t - rpAppStateSince)); } catch { /* ignore */ }
      rpAppStateTrail = [...rpAppStateTrail, nextStr].slice(-APPSTATE_TRAIL_MAX);
      rpAppState = nextStr;
      rpAppStateSince = t;
      // A fresh foreground restarts both clocks: a backgrounded app legitimately stops
      // painting, and counting that as a render stall would cry wolf every time the
      // player checks a message.
      // ⚠⚠ OTA-1176 — THE FRAME CLOCK STOPS WHEN THE APP DOES.
      // OTA-1172 ran this rAF loop for the entire life of the process, backgrounded or
      // not — 60 wakeups a second that the detector then THREW AWAY, because it only
      // judges while foregrounded. Pure waste, and a backgrounded app doing steady work is
      // what iOS reclaims first. On the device we are trying to keep alive, the instrument
      // was making the measurement slightly worse.
      if (nextStr === 'active') {
        rpLastFrameAt = t; rpLastJsAt = t;
        // ⚠⚠ OTA-1413 — THE CLEAN-EXIT LATCH RELEASES HERE, and it must release
        // BEFORE any foreground work can stamp a phase. From this instant a
        // surviving crumb means a real death again — including the third B9
        // freeze, which died 1ms into this very transition.
        noteForegrounded();
        rpStartFrameClock();
      } else {
        rpStopFrameClock();
        // ⚠⚠ OTA-1377 — THE ORDERLY EXIT, FINALLY MARKED. The freeze breadcrumb
        // rests on one invariant, written in its own doc comment at
        // saveSystem.clearLiveBreadcrumb: *"a breadcrumb that SURVIVES to the
        // next boot means the process died while it was still live."* That was
        // never true, because nothing ever cleared it on the way out —
        // `clearLiveBreadcrumb` had exactly one caller, `hydrate()`, which runs
        // at BOOT. Worse than an omission: the stamp at the top of this handler
        // writes a fresh crumb on the way to background and then leaves it
        // there, so every cold start found one and the boot line reported a
        // mid-action death whether or not anything had gone wrong. An
        // instrument that says the same thing every time carries no
        // information, and this is the instrument being used to hunt B9.
        //
        // ⚠ LAST STATEMENT IN THE HANDLER, ON PURPOSE. OTA-1357 added the stamp
        // above because the third B9 freeze died within 1ms of a state change,
        // on a path nothing else covered. Clearing at the TOP would have traded
        // a false positive for a blind spot over exactly that window. Anything
        // that dies earlier in this handler never reaches this line, so the
        // crumb survives and still names the transition it died in; reaching
        // here is itself the proof the transition completed.
        //
        // ⚠ `background` ONLY, never `inactive`. iOS reports `inactive` for a
        // notification banner, a Control Center pull, a peek at the app
        // switcher — none of which is an exit, and clearing on one would drop
        // the crumb for a freeze that happened while the banner was up.
        //
        // ⚠ WHAT THIS DOES NOT FIX, STATED PLAINLY: background work that stamps
        // a phase AFTER this point re-arms the crumb, so an OS reclaim of a
        // long-backgrounded app can still surface as "died mid-action". That is
        // a much rarer shape than the one being removed here — which fired on
        // literally every clean exit — and closing it would mean recording a
        // separate "exited cleanly" fact rather than deleting a stale one.
        //
        // ⚠⚠ OTA-1413 — CLOSED, AND BY EXACTLY THAT PRESCRIPTION. It was not
        // rarer than predicted: the owner's golem ledger carried one within a
        // day, because the Qwen teardown stamps `ctx-release` / `ctx-release-done`
        // immediately AFTER this line every single time the app backgrounds.
        // `clearLiveBreadcrumb` now latches the clean exit as a fact, so those
        // stamps are labelled `afterOrderlyExit` and boot can tell an OS reclaim
        // from a death. See saveSystem.stampBreadcrumbPhase.
        if (nextStr === 'background') void clearLiveBreadcrumb();
      }
    }) as { remove: () => void } | null;
  } catch { /* AppState unavailable (headless/test) */ }

  // Clock A — frames. Driven by the NATIVE frame callback, so it stops when the render
  // side stops even while JS keeps running.
  // ⚠ OTA-1176 — started and stopped with the app's foreground state; see the AppState
  // handler above and rpStopFrameClock/rpStartFrameClock below.
  rpStartFrameClock();

  // Clock B — plain JS. Serviced by the JS thread alone. The PAIR is the discriminator;
  // neither clock on its own can tell a frozen screen from a wedged engine.
  // ⚠ OTA-1634 — the crumb as it stood at the PREVIOUS tick. On a stall edge the
  // pair (then, now) brackets the quiet stretch; see stallContextLine.
  let crumbAtLastSample: ReturnType<typeof peekLiveBreadcrumb> = null;
  const sample = (): void => {
    const t = Date.now();
    const jsGap = t - rpLastJsAt - FREEZE_SAMPLE_MS;
    const frameGap = t - rpLastFrameAt;
    rpLastJsAt = t;
    let crumbNow: ReturnType<typeof peekLiveBreadcrumb> = null;
    try { crumbNow = peekLiveBreadcrumb(); } catch { /* an instrument never breaks the watch */ }
    // Only judge while the app is actually foregrounded — see the note above.
    if (rpAppState === 'active') {
      const v = freezeVerdict(Math.max(0, jsGap), frameGap);
      if (frameGap > rpWorstFrameGapMs) rpWorstFrameGapMs = frameGap;
      if (jsGap > rpWorstJsGapMs) rpWorstJsGapMs = Math.max(0, jsGap);
      // ⚠ Log on the EDGE, not every sample. A sustained freeze would otherwise write a
      // line every 5 seconds and bury the transition that actually matters.
      if (v !== 'ok' && v !== rpLastVerdict) {
        if (v === 'ui-stalled' || v === 'both-stalled') rpUiStalls += 1;
        try {
          let ctx = '';
          try { ctx = ` · ${stallContextLine(crumbAtLastSample, crumbNow, nativeMlSnapshot(), t)}`; } catch { /* ignore */ }
          get().appendLog('debug', `${freezeVerdictLine(v, Math.max(0, jsGap), frameGap)}${ctx}`);
        } catch { /* ignore */ }
      } else if (v === 'ok' && rpLastVerdict !== 'ok') {
        try { get().appendLog('debug', `freeze watch: recovered — painting again after ${Math.round(rpWorstFrameGapMs)}ms quiet.`); } catch { /* ignore */ }
      }
      rpLastVerdict = v;
    }
    crumbAtLastSample = crumbNow;
    rpSampleTimer = setTimeout(sample, FREEZE_SAMPLE_MS);
  };
  rpSampleTimer = setTimeout(sample, FREEZE_SAMPLE_MS);
}

// ── ⚠⚠ THE SHARED MEMORY-PRESSURE STATE, AND ITS ACCESSORS ────────────────────
//
// These five variables are the seam between the freeze instruments and the Qwen
// watchdog. They are declared above and exposed here as functions because a
// `let` cannot be shared across a module boundary: an importer can READ the
// current value through a live binding but cannot assign to it. The watchdog
// does both, so it needs functions.
//
// ⚠ Keep this surface small. Every accessor added here is a piece of this
// module's internals that something else now depends on, and the reason the
// instruments were worth extracting is that almost nothing outside needed them.

/** True while the OS has recently told us memory is tight. Read by the Qwen
 *  watchdog before a reload, and by the vendor-voice warm timer before it loads
 *  a voice model — both are large allocations that must not happen now. */
export function underMemoryPressure(now: number = Date.now()): boolean {
  return now < rpMemoryPressureUntil;
}

/** ⚠ The watchdog's own stand-down latch: once Qwen has been switched off for
 *  memory, it stays off for the session unless a genuine background→foreground
 *  return clears it. Separate from the quiet window on purpose. */
export function qwenStoodDownForMemory(): boolean { return rpQwenStoodDownForMemory; }
export function memoryWarningCount(): number { return rpMemoryWarnings; }
export function memoryQuietAlreadyLogged(): boolean { return rpMemoryQuietLogged; }
export function noteMemoryQuietLogged(): void { rpMemoryQuietLogged = true; }
export function standDownAlreadyLogged(): boolean { return rpStandDownLogged; }
export function noteStandDownLogged(): void { rpStandDownLogged = true; }

/** ⚠ Cleared by the watchdog RESTART and by a real background→foreground return
 *  — never by a twitch. A device that refused three times is telling us
 *  something; re-arming on every app-state flicker would ignore it. */
export function clearMemoryPressureLatches(): void {
  rpMemoryPressureUntil = 0;
  rpQwenStoodDownForMemory = false;
  rpMemoryQuietLogged = false;
  rpStandDownLogged = false;
}

/** How long the quiet window lasts, exported so the watchdog's log line can
 *  state the same number this module enforces. */
export { MEMORY_PRESSURE_QUIET_MS };
