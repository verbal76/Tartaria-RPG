// ⚠⚠⚠ OTA-1587 — WHICH LIFE DIED. AN INSTRUMENT, NOT A FIX.
//
// Owner: *"add the telemetry."*
//
// ⚠⚠ THE MEASUREMENT THAT MADE THIS NECESSARY. Ten `native-death` records in
// the crash ledger, and SIX OF THE LAST SEVEN land on an OTA apply — one each
// for OTA-1571, 1578, 1580, 1581, 1582. Every one of them reads the same:
//
//     PROCESS KILLED — no JS ran · stage native:cognition:done
//     last checkpoint: native:cognition:done [q0] · 3xx-5xxms into the action
//                      · alive 0ms after it
//
// and the same session's final report reads
//
//     Model contexts — Live now: 1 · Opened: 1 · Released: 0 · Peak live: 1
//
// Task #77 closed this class as memory pressure from two model installs. That
// RCA is not obviously wrong, but it measured a DIFFERENT FREQUENCY: this now
// fires on essentially every update-and-restart, which a standing condition of
// the device does not explain and an update-and-restart might.
//
// ⚠⚠⚠ AND THE LEDGER STRUCTURALLY CANNOT ANSWER THE ONE QUESTION THAT DECIDES
// IT. A breadcrumb has no process identity. So when boot finds a survivor,
// nothing on it says whether the process that wrote it was
//
//   (a) the OLD process, dying during the teardown that precedes reloadAsync
//       — in which case the kill is ours and the fix is in the teardown, or
//   (b) the NEW process, dying seconds into the boot that reloadAsync started
//       — in which case the suspect is what the OLD life left behind in a
//       native process that reloadAsync does NOT restart.
//
// Those two have opposite fixes and the record reads identically for both. The
// candidate for (b) is stated plainly so the next log can kill it or confirm it:
// `Updates.reloadAsync()` swaps the JS bundle inside the SAME native process, so
// a llama.rn context the old JS never released is still resident when the new JS
// boots and opens its own ~425MB one. `Released: 0` is consistent with that and
// is not evidence for it — the counters reset with the JS, so a post-reload
// session reporting `Opened: 1 · Released: 0` is also just a session that has
// not shut down yet. THAT AMBIGUITY IS THE DEFECT THIS FILE REMOVES.
//
// ⚠⚠ SO: A PROCESS GETS A NAME, AND THE RELOAD LEAVES A NOTE.
//
//   • `BOOT_ID` / `BOOT_AT` — a nonce and a timestamp minted at module load, i.e.
//     once per NATIVE PROCESS-or-JS-life. Stamped onto every breadcrumb, so a
//     surviving crumb finally says which life wrote it and, subtracting, HOW OLD
//     THAT LIFE WAS WHEN IT DIED. A death 1.4s into a life is a boot-time OOM; a
//     death forty minutes in is not; today both print the same line.
//   • The OTA handoff — written by `markOrderlyExitForReload` immediately before
//     `reloadAsync`, carrying the dying life's id and its CONTEXT LEDGER. The
//     next boot reads it and can say, for the first time, what the previous life
//     handed over: `opened=1 released=0` at the moment of the reload is the
//     orphaned-context hypothesis with a number under it.
//
// ⚠ NOTHING HERE CHANGES BEHAVIOUR, and that is deliberate — the owner's own
// rule, recorded in contextLedger.ts and violated once already at a cost of a
// day: **measure the cause, or ship an instrument.** OTA-1172 wrote it down;
// OTA-1173 overrode it with a well-argued paragraph and created the loop it was
// trying to prevent. The paragraph above is exactly as well argued and is
// likewise not a number yet, so it ships as a question the next device log
// answers, not as a fix.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OTA_BUILD_ID, DISPLAY_VERSION } from '../buildInfo';

/** ⚠ Minted at MODULE LOAD, which in React Native is once per JS life — a cold
 *  start and a `reloadAsync` each get a fresh one, which is precisely the
 *  boundary the ledger could not see. Short by design: it rides on every
 *  breadcrumb write, and that write is the one thing that must stay small enough
 *  to outrun a wedged JS thread. */
export const BOOT_ID: string = `b${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
  .toString(36).padStart(2, '0')}`;

/** When this life began. `lastAlive - BOOT_AT` on a surviving crumb is the age of
 *  the process that died, the single number the whole file exists to produce. */
export const BOOT_AT: number = Date.now();

export function bootAgeMs(now: number = Date.now()): number {
  return Math.max(0, now - BOOT_AT);
}

