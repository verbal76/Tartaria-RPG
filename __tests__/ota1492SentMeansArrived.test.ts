// OTA-1492 — SENT MEANS ARRIVED.
//
// ⚠⚠ THE MEASURED DEFECT: the owner tapped SEND LOG three times, the button
// reported success, and the Sentry inbox sync found ZERO player-log events
// server-side — while six crash-ledger reports sat right there proving the
// pipeline itself works. captureEvent only QUEUES an envelope; returning true
// at that point reports delivery that has not happened. The SDK's flush()
// pushes the queue out and answers whether everything went — so the button's
// "SENT" now means the envelope left the device, and a failure is shown as a
// failure with the outcome written to the log either way.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { crashReportDsn: 'https://test@sentry.invalid/1', tartariaLine: 'golem' } } },
}));
const mockSentry: {
  init: jest.Mock; captureEvent: jest.Mock; flush?: jest.Mock;
} = { init: jest.fn(), captureEvent: jest.fn() };
jest.mock('@sentry/react-native', () => mockSentry, { virtual: true });

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sendDiagnosticsBundle, _resetSentryTransportForTests } from '../app/diagnostics/sentryTransport';
import {
  installCrashTransport, loadReportingPref, CRASH_REPORTING_PREF_KEY,
  _resetCrashReporterForTests,
} from '../app/diagnostics/crashReporter';

const BUNDLE = { log: 'L', inventory: 'I', save: '{}', device: 'D' };

const armed = async () => {
  await AsyncStorage.removeItem(CRASH_REPORTING_PREF_KEY);
  _resetCrashReporterForTests();
  _resetSentryTransportForTests();
  mockSentry.captureEvent.mockClear();
  delete mockSentry.flush;
  installCrashTransport({ name: 'test', send: async () => {} });
  await loadReportingPref();
};

afterEach(() => { _resetCrashReporterForTests(); _resetSentryTransportForTests(); delete mockSentry.flush; });

describe('OTA-1492 — the send answers with DELIVERY, not with queueing', () => {
  it('⚠⚠ a flush that reports failure makes the send report failure', async () => {
    await armed();
    mockSentry.flush = jest.fn().mockResolvedValue(false);
    expect(await sendDiagnosticsBundle(BUNDLE)).toBe(false);
    expect(mockSentry.captureEvent).toHaveBeenCalledTimes(1); // queued, but not delivered
    expect(mockSentry.flush).toHaveBeenCalled();
  });

  it('⚠⚠ a flush that reports success makes the send report success', async () => {
    await armed();
    mockSentry.flush = jest.fn().mockResolvedValue(true);
    expect(await sendDiagnosticsBundle(BUNDLE)).toBe(true);
    expect(mockSentry.flush).toHaveBeenCalledWith(10_000);
  });

  it('⚠ an SDK without flush keeps the old queue-and-hope answer, not a crash', async () => {
    await armed();
    expect(await sendDiagnosticsBundle(BUNDLE)).toBe(true);
  });
});

describe('OTA-1492 — the outcome is written down on-device', () => {
  it('⚠ handleSendLog logs the result either way — the next diagnosis starts from a line, not a memory', () => {
    const about = readFileSync(join(__dirname, '..', 'app', 'screens', 'AboutScreen.tsx'), 'utf8');
    expect(about).toMatch(/appendLog\('debug', `send-log: \$\{ok \? /);
  });
});
