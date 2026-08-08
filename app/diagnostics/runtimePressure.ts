// OTA-1195 — MEMORY WARNINGS, APP-STATE CHURN, AND A FREEZE DETECTOR.
//
// Owner, after a hard lock on an iPhone that this log could not explain: *"add in memory
// warning codes to the log so you can track them, whatever debug information you need.
// add that to whatever you can immediately put in as an OTA and push it."*
//
// ⚠ WHAT THE FREEZE REPORT COULD AND COULD NOT SAY, because it is the whole reason this
// file exists. The qwen-watchdog kept ticking every ~10s straight through the freeze
// (12:29:58 → 12:31:27) and a save landed at 12:31:02, so THE JS THREAD WAS ALIVE the
// entire time the screen was dead. That single fact rules out an infinite loop and rules
// out every pure-logic suspect — and having ruled those out, the log had nothing else to
// offer. There is no record of a tap arriving, no record of the screen painting, and no
// record of memory pressure. Three holes, three instruments.
//
// ⚠⚠ NOTHING IN THIS APP LISTENED FOR `memoryWarning` — checked, not assumed. On iOS the
// OS warns before it stalls you and again before it kills you, and a frozen-but-alive app
// is exactly what memory pressure looks like from the inside. That was the single most
// valuable signal available on the platform the bug was reported on, and it was going
// straight in the bin.
//
// ⚠ DIAGNOSTICS ONLY, DELIBERATELY. The same log shows a REAL defect — an iOS `active`
// transition wipes the Qwen backoff ladder and immediately kicks a ~400MB model reload,
// and iOS fires `active` for a notification banner or a Control Center pull, so three of
// the six reload attempts in that window were incidental twitches rather than the player
// returning. That fix is NOT in this OTA on purpose: instrument first, then fix, so the
// next device log measures the bug as it actually stands today. Shipping both together
// would leave us unable to say which change moved the needle.

/** How often the freeze watch compares its two clocks. */
export const FREEZE_SAMPLE_MS = 5_000;

/** ⚠ A frame gap past this, WHILE the JS clock is still advancing, is the signature we
 *  are hunting: the render side stopped and the logic side did not. Generous on purpose —
 *  a backgrounded app legitimately stops painting, and a slow scene build can eat a
 *  second — so this is set well past anything a healthy foreground frame budget produces. */
export const FRAME_STALL_MS = 2_000;

/** ⚠ And the mirror of it. If the JS clock ALSO stopped, the app was genuinely wedged and
 *  the freeze is a different animal entirely — worth telling apart, because the fix lives
 *  in a different half of the codebase. */
export const JS_STALL_MS = 2_000;

/** How many app-state transitions we keep. iOS churns through `inactive` constantly, so
 *  this is a ring rather than a list — the recent shape is what matters, not the history. */
export const APPSTATE_TRAIL_MAX = 24;

export type FreezeVerdict = 'ok' | 'ui-stalled' | 'js-stalled' | 'both-stalled';

/** ⚠ THE DISCRIMINATOR, AND THE REASON THERE ARE TWO CLOCKS.
 *
 *  `setTimeout` is serviced by the JS thread alone. `requestAnimationFrame` in React
 *  Native is driven by the native frame callback, so it stops when the RENDER side stops
 *  even while JS keeps running. Neither clock alone can tell a frozen screen from a
 *  wedged engine; the PAIR can, and that is precisely the question the freeze report left
 *  open and I had to ask the owner by hand.
 *
 *  ⚠ Both gaps are measured against the same sample instant, so a long sample interval
 *  cannot read as a stall on its own. */
export function freezeVerdict(jsGapMs: number, frameGapMs: number): FreezeVerdict {
  const jsStalled = jsGapMs >= JS_STALL_MS;
  const uiStalled = frameGapMs >= FRAME_STALL_MS;
  if (jsStalled && uiStalled) return 'both-stalled';
  if (uiStalled) return 'ui-stalled';
  if (jsStalled) return 'js-stalled';
  return 'ok';
}

/** Plain English for the verdict, because a device log is read at triage by someone who
 *  did not write this file — often months later, often me. */