export const OTA_HANDOFF_KEY = '@tartaria/otaHandoff';

/** How long after a handoff a boot is still credibly THAT reload's boot. A
 *  reloadAsync boot follows within a second or two; the window is generous
 *  because a slow device applying a large bundle is the case we must not
 *  mis-file, and a handoff older than this is reported as stale rather than
 *  silently attributed to a boot it had nothing to do with. */
export const HANDOFF_FRESH_MS = 5 * 60_000;

export interface HandoffContexts {
  opened: number;
  released: number;
  live: number;
  peakLive: number;
  disposeFoundNothing: number;
  stragglersTornDown: number;
}

export interface OtaHandoff {
  /** The id of the life that called `reloadAsync`. Never equal to `BOOT_ID` in
   *  the process that reads it — if it ever is, the read happened in the wrong
   *  life and the instrument is lying. */
  bootId: string;
  /** When that life started, so its total age at the reload is derivable. */
  bootAt: number;
  /** When the reload was requested. */
  at: number;
  build: string;
  version: string;
  /** ⚠⚠ THE PAYLOAD. What the model ledger read at the moment of the reload. A
   *  `live` above zero here means the old JS handed a native context to a
   *  process that is about to boot a new JS and open another one. */
  ctx: HandoffContexts;
  /** Which of the two reload sites wrote it — the boot-front auto-apply (no
   *  native modules up yet, so `live` should be 0) or the mid-session apply
   *  (teardown ran first, so `live` should be 0 THERE TOO, and a non-zero value
   *  means the teardown did not do what it says). */
  path: 'boot-front' | 'mid-session';
}

/** Read the ledger without importing it. ⚠ Lazy on purpose: this module is
 *  imported by `saveSystem`, which is imported by nearly everything, and the
 *  model ledger has no business in that graph. A `require` is resolved at call
 *  time by Metro and cached, so the cost is one property lookup per crumb. */
function readContexts(): HandoffContexts {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('../ai/generation/contextLedger') as typeof import('../ai/generation/contextLedger');
    return m.contextLedger();
  } catch {
    return { opened: 0, released: 0, live: 0, peakLive: 0, disposeFoundNothing: 0, stragglersTornDown: 0 };
  }
}

/** ⚠ The compact form that rides on a breadcrumb. Every crumb write must stay a
 *  single small key — see saveSystem's note on outrunning a wedged JS thread —
 *  so this is five numbers in eighteen characters rather than a nested object. */
export function contextTag(c: HandoffContexts = readContexts()): string {
  return `o${c.opened}/r${c.released}/l${c.live}/p${c.peakLive}/dn${c.disposeFoundNothing}`;
}

/** What rides on every breadcrumb. `bootId` / `bootAt` / `ctx` since OTA-1587;
 *  the launch facts since OTA-1674, and those are the fix for a hole in the
 *  instrument itself — see the note on `afterOta` below. */
export interface BootStamp {
  bootId: string;
  bootAt: number;
  ctx: string;
  /** ⚠⚠⚠ OTA-1674 — THE DEAD LIFE'S OWN ANSWER, which the record never carried.
   *
   *  OTA-1587 asked one question of every death: did the process that died
   *  boot on the far side of `reloadAsync`? It stored the answer in the wrong
   *  life. The handoff is consumed on read (see `snapshotHandoff`, and that is
   *  correct — a handoff is a fact about ONE boot), so the life that reads it is
   *  the life that then dies, taking the only copy with it. The NEXT boot finds
   *  no handoff, computes `afterOtaApply: false` about ITSELF, and bootSlice
   *  wrote that onto the dead life's record. Structurally, a death record could
   *  never say "yes". Eight of the owner's last ten kills read "not an OTA-apply
   *  boot", and that was not a finding — it was the only value the field could
   *  take.
   *
   *  So the fact rides the crumb: once `noteLaunchFacts` has run (early in
   *  hydrate, before any stage that matters), every crumb this life writes says
   *  whether THIS life followed an apply. A crumb written before that — the first
   *  few milliseconds — leaves it undefined, which the reader must print as
   *  "died before its launch was resolved", not as a cold start. Those are
   *  different facts, and OTA-1587's own summary already refuses to conflate
   *  them ("not resolved yet" vs "cold start"). */
  afterOta?: boolean;
  otaPath?: OtaHandoff['path'];
  /** Handoff → that life's boot, ms. Small means the death sat inside the
   *  reload window. */
  otaGapMs?: number;
  /** The life BEFORE the dead one, at the reload — the orphaned-context tag. */
  prevCtx?: string;
}

