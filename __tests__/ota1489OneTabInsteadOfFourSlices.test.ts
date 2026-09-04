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
    expect(ABOUT).toContain('{crashConfigured && (');
    expect(ABOUT).not.toContain('{ownerTools && crashConfigured && (');
  });

  it('⚠⚠ the gate function itself: owner names pass, a player name does not', () => {
    expect(sharingUnlockedFor('Verbal')).toBe(true);
    expect(sharingUnlockedFor('sasmooch the second')).toBe(true);
    expect(sharingUnlockedFor('Mudline Karn')).toBe(false);
    expect(sharingUnlockedFor(null)).toBe(false);
  });

  it('⚠⚠ every part is composed by the SAME function its COPY button uses', () => {
    // One derivation per artifact: what arrives at Sentry can never disagree
    // with what the corresponding clipboard export would have said.
    const body = between(ABOUT, 'async function handleSendLog()', 'async function handleCopyLog()');
    const flushAt = body.indexOf('flushLogWrites()');
    const readAt = body.indexOf('readFullLog()');
    expect(flushAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(flushAt);
    expect(body).toContain('log: stampLogExport(fresh),');
    expect(body).toContain('inventory: stampInventoryExport(buildInventorySnapshot(s.player), device, s.player?.name),');
    expect(body).toContain('save: stampSaveExport(buildSaveSnapshot(s.player, s.worldMemory), device, s.player?.name),');
    expect(body).toContain('device,');
    // And a failure is SHOWN, with the clipboard path named as the fallback —
    // claim-level: the failed state's text points at COPY LOG, however worded.
    expect(ABOUT).toMatch(/FAILED[^']{0,40}COPY LOG/);
  });
});
