/**
 * app/diagnostics/sentryTransport.ts — THE CRASH TRANSPORT.
 *
 * OTA-1401. The second half of "staged" that `crashReporter.ts` has been
 * describing since OTA-1380: a real destination for the crash records the
 * ledger has been capturing on-device and never sending anywhere.
 *
 * ⚠⚠ THE ENTIRE FILE IS BUILT AROUND ONE HAZARD, AND IT IS NOT A SENTRY HAZARD.
 *
 * `@sentry/react-native` is a NATIVE module. It exists in a build only after an
 * APK/AAB or IPA is compiled with it. But this OTA ships as a JS bundle to
 * devices running APK build 293, which was compiled BEFORE it — and a bundle
 * that does `import * as Sentry from '@sentry/react-native'` at module scope
 * fails to load on every one of those devices.
 *
 * ⚠ AND THAT FAILURE IS INVISIBLE FROM THE OUTSIDE. expo-updates abandons an
 * update whose JS throws during startup and silently reverts to the last working
 * bundle. From the player's side it looks exactly like "the update never
 * downloaded" — which is precisely the symptom OTA-1174 spent an OTA chasing,
 * and the reason that suite exists at all. Shipping a bare import here would
 * have bricked OTA delivery for every existing install, and the log would have
 * said nothing.
 *
 * So: LAZY `require`, inside a try/catch, behind a `typeof` check on what comes
 * back. Same pattern App.tsx already uses for `expo-navigation-bar`, for exactly
 * the same reason. On a build without the native module this file installs
 * nothing, `reportingConfigured()` stays false, and About says so honestly.
 *
 * ⚠ WHAT THIS DOES NOT DO. It does not change when a crash is CAPTURED — the
 * ledger already did that, on every build, and still does with or without a
 * transport. It does not enable delivery: `flushCrashReports()` refuses unless
 * the player has opted in, and that switch is untouched here. All this adds is
 * somewhere for an opted-in report to go.
 */
import Constants from 'expo-constants';
import type { CrashRecord } from './crashLedger';
import { crashReportDsn, installCrashTransport, reportingEnabled } from './crashReporter';
import { OTA_BUILD_ID } from '../buildInfo';

/** Minimal shape of the bits of the SDK this file uses. Declared rather than
 *  imported so the type does not drag the module into the bundle graph. */
interface SentryLike {
  init: (opts: Record<string, unknown>) => void;
  // ⚠ OTA-1489 — the optional second argument is the SDK's event HINT; its
  // `attachments` array is how a whole game log rides along with one event.
  // Same runtime function, wider type — crash records keep calling it 1-arg.
  captureEvent: (event: Record<string, unknown>, hint?: Record<string, unknown>) => void;
  setTag?: (key: string, value: string) => void;
  // ⚠ OTA-1492 — flush forces the queued envelope OUT and answers whether it
  // went. Without it, captureEvent is fire-and-forget: the owner's first three
  // SEND LOG taps reported "SENT" while nothing ever arrived server-side.
  flush?: (timeout?: number) => PromiseLike<boolean>;
}

let sdk: SentryLike | null = null;
let attempted = false;

/** ⚠ Lazy, guarded, and cached. See the header — a static import here breaks
 *  OTA delivery on every device built before the native module shipped. */
function loadSdk(): SentryLike | null {
  if (attempted) return sdk;
  attempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const mod = require('@sentry/react-native') as Partial<SentryLike> | null;
    // A native module that is present-but-broken is worse than an absent one, so
    // check the two functions actually used rather than trusting the require.
    if (mod && typeof mod.init === 'function' && typeof mod.captureEvent === 'function') {
      sdk = mod as SentryLike;
    }
  } catch {
    sdk = null; // built before the native module existed — expected, not an error
  }
  return sdk;
}

/** Which product this build is. Tagged on every event so one Sentry project
 *  serves all four lines without four projects to keep in step. */
function productLine(): string {
  try {
    const extra = (Constants?.expoConfig?.extra ?? {}) as { tartariaLine?: unknown };
    return typeof extra.tartariaLine === 'string' && extra.tartariaLine ? extra.tartariaLine : 'golem';
  } catch {
    return 'golem';
  }
}

/**
 * Translate one of OUR records into one of THEIRS.
 *
 * ⚠ The stack is passed as a plain string in `extra`, not parsed into Sentry's
 * structured `exception.stacktrace`. That is deliberate for a first cut: a
 * hand-rolled parser that gets frames subtly wrong produces a grouping that
 * looks authoritative and is not, and the ledger's records include kinds
 * (`native-death`) that have no JS stack at all. A correct string beats a
 * confident lie; structured frames can come later with source maps.
 */
export function toSentryEvent(rec: CrashRecord): Record<string, unknown> {
  const bc = rec.breadcrumb;
  return {
    message: rec.message,
    level: rec.isFatal === false ? 'error' : 'fatal',
    timestamp: rec.ts / 1000,
    // ⚠ Grouped by KIND and STAGE, not by message. A native death's message is
    // reconstructed from a breadcrumb and varies with whatever the player was
    // doing; grouping on it would file one issue per session.
    fingerprint: [rec.kind, rec.stage],
    tags: {
      line: productLine(),
      kind: rec.kind,
      stage: rec.stage,
      build: rec.build,
      version: rec.version,
    },
    extra: {
      id: rec.id,
      stack: rec.stack ?? '(none — the process died without one)',
      sinceBootMs: rec.sinceBoot,
      // The breadcrumb IS the report for a native death: it is the only record
      // of what the app was doing when the OS killed it.
      lastAction: bc?.what,
      lastRoom: bc?.room,
      lastScreen: bc?.screen,
      lastPhase: bc?.phase,
      lastPhaseDetail: bc?.phaseDetail,
      lastPhaseAgeMs: bc?.phaseAt ? rec.ts - bc.phaseAt : undefined,
    },
  };
}

