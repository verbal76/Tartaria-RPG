// ⚠⚠ OTA-1380 — CRASH DELIVERY, AND IT IS INERT UNTIL TWO SEPARATE THINGS ARE TRUE.
//
// Owner's call, asked and answered before a line of this was written: crash
// reporting is staged, and off-device delivery is OPT-IN, DEFAULT OFF.
//
// So there are two independent switches, and BOTH must be on before a single
// byte leaves the device:
//
//   1. CONFIGURED — a transport is installed and a DSN exists. Neither is true
//      in the shipped build today: `@sentry/react-native` is a NATIVE module, so
//      adding it needs a full store rebuild rather than an OTA, and it needs an
//      account and DSN only the owner can create. Until then `transport` is
//      null, `reportingConfigured()` is false, and every function here is a
//      no-op that costs one boolean check.
//
//   2. ENABLED — the player has not turned it OFF in Settings.
//
//      ⚠⚠ OTA-1487 — THE DEFAULT FLIPPED, ON THE OWNER'S EXPLICIT RULING
//      (2026-08-24: "make it an opt out, not an opt in"). Delivery now defaults
//      ON; the Settings switch turns it off. Three things did NOT change:
//        · an explicit OFF is absolute — a stored 'false' wins over the new
//          default forever, so nobody who said no is re-enrolled;
//        · before the stored preference has been READ, nothing sends — the
//          in-memory default stays false so an opt-out can never lose a race
//          with a boot-time flush (App.tsx awaits loadReportingPref first);
//        · docs/PRIVACY.md changed in the same commit, because a policy that
//          says "off until you turn it on" over an opt-out build is a lie.
//      The original OTA-1380 ruling (opt-in, default off) is preserved above in
//      history; this paragraph is the record of it being overturned.
//
// ⚠ THE ORDER OF THOSE CHECKS MATTERS AND IS NOT AN ACCIDENT. `reportingEnabled`
// requires configured AND opted-in, so a build with no DSN cannot transmit even
// if the stored preference says yes (e.g. a player who opted in on a build that
// had a DSN, then moved to one that does not). The preference is remembered
// either way — flipping it back on must not lose the player's earlier answer.
//
// ⚠ WHAT THIS DOES NOT DO, STATED SO NOBODY ASSUMES OTHERWISE: it does not catch
// native crashes. Nothing written in JavaScript can. A process killed by the OS
// for memory — B9 — runs no JS, so the only in-app evidence is the surviving
// breadcrumb that `crashLedger` now promotes to a `native-death` record. Real
// native capture arrives with the Sentry SDK and a native build; that is the
// second half of "staged", and this file is the seam it plugs into.
//
// ADDING SENTRY LATER IS A ONE-FILE CHANGE, and deliberately so:
//   1. `npx expo install @sentry/react-native` (native dep → new store build)
//   2. put the DSN in app.json under `expo.extra.crashReportDsn`
//   3. in App.tsx, after the ledger wiring:
//        Sentry.init({ dsn: crashReportDsn(), enableNative: true });
//        installCrashTransport({
//          name: 'sentry',
//          send: async (r) => { Sentry.captureEvent(toSentryEvent(r)); },
//        });
//   4. update docs/PRIVACY.md — data leaves the device the moment a player opts in
// Nothing else in the app changes, because nothing else in the app knows there
// is a transport.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { loadCrashLedger, markCrashesSent, unsentCrashes, type CrashRecord } from './crashLedger';

export const CRASH_REPORTING_PREF_KEY = '@tartaria/crashReporting';

export interface CrashTransport {
  /** Shown in About so the player can see what would receive their data. */
  name: string;
  /** Resolve on accepted, reject on failure. Never called unless enabled. */
  send(rec: CrashRecord): Promise<void>;
}

let transport: CrashTransport | null = null;
let optedIn = false;
let prefLoaded = false;

