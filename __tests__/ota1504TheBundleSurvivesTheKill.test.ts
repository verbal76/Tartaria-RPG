// OTA-1504 — THE BUNDLE SURVIVES THE KILL.
//
// ⚠⚠⚠ THE MEASURED DEFECT, from the owner's pasted bug reports (2026-08-25,
// Pixel 10 Pro XL, both installs): every SEND LOG bundle that night died
// client-side. His own theory named the mechanism — *"maybe me sending logs
// then force closing it caused the after crashes"* — and the ledgers agree:
// four native-death receipts each seconds after a send, while the relay's
// outcomes ledger shows ZERO server-side drops. Two failure modes, both
// proven in his own log lines:
//   · `send-log: FAILED - envelope did not go out`  (flush answered false)
//   · `send-log: flushed to Sentry` with NO event ever arriving (flush LIED)
//
// So the bundle becomes durable: written to disk BEFORE the first send, and
// re-sent once per boot until MAX_SEND_ATTEMPTS is spent — regardless of what
// flush() answered, because its yes has been caught lying and no client-side
// signal is receipt.
//
// ⚠ OTA-1682 amended the last clause: on the inline path, with the transport's
// own refusals counted into `delivered`, that verdict IS receipt, and a
// delivered bundle is cleared instead of re-sent. The retry keeps the bundle
// that did not go. See the re-anchored pin below.
//
// ⚠⚠ AND THE DEATHS THEMSELVES WERE MISDATED. The native-death record carried
// the ACTION's timestamp (`crumb.at`), not the last sign of life (`phaseAt`).
// His 15:08 record wore `ctx-release (+2,639,101ms)` — the action was 44
// MINUTES old at the last stamp, and the record still read "died doing that,
// at that time". TARTARIA-2 (the tuning-fork alert) burned a night on exactly
// this: the record said "mid-attack at 22:13" when the truth the crumb holds
// is "last seen alive at 22:13:44, dead sometime before the 22:15 boot".

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
// In-memory document directory + an operation journal, so the tests can assert
// ORDER (the attempt is burned to disk before the envelope goes out).
const mockDisk = new Map<string, string>();
const mockOps: string[] = [];
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///doc/',
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockDisk.has(uri), uri })),
  readAsStringAsync: jest.fn(async (uri: string) => {
    if (!mockDisk.has(uri)) throw new Error('ENOENT');
    return mockDisk.get(uri)!;
  }),
  writeAsStringAsync: jest.fn(async (uri: string, data: string) => {
    mockOps.push('write');
    mockDisk.set(uri, data);
  }),
  deleteAsync: jest.fn(async (uri: string) => { mockOps.push('delete'); mockDisk.delete(uri); }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  persistPendingBundle, readPendingBundle, clearPendingBundle, retryPendingBundleAtBoot,
  MAX_SEND_ATTEMPTS, PENDING_BUNDLE_FILE, type PendingBundle,
} from '../app/diagnostics/pendingBundle';
import { _resetSentryTransportForTests } from '../app/diagnostics/sentryTransport';
import {
  installCrashTransport, loadReportingPref, CRASH_REPORTING_PREF_KEY,
  _resetCrashReporterForTests,
} from '../app/diagnostics/crashReporter';
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
const APP = readFileSync(join(ROOT, 'App.tsx'), 'utf8');
const BOOT = readFileSync(join(ROOT, 'app', 'state', 'slices', 'bootSlice.ts'), 'utf8');
const PRESSURE = readFileSync(join(ROOT, 'app', 'diagnostics', 'runtimePressure.ts'), 'utf8');

const URI = 'file:///doc/' + PENDING_BUNDLE_FILE;
const BUNDLE = { log: 'L', inventory: 'I', save: '{}', device: 'D' };

