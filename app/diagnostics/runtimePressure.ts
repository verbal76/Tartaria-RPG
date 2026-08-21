// OTA-1172 — MEMORY WARNINGS, APP-STATE CHURN, AND A FREEZE DETECTOR.
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
  /** ⚠⚠ OTA-1179 — THE OTHER NATIVE MODEL, AND IT WAS MISSING FROM THIS LINE ENTIRELY.
   *  Qwen is not the only large native allocation in this app: the bundled voice
   *  (Kokoro, via react-native-executorch) is a second one, and TTSManager's own comment
   *  prices a voice swap at "~100 MB to the pool". The owner's 2026-08-09 report is the
   *  reason this field exists — every memory warning in it reads `qwen='idle'` or
   *  `qwen='failed'` while `Kokoro state: ready`, i.e. the OS was asking for memory back
   *  at moments when the ONLY large model we held was the voice.
   *  ⚠ That is a lead, NOT a verdict: ~100MB does not explain a 1.9GB jetsam on its own,
   *  and this field is here to make the next report say so either way rather than to
   *  argue a case. */
  kokoroPhase?: string;
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
  // OTA-1179 — sits next to qwen deliberately: the pair is the question ("which of our
  // two native models was actually up when the OS complained"), and split across two
  // lines it would not read as one.
  if (ctx.kokoroPhase) bits.push(`voice='${ctx.kokoroPhase}'`);
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
  /** ⚠ OTA-1368 — the native-ML queue, which is the half of "is the app
   *  wedged?" the two clocks below structurally cannot answer. Optional so an
   *  older caller (and every existing test) still type-checks. */
  native?: {
    worstWaitMs: number;
    slowJobs: number;
    worstMsPerPromptTok: number;
    wastedCalls: number;
    wastedMs: number;
  };
  lastVerdict: FreezeVerdict;
  worstFrameGapMs: number;
  worstJsGapMs: number;
  uiStalls: number;
}

/** The block that rides along in every COPY / SHARE bug report, so the counts are visible
 *  in the header rather than only reconstructable by reading 146 log lines. */
// ⚠⚠ OTA-1276 — the breadcrumb that survived the LAST boot, if any. Loaded once at
// hydrate (see gameStore) and printed here, because the freeze this file was built for
// has turned out to be one this file structurally CANNOT see: a wedged JS thread stops
// the setTimeout sampler and requestAnimationFrame alike (both are JS timers in RN), so
// "no stalls seen" prints straight through a hard freeze. The breadcrumb is written
// ahead of the wedge instead of measured after it.
let rpLastBreadcrumb: {
  at: number; what: string; screen?: string; room?: string;
  // OTA-1356 — the phase checkpoints (see saveSystem.stampBreadcrumbPhase).
  phase?: string; phaseAt?: number; phaseDetail?: string;
  /** OTA-1413 — see saveSystem.LiveBreadcrumb. */
  afterOrderlyExit?: boolean;
} | null = null;
export function setLastBootBreadcrumb(c: typeof rpLastBreadcrumb): void { rpLastBreadcrumb = c; }