/** The fields every breadcrumb carries so a survivor can name its own life.
 *  ⚠ Never throws — a breadcrumb that can fail is worse than a breadcrumb that
 *  is vague, because the whole point of the crumb is to survive a bad moment.
 *  ⚠ The launch fields are added ONLY once the launch has resolved; an unset
 *  `afterOta` is a fact ("not yet known") and must not be forged as `false`. */
export function bootStampFields(): BootStamp {
  try {
    const base: BootStamp = { bootId: BOOT_ID, bootAt: BOOT_AT, ctx: contextTag() };
    const f = _facts;
    if (!f) return base;
    return {
      ...base,
      afterOta: f.afterOtaApply,
      ...(f.path ? { otaPath: f.path } : {}),
      ...(f.otaGapMs != null ? { otaGapMs: f.otaGapMs } : {}),
      ...(f.prevCtx ? { prevCtx: f.prevCtx } : {}),
    };
  } catch {
    return { bootId: BOOT_ID, bootAt: BOOT_AT, ctx: '' };
  }
}

/**
 * ⚠⚠ CALLED IMMEDIATELY BEFORE `reloadAsync`, from the one place that already
 * marks the orderly exit. Awaited by the caller so the key is on disk before the
 * process is torn down — a note written after the restart begins is a note that
 * does not exist.
 */
export async function noteOtaHandoff(path: OtaHandoff['path']): Promise<void> {
  try {
    const rec: OtaHandoff = {
      bootId: BOOT_ID,
      bootAt: BOOT_AT,
      at: Date.now(),
      build: OTA_BUILD_ID,
      version: DISPLAY_VERSION,
      ctx: readContexts(),
      path,
    };
    await AsyncStorage.setItem(OTA_HANDOFF_KEY, JSON.stringify(rec));
  } catch {
    // ⚠ NEVER BLOCK THE RESTART. A missing note costs one unexplained boot; a
    // hung restart costs the player their session. Same trade as OTA-1521.
  }
}

// ⚠⚠⚠ THE SNAPSHOT DISCIPLINE, TAKEN STRAIGHT FROM OTA-1526. That OTA's whole
// finding was that boot read a key the FRESH process was already writing, so 20
// of 22 death records described this session's own handwriting. The same trap is
// open here in the other direction: the handoff describes exactly ONE transition,
// and if it is left on disk it will be read again by the next boot, and the boot
// after that, each of them reporting an OTA apply that happened days ago.
//
// So it is snapshotted at module load, handed out ONCE, and REMOVED. A boot that
// gets `null` genuinely did not follow a reload.
let _handoffSnapshot: Promise<OtaHandoff | null> | null = snapshotHandoff();

function snapshotHandoff(): Promise<OtaHandoff | null> {
  // ⚠ Issued on a microtask, not in the module body: the binding is initialised
  // at load (which is what puts it ahead of every writer) but the storage call
  // lands after the module graph has finished evaluating, so an import-order
  // accident cannot cost the snapshot. Same reasoning as snapshotSurvivor.
  return Promise.resolve()
    .then(() => AsyncStorage.getItem(OTA_HANDOFF_KEY))
    .then(async (raw) => {
      const parsed = parseHandoff(raw);
      // ⚠ Consumed on read. A handoff is a fact about ONE boot.
      if (parsed) { try { await AsyncStorage.removeItem(OTA_HANDOFF_KEY); } catch { /* ignore */ } }
      return parsed;
    })
    .catch(() => null);
}

function parseHandoff(raw: string | null): OtaHandoff | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as OtaHandoff;
    return typeof p?.bootId === 'string' && typeof p?.at === 'number' && p.ctx ? p : null;
  } catch { return null; }
}

/** The note the previous life left, or null. Handed out once per process. */
export async function readOtaHandoff(): Promise<OtaHandoff | null> {
  const pending = _handoffSnapshot;
  _handoffSnapshot = null;
  return pending ? await pending : null;
}

/** Test seam — re-take the snapshot so a suite can stage "the process starts with
 *  THIS on disk" without a second module instance. Mirrors
 *  `_armSurvivorSnapshotForTest`. */
export function _armHandoffSnapshotForTest(): void {
  _handoffSnapshot = snapshotHandoff();
}

