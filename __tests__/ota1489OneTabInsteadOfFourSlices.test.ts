// OTA-1489 — ONE TAP INSTEAD OF FOUR SLICES.
//
// ⚠⚠ Owner: *"are we able to have logs pushed to sentry for you to view? it's
// easier than copying slices"* — then: *"have the log include the game log,
// inventory log, save file, about information all at one time so you always
// see the whole picture."* One SEND LOG tap in SETTINGS → SESSION → REPORTING
// ships FOUR attachments on one event — game-log.txt, inventory.txt,
// save.json, device.txt — each composed by the same function its COPY button
// uses, replacing the whole clipboard relay.
//
// ⚠⚠ THE TWO GATES ARE THE TEST SUBJECT, more than the happy path:
//   · the crash-reports switch governs EVERY contact with Sentry — the policy
//     sentence is "the app never contacts Sentry at all", and a log send with
//     the switch off would make it false;
//   · the button exists only for the owner's unlock names — players are
//     promised that nothing but crash records leaves, and a log carries what
//     they typed.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { crashReportDsn: 'https://test@sentry.invalid/1', tartariaLine: 'golem' } } },
}));
const mockSentry = { init: jest.fn(), captureEvent: jest.fn() };
jest.mock('@sentry/react-native', () => mockSentry, { virtual: true });

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sendDiagnosticsBundle, _resetSentryTransportForTests } from '../app/diagnostics/sentryTransport';
import {
  installCrashTransport, loadReportingPref, CRASH_REPORTING_PREF_KEY,
  _resetCrashReporterForTests,
} from '../app/diagnostics/crashReporter';
import { sharingUnlockedFor } from '../app/engine/fallenLedger';
import { OTA_BUILD_ID } from '../app/buildInfo';
import { between } from '../test-utils/srcBlock';

const ROOT = join(__dirname, '..');
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

const armed = async () => {
  await AsyncStorage.removeItem(CRASH_REPORTING_PREF_KEY);
  _resetCrashReporterForTests();
  _resetSentryTransportForTests();
  mockSentry.captureEvent.mockClear();
  installCrashTransport({ name: 'test', send: async () => {} });
  await loadReportingPref(); // opt-out default → ON
};

afterEach(() => { _resetCrashReporterForTests(); _resetSentryTransportForTests(); });

const BUNDLE = { log: 'the log body', inventory: 'INV LINES', save: '{"player":1}', device: 'DEVICE SUMMARY' };

describe('OTA-1489 — the whole picture, one event', () => {
  it('⚠⚠ ships all FOUR parts as attachments on one stamped event', async () => {
    await armed();
    expect(await sendDiagnosticsBundle(BUNDLE)).toBe(true);
    expect(mockSentry.captureEvent).toHaveBeenCalledTimes(1);
    const [event, hint] = mockSentry.captureEvent.mock.calls[0] as [
      { message: string; tags: Record<string, string> },
      { attachments: Array<{ filename: string; data: string }> },
    ];
    // The event names the build, so a bundle is never orphaned from its version.
    expect(event.message).toContain(OTA_BUILD_ID);
    expect(event.tags.kind).toBe('player-log');
    // Attachments, not message/extra — those truncate, files arrive whole.
    expect(hint.attachments.map((a) => a.filename))
      .toEqual(['game-log.txt', 'inventory.txt', 'save.json', 'device.txt']);
    expect(hint.attachments.map((a) => a.data))
      .toEqual(['the log body', 'INV LINES', '{"player":1}', 'DEVICE SUMMARY']);
  });

  it('⚠ past the cap the LOG keeps its tail — and the SAVE is never cut', async () => {
    await armed();
    const bigLog = 'x'.repeat(900_000) + 'THE-END-MATTERS';
    const bigSave = '{' + '"k":1,'.repeat(200_000) + '"end":true}';
    expect(await sendDiagnosticsBundle({ ...BUNDLE, log: bigLog, save: bigSave })).toBe(true);
    const [, hint] = mockSentry.captureEvent.mock.calls[0] as [unknown, { attachments: Array<{ data: string }> }];
    // Recent lines are the evidence; the head of an enormous log was already fixed.
    expect(hint.attachments[0]!.data.length).toBe(800_000);
    expect(hint.attachments[0]!.data.endsWith('THE-END-MATTERS')).toBe(true);
    // A cut save does not round-trip — it arrives whole or not at all.
    expect(hint.attachments[2]!.data).toBe(bigSave);
  });
});