export function runtimePressureSummary(s: PressureSnapshot): string {
  const out: string[] = ['Runtime pressure'];
  if (rpLastBreadcrumb) {
    const ago = Math.max(0, Date.now() - rpLastBreadcrumb.at);
    const mins = Math.round(ago / 60_000);
    // ⚠⚠ OTA-1413 — SECOND DOOR. The crash ledger and THIS line both read the
    // same crumb and both asserted a mid-action death, so suppressing the false
    // record in the ledger alone would have left About still saying it. Six
    // fixes this session have been the many-doors mistake; this is the pair.
    if (rpLastBreadcrumb.afterOrderlyExit) {
      out.push(`  · Last boot exited cleanly, then the OS reclaimed it — not a crash.`);
      out.push(`     A ~400MB model app is what Android drops first when it needs memory.`);
      out.push(`     Kept because the phase is still evidence if a real freeze lands here.`);
      out.push(`     Last checkpoint: ${rpLastBreadcrumb.phase ?? '(none)'}`
        + ` at ${new Date(rpLastBreadcrumb.phaseAt ?? rpLastBreadcrumb.at).toISOString()}`
        + ` (${mins} min before this boot)`);
    } else {
      out.push(`  ⚠⚠ LAST BOOT DIED MID-ACTION — no orderly exit was recorded.`);
      out.push(`     Last thing the app did: ${rpLastBreadcrumb.what}`);
      out.push(`     Where: ${rpLastBreadcrumb.room ?? '(unknown)'} on ${rpLastBreadcrumb.screen ?? '(unknown)'} screen`);
      out.push(`     When: ${new Date(rpLastBreadcrumb.at).toISOString()} (${mins} min before this boot)`);
      // OTA-1356 — the phase names WHERE in that activity's life the app died:
      // `engine-done` but never `rendered` → render side; stuck at `parsed:` →
      // the engine; `homework:` → the background writer, not the player at all.
      if (rpLastBreadcrumb.phase) {
        const dt = rpLastBreadcrumb.phaseAt != null
          ? ` (+${Math.max(0, rpLastBreadcrumb.phaseAt - rpLastBreadcrumb.at)}ms after it)`
          : '';
        out.push(`     Last checkpoint reached: ${rpLastBreadcrumb.phase}`
          + (rpLastBreadcrumb.phaseDetail ? ` [${rpLastBreadcrumb.phaseDetail}]` : '') + dt);
      } else {
        out.push(`     Last checkpoint reached: (none — the action never cleared its first phase)`);
      }
      out.push(`     ⚠ The disk log's tail is UNRELIABLE for that session — batched lines`);
      out.push(`       die in memory when the JS thread wedges. Trust this line over it.`);
    }
  }
  out.push(s.memoryWarnings === 0
    ? `  Memory warnings: none this session`
    : `  ⚠ Memory warnings: ${s.memoryWarnings} this session`);
  out.push(s.uiStalls === 0
    ? `  Freeze watch: no stalls seen (JS clocks only — see the native queue below)`
    : `  ⚠ Freeze watch: ${s.uiStalls} render stall${s.uiStalls === 1 ? '' : 's'} `
      + `(worst: frames quiet ${Math.round(s.worstFrameGapMs)}ms while logic ran)`);
  if (s.worstJsGapMs >= JS_STALL_MS) {
    out.push(`  ⚠ Worst logic stall: ${Math.round(s.worstJsGapMs)}ms`);
  }
  // ⚠⚠ OTA-1368 — THE LINE THAT EXPLAINS A NEAR-FREEZE THE WATCH CANNOT SEE.
  // The owner reported the app "hung a few Ms then came back"; the report said
  // `Freeze watch: no stalls seen`, and BOTH were true. The watch compares a
  // setTimeout clock against a requestAnimationFrame clock — two JS-side
  // measurements. The 4.29.260 log's stall was on the NATIVE side: the cognitive
  // embedder went 70ms → 12,619ms, prompt reads degraded 2.7 → 18.5ms/token, and
  // four jobs queued 5.6–8.7s behind one another. JS kept ticking and frames kept
  // coming the whole time, so neither clock moved and nothing was "stalled" —
  // everything was merely QUEUED, which feels identical from the player's side of
  // the screen and reads as an all-clear from this one. The numbers existed in
  // qwenTelemetry all along; this is the missing consumer.
  const nat = s.native;
  if (nat) {
    const bad = nat.worstWaitMs >= 3_000 || nat.worstMsPerPromptTok >= 10;
    const bits = [
      `worst wait ${(nat.worstWaitMs / 1000).toFixed(1)}s`,
      `${nat.slowJobs} job kind${nat.slowJobs === 1 ? '' : 's'} queued >3s`,
      `worst ${nat.worstMsPerPromptTok.toFixed(1)}ms/prompt-token`,
    ];
    if (nat.wastedCalls > 0) {
      bits.push(`${nat.wastedCalls} generation${nat.wastedCalls === 1 ? '' : 's'} `
        + `thrown away (${(nat.wastedMs / 1000).toFixed(1)}s)`);
    }
    out.push(`  ${bad ? '⚠ ' : ''}Native queue: ${bits.join(' · ')}`);
    if (bad) {
      out.push(`     The JS thread was healthy and the native model queue was not.`
        + ` A stall the freeze watch above is structurally blind to.`);
    }
  }
  const trail = s.appStateTrail.slice(-6);
  out.push(`  App state trail: ${trail.length ? trail.join(' → ') : '(none recorded)'}`);
  return out.join('\n');
}
