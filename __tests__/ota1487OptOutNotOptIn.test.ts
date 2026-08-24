// OTA-1487 — OPT OUT, NOT OPT IN.
//
// ⚠⚠ Owner, verbatim, 2026-08-24: *"make it an opt out, not an opt in"* — the
// deliberate overturning of his own OTA-1380 ruling, given after being told the
// change would flip the default for everyone on the live channel. Crash
// delivery now starts ON; the Settings switch turns it off.
//
// ⚠⚠ THE THREE PROMISES THAT MAKE AN OPT-OUT HONEST, each pinned below:
//   1. An explicit OFF is absolute — a stored 'false', from ANY version, wins
//      over the new default forever. Nobody who said no is re-enrolled.
//   2. Before the stored preference has been read, nothing sends — the
//      in-memory seed stays false, so an opt-out cannot lose a race with a
//      boot-time flush.
//   3. The privacy policy moved in the SAME commit (ota1401's suite pins its
//      wording): a policy that says "off until you turn it on" over an
//      opt-out build is a lie with a document attached.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  loadReportingPref, setReportingEnabled, reportingOptedIn, reportingEnabled,
  installCrashTransport, flushCrashReports, CRASH_REPORTING_PREF_KEY,
  _resetCrashReporterForTests,
} from '../app/diagnostics/crashReporter';
import { recordCrash, _setCrashLedgerForTests } from '../app/diagnostics/crashLedger';

const fresh = async () => {
  await AsyncStorage.removeItem(CRASH_REPORTING_PREF_KEY);
  _resetCrashReporterForTests();
};

afterEach(() => _resetCrashReporterForTests());

describe('OTA-1487 — the default is ON', () => {
  it('⚠⚠ a fresh install (no stored answer) loads as opted in', async () => {
    await fresh();
    expect(await loadReportingPref()).toBe(true);
    expect(reportingOptedIn()).toBe(true);
  });

  it('⚠ a stored yes stays yes', async () => {
    await fresh();
    await AsyncStorage.setItem(CRASH_REPORTING_PREF_KEY, 'true');
    _resetCrashReporterForTests();
    expect(await loadReportingPref()).toBe(true);
  });
});

describe('OTA-1487 — an explicit OFF is absolute', () => {
  it('⚠⚠ a stored no, from any version, beats the new default', async () => {
    await fresh();
    await AsyncStorage.setItem(CRASH_REPORTING_PREF_KEY, 'false');
    _resetCrashReporterForTests();
    expect(await loadReportingPref()).toBe(false);
    expect(reportingOptedIn()).toBe(false);
  });

  it('⚠⚠ switching off round-trips: the choice survives a reload', async () => {
    await fresh();
    await loadReportingPref();
    await setReportingEnabled(false);
    _resetCrashReporterForTests();
    expect(await loadReportingPref()).toBe(false);
  });
});

describe('OTA-1487 — the default cannot outrun the stored answer', () => {
  it('⚠⚠ before the pref is read, nothing is opted in and nothing sends', async () => {
    // The seed is the RACE GUARD, not the policy: a boot-time flush that ran
    // before AsyncStorage answered would otherwise send under the new default
    // while an explicit opt-out sat unread on disk.
    await fresh();
    await AsyncStorage.setItem(CRASH_REPORTING_PREF_KEY, 'false');
    _resetCrashReporterForTests();
    const sent: unknown[] = [];
    installCrashTransport({ name: 'test', send: async (r) => { sent.push(r); } });
    _setCrashLedgerForTests([]);
    recordCrash({ kind: 'js-fatal', stage: 's', message: 'boom', ts: 1 });
    expect(reportingOptedIn()).toBe(false);
    expect(reportingEnabled()).toBe(false);
    expect(await flushCrashReports()).toBe(0);
    expect(sent).toEqual([]);
  });

  it('⚠ a pref that cannot be READ is treated as a possible no', () => {
    // Source pin: the catch branch must default false — a read error might be
    // hiding an explicit opt-out, and guessing "on" there overrides a recorded
    // no. The next successful read restores the real answer.
    const src = readFileSync(join(__dirname, '..', 'app', 'diagnostics', 'crashReporter.ts'), 'utf8');
    const loadFn = src.slice(src.indexOf('export async function loadReportingPref'));
    const catchAt = loadFn.indexOf('} catch {');
    expect(catchAt).toBeGreaterThan(-1);
    expect(loadFn.slice(catchAt, catchAt + 400)).toContain('optedIn = false;');
    // And the live reading is the opt-out one.
    expect(loadFn).toContain("optedIn = raw !== 'false';");
  });
});