describe('OTA-1489 — the switch governs every contact with Sentry', () => {
  it('⚠⚠ with the crash-reports switch OFF, the send refuses and nothing is called', async () => {
    await armed();
    await AsyncStorage.setItem(CRASH_REPORTING_PREF_KEY, 'false');
    _resetCrashReporterForTests();
    installCrashTransport({ name: 'test', send: async () => {} });
    expect(await sendDiagnosticsBundle(BUNDLE)).toBe(false);
    expect(mockSentry.captureEvent).not.toHaveBeenCalled();
  });

  it('⚠ an unconfigured build refuses too — there is nowhere to send', async () => {
    await armed();
    installCrashTransport(null);
    expect(await sendDiagnosticsBundle(BUNDLE)).toBe(false);
    expect(mockSentry.captureEvent).not.toHaveBeenCalled();
  });
});

describe('OTA-1489 — the button is honest about its work', () => {
  it('⚠⚠ the render gate is a build that can actually deliver', () => {
    // ⚠ RETARGETED TWICE. OTA-1490 widened the unlock from the loaded
    // character's name to the DEVICE (sticky flag); OTA-1661 then REMOVED the
    // owner half entirely — *"anyone testing should be able to push a log"* —
    // and moved docs/PRIVACY.md to match, adding a two-tap confirm that names
    // the contents. What survives from this test's original claim is the half
    // that was always about honesty rather than access: the button appears only
    // where the build has a destination, because a live-looking button that
    // cannot deliver is how a tester concludes their report was received.
    // ⚠ RE-ANCHORED AGAIN for OTA-1665. This asserted SEND LOG rendered only
    // where the build could deliver — a real claim about a button that no
    // longer exists. What survives is the claim underneath it: there IS a way
    // to report from this screen, and it is not hidden behind an owner gate.
    // ⚠ Pinned to the WIRING, not the label. 'REPORT A BUG' is three prose
    // words — a pin that fails on a reword and passes if the button is deleted,
    // which is the shape check:quotedpins exists to retire. What must be true is
    // that this screen can open the report at all, and that nothing gates it.
    expect(ABOUT).toContain('setBugReportOpen(true)');
    expect(ABOUT).not.toContain('{ownerTools && crashConfigured && (');
  });

  it('⚠⚠ the gate function itself: owner names pass, a player name does not', () => {
    expect(sharingUnlockedFor('Verbal')).toBe(true);
    expect(sharingUnlockedFor('sasmooch the second')).toBe(true);
    expect(sharingUnlockedFor('Mudline Karn')).toBe(false);
    expect(sharingUnlockedFor(null)).toBe(false);
  });

  it('⚠⚠ the report is composed by the SAME functions the COPY buttons use', () => {
    // ⚠ RE-ANCHORED for OTA-1665. One derivation per artifact: what arrives at
    // the developer can never disagree with what the corresponding clipboard
    // export would have said. That claim outlived the button it was written
    // for — SEND LOG is deleted, REPORT A BUG carries the payload — so it is
    // asserted where the payload is actually built.
    const body = BUTTON.slice(BUTTON.indexOf('export async function composeAndSendBugReport'));
    expect(body).toContain('buildBasicDeviceSummary()');
    expect(body).toContain('buildVoiceSummary()');
    // ⚠ OTA-1682 — the log source is `src` (the picked slot, else the last-played
    // one a general report borrows); the derivation is the same readSlotLog.
    expect(body).toContain('readSlotLog(src.slotId)');
    // And a failure is SHOWN rather than swallowed. The clipboard fallback it
    // used to name is gone with the clipboard route, so the surviving claim is
    // the stronger one: every outcome carries words for the player.
    expect(body).toContain("status: 'queued'");
    expect(body).toContain("status: 'unchanged'");
    expect(body).toMatch(/message: '/);
  });
});
