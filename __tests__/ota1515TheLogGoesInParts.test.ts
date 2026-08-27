// OTA-1515 — THE LOG GOES IN PARTS (the send audit, and its answer).
//
// ⚠⚠⚠ Owner: *"if it didn't pull then I want a full audit and I want the root
// cause found and double verified in 2 directions to ensure it's the full
// issue… right now I am trying to send a full log, and just the game log, not
// the inventory or save file or anything else. if over 20 parts it will be a
// long send, make sure it can't time out."*
//
// ⚠⚠ DIRECTION ONE — THE SERVER, AND IT IS CONCLUSIVE BY ABSENCE. The relay's
// outcome query was widened from 24h to 30d, and the entire thirty-day ledger
// for this org reads:
//     accepted / none / error       → 22
//     accepted / none / attachment  → 1,212,790
// with NO rate_limited, NO filtered, NO invalid, NO client_discard. Sentry has
// never once refused anything. Every server-side theory — quota, spike
// protection, a cached 429 poisoning the attachment category — is dead. The
// envelope is not being rejected; it is never arriving.
//
// ⚠⚠ DIRECTION TWO — THE DEVICE, AND IT IS IN THE VENDOR SOURCE, NOT INFERRED.
// `@sentry/react-native` declares `export function flush()` with ZERO
// parameters and forwards `client.flush()` with nothing; core's promise buffer
// documents what nothing means — "wait as long as it takes to drain" — and
// core's `_isClientDoneProcessing` guards its only exit with `if (timeout && …)`,
// which `undefined` never satisfies. So `await s.flush(10_000)`, standing since
// OTA-1492, was never a ten-second wait. It was an UNBOUNDED one. When the
// native captureEnvelope call does not settle the send hangs forever: never
// true, never false, never thrown, never logged.
//
// ⚠⚠ AND THE TWO DIRECTIONS AGREE ON WHAT LOOKED LIKE A CONTRADICTION. The
// crash transport is fire-and-forget — it captures and never flushes — so
// twenty-two crash records kept arriving while not one bundle did. Bundles are
// the ONLY path that ever awaited a flush. Unlike the payload-size theory this
// one SURVIVES the owner's controlled experiment: he started a fresh character
// ("quiet tartarian giant"), sent a tiny bundle, and it failed exactly like the
// megabyte ones — because an unbounded wait does not care how big the thing it
// is waiting on was. Size is ruled out; the missing deadline is not.

import {
  sendGameLogChunked, describeChunkedSend, LOG_CHUNK_CHARS,
  _resetSentryTransportForTests,
} from '../app/diagnostics/sentryTransport';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const ABOUT = readFileSync(join(ROOT, 'app', 'screens', 'AboutScreen.tsx'), 'utf8');
const RELAY = readFileSync(join(ROOT, '.github', 'workflows', 'sentry-inbox.yml'), 'utf8');

jest.mock('../app/diagnostics/crashReporter', () => ({
  reportingEnabled: () => true,
  crashReportDsn: () => 'https://k@o.ingest.sentry.io/1',
}));

/** A fake SDK that records what it was handed and can be told to misbehave. */
function fakeSdk(opts: { flush?: (ms: number) => Promise<boolean>; throwOnPart?: number } = {}) {
  const events: Array<{ msg: string; tags: Record<string, string>; filename: string; bytes: number }> = [];
  let n = 0;
  return {
    events,
    captureEvent: (ev: { message: string; tags: Record<string, string> }, hint: { attachments: Array<{ filename: string; data: string }> }) => {
      n += 1;
      if (opts.throwOnPart === n) throw new Error('out of memory');
      const a = hint.attachments[0]!;
      events.push({ msg: ev.message, tags: ev.tags, filename: a.filename, bytes: a.data.length });
    },
    flush: opts.flush ?? (async () => true),
  };
}

function install(sdk: unknown) {
  _resetSentryTransportForTests();
  // The transport resolves its SDK through a module the tests can stand in for.
  jest.doMock('@sentry/react-native', () => sdk, { virtual: true });
}

