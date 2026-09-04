// OTA-1519 — THE ATTACHMENT WAS THE FAULT.
//
// ⚠⚠⚠ THE PROOF, AND IT IS THE OWNER'S OWN DEVICES RUNNING THE A/B BY ACCIDENT.
// OTA-1518 moved the BUTTON to an attachment-free sender and left the crash
// auto-push on the attachment one. So each device ran both, seconds apart,
// inside a single boot — same process, same SDK, same second, one variable:
//
//   hal   (APK 293)  02:01:31 attachments → flush false   02:01:35 inline → flush YES, 27/27
//   golem (APK 299)  02:02:02 attachments → flush false   02:02:07 inline → flush YES, 22/22
//
// Two builds, two app ids, 405K and 319K of log. Nothing carrying an attachment
// has reached Sentry since 2026-08-25; the first attachment-free send worked on
// the first try. Payload size (his own new-character test), the discarded flush
// deadline (real, fixed, not the cause) and the missing native module (golem's
// APK 299) are all eliminated by his own evidence.
//
// ⚠⚠ AND I OWED flush() AN APOLOGY. OTA-1518 was built on the premise that it
// had lied in both directions and could not be trusted to gate delivery. It had
// not. It said `false` because nothing was leaving and `yes` the instant
// something did — it tracked reality exactly, and the same boot shows it doing
// both. So it goes back to being the signal, and `delivered` is the verdict:
// every part accepted AND the flush confirmed it. "The SDK took it" was true
// for two days while nothing arrived; that is precisely the distinction flush
// draws, and dropping it was my error, not the SDK's.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describeInlineSend } from '../app/diagnostics/sentryTransport';

jest.mock('../app/diagnostics/crashReporter', () => ({
  reportingEnabled: () => true,
  crashReportDsn: () => 'https://k@o.ingest.sentry.io/1',
}));

const ROOT = join(__dirname, '..');
const SRC = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
const PENDING = readFileSync(join(ROOT, 'app', 'diagnostics', 'pendingBundle.ts'), 'utf8');
const AUTO = readFileSync(join(ROOT, 'app', 'diagnostics', 'autoBundle.ts'), 'utf8');
const ABOUT = readFileSync(join(ROOT, 'app', 'screens', 'AboutScreen.tsx'), 'utf8');
// ⚠⚠ OTA-1665 — THE BUTTON'S SEND PATH MOVED, and this constant moved with it.
// Every "button" assertion in this file used to read AboutScreen, because that
// is where SEND LOG's handler lived. SEND LOG is deleted (the owner: "I've
// removed the send log") and REPORT A BUG is the one push now, so the same
// claims are asserted against `diagnostics/bugReport.ts`. The claims themselves
// are unchanged and were worth every line: repointing them caught that the new
// implementation read `!chunk.stopped` instead of `chunk.delivered` — the exact
// false positive OTA-1519 was written about — and that it had dropped the
// OTA-1492 result line entirely. Both fixed in the code, not the test.
const BUTTON = readFileSync(join(ROOT, 'app', 'diagnostics', 'bugReport.ts'), 'utf8');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
}

describe('OTA-1519 — every production path is attachment-free', () => {
  it('⚠⚠⚠ ALL THREE SENDERS ARE INLINE — button, boot retry, crash auto-push', () => {
    for (const src of [BUTTON, PENDING, AUTO]) {
      expect(codeOnly(src)).toContain('sendGameLogInline(');
    }
  });

  it('⚠⚠⚠ AND NOT ONE OF THEM CAN REACH AN ATTACHMENT SENDER', () => {
    // The two attachment senders are proven not to leave the device. A caller
    // wandering back onto one is the bug returning, silently, for two more days.
    for (const src of [BUTTON, PENDING, AUTO]) {
      const code = codeOnly(src);
      expect(code).not.toMatch(/sendDiagnosticsBundle/);
      expect(code).not.toMatch(/sendGameLogChunked/);
    }
  });

  it('⚠⚠ the retired senders SAY they are retired, at the definition', () => {
    // Kept only because their suites document how the fault was established.
    const bundleAt = SRC.indexOf('export async function sendDiagnosticsBundle(');
    const chunkAt = SRC.indexOf('export async function sendGameLogChunked(');
    expect(SRC.slice(Math.max(0, bundleAt - 1200), bundleAt)).toContain('RETIRED. DO NOT CALL THIS FROM A PRODUCTION PATH');
    expect(SRC.slice(Math.max(0, chunkAt - 600), chunkAt)).toContain('RETIRED, same reason');
  });
});