export interface LaunchFacts {
  /** True when this boot credibly followed the handoff's reload. */
  afterOtaApply: boolean;
  /** Handoff → this boot, in ms. Undefined when there was no handoff. */
  otaGapMs?: number;
  /** The previous life's ledger, compact. */
  prevCtx?: string;
  /** ⚠ The one that matters: the old life still held a native context when it
   *  asked the OS to reload the JS on top of it. */
  prevHeldContext?: boolean;
  path?: OtaHandoff['path'];
  /** A handoff was found but is too old to belong to this boot. Reported rather
   *  than dropped: a stale handoff means a previous boot never got to consume
   *  it, which is itself the signature of a boot that died young. */
  stale?: boolean;
}

export function launchFacts(h: OtaHandoff | null, now: number = BOOT_AT): LaunchFacts {
  if (!h) return { afterOtaApply: false };
  const gap = Math.max(0, now - h.at);
  const stale = gap > HANDOFF_FRESH_MS;
  return {
    afterOtaApply: !stale,
    otaGapMs: gap,
    prevCtx: contextTag(h.ctx),
    prevHeldContext: h.ctx.live > 0,
    path: h.path,
    stale: stale || undefined,
  };
}

/** One line for the debug log, on every boot. ⚠ A boot that did NOT follow an OTA
 *  says so out loud — the absence of a line is not an answer, and half of reading
 *  these logs is telling "it did not happen" from "nobody looked". */
export function launchLine(f: LaunchFacts): string {
  const head = `boot: life ${BOOT_ID} started ${new Date(BOOT_AT).toISOString()}`;
  if (!f.afterOtaApply) {
    return f.stale
      ? `${head} · a stale OTA handoff was on disk (${Math.round((f.otaGapMs ?? 0) / 1000)}s old, `
        + `prev ctx ${f.prevCtx}) — the boot it belonged to never consumed it`
      : `${head} · not an OTA apply (no handoff on disk)`;
  }
  const held = f.prevHeldContext
    ? ' ⚠⚠ THE PREVIOUS LIFE STILL HELD A NATIVE CONTEXT AT THE RELOAD'
    : ' (previous life released its contexts first)';
  return `${head} · FOLLOWED AN OTA APPLY ${f.otaGapMs}ms ago via ${f.path} `
    + `· prev ctx ${f.prevCtx}${held}`;
}

// ⚠ Held so the About screen and the bug report can print the same facts boot
// resolved, without a second read of a key that has already been consumed. Same
// shape and same reason as runtimePressure's `setLastBootBreadcrumb`.
let _facts: LaunchFacts | null = null;
export function noteLaunchFacts(f: LaunchFacts): void { _facts = f; }
export function _resetLaunchFactsForTest(): void { _facts = null; }

/** ⚠⚠ OTA-1593 — the one-line launch statement, from the cache. `hydrate()`
 *  prints `launchLine` the moment it resolves the handoff — and the owner's
 *  first 1592 log proved that line never reaches anyone: hydrate runs before a
 *  slot is active, so its appendLog lands in the pre-slot buffer the save load
 *  replaces. The SEAM is where the persisted log actually begins (the same
 *  lesson as OTA-1586's trace), so the seam re-emits the line from this cache.
 *  Null before boot has resolved it, so the seam can stay silent rather than
 *  guess. */
export function launchLineCached(): string | null {
  return _facts ? launchLine(_facts) : null;
}

/** The bug-report block. ⚠ An unresolved launch says "not resolved yet" rather
 *  than "cold start" — those are different facts, and a report that guesses at
 *  one of them is worse than a report that admits it does not know. */
export function launchFactsSummary(): string {
  return _facts ? launchSummary(_facts) : 'This launch\n  (not resolved yet)';
}

/** The bug-report block. Reads flat when there is nothing to say. */
export function launchSummary(f: LaunchFacts): string {
  const out: string[] = ['This launch'];
  out.push(`  Life: ${BOOT_ID} · started ${new Date(BOOT_AT).toISOString()}`);
  if (!f.afterOtaApply) {
    out.push(f.stale
      ? `  ⚠ A stale OTA handoff was on disk (${Math.round((f.otaGapMs ?? 0) / 1000)}s old) — `
        + `the boot it belonged to never consumed it, which is what a boot that died young leaves behind`
      : '  Cold start — this boot did not follow an OTA apply');
    return out.join('\n');
  }
  out.push(`  Followed an OTA apply ${f.otaGapMs}ms ago (${f.path})`);
  out.push(f.prevHeldContext
    ? `  ⚠⚠ The previous life still held a native model context when it reloaded (${f.prevCtx}) — `
      + `reloadAsync swaps the JS bundle inside the SAME native process, so this boot's own context is the second one`
    : `  The previous life released its model contexts before reloading (${f.prevCtx})`);
  return out.join('\n');
}
