// OTA-1518 — THE BEACON GOES FIRST.
//
// ⚠⚠⚠ TWO WRONG ROOT CAUSES HAVE ALREADY COST THE OWNER A SEND APIECE, so this
// OTA stops theorising and MEASURES. What his two devices actually built:
//
//                    attachment?   flushed?   arrives?
//   crash record         no         NEVER      YES — four since Aug 26
//   log part            YES          yes        no
//   old bundle          YES          yes        no
//
// Identical on hal (APK 293) and golem (APK 299) — two builds, two app ids,
// payloads 314K and 405K, same 33-47ms `flush() resolved false without
// sending`. That kills "build 293 lacks the native module" AND "the payload is
// too big" outright. The relay confirms flush is telling the truth this time:
// zero `game-log.part*` files ever arrived.
//
// ⚠⚠ SO THE LAST DISCRIMINATOR STANDING IS THE ATTACHMENT, and it is one
// experiment from proven or eliminated. The BEACON is that experiment: one tiny
// event, no attachment, shaped exactly like the crash records that still work.
//   · beacon arrives, parts do not → attachments are the fault, conclusively.
//   · beacon does not arrive either → attachments EXONERATED, and the fault is
//     the transport/flush path, which is the last candidate left.
// Either outcome is worth the tap, and neither requires me to be right first.
//
// ⚠⚠ AND THE INLINE PARTS MEAN THE EXPERIMENT ALSO DELIVERS. If attachments are
// the fault, the log is already coming through in the event bodies behind the
// beacon — the diagnosis and the payload in one tap.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describeInlineSend, INLINE_CHUNK_CHARS } from '../app/diagnostics/sentryTransport';

jest.mock('../app/diagnostics/crashReporter', () => ({
  reportingEnabled: () => true,
  crashReportDsn: () => 'https://k@o.ingest.sentry.io/1',
}));

const ROOT = join(__dirname, '..');
const SRC = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
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
const RELAY = readFileSync(join(ROOT, '.github', 'workflows', 'sentry-inbox.yml'), 'utf8');

function inlineBody(): string {
  const fn = SRC.slice(SRC.indexOf('export async function sendGameLogInline'));
  return fn.slice(0, fn.indexOf('\n}'));
}

describe('OTA-1518 — nothing on this path carries an attachment', () => {
  it('⚠⚠⚠ NOT ONE ATTACHMENT ANYWHERE IN THE INLINE SENDER — that is the experiment', () => {
    const body = inlineBody();
    // A single `attachments:` here would destroy the whole measurement.
    expect(body).not.toMatch(/attachments/);
    // And no hint argument at all — captureEvent is called one-arg, exactly
    // like the crash transport that still works.
    // ⚠ OTA-1520 amended the shape, not the principle: the slice still rides in
    // `extra` with no attachment anywhere, but as an ARRAY of small blocks,
    // because Sentry's @password rule replaces a whole value and ate nine whole
    // parts. `chunkChars` stays so the relay can prove nothing went missing.
    // ⚠ OTA-1677 amended it once more, same principle: still `extra`, still an
    // array of blocks, no attachment — each block now base64 so the scrubber is
    // handed no text at all. The pin follows the shape.
    expect(body).toContain('chunkBlocks: splitLogIntoBlocks(slice).map(encodeLogBlock),');
    expect(body).toContain('chunkChars: slice.length,');
  });

  it('⚠⚠⚠ THE BEACON GOES FIRST, AND IT IS SHAPED LIKE A CRASH RECORD', () => {
    const body = inlineBody();
    const beaconAt = body.indexOf("kind: 'player-log-beacon'");
    const partsAt = body.indexOf('for (let i = 0; i < total; i++)');
    expect(beaconAt).toBeGreaterThan(-1);
    expect(partsAt).toBeGreaterThan(beaconAt); // first, so it lands even if the loop dies
    expect(body).toContain('report.beaconOut = true;');
  });

  it('⚠⚠ a beacon that throws is RECORDED, not swallowed', () => {
    expect(inlineBody()).toContain('report.threwAt = `beacon: ${err instanceof Error ? err.message : String(err)}`;');
  });
});