/** The DSN, if this build carries one. Read from expo config rather than a
 *  literal so the key is a build input, not something baked into source that
 *  would end up in the public repo. */
export function crashReportDsn(): string | null {
  try {
    const extra = (Constants?.expoConfig?.extra ?? {}) as { crashReportDsn?: unknown };
    const dsn = typeof extra.crashReportDsn === 'string' ? extra.crashReportDsn.trim() : '';
    return dsn.length > 0 ? dsn : null;
  } catch {
    return null;
  }
}

export function installCrashTransport(t: CrashTransport | null): void { transport = t; }
export function crashTransportName(): string | null { return transport?.name ?? null; }

/** Switch 1: could this build deliver anything at all? */
export function reportingConfigured(): boolean {
  return transport !== null && crashReportDsn() !== null;
}

/** Switch 2 AND switch 1. The only function anything should gate transmission on. */
export function reportingEnabled(): boolean {
  return reportingConfigured() && optedIn;
}

/** The player's stored answer, independent of whether this build can act on it. */
export function reportingOptedIn(): boolean { return optedIn; }

export async function loadReportingPref(): Promise<boolean> {
  if (prefLoaded) return optedIn;
  try {
    // ⚠⚠ OTA-1487 — OPT-OUT: no stored answer means ON. Only an explicit,
    // recorded 'false' (the player pressed the switch off, on any version)
    // holds delivery off. `raw === 'true'` was the opt-in reading.
    const raw = await AsyncStorage.getItem(CRASH_REPORTING_PREF_KEY);
    optedIn = raw !== 'false';
  } catch {
    // ⚠ A preference we could not READ might have been an explicit opt-out.
    // Deliver nothing rather than risk overriding a recorded no — the next
    // successful read restores the real answer.
    optedIn = false;
  }
  prefLoaded = true;
  return optedIn;
}

export async function setReportingEnabled(on: boolean): Promise<void> {
  optedIn = !!on;
  prefLoaded = true;
  try { await AsyncStorage.setItem(CRASH_REPORTING_PREF_KEY, on ? 'true' : 'false'); } catch { /* ignore */ }
}

/** One line for the About screen, and it says which switch is holding it. A
 *  toggle that reads "on" while a missing DSN silently blocks delivery is how a
 *  player (or the owner, reading a bug report) concludes reports are arriving
 *  when none are. */
export function reportingStatusLine(): string {
  const dsn = crashReportDsn() !== null;
  if (!transport && !dsn) return 'Crash delivery: not built into this version (capture still works, on-device only).';
  if (!transport) return 'Crash delivery: no transport installed in this build — nothing is sent.';
  if (!dsn) return 'Crash delivery: this build has no destination configured — nothing is sent.';
  return optedIn
    ? `Crash delivery: ON — reports go to ${transport.name} when you crash.`
    : `Crash delivery: OFF — captured on this device only. Turn it on to help fix crashes.`;
}

/** Hand every undelivered record to the transport. Safe to call on any boot:
 *  a no-op when not enabled, and failures leave the records unsent for the next
 *  attempt rather than dropping them. */
export async function flushCrashReports(): Promise<number> {
  if (!reportingEnabled()) return 0;
  try {
    await loadCrashLedger();
    const pending = unsentCrashes();
    if (pending.length === 0) return 0;
    const delivered: string[] = [];
    for (const rec of pending) {
      try {
        await transport!.send(rec);
        delivered.push(rec.id);
      } catch {
        // ⚠ Stop on the first failure rather than hammering a dead endpoint
        // through ten records on a device that may be offline entirely.
        break;
      }
    }
    if (delivered.length > 0) await markCrashesSent(delivered);
    return delivered.length;
  } catch {
    return 0;
  }
}

/** Test seam. Never called by shipped code. */
export function _resetCrashReporterForTests(): void {
  transport = null;
  optedIn = false;
  prefLoaded = false;
}
