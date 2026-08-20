// ⚠⚠ OTA-1366 — THE CRASH LEDGER. Owner: *"add crash reporting."*
//
// ⚠ READ THIS BEFORE ADDING ANYTHING: the project already HAD crash capture, and
// a great deal of it. `@tartaria/lastCrash` (the global ErrorUtils handler),
// `crashSave.ts` (the exact save bytes for repro), `ScreenErrorBoundary`,
// `lastBreadcrumb` (OTA-1276..1377), `mlHealth`, `runtimePressure` and
// `bugReport`'s one-tap clipboard bundle all predate this file. Assuming
// otherwise and bolting on a parallel system is the obvious mistake here, so it
// is named up front. This module does NOT replace any of them; it collects what
// they already produce into one durable, multi-entry record.
//
// TWO GAPS WERE REAL, AND THEY ARE THE ONLY REASON THIS EXISTS:
//
//   1. EVERY CRASH OVERWROTE THE LAST. `@tartaria/lastCrash` is a single slot.
//      Crash twice and the first is gone — so a repeating crash and a one-off
//      look identical, and the interesting one (the FIRST, before the app was
//      already sick) is the one you lose. This is a ring of the last 10.
//
//   2. A NATIVE DEATH PRODUCED NO CRASH RECORD AT ALL. B9 was an OOM kill: the
//      process was terminated by the OS, so no JS handler ran, `lastCrash` was
//      never written, and the only trace was a breadcrumb sitting on disk that
//      the next boot printed to the debug log and then discarded. That is
//      exactly why five OTAs went into hand-built forensics. The breadcrumb was
//      already the evidence — it was just never promoted to a CRASH. Now it is:
//      hydrate() turns a surviving crumb into a `native-death` record with the
//      phase, the room and the screen the process died in.
//
// ⚠ NOTHING HERE TRANSMITS. This module only writes to local AsyncStorage.
// Delivery is `crashReporter.ts`, which is inert unless a DSN is configured AND
// the player has opted in. Keeping capture and delivery in separate files is
// deliberate: capture must keep working for a player who never opts in, because
// the clipboard bug-report path reads the same ledger.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OTA_BUILD_ID, DISPLAY_VERSION } from '../buildInfo';

export const CRASH_LEDGER_KEY = '@tartaria/crashLedger';

/** How many crashes are kept. Ten is enough to see a pattern (same stack three
 *  boots running) without the record growing without bound on a device that is
 *  crash-looping — which is the exact device least able to afford the storage. */
export const CRASH_LEDGER_CAP = 10;

export type CrashKind =
  /** The global ErrorUtils handler fired — an uncaught JS error. */
  | 'js-fatal'
  /** ScreenErrorBoundary caught a render throw. The app survived; the screen did not. */
  | 'js-boundary'
  /** hydrate() threw. The save may not have loaded. */
  | 'hydrate-fail'
  /** ⚠ THE B9 CASE. No JS ran. Inferred at boot from a breadcrumb that survived,
   *  which can only happen if the process died while an action was live. */
  | 'native-death';

export interface CrashRecord {
  /** Stable per crash, so a re-read of the ledger cannot double-count one. */
  id: string;
  ts: number;
  kind: CrashKind;
  /** Boot stage / origin tag (`__TARTARIA_BOOT_STAGE`), mirrors lastCrash. */
  stage: string;
  message: string;
  stack?: string;
  isFatal?: boolean;
  sinceBoot?: number;
  build: string;
  version: string;
  /** `native-death` only — what the app was doing when the OS killed it. */
  breadcrumb?: {
    at: number;
    what: string;
    room?: string;
    screen?: string;
    phase?: string;
    phaseDetail?: string;
    phaseAt?: number;
  };
  /** Set once a transport has accepted it. Absent = never delivered anywhere. */
  sent?: boolean;
}

/** Sync mirror so `crashLedgerSummary()` can serve the About screen and the bug
 *  report without an await — the same shape lastCrash.ts uses, and for the same
 *  reason: those two callers are sync and must not sprout a loading state. */
let cache: CrashRecord[] | null = null;

/** ⚠⚠ WRITES ARE SERIALISED, and this is not theoretical tidiness — the suite
 *  caught it. `recordCrash` is fire-and-forget, so two crashes in the same tick
 *  each read the ledger, each append to the copy they read, and the second write
 *  overwrites the first. That is the ORIGINAL single-slot bug re-created inside
 *  the thing built to fix it, and the case where it matters most is a fast crash
 *  loop — exactly when several records land close together.
 *
 *  A tail promise costs nothing (there is no contention outside that case) and
 *  makes append-then-persist atomic with respect to every other append. */
let writeTail: Promise<void> = Promise.resolve();

const clip = (s: unknown, n: number): string => String(s ?? '').slice(0, n);

/** ⚠ Never throws and never returns a rejected promise. A crash recorder that
 *  can itself crash turns one defect into two, and the second one happens
 *  inside the handler for the first. Every path here swallows. */
