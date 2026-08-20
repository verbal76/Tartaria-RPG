// OTA-063 — shared "basic device + install" summary used by:
//   1. The About screen (rendered at the top of the diagnostic
//      block so player + dev see the same identifying info)
//   2. The bug-report flow on the title screen (so every report
//      lands with a consistent device/build header in the email
//      body the player pastes into Gmail)
//
// Kept synchronous + dependency-free so the About screen's
// useMemo path can render it without an async fetch + suspended
// re-render. Free-disk is intentionally NOT pulled here — the
// expo-file-system call is async and tends to throw on some
// Androids, and the field is rarely the deciding clue for bug
// triage. The build/runtime/locale/screen fields together cover
// 95% of "which device is this?" questions.
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform, Dimensions, PixelRatio } from 'react-native';
import { OTA_BUILD_ID, DISPLAY_VERSION } from '../buildInfo';
import { getBuildCodename, getApkCodename } from '../buildCodename';
import { mlHealthSummary } from './mlHealth';
// OTA-1172 — memory warnings / freeze watch / app-state trail.
import { runtimePressureSummary } from './runtimePressure';
import { runtimePressureSnapshot, useGameStore } from '../state/gameStore';
// OTA-1177 — how many ~400MB model contexts are live, and how many disposes freed nothing.
import { contextLedgerSummary } from '../ai/generation/contextLedger';

/** ⚠ Isolated behind a try/catch and a lazy read: the bug-report exporter must NEVER be
 *  the thing that fails when the app is already in trouble, and this block is at its most
 *  valuable in exactly the sessions where something is going wrong. */
function runtimePressureBlock(): string {
  try {
    return runtimePressureSummary(runtimePressureSnapshot());
  } catch {
    return 'Runtime pressure\n  (unavailable this session)';
  }
}

/** OTA-1177 — live llama-context count. Same isolation as the block above, and for the
 *  same reason: this is worth the most in the report from the session that died. */
function contextLedgerBlock(): string {
  try {
    // ⚠ OTA-1180 — the ENGINE STATUS belongs next to the context count, because the two
    // together are the whole reading and either alone misleads. The owner's 2026-08-09
    // report showed `Opened: 0` beside a header claiming a healthy init; a reader had to
    // cross-reference a memory-warning line 40 entries down the log to learn the model had
    // never loaded. Now the block says it in place.
    let status = '';
    let err = '';
    try {
      const st = useGameStore.getState();
      status = String(st.qwenStatus ?? '');
      err = String(st.qwenError ?? '');
    } catch { /* best effort */ }
    const ledger = contextLedgerSummary();
    if (!status) return ledger;
    // ⚠⚠ OTA-1181 — THE REASON, NOT JUST THE VERDICT. `qwenError` has existed in the store
    // since the engine was written and was surfaced NOWHERE — not here, not in mlHealth.
    // The owner's 2026-08-09 report on build 1203 reads `Narration engine: failed` with no
    // hint of why, and the answer was sitting in state the whole time. Three reports in a
    // row have now said the model does not load; none could say what it said on the way
    // down, so every theory about it has been inference.
    const why = status === 'failed' && err ? `\n  Why: ${err}` : '';
    return `${ledger}\n  Narration engine: ${status}${why}`;
  } catch {
    return 'Model contexts\n  (unavailable this session)';
  }
}
import { saveLoadHealthSummary } from './saveLoadHealth';
import { lastCrashSummary } from './lastCrash';
import { crashLedgerSummary } from './crashLedger';
import { reportingStatusLine } from './crashReporter';