export function freezeVerdictLine(v: FreezeVerdict, jsGapMs: number, frameGapMs: number): string {
  const gaps = `js ${Math.round(jsGapMs)}ms · frames ${Math.round(frameGapMs)}ms`;
  switch (v) {
    case 'ui-stalled':
      return `⚠ FREEZE WATCH: the SCREEN stopped painting while logic kept running (${gaps}). `
        + `This is the frozen-but-alive shape — look at the render/UI thread, not the engine.`;
    case 'js-stalled':
      return `⚠ FREEZE WATCH: LOGIC stalled while frames kept coming (${gaps}). `
        + `Something blocked the JS thread — look for a long synchronous run.`;
    case 'both-stalled':
      return `⚠ FREEZE WATCH: both clocks stopped (${gaps}). `
        + `Whole app wedged, or it was backgrounded — check the appstate trail beside this line.`;
    default:
      return `freeze watch: ok (${gaps})`;
  }
}

export interface MemoryWarningContext {
  /** Where the engine was when the OS complained — the reload storm is the suspect. */
  qwenStatus?: string;
  /** Reload attempts so far this stretch. ⚠ Each one is a ~400MB native allocation. */
  qwenReinitAttempts?: number;
  /** App state at the moment of the warning. */
  appState?: string;
  /** Most recent persisted save size in KB, when known. */
  saveKb?: number;
}

/** ⚠ THE LINE THE OWNER ASKED FOR. It is deliberately loud (a ⚠ and an ordinal) because
 *  in a 146-entry log the whole point is that this one is findable by eye, and because on
 *  iOS the SECOND and THIRD warnings mean something very different from the first — the
 *  OS escalates before it jetsams, so the COUNT is the severity. */
export function memoryWarningLine(
  ordinal: number,
  msSincePrevious: number | null,
  ctx: MemoryWarningContext = {},
): string {
  const bits: string[] = [];
  if (ctx.appState) bits.push(`app=${ctx.appState}`);
  if (ctx.qwenStatus) bits.push(`qwen='${ctx.qwenStatus}'`);
  if (ctx.qwenReinitAttempts != null) bits.push(`reloads=${ctx.qwenReinitAttempts}`);
  if (ctx.saveKb != null) bits.push(`save=${ctx.saveKb}KB`);
  const since = msSincePrevious == null
    ? 'first this session'
    : `${(msSincePrevious / 1000).toFixed(1)}s since the last one`;
  return `⚠⚠ MEMORY WARNING #${ordinal} from the OS (${since})`
    + (bits.length ? ` — ${bits.join(' · ')}` : '')
    + `. The system is asking for memory back; a freeze or a kill can follow.`;
}

/** ⚠ ONE LINE PER TRANSITION, INCLUDING `inactive`. That is not noise on this platform —
 *  it is the evidence. iOS reports `inactive` for a notification banner, a Control Center
 *  pull and a peek at the app switcher, and the reported freeze log showed three
 *  `active` bounces about 350ms apart that each bought a fresh model reload. Without the
 *  transition written down, that read as the watchdog contradicting itself. */
export function appStateLine(prev: string, next: string, msInPrev: number): string {
  return `appstate: ${prev} → ${next} (was ${prev} for ${Math.round(msInPrev)}ms)`;
}

export interface PressureSnapshot {
  memoryWarnings: number;
  lastMemoryWarningAt: number | null;
  appStateTrail: readonly string[];
  lastVerdict: FreezeVerdict;
  worstFrameGapMs: number;
  worstJsGapMs: number;
  uiStalls: number;
}

/** The block that rides along in every COPY / SHARE bug report, so the counts are visible
 *  in the header rather than only reconstructable by reading 146 log lines. */
export function runtimePressureSummary(s: PressureSnapshot): string {
  const out: string[] = ['Runtime pressure'];
  out.push(s.memoryWarnings === 0
    ? `  Memory warnings: none this session`
    : `  ⚠ Memory warnings: ${s.memoryWarnings} this session`);
  out.push(s.uiStalls === 0
    ? `  Freeze watch: no stalls seen`
    : `  ⚠ Freeze watch: ${s.uiStalls} render stall${s.uiStalls === 1 ? '' : 's'} `
      + `(worst: frames quiet ${Math.round(s.worstFrameGapMs)}ms while logic ran)`);
  if (s.worstJsGapMs >= JS_STALL_MS) {
    out.push(`  ⚠ Worst logic stall: ${Math.round(s.worstJsGapMs)}ms`);
  }
  const trail = s.appStateTrail.slice(-6);
  out.push(`  App state trail: ${trail.length ? trail.join(' → ') : '(none recorded)'}`);
  return out.join('\n');
}
