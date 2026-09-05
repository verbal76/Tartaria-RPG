// ⚠⚠ OTA-1380 — THE CRASH LEDGER. Owner: *"add crash reporting."*
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
    /** ⚠⚠ OTA-1567 — the last sign of life, kept apart from the last CHECKPOINT.
     *  The `rendered` heartbeat used to overwrite `phase` on every React commit,
     *  so 25 of 32 native-death receipts named `rendered` — the instrument
     *  reporting "the player was playing". See saveSystem.LiveBreadcrumb. */
    aliveAt?: number;
  };
  /**
   * ⚠⚠⚠ OTA-1587 — WHICH LIFE DIED, AND HOW OLD IT WAS.
   *
   * Ten `native-death` records on file and SIX OF THE LAST SEVEN land on an OTA
   * apply, all reading `stage native:cognition:done`. The ledger could not say
   * whether the killed process was the OLD one (dying in the teardown that
   * precedes `reloadAsync`) or the NEW one (dying seconds into the boot that
   * reload started) — two explanations with opposite fixes and one identical
   * record. These fields are that discrimination; see diagnostics/bootIdentity.
   */
  launch?: {
    /** How long the process that died had been alive. A death 1.4s in is a
     *  boot-time OOM; a death forty minutes in is not. */
    ageMs?: number;
    /** ⚠⚠⚠ OTA-1674 — THE DEAD LIFE'S OWN FACT, read off its crumb. Until this
     *  OTA it was the READING life's: the handoff is consumed on read by the
     *  life that then dies, so the next boot found none, computed `false` about
     *  itself, and wrote that here. A death record could never say "yes" —
     *  "not an OTA-apply boot" on eight of ten kills was the only value the
     *  field could take, not a finding. `undefined` now means the life died
     *  before its launch resolved (or the crumb predates 1674) and is printed
     *  as unknown, never as a cold start. */
    afterOtaApply?: boolean;
    otaPath?: 'boot-front' | 'mid-session';
    /** Handoff → the dead life's boot. Small means the death sat inside the
     *  reload window. */
    otaGapMs?: number;
    /** The life BEFORE the dead one, at the reload (`o1/r0/l1/p1/dn0`). A
     *  non-zero `l` is the orphaned-context hypothesis with a number under it. */
    prevCtx?: string;
    /** The DEAD life's own model ledger at its last stamp. */
    ctx?: string;
  };
  /** Set once a transport has accepted it. Absent = never delivered anywhere. */
  sent?: boolean;
  /** ⚠⚠⚠ OTA-1685 — THE NATIVE SDK'S VERDICT ON THE LIFE THAT DIED. `true`: its
   *  NDK handler caught a signal in that life — a real native crash, and its
   *  own report should be on Sentry. `false`: the process ended with no signal
   *  — the OS took it (out-of-memory kill or reclaim). `null`: the SDK could not
   *  say. Absent: the record predates this OTA, or the verdict never arrived.
   *  Only a `native-death` minted in the boot that asked carries one. */
  sdkSawCrash?: boolean | null;
  /** OTA-1685 — when THIS process wrote the record. A verdict is only ever
   *  applied to a death minted in the same boot that asked for it. */
  mintedAt?: number;
}

/** OTA-1685 — the verdict, held for a native-death that is minted AFTER it
 *  arrived (hydrate promotes the crumb on its own schedule). */
let pendingSdkVerdict: { value: boolean | null } | null = null;
/** When this JS context came up — the fence for "minted this boot". */
const PROCESS_STARTED_AT = Date.now();

/** ⚠ OTA-1685 — the three answers, in words, for About and the bug report. */
export function sdkVerdictLine(v: boolean | null | undefined): string | null {
  if (v === true) return '      the native SDK SAW A CRASH in that life — a signal was raised (a real native fault, not a memory kill); its own report should be on Sentry';
  if (v === false) return '      the native SDK saw NO crash in that life — the process ended with no signal: the OS took it (out-of-memory kill or reclaim)';
  if (v === null) return '      the native SDK could not say whether that life crashed (no native module, or not initialised in time)';
  return null;
}

/**
 * ⚠⚠⚠ OTA-1685 — WRITE THE NATIVE SDK'S VERDICT ONTO THE DEATH THIS BOOT MINTED.
 * Called once per boot, after Sentry is installed. Annotates every native-death
 * record minted in this process that has no verdict yet, and holds the verdict
 * for one minted later (hydrate runs on its own schedule). Returns the debug
 * line to log, or null when there was no death to annotate.
 */
