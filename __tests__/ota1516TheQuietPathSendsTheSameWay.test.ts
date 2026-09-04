// OTA-1516 — THE QUIET PATH SENDS THE SAME WAY.
//
// ⚠⚠⚠ THE GAP WAS IN OTA-1515 ITSELF, AND THE CRASH RECORD FOUND IT. That OTA
// moved the SEND LOG BUTTON onto the chunked game-log path and left the two
// paths nobody watches — the boot retry and the post-crash auto-push — still
// calling `sendDiagnosticsBundle`, which assembles the whole thing in one go:
// an 800KB log tail plus a NEVER-truncated save plus inventory plus device,
// UTF-8'd, concatenated with a full array copy per item, base64'd into a single
// JS string, and handed across the RN bridge in ONE call. The largest
// allocation the app ever makes was left running unattended on every boot.
//
// ⚠⚠ WHAT THE 01:03:31 RECORD SAYS, VERBATIM FROM ITS OWN FIELDS:
//     kind            native-death        (the OS killed the process)
//     build           2026-08-27-1515     (the fix WAS installed)
//     lastAction      "(no action yet)"   (before the player touched anything)
//     lastPhase       "rendered"
//     lastPhaseAgeMs  0                   (AT the instant it reached rendered)
// App.tsx fires the boot retry once `otaBootResolved` opens — right at render —
// and after OTA-1515 it was the only megabyte-scale assembly left in the boot.
//
// ⚠ AND THE HONEST LIMIT ON THAT: it is a strong coincidence, not a proof. The
// ledger's native deaths carry no stack (`"(none — the process died without
// one)"`), so nothing on the device can name the allocation that killed it.
// This change does not need the proof. There was never a reason for the retry
// to send a DIFFERENT, LARGER payload than the button, and the owner asked for
// the game log alone — "not the inventory or save file or anything else." If
// the native deaths stop, that is the confirmation the record could not give.

import { describeChunkedSend } from '../app/diagnostics/sentryTransport';
import { readFileSync } from 'fs';
import { join } from 'path';

// ⚠ The transport reaches crashReporter, which reaches AsyncStorage's native
// side. Same stand-in the OTA-1515 suite uses — this file only needs the pure
// formatter, not a real reporting gate.
jest.mock('../app/diagnostics/crashReporter', () => ({
  reportingEnabled: () => true,
  crashReportDsn: () => 'https://k@o.ingest.sentry.io/1',
}));

