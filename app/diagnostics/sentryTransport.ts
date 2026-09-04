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
import { OTA_BUILD_ID, DISPLAY_VERSION } from '../buildInfo';

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
  //
  // ⚠⚠⚠ OTA-1515 — THE ARGUMENT IS A LIE, AND THAT LIE IS THE ROOT CAUSE.
  // The type says `(timeout?: number)`, and every call site here has been
  // passing one since OTA-1492. `@sentry/react-native`'s exported flush
  // (dist/js/sdk.js) is declared `export function flush()` — ZERO parameters —
  // and calls `client.flush()` with nothing. See flushWithRealDeadline below
  // for what that costs. The signature stays `(timeout?: number)` because an
  // SDK that DOES honour it must still be handed one; it is simply never
  // trusted on its own.
  flush?: (timeout?: number) => PromiseLike<boolean>;
}

/**
 * ⚠⚠⚠ OTA-1515 — THE ROOT CAUSE, NAMED AT THE LINE, VERIFIED IN TWO DIRECTIONS
 * THAT EXCLUDE EACH OTHER'S ALTERNATIVES.
 *
 * ⚠⚠ DIRECTION ONE — THE SERVER, CONCLUSIVE BY ABSENCE. Widening the org
 * outcome query from 24h to 30 days returned, in full:
 *
 *     accepted / none / error       → 22
 *     accepted / none / attachment  → 1,212,790
 *
 * and NOTHING else. No `rate_limited`, no `filtered`, no `invalid`, no
 * `client_discard`. In thirty days Sentry has never once refused anything from
 * this org, so every server-side theory — quota, spike protection, a cached
 * 429 poisoning the attachment category — is dead. The envelope is not being
 * rejected. It is never arriving.
 *
 * ⚠⚠ DIRECTION TWO — THE DEVICE, AND IT IS READABLE IN THE VENDOR SOURCE.
 * `@sentry/react-native` exports `flush()` with no parameters. It forwards to
 * core's `client.flush(undefined)`, which is:
 *
 *   · `_isClientDoneProcessing(undefined)` — a 1ms setInterval whose only exit
 *     is `_numProcessing === 0`; its timeout branch reads `if (timeout && …)`,
 *     so with undefined it CANNOT time out; and
 *   · `transport.flush(undefined)` → `promisebuffer.drain(undefined)`, whose
 *     own docstring says: "Passing 0 (or not passing anything) will make the
 *     promise wait as long as it takes for the queue to drain."
 *
 * So `await s.flush(10_000)` never had a ten-second deadline. It had NO
 * deadline. When the native `captureEnvelope` call does not settle — a wedged
 * bridge, a stalled socket, a device swapping under a ~425MB model context —
 * the send hangs forever: never true, never false, never thrown, never logged.
 *
 * ⚠⚠ AND THE TWO DIRECTIONS AGREE ON WHAT LOOKED LIKE A CONTRADICTION. Crash
 * records keep arriving (twenty-two of them) because the crash transport is
 * FIRE-AND-FORGET: `installCrashTransport` calls `captureEvent` and never
 * flushes, so nothing waits on the native promise and the native layer
 * delivers whenever it can. Bundles are the ONLY path that ever awaited a
 * flush. That is the real asymmetry — and unlike payload size it survives the
 * owner's controlled experiment, because an unbounded wait does not care how
 * big the thing it is waiting on was. A new character's tiny bundle hangs
 * exactly as readily as a megabyte one.
 *
 * ⚠⚠⚠ SO THE FIX IS TO STOP TRUSTING THE SDK'S DEADLINE AND KEEP OUR OWN.
 * The race below is what *"make sure it can't time out"* actually requires:
 * not a longer wall, but a wall that EXISTS, so a stalled send resolves
 * `false` and gets written down instead of vanishing.
 *
 * ⚠ The losing promise is neither cancellable nor cancelled, and that is a win
 * rather than a leak: the envelope may still go out afterwards, and a late
 * delivery is a delivered log. All the race governs is how long we stand there
 * before recording what happened.
 */