const armed = async () => {
  await AsyncStorage.removeItem(CRASH_REPORTING_PREF_KEY);
  _resetCrashReporterForTests();
  _resetSentryTransportForTests();
  mockSentry.captureEvent.mockClear();
  mockSentry.captureEvent.mockImplementation(() => { mockOps.push('send'); });
  delete mockSentry.flush;
  installCrashTransport({ name: 'test', send: async () => {} });
  await loadReportingPref(); // opt-out default → ON
};

const plant = (rec: Partial<PendingBundle>) => {
  mockDisk.set(URI, JSON.stringify({
    id: 'zz99', createdAt: 5, attempts: 1, bundle: BUNDLE, ...rec,
  }));
};

beforeEach(() => { mockDisk.clear(); mockOps.length = 0; });
afterEach(() => { _resetCrashReporterForTests(); _resetSentryTransportForTests(); delete mockSentry.flush; });

describe('OTA-1504 — the bundle is on disk before anything is sent', () => {
  it('⚠⚠ persist writes attempts:1 (the tap itself is the first attempt) and round-trips', async () => {
    const rec = await persistPendingBundle(BUNDLE);
    expect(rec).not.toBeNull();
    expect(rec!.attempts).toBe(1);
    expect(rec!.id.length).toBeGreaterThan(4);
    const back = await readPendingBundle();
    expect(back).toEqual(rec);
  });

  it('⚠⚠ latest wins — a second tap overwrites, it does not queue', async () => {
    const a = await persistPendingBundle(BUNDLE);
    const b = await persistPendingBundle({ ...BUNDLE, log: 'NEWER' });
    expect(b!.id).not.toBe(a!.id);
    const back = await readPendingBundle();
    expect(back!.bundle.log).toBe('NEWER');
    expect(mockDisk.size).toBe(1);
  });

  it('⚠ a garbage or absent file reads as null, never a throw', async () => {
    expect(await readPendingBundle()).toBeNull();
    mockDisk.set(URI, 'not json {');
    expect(await readPendingBundle()).toBeNull();
    mockDisk.set(URI, JSON.stringify({ id: 'x', attempts: 1, bundle: { log: 'L' } }));
    expect(await readPendingBundle()).toBeNull(); // shape check: partial bundle refused
    await clearPendingBundle();
    expect(mockDisk.size).toBe(0);
  });

  it('⚠⚠ the push persists BEFORE it sends, and reports the queued state honestly', () => {
    // ⚠ RE-ANCHORED for OTA-1665. This read AboutScreen's `handleSendLog`, which
    // is deleted along with the SEND LOG button; the one push is now REPORT A
    // BUG, in diagnostics/bugReport.ts. OTA-1515 changed WHAT is sent, OTA-1518
    // changed HOW, OTA-1665 changed WHICH BUTTON — and none of them changed this
    // ORDER, which is the whole point of the pin: the durable copy is on disk
    // before anything crosses the wire, so the owner's swipe-away habit is free.
    const body = BUTTON.slice(BUTTON.indexOf('export async function composeAndSendBugReport'));
    const persistAt = body.indexOf('persistPendingBundle({');
    const sendAt = body.indexOf('sendGameLogInline(report, pendingId)');
    expect(persistAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(persistAt);
    // The outcomes stay distinct: sent, saved-for-retry, and the refusals.
    expect(body).toContain("status: 'sent'");
    expect(body).toContain("status: 'queued'");
    expect(body).toMatch(/Saved on this device and queued/);
  });

  it('⚠ an empty disk is a silent no-op — no send, no line', async () => {
    await armed();
    expect(await retryPendingBundleAtBoot()).toBeNull();
    expect(mockSentry.captureEvent).not.toHaveBeenCalled();
  });

  it('⚠⚠ delivery OFF holds the bundle without burning an attempt', async () => {
    await armed();
    await AsyncStorage.setItem(CRASH_REPORTING_PREF_KEY, 'false');
    _resetCrashReporterForTests();
    installCrashTransport({ name: 'test', send: async () => {} });
    await loadReportingPref();
    plant({ attempts: 2 });
    const line = await retryPendingBundleAtBoot();
    expect(line).toContain('delivery is off, kept');
    expect((await readPendingBundle())!.attempts).toBe(2); // unchanged
    expect(mockSentry.captureEvent).not.toHaveBeenCalled();
  });

  it('⚠⚠⚠ THE ATTEMPT IS BURNED TO DISK BEFORE THE ENVELOPE GOES OUT — a kill mid-send cannot reset the counter', async () => {
    await armed();
    plant({ attempts: 1 });
    mockOps.length = 0;
    await retryPendingBundleAtBoot();
    expect(mockOps.indexOf('write')).toBeGreaterThan(-1);
    expect(mockOps.indexOf('send')).toBeGreaterThan(mockOps.indexOf('write'));
  });

  it('⚠⚠⚠ A DELIVERED RETRY CLEARS THE FILE — the contract OTA-1682 reversed, on purpose', async () => {
    // ⚠ THIS PIN USED TO SAY THE OPPOSITE: "a flush that answers true still
    // keeps the file — flush()===true has been caught lying". It had, on the
    // ATTACHMENT path, in August. OTA-1519 moved every sender to the inline
    // path and proved flush honest there; OTA-1682 found the one way that path
    // still lied (the transport's thirty-deep buffer refusing parts captureEvent
    // had accepted) and put the refusal count into `delivered`. With that,
    // delivered is receipt, and the re-send that followed every delivered
    // bundle each boot was the duplicate the owner watched land three and four
    // times on 09-05. The retry is for the bundle that did NOT go.
    await armed();
    mockSentry.flush = jest.fn().mockResolvedValue(true);
    plant({ attempts: 1 });
    const line = await retryPendingBundleAtBoot();
    expect(line).toContain(`attempt 2/${MAX_SEND_ATTEMPTS} delivered to Sentry`);
    expect(line).toContain('cleared from disk');
    expect(await readPendingBundle()).toBeNull();
  });

  it('⚠⚠ the re-send carries the SAME id and its attempt number, so the relay reader can dedupe', async () => {
    await armed();
    plant({ id: 'abc123', attempts: 1 });
    await retryPendingBundleAtBoot();
    const [event] = mockSentry.captureEvent.mock.calls[0] as [
      { message: string; tags: Record<string, string> },
    ];
    expect(event.message).toContain('#abc123');
    expect(event.tags.bundleId).toBe('abc123');
    expect(event.tags.sendAttempt).toBe('2');
  });

  it('⚠ a tap-path send WITHOUT a persisted record keeps the plain unstamped message', async () => {
    await armed();
    const { sendDiagnosticsBundle } = require('../app/diagnostics/sentryTransport') as
      typeof import('../app/diagnostics/sentryTransport');
    await sendDiagnosticsBundle(BUNDLE);
    const [event] = mockSentry.captureEvent.mock.calls[0] as [{ message: string; tags: Record<string, string> }];
    expect(event.message).not.toContain('#');
    expect(event.tags.bundleId).toBeUndefined();
  });

  it('⚠⚠ the final attempt clears the file — win or lose, the retrying ends', async () => {
    await armed();
    plant({ attempts: MAX_SEND_ATTEMPTS - 1 });
    const line = await retryPendingBundleAtBoot();
    // ⚠ OTA-1682 — a WIN now clears on its own ("cleared from disk"); the
    // "final try, cleared" wording is the LOSS on the last attempt. Either way
    // the claim holds: the file is gone and the retrying ends.
    expect(line).toMatch(/cleared from disk|final try, cleared/);
    // ⚠ OTA-1519 — beacon + one inline part. The attempt ACCOUNTING this pins
    // (the last try clears the file, win or lose) is untouched.
    expect(mockSentry.captureEvent).toHaveBeenCalledTimes(2);
    expect(await readPendingBundle()).toBeNull();
  });

  it('⚠ a file that arrives already spent is cleared without another send', async () => {
    await armed();
    plant({ attempts: MAX_SEND_ATTEMPTS });
    const line = await retryPendingBundleAtBoot();
    expect(line).toContain(`spent all ${MAX_SEND_ATTEMPTS} attempts — cleared`);
    expect(mockSentry.captureEvent).not.toHaveBeenCalled();
    expect(await readPendingBundle()).toBeNull();
  });

  it('⚠⚠ App.tsx runs the retry behind the SAME told-first gate as the crash flush', () => {
    // OTA-1488's promise — nothing leaves the device before the one-time
    // notice — governs every send, the durable retry included.
    const at = APP.indexOf('retryPendingBundleAtBoot()');
    expect(at).toBeGreaterThan(-1);
    const gate = APP.lastIndexOf('if (!(await cr.crashNoticeNeeded()))', at);
    expect(gate).toBeGreaterThan(-1);
    // ⚠ OTA-1512 — WAS a byte-distance check (`at - gate < 700`), which is the
    // brittle shape this repo has a ratchet against: adding the OTA-resolved
    // wait between the gate and the call broke it while the CLAIM — the retry
    // runs inside the told-first block — stayed true the whole time. Assert the
    // structure instead: nothing between them re-opens or closes that block.
    const GATE = 'if (!(await cr.crashNoticeNeeded()))';
    const between = APP.slice(gate + GATE.length, at);
    expect(between).not.toContain('crashNoticeNeeded');   // no second gate opened
    expect(between).not.toMatch(/\n {6}\}/);              // and this one never closed
    // ⚠⚠ OTA-1512 — and it now waits on the OTA verdict as well, so an attempt
    // is never spent on a process that is about to reloadAsync.
    expect(between).toContain('otaBootResolved');
    // And the outcome line lands in the log, where every send-log line lives.
    expect(APP).toContain("if (line) useGameStore.getState().appendLog('debug', line);");
  });
});