export function buildBasicDeviceSummary(): string {
  const apkBuild = Application.nativeBuildVersion ?? '(unknown)';
  // OTA-251 — App version now reads DISPLAY_VERSION from buildInfo.ts.
  // Background: OTA-250 tried to pull the version from Constants.
  // expoConfig?.version (i.e. app.json's expo.version). But Expo binds
  // app.json's version to the runtimeVersion gate — bumping it
  // orphans OTAs (the APK silently rejects them). So app.json must
  // stay pinned to the rt baked into the installed APK. DISPLAY_VERSION
  // is a separate JS-only constant that bumps freely per OTA and is
  // what the player sees. Native version is still preserved on its
  // own line for diagnostic clarity (the APK's nativeVersionName).
  const otaVersion = DISPLAY_VERSION;
  const nativeVersion = Application.nativeApplicationVersion ?? otaVersion;
  const appId = Application.applicationId ?? '(unknown)';
  // Constants.deviceName is iOS-set (user's chosen device name in
  // Settings → General → About → Name); on Android it's null in
  // managed Expo unless a custom config plugin exposes it. Either
  // way we tolerate the missing case.
  const deviceName = Constants.deviceName ?? '(not exposed by platform)';

  // Intl is available on Hermes; both `.locale` and `.timeZone`
  // are RFC-standard fields on resolvedOptions(). Guarded anyway
  // because some lower-end Androids ship a partial Intl polyfill.
  let locale = '(unknown)';
  let timeZone = '(unknown)';
  try {
    const r = new Intl.DateTimeFormat().resolvedOptions();
    locale = r.locale ?? '(unknown)';
    timeZone = r.timeZone ?? '(unknown)';
  } catch {
    // Hermes Intl missing — leave as unknown.
  }

  const win = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  const screenStr =
    `window ${Math.round(win.width)}×${Math.round(win.height)}` +
    ` / screen ${Math.round(screen.width)}×${Math.round(screen.height)}` +
    ` @ ${PixelRatio.get()}x density`;

  const hermes =
    typeof (globalThis as { HermesInternal?: unknown }).HermesInternal !==
    'undefined';

  const lines = [
    `Device`,
    `  Name: ${deviceName}`,
    `  Platform: ${Platform.OS} ${Platform.Version}`,
    `  Hermes: ${hermes ? 'yes' : 'no'}`,
    `  Locale: ${locale}`,
    `  Timezone: ${timeZone}`,
    `  Screen: ${screenStr}`,
    `  Captured at: ${new Date().toISOString()}`,
    ``,
    `Install`,
    `  App ID: ${appId}`,
    `  App version: ${otaVersion}`,
    ...(nativeVersion !== otaVersion
      ? [`  APK build version: ${nativeVersion}`]
      : []),
    `  APK build: ${apkBuild}`,
    // OTA-267 — user-visible build label is now the codename
    // (e.g., "Cinder Drift") instead of the raw OTA_BUILD_ID
    // ("2026-05-31-266"), which matched the OTA-NNN pattern in
    // commit messages and was a search-engine breadcrumb back to
    // the GitHub repo. The codename map lives in
    // app/buildCodename.ts and docs/build-codenames.md.
    // OTA-274 — surface BOTH the AAB codename (binary identity,
    // from versionCode) and the OTA codename (JS bundle identity,
    // from OTA_BUILD_ID). They drift naturally; testers on the
    // same APK running different OTA bundles share the AAB name
    // but differ on OTA name. Dev pairs the two when triaging.
    `  AAB: ${getApkCodename(apkBuild)}`,
    `  OTA: ${getBuildCodename(OTA_BUILD_ID)}`,
    // OTA-278 — surface the boot-stage telemetry that App.tsx writes
    // into a global at each step. Lets us diagnose "which stage did
    // the boot path stall on?" from a single bug report. The global
    // is set by App.tsx's `setStage(s)` helper at hydrate / mlhealth
    // / cognitive / qwen / etc. If the boot completed cleanly we'll
    // see "qwen:done" — anything else identifies the stall point.
    // First needed for the iOS Qwen-stuck-at-idle investigation:
    // Cognitive boots fine but Qwen stays at idle/0%/no-error, which
    // is impossible if bootQwen was called. Seeing the final stage
    // tells us if setTimeout fired, if bootQwen was reached, etc.
    `  Boot stage: ${(globalThis as unknown as { __TARTARIA_BOOT_STAGE?: string }).__TARTARIA_BOOT_STAGE ?? '(not set)'}`,
    ``,
    // OTA-272 — ML runtime health block. Tells the dev at triage
    // time whether this tester has hit native ML crashes and
    // self-disabled. Crash count + timestamps surface here so a
    // bug report containing "everything feels less interesting"
    // can be diagnosed as "Qwen is auto-disabled, they're on
    // template narration only" instead of guessing.
    mlHealthSummary(),
    // arb38 — save-load crash block. Surfaces whether any character
    // has been closing the app on load (stale cross-version save) and
    // how many times, so an "app crashes when I open my guy" report is
    // diagnosed at a glance instead of guessed.
    saveLoadHealthSummary(),
    // arb172 — last JS-fatal crash (stage + message + top stack frames). The
    // global ErrorUtils handler captures non-ML, non-load crashes here; without
    // this line they never reached the pasted report and we'd be guessing.
    lastCrashSummary(),
    // ⚠⚠ OTA-1380 — THE CRASH LEDGER. lastCrashSummary() above is a SINGLE SLOT,
    // so a crash loop reports as one crash and the first (most informative) one
    // is gone. This is the last ten — and it is the only place a NATIVE death
    // appears at all, because a process killed by the OS runs no JS and so
    // never reaches the handler that writes lastCrash. That was B9.
    crashLedgerSummary(),
    // And whether any of it is being DELIVERED anywhere, which is a different
    // question from whether it was captured, and one a reader of this report
    // should never have to guess at.
    reportingStatusLine(),
    // ⚠ OTA-1172 — RUNTIME PRESSURE. Memory warnings, render stalls and the app-state
    // trail. This block exists because a hard-lock report arrived with no way to answer
    // "did the OS ask for memory back" or "did the screen stop painting" — the two
    // questions that decide which half of the codebase to look in. The counts belong in
    // the HEADER, not only reconstructable from 146 log lines.
    runtimePressureBlock(),
    // ⚠⚠ OTA-1177 — LIVE MODEL CONTEXTS. Three JetsamEvent reports put this process at
    // ~1.9GB on a 3GB phone with reason `per-process-limit`; the model is ~400MB of that
    // and the rest was never accounted for. One number in the header — how many contexts
    // are live right now — separates "we are holding four of them" from "look elsewhere",
    // and no amount of reading the code answers it.
    contextLedgerBlock(),
  ];
  return lines.join('\n');
}