/**
 * ⚠⚠⚠ OTA-1516 — AND WHY IT SAID NO, WHICH THE 01:02 LOG PROVED WE STILL COULD
 * NOT SEE. The first chunked send reported, in full:
 *
 *     send-log: #mtatj02qozh5 — 0/7 parts out (404814 chars, median 33ms, worst 34ms)
 *
 * Read that carefully, because it eliminates almost everything at once. All
 * SEVEN parts were ATTEMPTED — a refusal would have printed NOT ATTEMPTED with
 * its reason. None of them THREW — the clause is absent. And every one came
 * back in THIRTY-THREE MILLISECONDS. No network round trip completes in 33ms
 * from a phone, so nothing was waiting on a server: `flush()` returned `false`
 * locally and immediately, before a byte left the device. Payload size, memory
 * pressure and the missing deadline are all dead as explanations — a 33ms
 * `false` is the SDK refusing on the spot.
 *
 * ⚠⚠ SO THE ONLY THING LEFT TO LEARN IS WHAT IT REFUSED WITH, AND THE CODE
 * ABOVE WAS THROWING THAT AWAY. `ok !== false` flattened three very different
 * outcomes into one boolean: a flush that RESOLVED false (the SDK's own
 * `getClient()`-missing path, which returns false without touching the
 * network), a flush that REJECTED (the promise buffer rejects when a queued
 * send fails, and RN's flush catches that and answers false), and our own
 * deadline firing. Those need completely different fixes, and 33ms cannot tell
 * them apart on its own. `flushNote` records which one happened, and the
 * rejection's message with it.
 *
 * ⚠ Kept deliberately cheap: one string, only on the failure path, and it
 * rides the line that already prints. The next send names the cause itself
 * instead of costing another round of guessing.
 */
let lastFlushNote: string | null = null;

