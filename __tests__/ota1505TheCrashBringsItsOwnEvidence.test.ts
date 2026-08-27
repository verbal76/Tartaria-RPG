// OTA-1505 — THE CRASH BRINGS ITS OWN EVIDENCE.
//
// ⚠⚠⚠ Owner, 2026-08-26: *"make it so my characters and sasmooches characters
// push the full bundle."* Crash RECORDS have always auto-pushed at boot; the
// full four-attachment bundle — the log that actually closes cases — was a
// manual tap, and the night of 2026-08-25 proved what that costs: four crash
// headlines arrived with no story attached.
//
// Now a slot load on an UNLOCKED device (verbal/sasmooch names, or the
// OTA-1490 sticky device flag) checks the ledger for a crash newer than the
// last one bundled, and pushes the full bundle through the OTA-1504 durable
// pipeline automatically. Players' devices never pass the gate — the
// privacy-page promise (slim crash records only) is untouched for them.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { crashReportDsn: 'https://test@sentry.invalid/1', tartariaLine: 'golem' } } },
}));
const mockSentry: { init: jest.Mock; captureEvent: jest.Mock; flush?: jest.Mock } = {
  init: jest.fn(), captureEvent: jest.fn(),
};
jest.mock('@sentry/react-native', () => mockSentry, { virtual: true });
const mockDisk = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///doc/',
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockDisk.has(uri), uri })),
  readAsStringAsync: jest.fn(async (uri: string) => {
    if (!mockDisk.has(uri)) throw new Error('ENOENT');
    return mockDisk.get(uri)!;
  }),
  writeAsStringAsync: jest.fn(async (uri: string, data: string) => { mockDisk.set(uri, data); }),
  deleteAsync: jest.fn(async (uri: string) => { mockDisk.delete(uri); }),
}));
// The composer's inputs are stubbed so this suite tests the GATE and the
// PIPELINE; the "same stampers as SEND LOG" claim is pinned against source
// below, and the stampers themselves are proven by their own suites.
jest.mock('../app/engine/saveSystem', () => ({
  flushLogWrites: jest.fn(async () => {}),
  readFullLog: jest.fn(async () => 'THE LOG BODY'),
}));
jest.mock('../app/diagnostics/aboutSummary', () => ({
  buildBasicDeviceSummary: jest.fn(() => 'DEVICE SUMMARY'),
  stampLogExport: jest.fn((s: string) => `LOG[${s}]`),
}));
jest.mock('../app/diagnostics/inventorySnapshot', () => ({
  buildInventorySnapshot: jest.fn(() => 'INV'),
  stampInventoryExport: jest.fn((s: string) => `INV[${s}]`),
}));
jest.mock('../app/diagnostics/saveSnapshot', () => ({
  buildSaveSnapshot: jest.fn(() => '{"save":1}'),
  stampSaveExport: jest.fn((s: string) => `SAVE[${s}]`),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import { maybeAutoQueueCrashBundle, AUTO_BUNDLE_MARK_KEY } from '../app/diagnostics/autoBundle';
import { readPendingBundle } from '../app/diagnostics/pendingBundle';
import { _setCrashLedgerForTests, type CrashRecord } from '../app/diagnostics/crashLedger';
import { _resetSentryTransportForTests } from '../app/diagnostics/sentryTransport';
import {
  installCrashTransport, loadReportingPref, CRASH_REPORTING_PREF_KEY,
  _resetCrashReporterForTests,
} from '../app/diagnostics/crashReporter';
import { OWNER_TOOLS_KEY } from '../app/diagnostics/ownerTools';
import type { PlayerCharacter } from '../app/engine/types';

const ROOT = join(__dirname, '..');
const AUTO = readFileSync(join(ROOT, 'app', 'diagnostics', 'autoBundle.ts'), 'utf8');
const SLOT = readFileSync(join(ROOT, 'app', 'state', 'slices', 'slotSlice.ts'), 'utf8');

const asPlayer = (name: string): PlayerCharacter => ({ name } as unknown as PlayerCharacter);
const crash = (ts: number): CrashRecord => ({
  id: `${ts}_native-death`, ts, kind: 'native-death', stage: 'rendered',
  message: 'Process died with no orderly exit while: (no action yet)',
  build: 'test', version: 'test',
});

const armed = async () => {
  await AsyncStorage.clear();
  _resetCrashReporterForTests();
  _resetSentryTransportForTests();
  _setCrashLedgerForTests(null);
  mockSentry.captureEvent.mockClear();
  mockDisk.clear();
  installCrashTransport({ name: 'test', send: async () => {} });
  await loadReportingPref(); // opt-out default → ON
};

afterEach(() => {
  _resetCrashReporterForTests();
  _resetSentryTransportForTests();
  _setCrashLedgerForTests(null);
});

describe('OTA-1505 — who it fires for', () => {
  it('⚠⚠⚠ AN UNLOCK-NAMED CHARACTER WITH A FRESH CRASH PUSHES THE FULL BUNDLE, NO TAP', async () => {
    await armed();
    _setCrashLedgerForTests([crash(7000)]);
    const line = await maybeAutoQueueCrashBundle(asPlayer('Verbal'), {});
    expect(line).toContain('game log pushed automatically');
    expect(mockSentry.captureEvent).toHaveBeenCalledTimes(1);
    const [event, hint] = mockSentry.captureEvent.mock.calls[0] as [
      { message: string }, { attachments: Array<{ filename: string; data: string }> },
    ];
    // ⚠⚠ OTA-1516 NARROWED THE WIRE, DELIBERATELY. The auto-push used to send
    // all four artifacts in ONE envelope, on a device that had just been proven
    // unable to hold a process — the single largest allocation the app makes, at
    // the worst possible moment. It now sends the GAME LOG ALONE, in parts, which
    // is also the payload the owner asked for ("not the inventory or save file or
    // anything else"). The save and inventory are NOT lost: the bundle is still
    // composed and persisted whole to the OTA-1504 slot, pinned just below.
    expect(hint.attachments).toHaveLength(1);
    expect(hint.attachments[0]!.filename).toMatch(/^game-log\.part\d+-of-\d+\.txt$/);
    expect(hint.attachments[0]!.data).toBe('LOG[THE LOG BODY]');
    // Durable: the same bundle sits in the OTA-1504 slot with its id on the event.
    const pending = await readPendingBundle();
    expect(pending).not.toBeNull();
    expect(pending!.attempts).toBe(1);
    expect(event.message).toContain(`#${pending!.id}`);
  });

  it("⚠⚠ sasmooch's characters pass the same gate", async () => {
    await armed();
    _setCrashLedgerForTests([crash(7000)]);
    const line = await maybeAutoQueueCrashBundle(asPlayer('sasmooch the second'), {});
    expect(line).toContain('game log pushed automatically');
  });

  it('⚠⚠ the OTA-1490 sticky device flag fires it for their OTHER characters too', async () => {
    await armed();
    await AsyncStorage.setItem(OWNER_TOOLS_KEY, 'true'); // device once held an unlock name
    _setCrashLedgerForTests([crash(7000)]);
    const line = await maybeAutoQueueCrashBundle(asPlayer('Mudline Karn'), {});
    expect(line).toContain('game log pushed automatically');
  });

  it("⚠⚠⚠ A PLAYER'S DEVICE NEVER AUTO-PUSHES — the privacy promise holds", async () => {
    await armed();
    _setCrashLedgerForTests([crash(7000)]);
    expect(await maybeAutoQueueCrashBundle(asPlayer('Mudline Karn'), {})).toBeNull();
    expect(await maybeAutoQueueCrashBundle(null, {})).toBeNull();
    expect(mockSentry.captureEvent).not.toHaveBeenCalled();
    expect(await readPendingBundle()).toBeNull();
  });

  it('⚠⚠ the crash-reports switch OFF silences it — and does NOT advance the mark', async () => {
    await armed();
    await AsyncStorage.setItem(CRASH_REPORTING_PREF_KEY, 'false');
    _resetCrashReporterForTests();
    installCrashTransport({ name: 'test', send: async () => {} });
    await loadReportingPref();
    _setCrashLedgerForTests([crash(7000)]);
    expect(await maybeAutoQueueCrashBundle(asPlayer('Verbal'), {})).toBeNull();
    expect(mockSentry.captureEvent).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(AUTO_BUNDLE_MARK_KEY)).toBeNull();
    // Switched back on, the crash is still owed — and now it fires.
    await AsyncStorage.removeItem(CRASH_REPORTING_PREF_KEY);
    _resetCrashReporterForTests();
    installCrashTransport({ name: 'test', send: async () => {} });
    await loadReportingPref();
    expect(await maybeAutoQueueCrashBundle(asPlayer('Verbal'), {})).toContain('pushed automatically');
  });
});

describe('OTA-1505 — one crash, one bundle', () => {
  it('⚠⚠⚠ THE MARK: a second slot load does not re-push the same crash', async () => {
    await armed();
    _setCrashLedgerForTests([crash(7000)]);
    expect(await maybeAutoQueueCrashBundle(asPlayer('Verbal'), {})).not.toBeNull();
    mockSentry.captureEvent.mockClear();
    expect(await maybeAutoQueueCrashBundle(asPlayer('Verbal'), {})).toBeNull();
    expect(mockSentry.captureEvent).not.toHaveBeenCalled();
  });

  it('⚠⚠ a NEWER crash re-arms it', async () => {
    await armed();
    _setCrashLedgerForTests([crash(7000)]);
    await maybeAutoQueueCrashBundle(asPlayer('Verbal'), {});
    _setCrashLedgerForTests([crash(7000), crash(9000)]);
    const line = await maybeAutoQueueCrashBundle(asPlayer('Verbal'), {});
    expect(line).toContain('pushed automatically');
    expect(await AsyncStorage.getItem(AUTO_BUNDLE_MARK_KEY)).toBe('9000');
  });

  it('⚠ an empty ledger is a silent no-op', async () => {
    await armed();
    _setCrashLedgerForTests([]);
    expect(await maybeAutoQueueCrashBundle(asPlayer('Verbal'), {})).toBeNull();
    expect(mockSentry.captureEvent).not.toHaveBeenCalled();
  });
});

describe('OTA-1505 — the wiring is honest', () => {
  it('⚠⚠ the composer uses the SAME stampers as SEND LOG — one derivation per artifact', () => {
    expect(AUTO).toContain('log: stampLogExport(fresh),');
    expect(AUTO).toContain('inventory: stampInventoryExport(buildInventorySnapshot(player), device, player?.name),');
    expect(AUTO).toContain('save: stampSaveExport(buildSaveSnapshot(player, worldMemory), device, player?.name),');
    // And the durable order survives review: persist BEFORE send, mark between.
    const persistAt = AUTO.indexOf('persistPendingBundle(bundle)');
    const markAt = AUTO.indexOf('AsyncStorage.setItem(AUTO_BUNDLE_MARK_KEY,');
    const sendAt = AUTO.indexOf('sendGameLogChunked(bundle.log,');
    expect(persistAt).toBeGreaterThan(-1);
    expect(markAt).toBeGreaterThan(persistAt);
    expect(sendAt).toBeGreaterThan(markAt);
  });

  it('⚠⚠ the slot load calls it after the session-start marker, fire-and-forget', () => {
    const hookAt = SLOT.indexOf('ab.maybeAutoQueueCrashBundle(get().player, get().worldMemory)');
    const sessionAt = SLOT.indexOf('OTA session start: ${OTA_BUILD_ID}');
    expect(hookAt).toBeGreaterThan(-1);
    expect(sessionAt).toBeGreaterThan(-1);
    expect(hookAt).toBeGreaterThan(sessionAt);
    // The outcome line lands in the debug log like every other send-log line.
    expect(SLOT).toContain(".then((line) => { if (line) get().appendLog('debug', line); })");
  });
});