export async function applyNativeSdkVerdict(verdict: boolean | null): Promise<string | null> {
  try {
    pendingSdkVerdict = { value: verdict };
    await settleCrashWrites();
    const list = await loadCrashLedger();
    const targets = list.filter((r) =>
      r.kind === 'native-death' && r.sdkSawCrash === undefined
      && r.mintedAt != null && r.mintedAt >= PROCESS_STARTED_AT - 1000);
    const word = verdict === true ? 'yes' : verdict === false ? 'no' : 'unknown';
    if (targets.length === 0) {
      return verdict === true
        ? `crash-ledger: the native SDK reports a crash in the previous run (crashed=yes) but no death crumb was minted this boot — the signal came with no live action recorded`
        : null;
    }
    const ids = new Set(targets.map((r) => r.id));
    const next = list.map((r) => (ids.has(r.id) ? { ...r, sdkSawCrash: verdict } : r));
    cache = next;
    await AsyncStorage.setItem(CRASH_LEDGER_KEY, JSON.stringify(next));
    return `crash-ledger: native SDK verdict on the life that died — crashed=${word} (${targets.length} record${targets.length === 1 ? '' : 's'} annotated)`;
  } catch {
    return null;
  }
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
      launch: rec.launch,
      sent: rec.sent,
      mintedAt: Date.now(),
      // OTA-1685 — a native death minted after the verdict arrived takes it now.
      ...(rec.kind === 'native-death' && pendingSdkVerdict ? { sdkSawCrash: pendingSdkVerdict.value } : {}),
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

/** ⚠⚠⚠ OTA-1674 — A RECORD THAT IS NOT FATAL MUST NOT SAY "KILLED".
 *
 *  OTA-1567 stopped filing an idle reclaim as a fatal crash (`isFatal: false`),
 *  and Sentry has honoured that since (level `error`, not `fatal`). This
 *  renderer never did: it keyed the label on `kind` alone, so every reclaim
 *  still printed PROCESS KILLED — no JS ran, in About and in every bug report,
 *  and was counted in "N recorded" beside the real ones. Two of the owner's ten
 *  entries in the 19:40 report were that. A ledger that overstates kills to the
 *  one person reading it is the exact failure OTA-1521 named: it sends the hunt
 *  at the wrong thing. The label now says what the record already knew. */
function recordLabel(r: CrashRecord): string {
  if (r.kind === 'native-death' && r.isFatal === false) return 'PROCESS RECLAIMED — not a crash (no JS ran)';
  return KIND_LABEL[r.kind] ?? r.kind;
}

/** Fatal unless the record says otherwise. `undefined` is fatal: every record
 *  written before `isFatal` existed was a real crash, and a missing flag must
 *  not quietly downgrade it. */
function isFatalRecord(r: CrashRecord): boolean {
  return r.isFatal !== false;
}

/** Sync block for the About screen and the bug report. Reads the cache, so a
 *  caller that has never awaited `loadCrashLedger()` gets the header and an
 *  honest "not loaded yet" rather than a lie about there being none. */
export function crashLedgerSummary(): string {
  if (cache === null) return 'Crash ledger\n  (not loaded yet)';
  if (cache.length === 0) return 'Crash ledger\n  No crashes recorded.';
  // ⚠ OTA-1674 — the count says how many were FATAL. "10 recorded" with two
  // idle reclaims among them read as ten kills to the owner; it was eight.
  const fatalCount = cache.filter(isFatalRecord).length;
  const out: string[] = [
    fatalCount === cache.length
      ? `Crash ledger — ${cache.length} recorded (newest last)`
      : `Crash ledger — ${cache.length} recorded, ${fatalCount} fatal (newest last)`,
  ];
  // ⚠⚠⚠ OTA-1587 — THE ROLLUP THAT NAMES THE PATTERN, because the pattern is
  // what a reader misses. Six of the owner's last seven kills followed an OTA
  // apply, and finding that took reading ten records against a list of OTA
  // timestamps by hand. Any reader who has the ledger now has the count.
  //
  // ⚠⚠ OTA-1674 — over FATAL kills, and `=== true`. An idle reclaim that
  // happened to follow an apply is not the #110 signal, and `undefined` (the
  // life died before its launch resolved) is not a "no" — counting it as one
  // is the same lie the field told for two OTAs, one layer down.
  const kills = cache.filter((r) => r.kind === 'native-death' && isFatalRecord(r));
  const onOta = kills.filter((r) => r.launch?.afterOtaApply === true);
  const unresolved = kills.filter((r) => r.launch && r.launch.afterOtaApply === undefined);
  if (onOta.length > 0) {
    out.push(`  ⚠⚠ ${onOta.length} of ${kills.length} process kills landed on an OTA-apply boot`);
    const orphaned = onOta.filter((r) => /\/l[1-9]/.test(r.launch?.prevCtx ?? ''));
    if (orphaned.length > 0) {
      out.push(`     ⚠⚠⚠ ${orphaned.length} of those inherited a native model context the `
        + `previous life never released — reloadAsync reuses the same native process`);
    }
  }
  if (unresolved.length > 0) {
    // ⚠ Said out loud, because the absence of the line is how the hole hid.
    out.push(`  ⚠ ${unresolved.length} of ${kills.length} died before their launch resolved — whether they followed an OTA apply is not known`);
  }
  for (const r of cache) {
    const age = Math.round(Math.max(0, Date.now() - r.ts) / 60_000);
    out.push(`  • ${new Date(r.ts).toISOString()} (${age}m ago) — ${recordLabel(r)}`);
    out.push(`      build ${r.version} · ${r.build} · stage ${r.stage}`);
    if (r.message) out.push(`      ${r.message}`);
    if (r.breadcrumb) {
      // ⚠ For a native death this IS the whole report — there is no stack,
      // because no JS ran. The phase is the most useful field in the file.
      const b = r.breadcrumb;
      out.push(`      doing: ${b.what} · room ${b.room ?? '?'} · screen ${b.screen ?? '?'}`);
      if (b.phase) {
        // ⚠⚠ OTA-1571 — THE BARE `(+Nms)` HERE HAS BEEN MISREAD SINCE IT SHIPPED,
        // by me included. It is `phaseAt - at`: how far INTO THE ACTION the
        // checkpoint landed. Printed with no unit-of-meaning right after the
        // phase name it reads as the checkpoint's own age, which is why a
        // `(+306713ms)` on an idle breadcrumb looked like a five-minute stall
        // instead of what it was — an action string that had simply been sitting
        // there for five minutes. Both numbers are worth having, so both are
        // named. `aliveAt` (OTA-1567) is the one that answers the question the
        // reader is actually asking: how long the process outlived the
        // checkpoint before it was killed.
        const into = b.phaseAt != null ? ` · ${Math.max(0, b.phaseAt - b.at)}ms into the action` : '';
        const after =
          b.phaseAt != null && b.aliveAt != null
            ? ` · alive ${Math.max(0, b.aliveAt - b.phaseAt)}ms after it`
            : '';
        out.push(
          `      last checkpoint: ${b.phase}${b.phaseDetail ? ` [${b.phaseDetail}]` : ''}${into}${after}`,
        );
      }
    }
    if (r.launch) {
      // ⚠⚠⚠ OTA-1587 — THE TWO LINES THAT SAY WHICH PROCESS THIS WAS. Without
      // them a kill in the teardown BEFORE reloadAsync and a kill seconds INTO
      // the boot reloadAsync started read identically, and they have opposite
      // fixes. The age is the discriminator; the ledger tags are the evidence
      // for what the new life inherited.
      const l = r.launch;
      const age = l.ageMs != null ? `died ${l.ageMs}ms into the process` : 'age of the process unknown';
      // ⚠⚠⚠ OTA-1674 — THREE ANSWERS, NOT TWO. `undefined` is the life dying
      // before its launch resolved (or a crumb older than this OTA), and
      // printing it as "not an OTA-apply boot" is exactly how the hole in the
      // instrument stayed hidden for two OTAs: the absence of a fact wore the
      // words of a fact.
      const ota = l.afterOtaApply === true
        ? ` · THIS BOOT FOLLOWED AN OTA APPLY${l.otaGapMs != null ? ` ${l.otaGapMs}ms earlier` : ''}${l.otaPath ? ` via ${l.otaPath}` : ''}`
        : l.afterOtaApply === false
          ? ' · not an OTA-apply boot'
          : ' · whether it followed an OTA apply is not known (died before its launch resolved)';
      out.push(`      launch: ${age}${ota}`);
      // ⚠⚠⚠ OTA-1685 — the native SDK's verdict, right under the launch line it
      // qualifies. Absent on records older than this OTA: nothing is invented.
      const verdict = sdkVerdictLine(r.sdkSawCrash);
      if (verdict) out.push(verdict);
      if (l.prevCtx) {
        out.push(/\/l[1-9]/.test(l.prevCtx)
          ? `      ⚠⚠ the previous life handed over a LIVE native context (${l.prevCtx}) — `
            + `reloadAsync reuses the same native process, so this life's own model is the second one`
          : `      previous life released its contexts before reloading (${l.prevCtx})`);
      }
      if (l.ctx) out.push(`      its own model ledger at the last stamp: ${l.ctx}`);
    }
    if (r.stack) out.push(`      ${r.stack.split('\n').slice(0, 4).join('\n      ')}`);
  }
  return out.join('\n');
}

/** Test seam. Never called by shipped code. */
export function _setCrashLedgerForTests(list: CrashRecord[] | null): void { cache = list; }