describe('OTA-1504 — the death is dated at the last sign of life', () => {
  it('⚠⚠⚠ THE LEDGER RECORD USES phaseAt, NOT THE ACTION START — the 44-minute misdating dies here', () => {
    const block = between(BOOT, "kind: 'native-death'", 'breadcrumb: crumb,');
    expect(block).toContain('ts: lastAlive,');
    // ⚠ RETARGETED BY OTA-1567. This OTA's whole point — date the death at the
    // LAST SIGN OF LIFE rather than at the action's start — is unchanged and is
    // what this still pins. What changed is that the last sign of life is no
    // longer whichever checkpoint happened to survive being overwritten: the
    // `rendered` heartbeat now keeps its own `aliveAt`, so the record reads the
    // later of the two instead of the one the heartbeat left standing.
    expect(BOOT).toContain('const lastAlive = crumb.aliveAt ?? crumb.phaseAt ?? crumb.at;');
  });

  it('⚠⚠ an action standing longer than 2 minutes at the last stamp is CALLED stale in the record', () => {
    expect(BOOT).toContain('(staleMs > 120_000');
    expect(BOOT).toContain('life; treat the action label as stale, not as the killer');
    // The boot debug line got the same correction — one crumb, every door.
    expect(BOOT).toContain(
      'last boot ended mid-action — ${crumb.what} @ ${crumb.room ?? \'?\'} (${new Date(crumb.phaseAt ?? crumb.at).toISOString()})',
    );
  });

  it('⚠⚠ the About/bug-report block measures "before this boot" from the last stamp too', () => {
    expect(PRESSURE).toContain('const lastAlive = rpLastBreadcrumb.phaseAt ?? rpLastBreadcrumb.at;');
    expect(PRESSURE).toContain('Last seen alive: ${new Date(lastAlive).toISOString()}');
    expect(PRESSURE).toContain('— the kill landed somewhere in that gap)');
  });
});