describe('OTA-1518 — the experiment, and the premise OTA-1519 corrected', () => {
  // ⚠⚠⚠ THE PREMISE HERE WAS WRONG, AND SAYING SO IS THE POINT OF LEAVING IT.
  // OTA-1518 stopped gating delivery on flush() because flush appeared to have
  // lied in both directions. It had not. The owner's own devices settled it
  // hours later, each running the A/B inside ONE boot, seconds apart:
  //   hal   02:01:31 attachments → flush false | 02:01:35 inline → flush YES 27/27
  //   golem 02:02:02 attachments → flush false | 02:02:07 inline → flush YES 22/22
  // flush said `false` because nothing was leaving and `yes` the instant
  // something did — it tracked reality exactly. OTA-1519 restored it as the
  // signal, and these pins are amended to the corrected contract rather than
  // deleted, because the mistaken step is part of how the fault was found.
  it('⚠⚠ ACCEPTANCE IS COUNTED SEPARATELY FROM DELIVERY — both facts are kept', () => {
    const body = inlineBody();
    // The increment sits in the try, straight after the capture — no await on
    // a flush between them, and no `ok &&`.
    expect(body).toMatch(/report\.sent \+= 1;[\s\S]{0,80}report\.chars \+= slice\.length;/);
    expect(body).not.toMatch(/if \(ok\) report\.sent \+= 1;/);
  });

  it('⚠⚠ ONE flush at the END — and OTA-1519 made its answer decisive again', () => {
    // Recorded here, decisive at the call sites (see ota1519's `delivered`).
    const body = inlineBody();
    expect(body).toContain("report.flushSaid = ok ? 'yes' : 'no';");
    const flushAt = body.indexOf('flushWithRealDeadline');
    const loopAt = body.indexOf('for (let i = 0; i < total; i++)');
    expect(flushAt).toBeGreaterThan(loopAt); // once, at the END — never per part
  });

  it('⚠ the line reports the experiment AND, since 1519, the verdict', () => {
    const line = describeInlineSend({
      sent: 27, parts: 27, chars: 400_000, timings: [3, 4], threwAt: null,
      flushNote: 'flush() resolved false without sending', stopped: null,
      // ⚠ OTA-1519 added `delivered` — accepted AND flush-confirmed. This
      // fixture is the two-day trap: every part accepted, flush said no.
      bundleId: 'zz9', beaconOut: true, flushSaid: 'no', delivered: false,
    });
    // ⚠ OTA-1519 put the verdict first; the experiment's own facts still follow.
    expect(line).toContain('NOT DELIVERED');
    expect(line).toContain('inline, no attachments');
    expect(line).toContain('beacon out');
    expect(line).toContain('27/27 parts accepted');
    expect(line).toContain('flush said no');
  });

  it('⚠ a beacon that failed says FAILED, loudly', () => {
    const line = describeInlineSend({
      sent: 0, parts: 3, chars: 0, timings: [], threwAt: null, flushNote: null,
      stopped: null, bundleId: 'q', beaconOut: false, flushSaid: 'no-flush', delivered: false,
    });
    expect(line).toContain('beacon FAILED');
  });
});

describe('OTA-1518 — the chunk fits an event body, not an envelope', () => {
  it('⚠⚠ inline parts are far smaller than the attachment chunks were', () => {
    // Inline text is normalised INTO the event, so it shares the payload budget
    // with tags and message — 15K leaves comfortable room.
    expect(INLINE_CHUNK_CHARS).toBeLessThanOrEqual(20_000);
    expect(INLINE_CHUNK_CHARS).toBeGreaterThanOrEqual(4_000);
  });

  it('⚠ the button sends inline, and the whole-envelope senders are off this path', () => {
    expect(BUTTON).toContain('await sendGameLogInline(report, pendingId);');
    expect(BUTTON).not.toMatch(/sendDiagnosticsBundle\(/);
    expect(BUTTON).toContain('describeInlineSend(chunk)');
  });
});

describe('OTA-1518 — the relay reads the answer', () => {
  it('⚠⚠⚠ THE BEACON IS CALLED OUT BY NAME — it is the result, not a fragment', () => {
    expect(RELAY).toContain("print('  ⚠ BEACONS ARRIVED (attachment-free sending WORKS):', sorted(set(beacons)))");
    expect(RELAY).toContain("print('  ⚠ no beacons yet')");
  });

  it('⚠⚠ inline parts stitch through the SAME assembler, reading extra.chunk', () => {
    expect(RELAY).toContain("chunk = extraval(ev, 'chunk')");
    expect(RELAY).toContain("bundles[bid]['seen'].setdefault(int(part), chunk)");
    // The attachment path is untouched — an older bundle still reassembles.
    expect(RELAY).toContain("slices = sorted(d.glob('game-log.part*'))");
  });

  it('⚠ a beacon is never mistaken for part of the log', () => {
    expect(RELAY).toContain("if 'beacon' in title or tagval(ev, 'kind') == 'player-log-beacon':");
  });
});