async function flushWithRealDeadline(s: SentryLike, ms: number): Promise<boolean> {
  lastFlushNote = null;
  if (typeof s.flush !== 'function') return true; // old SDK: queue-and-hope, unchanged
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(s.flush(ms)).then(
        (ok) => {
          // ⚠ A resolved `false` is the SDK declining, NOT a timeout. Say so.
          if (ok === false) lastFlushNote = 'flush() resolved false without sending';
          return ok !== false;
        },
        (err) => {
          // ⚠ A REJECTION carries the real fault — the queued send's own error.
          lastFlushNote = `flush() rejected: ${err instanceof Error ? err.message : String(err)}`;
          return false;
        },
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => { lastFlushNote = `no answer within ${ms}ms`; resolve(false); }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
      // ⚠⚠⚠ OTA-1567 — THIS FIELD HAS NEVER ONCE CARRIED A REAL VALUE, across
      // all 32 native-death receipts on file, in either of its two eras:
      //
      //   builds ≤1503 — `ts` was the ACTION'S START, so `ts - phaseAt` came out
      //     NEGATIVE whenever a phase stamped after the action began. Ten
      //     receipts, down to −2,639,101ms. An age cannot be negative.
      //   builds ≥1504 — OTA-1504 correctly redated the record to the last sign
      //     of life, which made `ts` BE `phaseAt`, so the subtraction became
      //     `phaseAt − phaseAt`. Twenty-two receipts, every one exactly 0.
      //
      // The record was fixed and its reader was not, which is the quietest way
      // an instrument can fail: it never threw, it just answered the same number
      // forever. It is now computed from the two timestamps that are genuinely
      // different — the last sign of life and the last real CHECKPOINT — so it
      // finally means what its name says: how long the app went on living after
      // its last checkpoint. Near zero indicts that checkpoint; large exonerates
      // it, which is the question OTA-1356 built this instrument to answer.
      lastPhaseAgeMs: bc?.phaseAt && bc?.aliveAt ? Math.max(0, bc.aliveAt - bc.phaseAt) : undefined,
      // ⚠⚠ AND THE NUMBER bootSlice ALREADY COMPUTES AND THROWS AWAY. It works
      // out how long the action had been standing at the last sign of life, uses
      // that to decide whether to call the label stale — and then spends it on a
      // prose sentence, where nothing can group, sort or alert on it.
      actionAgeMs: bc?.aliveAt && bc?.at ? Math.max(0, bc.aliveAt - bc.at) : undefined,
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
      // ⚠⚠⚠ OTA-1592 — THE EVENTS FINALLY SAY WHICH BUILD SENT THEM. All 356
      // delivered events carried `release: null · dist: null`, so the repo link
      // the owner added to the Sentry project could do nothing: suspect commits,
      // release grouping and regression detection all key on `release`, and the
      // only identity our events carried was a `build` TAG a human has to read.
      // Sentry auto-creates the release record from the first event that names
      // one, so the client half alone lights up grouping; wiring set-commits in
      // CI (the other half of #109) can follow without touching this again.
      // ⚠ The OTA stamp IS the release: JS behaviour changes per OTA, not per
      // store binary, and every forensic session in this repo is keyed by it.
      release: `tartaria@${DISPLAY_VERSION}+${OTA_BUILD_ID}`,
      dist: OTA_BUILD_ID,
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
// ⚠⚠ THE GATE, AND IT IS NOT OPTIONAL:
//   · `reportingEnabled()` — the privacy policy says that with the crash-
//     reports switch off "the app never contacts Sentry at all, not even to
//     check in." This send is contacting Sentry; the switch governs it too.
//     Enforced at the top of sendGameLogInline, which refuses with "crash
//     reporting is switched off on this device" rather than failing silently.
//
// ⚠⚠⚠ OTA-1661 — THE SECOND GATE IS GONE, DELIBERATELY. Owner: *"anyone
// testing should be able to push a log."* This used to say the calling BUTTON
// renders only for the owner's unlock names, because the policy promised
// players that only crash records leave their device. That was true of the
// policy, and it meant every tester outside a two-name allowlist had to email a
// clipboard paste instead — which is exactly what both his daughters did.
//
// So the POLICY moved rather than the promise being quietly bent: docs/PRIVACY.md
// now carries a section describing this send — what it contains, that it happens
// only on a deliberate confirmed tap, and that the crash switch governs it. The
// button is armed by one tap and sent by a second, naming the contents in
// between, because consent is the entire basis on which it is open to strangers.
//
// ⚠ WHAT STAYED SHUT: the OTA-1505 auto-bundle in autoBundle.ts, which pushes
// this same payload with NO TAP. "Able to push a log" is about the ability to
// push, not about collecting from people who never chose to send anything.
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

/**
 * ⚠⚠⚠ OTA-1519 — RETIRED. DO NOT CALL THIS FROM A PRODUCTION PATH.
 *
 * Attachments are PROVEN not to leave this app. The owner's two devices each
 * ran the A/B inside a single boot, seconds apart, same process and same SDK:
 *
 *   hal   (APK 293)  02:01:31 attachments → flush false   02:01:35 inline → flush YES, 27/27
 *   golem (APK 299)  02:02:02 attachments → flush false   02:02:07 inline → flush YES, 22/22
 *
 * Nothing carrying an attachment has reached Sentry since 2026-08-25; the very
 * first attachment-free send worked on the first try with 405K of log. This
 * function and `sendGameLogChunked` below are kept ONLY because their suites
 * document how that was established — every caller now uses sendGameLogInline.
 */
export async function sendDiagnosticsBundle(
  bundle: DiagnosticsBundle,
  // ⚠ OTA-1504 — the durable-send retry stamps each send with its bundle's id
  // and attempt number. The SAME bundle can now arrive more than once (that is
  // the design — see pendingBundle.ts), and the id in the message + tags is
  // what lets the relay reader collapse the copies back into one bundle.
  opts: { bundleId?: string; attempt?: number } = {},
): Promise<boolean> {
  try {
    if (!reportingEnabled()) return false;
    const s = loadSdk();
    if (!s || crashReportDsn() === null) return false;
    const logTail = bundle.log.length > LOG_ATTACHMENT_MAX_CHARS
      ? bundle.log.slice(-LOG_ATTACHMENT_MAX_CHARS)
      : bundle.log;
    s.captureEvent(
      {
        message: `player-log ${OTA_BUILD_ID}${opts.bundleId ? ` #${opts.bundleId}` : ''}`,
        level: 'info',
        tags: {
          kind: 'player-log',
          line: productLine(),
          ...(opts.bundleId
            ? { bundleId: opts.bundleId, sendAttempt: String(opts.attempt ?? 1) }
            : {}),
        },
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
    //
    // ⚠⚠⚠ OTA-1515 — and it goes through OUR deadline, not the SDK's. The bare
    // `await s.flush(10_000)` that stood here was an UNBOUNDED wait: RN's flush
    // takes no arguments. This is the boot-retry path, so it is also where a
    // hang was most invisible — nobody is looking at a screen during a retry.
    return await flushWithRealDeadline(s, 10_000);
  } catch {
    return false; // the button shows FAILED and the clipboard path still exists
  }
}

/**
 * ⚠⚠⚠ OTA-1515 — THE LOG GOES IN PARTS, AND THE AUDIT IS WHY.
 *
 * Owner: *"I want a full audit and I want the root cause found and double
 * verified in 2 directions… right now I am trying to send a full log, and just
 * the game log, not the inventory or save file or anything else. if over 20
 * parts it will be a long send, make sure it can't time out."*
 *
 * ⚠⚠ THE ROOT CAUSE ITSELF IS NOT HERE — it is `flushWithRealDeadline` above,
 * which documents both directions of the audit and the vendor lines that prove
 * them. In one sentence: RN's `flush()` takes no arguments, so the deadline we
 * had been passing since OTA-1492 was discarded and every bundle send was an
 * UNBOUNDED wait. That is fixed at the flush.
 *
 * ⚠⚠ THIS FUNCTION IS THE SECOND HALF, and it answers the owner's own two
 * requirements rather than the fault: *"just the game log, not the inventory or
 * save file or anything else"*, and *"if over 20 parts it will be a long send,
 * make sure it can't time out."* Each part is its own small event with ONE
 * small attachment, sent and flushed on its own:
 *
 *   · the payload is the game log ALONE, which is what he asked to send;
 *   · a part that misses its deadline costs THAT PART, not the send — the loop
 *     keeps going and reports what got through, which is what "make sure it
 *     can't time out" actually requires (a longer wall would only move it);
 *   · twenty parts is a long send and that is FINE, because there is no single
 *     deadline for the whole thing to miss;
 *   · and nothing is ever assembled at megabyte scale, which was a real second
 *     hazard even though it was NOT the fault — the owner disproved size
 *     himself by sending a brand-new character's tiny bundle and watching it
 *     fail identically. Chunking earns its place as insurance, not as the cure.
 *
 * Every part carries the same `bundleId` and its own `part`/`parts` tags, so
 * the relay can reassemble them in order and see immediately if one is missing.
 */
export const LOG_CHUNK_CHARS = 60_000;
/** Per-part flush budget. Generous, because a part is small and a slow network
 *  is not a reason to throw the part away — but bounded, because the loop must
 *  keep moving. A part that misses it is reported, not fatal. */
const PART_FLUSH_MS = 30_000;

export interface ChunkedSendReport {
  /** Parts the SDK accepted AND flushed inside the budget. */
  sent: number;
  /** Parts attempted in total. */
  parts: number;
  /** Total characters of log actually handed to the transport. */
  chars: number;
  /** Per-part ms, so a 25ms failure and a 30s one stop reading alike. */
  timings: number[];
  /** First part that threw, with its message — the on-device fault, named. */
  threwAt: string | null;
  /**
   * ⚠⚠⚠ OTA-1516 — WHY FLUSH SAID NO, when it said no. The 01:02 send reported
   * "0/7 parts out … median 33ms" — every part attempted, none thrown, all
   * refused in 33ms. That is a LOCAL refusal, and until now the three ways it
   * can happen (resolved-false, rejected, our deadline) all read identically.
   * This carries the first one seen, verbatim.
   */
  flushNote: string | null;
  /**
   * ⚠⚠⚠ WHY NOTHING WAS EVEN ATTEMPTED, when that is the answer.
   *
   * This field exists because its absence cost weeks. Every early return in
   * the old `sendDiagnosticsBundle` — reporting switched off, no native SDK in
   * this build, no DSN configured — produced the SAME flat `false` that a
   * genuine transport failure produced, and the button rendered all of them as
   * one message. A 25ms refusal and a stalled native call were indistinguishable
   * from the outside, so every diagnosis had to guess which one it was looking
   * at. Now the report says so in words, and the log line carries it.
   *
   * `null` means the loop actually ran.
   */
  stopped: string | null;
  bundleId: string;
}

/**
 * Send the GAME LOG ONLY, in parts. No save, no inventory, no device summary —
 * the owner asked for exactly this payload, and it is also the payload whose
 * size was the fault.
 */
/**
 * ⚠⚠⚠ OTA-1519 — RETIRED, same reason as sendDiagnosticsBundle above: the
 * attachment never leaves the device. Chunking made the envelopes small, which
 * was worth doing and was not the fault. Kept for its suite's record only.
 */
export async function sendGameLogChunked(
  fullLog: string,
  bundleId: string,
  // ⚠⚠ OTA-1516 — KEEP OTA-1504'S ATTEMPT STAMP. The same bundle can arrive more
  // than once by design (that is what the durable retry IS), and `sendAttempt`
  // is how the relay reader tells a first send from a boot re-send rather than
  // guessing from timestamps. Chunking changed the payload, not that contract.
  attempt?: number,
): Promise<ChunkedSendReport> {
  const report: ChunkedSendReport = {
    sent: 0, parts: 0, chars: 0, timings: [], threwAt: null, flushNote: null, stopped: null, bundleId,
  };
  // ⚠ Each refusal names ITSELF. See `stopped` above for why three different
  // causes sharing one silent `false` is the bug that hid the real one.
  if (!reportingEnabled()) {
    report.stopped = 'crash reporting is switched off on this device';
    return report;
  }
  const s = loadSdk();
  if (!s) {
    report.stopped = 'this build has no Sentry native module';
    return report;
  }
  if (crashReportDsn() === null) {
    report.stopped = 'no DSN is configured in this build';
    return report;
  }

  // ⚠ The WHOLE log, not a tail. Chunking is what makes that affordable — the
  // 800K tail cap existed because one envelope had to hold everything.
  const text = String(fullLog ?? '');
  const total = Math.max(1, Math.ceil(text.length / LOG_CHUNK_CHARS));
  report.parts = total;

  for (let i = 0; i < total; i++) {
    const slice = text.slice(i * LOG_CHUNK_CHARS, (i + 1) * LOG_CHUNK_CHARS);
    const partNo = i + 1;
    const startedAt = Date.now();
    try {
      s.captureEvent(
        {
          message: `player-log ${OTA_BUILD_ID} #${bundleId} [part ${partNo}/${total}]`,
          level: 'info',
          tags: {
            kind: 'player-log',
            line: productLine(),
            bundleId,
            part: String(partNo),
            parts: String(total),
            ...(attempt ? { sendAttempt: String(attempt) } : {}),
          },
        },
        {
          attachments: [{
            filename: `game-log.part${String(partNo).padStart(3, '0')}-of-${total}.txt`,
            data: slice,
            contentType: 'text/plain',
          }],
        },
      );
      // ⚠⚠⚠ OUR deadline, not the SDK's — flushWithRealDeadline explains why
      // `s.flush(PART_FLUSH_MS)` on its own is an unbounded wait, and why an
      // unbounded wait is the whole reason no log has arrived since 2026-08-25.
      const ok = await flushWithRealDeadline(s, PART_FLUSH_MS);
      report.timings.push(Date.now() - startedAt);
      // ⚠ OTA-1516 — keep the FIRST refusal's reason; later parts fail the same
      // way and repeating it would bury the line that matters.
      if (!ok && report.flushNote === null) report.flushNote = lastFlushNote;
      if (ok) report.sent += 1;
      report.chars += slice.length;
    } catch (err) {
      // ⚠ ONE PART'S FAILURE IS NOT THE SEND'S FAILURE. Record where it broke
      // and keep going — a log missing part 7 is still nineteen parts of
      // evidence, and the gap itself is a clue.
      report.timings.push(Date.now() - startedAt);
      if (report.threwAt === null) {
        report.threwAt = `part ${partNo}/${total}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }
  return report;
}

/** One line for the device log — the whole outcome, readable at a glance. */
export function describeChunkedSend(r: ChunkedSendReport): string {
  const worst = r.timings.length ? Math.max(...r.timings) : 0;
  const median = r.timings.length
    ? [...r.timings].sort((a, b) => a - b)[Math.floor(r.timings.length / 2)]
    : 0;
  // ⚠ A refusal is reported as a refusal, never as "0 parts out" — those two
  // read alike and mean completely different things to whoever reads this next.
  if (r.stopped) return `send-log: #${r.bundleId} — NOT ATTEMPTED: ${r.stopped}`;
  return `send-log: #${r.bundleId} — ${r.sent}/${r.parts} parts out (${r.chars} chars, `
    + `median ${median}ms, worst ${worst}ms)${r.threwAt ? ` — THREW at ${r.threwAt}` : ''}`
    // ⚠ OTA-1516 — the refusal's own words. "0/7 out in 33ms" was true and
    // useless; "0/7 out … WHY: flush() rejected: <message>" is a diagnosis.
    + `${r.flushNote ? ` — WHY: ${r.flushNote}` : ''}`;
}

/** Tests only. */
export function _resetSentryTransportForTests(): void {
  sdk = null;
  attempted = false;
}

/**
 * ⚠⚠⚠ OTA-1518 — THE BEACON AND THE INLINE LOG: ONE TAP THAT ANSWERS EITHER WAY.
 *
 * ⚠⚠ WHAT TWO NIGHTS OF EVIDENCE NARROWED IT TO, AND NOTHING FURTHER. The table
 * the owner's two devices built, hal (APK 293) and golem (APK 299):
 *
 *                    attachment?   flushed?   arrives?
 *   crash record         no         NEVER      YES — four since Aug 26
 *   log part            YES          yes        no
 *   old bundle          YES          yes        no
 *
 * Every send carrying an ATTACHMENT has failed for two days; every send without
 * one has landed. And the failure is identical across two different APKs, two
 * app ids and payloads from 314K to 405K — so "the native module is missing
 * from build 293" and "the payload is too big" are both dead. `flush()` answers
 * `false` in 33-47ms, and the relay confirms it is telling the truth: zero
 * `game-log.part*` files ever reached Sentry.
 *
 * ⚠⚠⚠ SO STOP THEORISING AND MEASURE. Two wrong root causes have already cost
 * the owner a send apiece — payload size (his own new-character test disproved
 * it) and the discarded flush deadline (real, fixed, and not the cause). The
 * remaining discriminator is the ATTACHMENT, and it is one experiment away from
 * proven or eliminated. This function IS that experiment, and it is designed so
 * a single tap settles it whichever way it falls:
 *
 *   · a BEACON goes first — one tiny event, NO attachment, nothing else new.
 *     If the beacon lands and the parts do not, attachments are the fault,
 *     conclusively, and the answer is in the relay within the hour.
 *     If the beacon does NOT land either, attachments are EXONERATED and the
 *     fault is in the flush/transport path — which is equally worth knowing,
 *     because it is the last candidate standing.
 *   · then the game log itself, INLINE — each part's text rides in the event
 *     body, still with no attachment anywhere. So if attachments are the
 *     fault, this send does not merely diagnose it, it DELIVERS THE LOG.
 *
 * ⚠⚠ AND IT DOES NOT GATE ON flush(). OTA-1492 made "sent" mean "flush() said
 * the queue drained". That premise has now been caught lying in BOTH
 * directions: `true` while nothing arrived (the reason OTA-1504's durable retry
 * exists) and `false` on this build for two days straight. Meanwhile the ONE
 * path that never flushes — the crash transport — is the one path that works.
 * So a part counts as OUT when `captureEvent` accepted it without throwing, and
 * the flush answer is recorded as ADVICE beside it. That is not optimism: it is
 * refusing to trust a narrator that has been wrong both ways, and the relay
 * remains the only thing that decides what actually arrived.
 *
 * ⚠ CHUNK SIZE. Inline text is normalised into the event body, so the parts are
 * far smaller than the attachment chunks — 15K keeps every event comfortably
 * inside Sentry's payload budget with room for the tags and message.
 */
export const INLINE_CHUNK_CHARS = 15_000;

/**
 * ⚠⚠⚠ OTA-1520 — THE SCRUBBER TAKES A WHOLE VALUE, SO STOP HANDING IT WHOLE
 * PARTS. OTA-1519 delivered 49 inline parts and Sentry replaced NINE of them
 * with the literal string `[Filtered]` — 135,000 characters of the owner's game
 * log, gone, with no hint in the app that anything was missing.
 *
 * ⚠⚠ AND SENTRY NAMED THE RULE ITSELF. Every one of the nine events carries the
 * reason in `_meta`, which the relay had been syncing all along without reading:
 *
 *   "context": { "chunk": { "": { "len": 15000, "rem": [["@password:filter", "s", 0, 10]],
 *     "chunks": [{ "type": "redaction", "text": "[Filtered]", "rule_id": "@password:filter" }] } } }
 *
 * `@password:filter` is one of Sentry's DEFAULT scrubbing rules. Its pattern is
 *
 *   (?i)(password|secret|passwd|api[-_]key|apikey|auth|credentials|mysql_pwd
 *        |privatekey|private[-_]key|token[^\s]*[:=]|^otp$|^two[-_]factor$)
 *
 * and two properties of it are what did the damage:
 *   · it is a KeyValue pattern, so it is tested against the VALUE, not only the
 *     field name — `chunk` is an innocent key and was never the trigger;
 *   · it has NO WORD BOUNDARIES, so it fires on `secret` inside "the secret
 *     door" and on `auth` inside "authored by".
 * When it matches, the redaction is `replace_value` — the ENTIRE string goes.
 *
 * ⚠⚠ DOUBLE-VERIFIED BEFORE A LINE WAS CHANGED, because three wrong root causes
 * have already cost the owner a send apiece:
 *   · forwards — the 588,818 characters that SURVIVED contain exactly ZERO
 *     matches of that pattern. Perfect discrimination across 40 parts.
 *   · backwards — the game's own prose is full of substrings that trip it:
 *     `authored` ×246, `secrets` ×40, `secret` ×35, `authority`, `authoritative`,
 *     `secretive`. A fantasy RPG log cannot avoid the word "secret".
 *
 * ⚠⚠⚠ SO THE DEFECT IS OURS, NOT SENTRY'S: we handed an all-or-nothing redactor
 * a 15,000-character document as ONE scalar. That is the error class — any
 * redactor that replaces whole values will destroy everything it is given in one
 * piece, and it destroys the evidence of its own trigger along with it. The fix
 * is not to dodge the scrubber; it is to stop giving it 15,000 characters to
 * take. The slice now rides as an ARRAY of small blocks, each scrubbed on its
 * own merits: one "secret" costs the ~400 characters around it instead of a
 * whole part, and the surviving neighbours name the trigger for the first time.
 *
 * ⚠ 400 IS CHOSEN, NOT ROUNDED. Blocks end on a line boundary where one falls in
 * the back half of the window, so a redaction eats whole log lines rather than
 * halves of two. That puts the block floor at 201 and the ceiling at 400, so a
 * 15,000-char part is at most 75 array elements — small enough that Sentry's
 * event trimming never comes near it, and `chunkChars` lets the relay prove that
 * per part rather than assume it.
 */
export const INLINE_BLOCK_CHARS = 400;

/**
 * Split one part into scrub-sized blocks. `blocks.join('') === slice` exactly —
 * every character, including the newlines, belongs to precisely one block, so
 * reassembly is concatenation and nothing has to be inferred.
 */
export function splitLogIntoBlocks(slice: string, size = INLINE_BLOCK_CHARS): string[] {
  const blocks: string[] = [];
  let i = 0;
  while (i < slice.length) {
    let end = Math.min(i + size, slice.length);
    if (end < slice.length) {
      // Prefer to break just after a newline, but only if that keeps the block
      // in the back half of the window — otherwise a run of long lines would
      // shred into tiny fragments and multiply the element count.
      const nl = slice.lastIndexOf('\n', end - 1);
      if (nl >= i + Math.floor(size / 2)) end = nl + 1;
    }
    blocks.push(slice.slice(i, end));
    i = end;
  }
  return blocks;
}

export interface InlineSendReport extends ChunkedSendReport {
  /** Did the no-attachment beacon leave without throwing? The experiment. */
  beaconOut: boolean;
  /**
   * ⚠⚠⚠ OTA-1519 — flush() IS AN HONEST NARRATOR, AND I OWED IT AN APOLOGY.
   * OTA-1518 was built on the premise that it had lied in both directions and
   * therefore could not gate delivery. The owner's two devices disproved that
   * in a single boot each, four and five seconds apart:
   *
   *   hal   02:01:31 auto-push (ATTACHMENTS) → flush false   02:01:35 inline → flush YES, 27/27
   *   golem 02:02:02 auto-push (ATTACHMENTS) → flush false   02:02:07 inline → flush YES, 22/22
   *
   * Same process, same SDK, same second; the only variable was the attachment.
   * flush() said `false` because nothing was leaving and `yes` the instant
   * something did — it tracked reality exactly. So it goes back to being the
   * signal it was designed to be.
   */
  flushSaid: 'yes' | 'no' | 'no-flush';
  /**
   * ⚠⚠ THE HONEST VERDICT: every part accepted AND the flush confirmed it.
   * `sent` alone only ever meant "the SDK took it" — which, on the attachment
   * path, was true for two days while nothing arrived. Call sites gate on THIS.
   */
  delivered: boolean;
}

export async function sendGameLogInline(
  fullLog: string,
  bundleId: string,
  attempt?: number,
): Promise<InlineSendReport> {
  const report: InlineSendReport = {
    sent: 0, parts: 0, chars: 0, timings: [], threwAt: null, flushNote: null,
    stopped: null, bundleId, beaconOut: false, flushSaid: 'no-flush', delivered: false,
  };
  if (!reportingEnabled()) {
    report.stopped = 'crash reporting is switched off on this device';
    return report;
  }
  const s = loadSdk();
  if (!s) {
    report.stopped = 'this build has no Sentry native module';
    return report;
  }
  if (crashReportDsn() === null) {
    report.stopped = 'no DSN is configured in this build';
    return report;
  }

  const text = String(fullLog ?? '');
  const total = Math.max(1, Math.ceil(text.length / INLINE_CHUNK_CHARS));
  report.parts = total;

  // ⚠⚠⚠ THE BEACON. Deliberately the smallest thing this app can send, and
  // shaped EXACTLY like a crash record — one event, no hint, no attachment —
  // because crash records are the thing that still works. If this lands and the
  // parts do not, the attachment is the fault and nothing else is.
  try {
    s.captureEvent({
      message: `player-log-beacon ${OTA_BUILD_ID} #${bundleId}`,
      level: 'info',
      tags: {
        kind: 'player-log-beacon',
        line: productLine(),
        bundleId,
        parts: String(total),
        ...(attempt ? { sendAttempt: String(attempt) } : {}),
      },
    });
    report.beaconOut = true;
  } catch (err) {
    report.threwAt = `beacon: ${err instanceof Error ? err.message : String(err)}`;
  }

  for (let i = 0; i < total; i++) {
    const slice = text.slice(i * INLINE_CHUNK_CHARS, (i + 1) * INLINE_CHUNK_CHARS);
    const partNo = i + 1;
    const startedAt = Date.now();
    try {
      // ⚠ NO HINT, NO ATTACHMENTS — the whole point. The slice rides in `extra`.
      s.captureEvent({
        message: `player-log ${OTA_BUILD_ID} #${bundleId} [inline ${partNo}/${total}]`,
        level: 'info',
        tags: {
          kind: 'player-log-inline',
          line: productLine(),
          bundleId,
          part: String(partNo),
          parts: String(total),
          ...(attempt ? { sendAttempt: String(attempt) } : {}),
        },
        // ⚠⚠⚠ OTA-1520 — BLOCKS, NOT ONE SCALAR. `@password:filter` replaces a
      // whole value, so the value it is offered has to be small. `chunkChars`
      // stays as the honest total: the relay compares it against what it
      // reassembles and can therefore say EXACTLY how much a redaction cost,
      // instead of silently stitching a hole the way part 1 did on 08-27.
      extra: { chunkBlocks: splitLogIntoBlocks(slice), chunkChars: slice.length },
      });
      // ⚠⚠ ACCEPTED, NOT FLUSHED. See the header: flush() has lied both ways,
      // and the path that never flushes is the path that works.
      report.sent += 1;
      report.chars += slice.length;
      report.timings.push(Date.now() - startedAt);
    } catch (err) {
      report.timings.push(Date.now() - startedAt);
      if (report.threwAt === null) {
        report.threwAt = `inline part ${partNo}/${total}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  // ⚠ ONE flush at the END, for its OPINION only — it cannot fail the send any
  // more, but what it says is still evidence and goes in the line.
  try {
    const ok = await flushWithRealDeadline(s, PART_FLUSH_MS);
    report.flushSaid = ok ? 'yes' : 'no';
    if (!ok) report.flushNote = lastFlushNote;
  } catch {
    report.flushSaid = 'no';
  }
  // ⚠⚠⚠ OTA-1519 — ONE flush at the end, and it DECIDES. Not per part: 27
  // round trips would be 27 chances to stall for no extra truth, and the parts
  // share one queue anyway. Accepted-by-the-SDK is necessary; flushed is what
  // makes it sufficient. An SDK too old to offer flush keeps the old
  // queue-and-hope answer rather than being called a failure.
  report.delivered = report.sent === report.parts
    && report.parts > 0
    && report.flushSaid !== 'no';
  return report;
}

/** One line for the device log — the experiment's result, readable at a glance. */
export function describeInlineSend(r: InlineSendReport): string {
  if (r.stopped) return `send-log: #${r.bundleId} — NOT ATTEMPTED: ${r.stopped}`;
  return `send-log: #${r.bundleId} — ${r.delivered ? 'DELIVERED' : 'NOT DELIVERED'} `
    + `(inline, no attachments): beacon ${r.beaconOut ? 'out' : 'FAILED'}, `
    + `${r.sent}/${r.parts} parts accepted (${r.chars} chars) — flush said ${r.flushSaid}`
    + `${r.flushNote ? ` (${r.flushNote})` : ''}${r.threwAt ? ` — THREW at ${r.threwAt}` : ''}`;
}