export function recordCrash(
  rec: Omit<CrashRecord, 'id' | 'ts' | 'build' | 'version'> & { ts?: number },
): void {
  try {
    const ts = rec.ts ?? Date.now();
    const full: CrashRecord = {
      id: `${ts}_${rec.kind}`,
      ts,
      kind: rec.kind,
      stage: clip(rec.stage || 'unknown', 60),
      message: clip(rec.message, 500),
      stack: rec.stack ? clip(rec.stack, 2000) : undefined,
      isFatal: rec.isFatal,
      sinceBoot: rec.sinceBoot,
      build: OTA_BUILD_ID,
      version: DISPLAY_VERSION,
      breadcrumb: rec.breadcrumb,
      sent: rec.sent,
    };
    writeTail = writeTail.then(async () => {
      try {
        const list = await loadCrashLedger();
        // ⚠ Dedup on id. hydrate() can run more than once in a session (a
        // reload after a fatal re-enters it), and promoting the same surviving
        // breadcrumb twice would invent a crash that never happened.
        if (list.some((r) => r.id === full.id)) return;
        const next = [...list, full].slice(-CRASH_LEDGER_CAP);
        cache = next;
        await AsyncStorage.setItem(CRASH_LEDGER_KEY, JSON.stringify(next));
      } catch { /* the crash still happened; losing the note is the lesser loss */ }
    });
  } catch { /* ignore */ }
}

/** Oldest first — the order they happened, which is the order you want to read
 *  a crash loop in. */
export async function loadCrashLedger(): Promise<CrashRecord[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(CRASH_LEDGER_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(parsed) ? (parsed as CrashRecord[]).slice(-CRASH_LEDGER_CAP) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export async function clearCrashLedger(): Promise<void> {
  // ⚠ Joins the same queue as the appends, so a clear can never land between an
  // in-flight append's read and its write and resurrect what it just removed.
  await settleCrashWrites();
  cache = [];
  try { await AsyncStorage.removeItem(CRASH_LEDGER_KEY); } catch { /* ignore */ }
}

/** Await every append queued so far. Shipped code never needs this (writes are
 *  fire-and-forget by design); the bug report path and the tests do. */
export function settleCrashWrites(): Promise<void> {
  return writeTail;
}

/** Records no transport has accepted yet. */
export function unsentCrashes(): CrashRecord[] {
  return (cache ?? []).filter((r) => !r.sent);
}

/** Mark delivered. Called by crashReporter after a transport accepts. */
export async function markCrashesSent(ids: readonly string[]): Promise<void> {
  try {
    const set = new Set(ids);
    const list = await loadCrashLedger();
    const next = list.map((r) => (set.has(r.id) ? { ...r, sent: true } : r));
    cache = next;
    await AsyncStorage.setItem(CRASH_LEDGER_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

const KIND_LABEL: Record<CrashKind, string> = {
  'js-fatal': 'JS fatal',
  'js-boundary': 'screen crash (recovered)',
  'hydrate-fail': 'save load failed',
  'native-death': 'PROCESS KILLED — no JS ran',
};

/** Sync block for the About screen and the bug report. Reads the cache, so a
 *  caller that has never awaited `loadCrashLedger()` gets the header and an
 *  honest "not loaded yet" rather than a lie about there being none. */
export function crashLedgerSummary(): string {
  if (cache === null) return 'Crash ledger\n  (not loaded yet)';
  if (cache.length === 0) return 'Crash ledger\n  No crashes recorded.';
  const out: string[] = [`Crash ledger — ${cache.length} recorded (newest last)`];
  for (const r of cache) {
    const age = Math.round(Math.max(0, Date.now() - r.ts) / 60_000);
    out.push(`  • ${new Date(r.ts).toISOString()} (${age}m ago) — ${KIND_LABEL[r.kind] ?? r.kind}`);
    out.push(`      build ${r.version} · ${r.build} · stage ${r.stage}`);
    if (r.message) out.push(`      ${r.message}`);
    if (r.breadcrumb) {
      // ⚠ For a native death this IS the whole report — there is no stack,
      // because no JS ran. The phase is the most useful field in the file.
      const b = r.breadcrumb;
      out.push(`      doing: ${b.what} · room ${b.room ?? '?'} · screen ${b.screen ?? '?'}`);
      if (b.phase) {
        const dt = b.phaseAt != null ? ` (+${Math.max(0, b.phaseAt - b.at)}ms)` : '';
        out.push(`      last checkpoint: ${b.phase}${b.phaseDetail ? ` [${b.phaseDetail}]` : ''}${dt}`);
      }
    }
    if (r.stack) out.push(`      ${r.stack.split('\n').slice(0, 4).join('\n      ')}`);
  }
  return out.join('\n');
}

/** Test seam. Never called by shipped code. */
export function _setCrashLedgerForTests(list: CrashRecord[] | null): void { cache = list; }