const ROOT = join(__dirname, '..');
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
const TRANSPORT = readFileSync(join(ROOT, 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
const APP = readFileSync(join(ROOT, 'App.tsx'), 'utf8');

/** The file with its comments stripped — so a pin can never be satisfied by
 *  prose that merely DESCRIBES the call it is supposed to be checking. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
}

describe('OTA-1516 — every send path sends the same payload the same way', () => {
  it('⚠⚠⚠ THE BOOT RETRY IS CHUNKED — the unattended path stops building megabytes', () => {
    const code = codeOnly(PENDING);
    // ⚠ OTA-1519 moved this one step further — inline, no attachments — after
    // the owner's devices proved the attachment was the fault. The contract
    // OTA-1516 pinned (the unattended path stops building the whole envelope)
    // is unchanged and is now enforced harder.
    expect(code).toContain('await sendGameLogInline(p.bundle.log, p.id, attempt)');
    // The whole-bundle sender must be gone from this file entirely, not merely
    // unused: an import left behind is a call waiting to come back.
    expect(code).not.toMatch(/sendDiagnosticsBundle/);
  });

  it('⚠⚠⚠ THE POST-CRASH AUTO-PUSH IS CHUNKED — the worst possible moment for a megabyte', () => {
    const code = codeOnly(AUTO);
    expect(code).toContain('await sendGameLogInline(bundle.log,');
    expect(code).not.toMatch(/sendDiagnosticsBundle/);
  });

  it('⚠⚠ ALL THREE PATHS NOW AGREE — button, boot retry, crash auto-push', () => {
    // ⚠ OTA-1518 moved the BUTTON one step further, to the attachment-free
    // inline sender, while the two quiet paths stay on the chunked one. What
    // this pins is unchanged and is the point of OTA-1516: NO path builds the
    // whole four-artifact envelope any more. They send the game log alone.
    // ⚠ OTA-1519 brought all three onto the SAME inline sender, which is what
    // "agree" was always reaching for — 1516 could only get them off the
    // four-artifact envelope, because the attachment fault was not yet proven.
    for (const src of [BUTTON, PENDING, AUTO]) {
      expect(codeOnly(src)).toContain('sendGameLogInline(');
    }
    // And nothing anywhere still reaches for the one-envelope sender.
    for (const src of [BUTTON, PENDING, AUTO]) {
      expect(codeOnly(src)).not.toMatch(/sendDiagnosticsBundle\(/);
    }
  });

  it('⚠⚠ THE DURABLE COPY IS UNTOUCHED — chunking changed the WIRE, not the disk', () => {
    // The save and inventory still go into the file on disk. Losing them would
    // have traded one diagnosis for another; only the upload narrowed.
    expect(codeOnly(BUTTON)).toContain('await persistPendingBundle({');
    expect(codeOnly(AUTO)).toContain('const pending = await persistPendingBundle(bundle);');
    // The stored shape still carries all four artifacts.
    expect(PENDING).toMatch(/DiagnosticsBundle/);
  });
});

describe('OTA-1516 — the retry still reports honestly', () => {
  it('⚠⚠ a failed retry prints the PART DETAIL, not a bare "did not go out"', () => {
    const code = codeOnly(PENDING);
    // describeChunkedSend carries parts/chars/timings — or NOT ATTEMPTED and
    // its reason. A retry that fails now says which of those it was.
    expect(code).toContain('describeInlineSend(chunk)');
    // ⚠ OTA-1519: `delivered` is accepted AND flush-confirmed. "The SDK took
    // it" was true for two days while nothing arrived.
    expect(code).toContain('const ok = chunk.delivered;');
  });

  it('⚠ the attempt accounting is unchanged — chunking is not a free extra try', () => {
    const code = codeOnly(PENDING);
    expect(code).toContain('const attempt = p.attempts + 1;');
    expect(code).toContain('if (attempt >= MAX_SEND_ATTEMPTS)');
    // OTA-1512's hold-not-burn rule survives untouched.
    expect(code).toContain('if (sinceLast < MIN_RETRY_GAP_MS)');
  });
});

describe('OTA-1516 — 33ms is an answer, and now it says which answer', () => {
  // ⚠⚠⚠ THE 01:02 SEND, VERBATIM FROM THE OWNER'S LOG:
  //     send-log: #mtatj02qozh5 — 0/7 parts out (404814 chars, median 33ms, worst 34ms)
  // Every part ATTEMPTED (a refusal prints NOT ATTEMPTED), none THREW (the
  // clause is absent), and all seven answered in THIRTY-THREE MILLISECONDS. No
  // phone completes a network round trip in 33ms, so nothing was waiting on a
  // server: flush() said no locally, instantly, before a byte left the device.
  // That kills size, memory pressure, and the missing deadline as explanations.
  //
  // ⚠⚠ WHAT IT DOES NOT SAY IS WHY — and `ok !== false` was flattening three
  // very different refusals into one boolean: a flush that RESOLVED false, a
  // flush that REJECTED (carrying the queued send's real error), and our own
  // deadline. Those want different fixes and 33ms cannot separate them.
  it('⚠⚠⚠ ALL THREE REFUSALS ARE NOW DISTINGUISHED, not flattened to false', () => {
    const code = codeOnly(TRANSPORT);
    expect(code).toContain("lastFlushNote = 'flush() resolved false without sending'");
    expect(code).toContain('lastFlushNote = `flush() rejected: ${err instanceof Error ? err.message : String(err)}`');
    expect(code).toContain('lastFlushNote = `no answer within ${ms}ms`');
  });

  it('⚠⚠ the reason reaches the log line, where the last diagnosis needed it', () => {
    expect(TRANSPORT).toContain('${r.flushNote ? ` — WHY: ${r.flushNote}` : \'\'}');
    // And only the FIRST one is kept — seven identical repeats bury the line.
    expect(codeOnly(TRANSPORT)).toContain('if (!ok && report.flushNote === null) report.flushNote = lastFlushNote;');
  });

  it('⚠ a clean send still says nothing extra', () => {
    const line = describeChunkedSend({
      sent: 2, parts: 2, chars: 40, timings: [9, 9], threwAt: null, flushNote: null,
      stopped: null, bundleId: 'ok1',
    });
    expect(line).not.toContain('WHY:');
  });
});

describe('OTA-1516 — why the boot retry is where the process was dying', () => {
  it('⚠⚠⚠ App.tsx FIRES THE RETRY AT RENDER, which is the phase the deaths name', () => {
    // The record said lastPhase 'rendered' with lastPhaseAgeMs 0. This pins
    // that the retry really does run at that point — gated on otaBootResolved,
    // which is the signal that opens as the first render settles.
    const gate = APP.indexOf('otaBootResolved');
    const call = APP.indexOf('retryPendingBundleAtBoot');
    expect(gate).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(gate);
    expect(APP).toContain('const line = await pb.retryPendingBundleAtBoot();');
  });

  it('⚠⚠ and the deadline from OTA-1515 still guards every part of it', () => {
    // Chunking without the real deadline would still hang; the deadline
    // without chunking still built megabytes. Both, or neither is enough.
    expect(TRANSPORT).toContain('async function flushWithRealDeadline(');
    expect(TRANSPORT).toMatch(/await flushWithRealDeadline\(s, PART_FLUSH_MS\)/);
    expect(TRANSPORT).not.toMatch(/return await s\.flush\(/);
  });
});