/**
 * Wire the transport, if this build can carry one. Safe to call on any boot and
 * on any build: it is a no-op without a DSN or without the native module, and
 * it never throws.
 *
 * ⚠ Calling `init` does NOT start sending anything. Delivery is gated by
 * `reportingEnabled()`, which additionally requires the player's opt-in — see
 * `crashReporter.ts`. This only makes a destination exist.
 */
export function installSentryIfAvailable(): boolean {
  try {
    const dsn = crashReportDsn();
    if (!dsn) return false;
    const s = loadSdk();
    if (!s) return false;
    s.init({
      dsn,
      enableNative: true,
      // ⚠ OFF. Sentry's own auto-capture would send a crash the moment it
      // happened, bypassing the opt-in switch entirely — which would make the
      // About screen's promise false. Every event this app sends goes through
      // flushCrashReports(), and nothing else.
      enableAutoSessionTracking: false,
      autoInitializeNativeSdk: true,
      enableCaptureFailedRequests: false,
      // The ledger is the source of truth for what happened; Sentry's own
      // breadcrumb collection would duplicate it and disagree at the edges.
      maxBreadcrumbs: 0,
      environment: productLine(),
    });
    try { s.setTag?.('line', productLine()); } catch { /* optional API */ }
    installCrashTransport({
      name: 'Sentry',
      send: async (rec: CrashRecord) => { s.captureEvent(toSentryEvent(rec)); },
    });
    return true;
  } catch {
    // A diagnostic that throws on the way up is worse than no diagnostic.
    return false;
  }
}

// ⚠⚠ OTA-1489 — SEND LOG: the WHOLE PICTURE to Sentry, on one deliberate tap.
//
// Owner: *"are we able to have logs pushed to sentry for you to view? it's
// easier than copying slices"* — and then: *"have the log include the game
// log, inventory log, save file, about information all at one time so you
// always see the whole picture."* So one event carries FOUR attachments:
//
//   game-log.txt   — the stamped full log (tail-capped; recent lines are the
//                    evidence, the head of an enormous log was already fixed)
//   inventory.txt  — the same stamped snapshot COPY INVENTORY exports
//   save.json      — the same loadable export COPY SAVE produces. ⚠ NEVER
//                    truncated: a cut save does not round-trip, and a save
//                    that cannot be loaded is dead weight, not evidence.
//   device.txt     — the basic device / install summary (the About picture)
//
// Attachments, not message/extra fields, because Sentry truncates long strings
// in those; files arrive whole.
//
// ⚠⚠ TWO GATES, NEITHER OPTIONAL:
//   · `reportingEnabled()` — the privacy policy says that with the crash-
//     reports switch off "the app never contacts Sentry at all, not even to
//     check in." This send is contacting Sentry; the switch governs it too.
//   · The BUTTON that calls this renders only for the owner's unlock names
//     (`sharingUnlockedFor`, the fallen-exchange gate). The policy promises
//     players that only crash records leave; a player-facing upload of their
//     log and save would break that promise, so players never see it at all.
const LOG_ATTACHMENT_MAX_CHARS = 800_000;

export interface DiagnosticsBundle {
  /** Stamped full game log — the play-by-play. */
  log: string;
  /** Stamped inventory snapshot. */
  inventory: string;
  /** Stamped loadable save export. Sent WHOLE, never cut. */
  save: string;
  /** The basic device / install summary. */
  device: string;
}

export async function sendDiagnosticsBundle(bundle: DiagnosticsBundle): Promise<boolean> {
  try {
    if (!reportingEnabled()) return false;
    const s = loadSdk();
    if (!s || crashReportDsn() === null) return false;
    const logTail = bundle.log.length > LOG_ATTACHMENT_MAX_CHARS
      ? bundle.log.slice(-LOG_ATTACHMENT_MAX_CHARS)
      : bundle.log;
    s.captureEvent(
      {
        message: `player-log ${OTA_BUILD_ID}`,
        level: 'info',
        tags: { kind: 'player-log', line: productLine() },
      },
      {
        attachments: [
          { filename: 'game-log.txt', data: logTail, contentType: 'text/plain' },
          { filename: 'inventory.txt', data: bundle.inventory, contentType: 'text/plain' },
          { filename: 'save.json', data: bundle.save, contentType: 'application/json' },
          { filename: 'device.txt', data: bundle.device, contentType: 'text/plain' },
        ],
      },
    );
    // ⚠⚠ OTA-1492 — DON'T REPORT WHAT WAS NOT DELIVERED. The owner's first
    // three sends showed success while zero events reached the server: the
    // capture only QUEUES. flush() pushes the envelope out now and says
    // whether everything went; an SDK without flush keeps the old behavior.
    if (typeof s.flush === 'function') {
      return await s.flush(10_000);
    }
    return true;
  } catch {
    return false; // the button shows FAILED and the clipboard path still exists
  }
}

/** Tests only. */
export function _resetSentryTransportForTests(): void {
  sdk = null;
  attempted = false;
}