describe('OTA-1519 — flush() is the signal again', () => {
  it('⚠⚠⚠ `delivered` IS accepted AND flushed — not "the SDK took it"', () => {
    const fn = SRC.slice(SRC.indexOf('export async function sendGameLogInline'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('report.delivered = report.sent === report.parts');
    expect(body).toContain("&& report.flushSaid !== 'no'");
    // Zero parts is not a delivery, however cleanly it did nothing.
    expect(body).toContain('&& report.parts > 0');
  });

  it('⚠⚠⚠ AND EVERY CALL SITE GATES ON IT', () => {
    expect(codeOnly(BUTTON)).toContain('ok = chunk.delivered;');
    expect(codeOnly(PENDING)).toContain('const ok = chunk.delivered;');
    expect(codeOnly(AUTO)).toContain('const ok = chunk.delivered;');
    // The OTA-1518 shape — counting acceptance alone as success — is gone.
    for (const src of [BUTTON, PENDING, AUTO]) {
      expect(codeOnly(src)).not.toMatch(/chunk\.sent > 0 && chunk\.sent === chunk\.parts/);
    }
  });

  it('⚠⚠ ONE flush at the end, not one per part', () => {
    // 27 round trips would be 27 chances to stall for no extra truth — the
    // parts share a queue, so one drain answers for all of them.
    const fn = SRC.slice(SRC.indexOf('export async function sendGameLogInline'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    const loopAt = body.indexOf('for (let i = 0; i < total; i++)');
    const flushAt = body.indexOf('flushWithRealDeadline');
    expect(flushAt).toBeGreaterThan(loopAt);
    expect(body.match(/flushWithRealDeadline/g) ?? []).toHaveLength(1);
  });

  it('⚠ an SDK with no flush is not called a failure', () => {
    // `!== 'no'` rather than `=== 'yes'`: 'no-flush' keeps the old
    // queue-and-hope answer instead of reporting a delivery that did happen.
    const line = describeInlineSend({
      sent: 3, parts: 3, chars: 90, timings: [2, 2, 2], threwAt: null, flushNote: null,
      stopped: null, bundleId: 'old', beaconOut: true, flushSaid: 'no-flush', delivered: true,
    });
    expect(line).toContain('DELIVERED');
  });
});

describe('OTA-1519 — the line states the verdict first', () => {
  it('⚠⚠ a confirmed send says DELIVERED', () => {
    const line = describeInlineSend({
      sent: 27, parts: 27, chars: 404783, timings: [3], threwAt: null, flushNote: null,
      stopped: null, bundleId: 'mtavmvn26xli', beaconOut: true, flushSaid: 'yes', delivered: true,
    });
    expect(line).toContain('DELIVERED');
    expect(line).toContain('27/27 parts accepted');
    expect(line).toContain('flush said yes');
  });

  it('⚠⚠ accepted-but-not-flushed reads as NOT DELIVERED — the two-day trap, named', () => {
    // This exact shape is what the attachment path produced: the SDK took every
    // part and nothing arrived. It must never read as success again.
    const line = describeInlineSend({
      sent: 7, parts: 7, chars: 404814, timings: [33], threwAt: null,
      flushNote: 'flush() resolved false without sending', stopped: null,
      bundleId: 'mtatj02qozh5', beaconOut: true, flushSaid: 'no', delivered: false,
    });
    expect(line).toContain('NOT DELIVERED');
    expect(line).toContain('flush() resolved false without sending');
  });
});