describe('OTA-1515 — the payload is the game log, and nothing else', () => {
  it('⚠⚠⚠ THE OWNER ASKED FOR EXACTLY THIS PAYLOAD — no save, no inventory, no device', () => {
    // The button hands the chunked sender `bundle.log` alone. The bundle is
    // still PERSISTED whole (the boot retry and COPY LOG keep everything);
    // what changed is what crosses the wire.
    // ⚠ OTA-1518 moved the button to the attachment-free INLINE sender. The
    // payload pinned here — the game log ALONE — is what did not change.
    expect(ABOUT).toContain('sendGameLogInline(bundle.log,');
    expect(ABOUT).not.toMatch(/sendDiagnosticsBundle\(bundle/);
    expect(ABOUT).toContain('const pending = await persistPendingBundle(bundle);');
  });

  it('⚠⚠ the misleading button copy is gone — tapping again retries, no restart needed', () => {
    expect(ABOUT).not.toMatch(/WILL RETRY AT BOOT/);
    expect(ABOUT).toMatch(/TAP AGAIN TO RETRY NOW/);
  });
});

describe('OTA-1515 — a long send cannot time out as a whole', () => {
  it('⚠⚠⚠ TWENTY-PLUS PARTS IS FINE: each part is its own event with its own deadline', () => {
    // A log big enough to need >20 parts is exactly the case he named.
    const parts = 23;
    const log = 'x'.repeat(LOG_CHUNK_CHARS * parts);
    expect(Math.ceil(log.length / LOG_CHUNK_CHARS)).toBe(parts);
    // Nothing in the sender waits on a single whole-send deadline.
    const SRC = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
    const fn = SRC.slice(SRC.indexOf('export async function sendGameLogChunked'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    // Per PART, inside the loop — and through OUR deadline, because the SDK
    // discards the one it is handed (see the root-cause block below).
    expect(body).toContain('await flushWithRealDeadline(s, PART_FLUSH_MS)');
    expect(body).toContain('for (let i = 0; i < total; i++)');
  });

  it('⚠⚠ ONE PART FAILING IS NOT THE SEND FAILING — the loop keeps going and reports the gap', () => {
    const SRC = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
    const fn = SRC.slice(SRC.indexOf('export async function sendGameLogChunked'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    // The catch is INSIDE the loop, and it records rather than returning.
    expect(body).toContain('} catch (err) {');
    expect(body).toContain('if (report.threwAt === null)');
    expect(body).not.toMatch(/catch[\s\S]{0,120}return report;/);
  });

  it('⚠ the chunk size keeps every envelope small — that is the whole cure', () => {
    // The fault was megabyte-scale assembly on a memory-pressured phone.
    expect(LOG_CHUNK_CHARS).toBeLessThanOrEqual(100_000);
    expect(LOG_CHUNK_CHARS).toBeGreaterThanOrEqual(10_000);
  });
});

describe('OTA-1515 — THE ROOT CAUSE: the SDK ignores the deadline we hand it', () => {
  // ⚠⚠⚠ THIS IS THE ANSWER TO THE AUDIT, AND IT IS READABLE IN THE VENDOR
  // SOURCE — not inferred, not guessed. `@sentry/react-native` exports its
  // flush with ZERO parameters and forwards `client.flush()` with nothing, and
  // core's promise buffer documents what "nothing" means: wait forever. So
  // `await s.flush(10_000)` was never a ten-second wait. It was no wait at all,
  // in the worst sense — an unbounded one.
  const RN_SDK = join(ROOT, 'node_modules', '@sentry', 'react-native', 'dist', 'js', 'sdk.js');
  const CORE_BUF = join(
    ROOT, 'node_modules', '@sentry', 'core', 'build', 'cjs', 'utils-hoist', 'promisebuffer.js',
  );

  it('⚠⚠⚠ THE VENDOR PROOF: RN flush() takes no arguments, so our timeout is discarded', () => {
    const src = readFileSync(RN_SDK, 'utf8');
    // Zero parameters — the 10_000 we passed since OTA-1492 never left this line.
    expect(src).toMatch(/export function flush\(\)/);
    // And it forwards with nothing, so core receives `undefined`.
    expect(src).toMatch(/client\.flush\(\)/);
  });

  it('⚠⚠⚠ AND WHAT `undefined` MEANS, in the buffer\'s own words: wait as long as it takes', () => {
    const src = readFileSync(CORE_BUF, 'utf8');
    expect(src).toMatch(/not passing anything\) will make the promise wait as long as it takes/);
  });

  it('⚠⚠⚠ SO WE KEEP OUR OWN WALL — a flush that never settles still resolves, as false', async () => {
    const SRC = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
    // The race exists, and BOTH send paths go through it rather than calling
    // the SDK's flush bare. A bare `await s.flush(` anywhere is the bug back.
    expect(SRC).toContain('async function flushWithRealDeadline(');
    // ⚠ OTA-1516 widened the timer arm to also RECORD why it fired; the wall
    // itself is unchanged, so the pin follows the structure, not the old text.
    expect(SRC).toMatch(/timer = setTimeout\(\(\) => \{[\s\S]{0,120}resolve\(false\); \}, ms\)/);
    expect(SRC).not.toMatch(/return await s\.flush\(/);
    expect(SRC).toMatch(/await flushWithRealDeadline\(s, PART_FLUSH_MS\)/);
    expect(SRC).toMatch(/await flushWithRealDeadline\(s, 10_000\)/);
  });

  it('⚠⚠ THE ASYMMETRY THAT SURVIVED THE SIZE EXPERIMENT: crashes never flush, bundles always did', () => {
    const SRC = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
    // The crash transport captures and returns — nothing waits on the native
    // promise, which is exactly why twenty-two crash records kept arriving
    // while not one bundle did, at ANY payload size.
    expect(SRC).toContain('send: async (rec: CrashRecord) => { s.captureEvent(toSentryEvent(rec)); }');
  });
});

describe('OTA-1515 — a refusal is not a failed send', () => {
  // ⚠⚠⚠ THE SECOND HALF OF THE AUDIT'S COST. Three different causes — the
  // switch is off, the build has no native module, there is no DSN — all
  // returned the same flat `false` as a genuine transport failure, and the
  // button rendered them identically. Every diagnosis had to guess which one
  // it was looking at. Now each names itself.
  it('⚠⚠⚠ EACH EARLY RETURN NAMES ITSELF instead of sharing one silent false', () => {
    const SRC = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
    const fn = SRC.slice(SRC.indexOf('export async function sendGameLogChunked'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain("report.stopped = 'crash reporting is switched off on this device'");
    expect(body).toContain("report.stopped = 'this build has no Sentry native module'");
    expect(body).toContain("report.stopped = 'no DSN is configured in this build'");
  });

  it('⚠⚠ the log line says NOT ATTEMPTED, never "0 parts out"', () => {
    const line = describeChunkedSend({
      sent: 0, parts: 0, chars: 0, timings: [], threwAt: null, flushNote: null,
      stopped: 'crash reporting is switched off on this device', bundleId: 'q1',
    });
    expect(line).toContain('NOT ATTEMPTED');
    expect(line).not.toContain('parts out');
  });

  it('⚠ and the screen repeats the reason rather than a part count', () => {
    expect(ABOUT).toContain('chunk.stopped ? `not attempted — ${chunk.stopped}`');
  });
});

describe('OTA-1515 — the report tells the truth about what got out', () => {
  it('⚠⚠ the line names parts, chars and timing — 25ms and 30s stop reading alike', () => {
    const line = describeChunkedSend({
      sent: 19, parts: 23, chars: 1_150_000,
      timings: [25, 900, 1200, 30_000], threwAt: 'part 20/23: out of memory',
      flushNote: null, stopped: null, bundleId: 'abc123',
    });
    expect(line).toContain('#abc123');
    expect(line).toContain('19/23 parts out');
    expect(line).toContain('1150000 chars');
    expect(line).toContain('worst 30000ms');
    expect(line).toContain('THREW at part 20/23: out of memory');
  });

  it('⚠ a clean run says so without noise', () => {
    const line = describeChunkedSend({
      sent: 3, parts: 3, chars: 120, timings: [10, 12, 11], threwAt: null, flushNote: null, stopped: null, bundleId: 'z9',
    });
    expect(line).toContain('3/3 parts out');
    expect(line).not.toContain('THREW');
  });
});

describe('OTA-1515 — the relay puts the parts back together', () => {
  it('⚠⚠⚠ TWENTY FRAGMENTS IN TWENTY FOLDERS IS NOT EVIDENCE — it stitches them in order', () => {
    expect(RELAY).toMatch(/REASSEMBLE THE PARTS/);
    expect(RELAY).toContain("bid = tagval(ev, 'bundleId')");
    expect(RELAY).toContain('have = sorted(b[\'seen\'])');
    expect(RELAY).toContain("(dest / 'game-log.txt').write_text(text)");
  });

  it('⚠⚠ a missing part is NAMED, not silently concatenated into a hole', () => {
    expect(RELAY).toContain("missing = [n for n in range(1, total + 1) if n not in b['seen']]");
    expect(RELAY).toContain("note += f' — MISSING {missing}'");
  });

  it('⚠⚠ the audit reads 30 days, not 24 hours — the lens that hid the answer', () => {
    expect(RELAY).toContain("for period in ('24h', '7d', '30d')");
    // …and with an interval that DIVIDES the period; equal values 400.
    expect(RELAY).toContain("('groupBy', 'category'), ('interval', '1d'),");
  });
});