// 2026-05-27 OTA-101 — stampLogExport. Single source of truth
// for the envelope-wrapped log + appended device/install
// summary that ships with every COPY / SHARE / CHUNK button
// across LogScreen + AboutScreen. Player request: "when a
// playtester pushes a big report have it also copy and paste
// the about information." Done — every log export now bundles
// both, so I don't have to ask the player to send the about
// info separately + their captures always carry build context.
//
// Format mirrors what playtesters were already manually doing
// (envelope first, blank line, "Tartaria Realms" header, then
// the buildBasicDeviceSummary block):
//
//   === TARTARIA LOG · 9243 CHARS · BEGIN ===
//   ... log body ...
//   === END LOG · 9243 CHARS ===
//
//   Tartaria Realms
//
//   Device
//     ...
//   Install
//     ...
//
// Multipart variant uses PART N of M markers but otherwise
// the same shape. The about block ALWAYS goes after the
// closing marker so it doesn't interfere with the byte-count
// envelope check (which compares chars between BEGIN/END to
// detect paste-side truncation).
export interface StampLogOptions {
  chunk?: { index: number; total: number };
  /** Optional player name to surface alongside Tartaria Realms
   *  in the header. Used by the TitleScreen export which has
   *  per-slot context. */
  playerName?: string;
}

export function stampLogExport(logBody: string, opts: StampLogOptions = {}): string {
  const { chunk, playerName } = opts;
  const begin = chunk
    ? `=== TARTARIA LOG · PART ${chunk.index} of ${chunk.total} · ${logBody.length} CHARS · BEGIN ===`
    : `=== TARTARIA LOG · ${logBody.length} CHARS · BEGIN ===`;
  const end = chunk
    ? `=== END PART ${chunk.index} of ${chunk.total} ===`
    : `=== END LOG · ${logBody.length} CHARS ===`;
  const header = playerName ? `Tartaria Realms · ${playerName}` : 'Tartaria Realms';
  return `${begin}\n${logBody}\n${end}\n\n${header}\n\n${buildBasicDeviceSummary()}\n`;
}
