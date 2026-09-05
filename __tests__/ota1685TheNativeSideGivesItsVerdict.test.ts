/**
 * OTA-1685 — THE NATIVE SIDE GIVES ITS VERDICT (task #192).
 *
 * Two mid-play kills on 09-05 died inside windows JS cannot see into:
 *   00:20:20  native:cognition:done [q0] · 285ms into "what's going on there?"
 *             · 8.8 min into a life that followed an OTA apply by 160ms
 *   01:31:00  native:voice:done [q0] · 21850ms into an attack on the Cantor
 *             · 152s into a life that followed an OTA apply by 893ms
 * Every fix on the table hangs on one fact JS cannot know: was the process
 * killed by a SIGNAL (a real native fault) or by the OS with no signal
 * (lowmemorykiller)? sentry-android already knows — isCrashedLastRun — and
 * this OTA asks it once per boot and writes the answer onto the death record
 * the ledger minted this boot. Three answers, never two.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { crashReportDsn: 'https://test@sentry.invalid/1', tartariaLine: 'golem' } } },
}));
const mockSentry: { init: jest.Mock; captureEvent: jest.Mock; crashedLastRun?: jest.Mock } = {
  init: jest.fn(), captureEvent: jest.fn(),
};
jest.mock('@sentry/react-native', () => mockSentry, { virtual: true });

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  recordCrash, loadCrashLedger, settleCrashWrites, applyNativeSdkVerdict, sdkVerdictLine,
  crashLedgerSummary, _setCrashLedgerForTests, type CrashRecord,
} from '../app/diagnostics/crashLedger';
import { nativeSdkSawCrashLastRun, toSentryEvent, _resetSentryTransportForTests } from '../app/diagnostics/sentryTransport';

const ROOT = join(__dirname, '..');
const APP = readFileSync(join(ROOT, 'App.tsx'), 'utf8');

const death = (ts: number): Omit<CrashRecord, 'id' | 'build' | 'version'> => ({
  kind: 'native-death', ts, stage: 'native:voice:done',
  message: 'Process died with no orderly exit while: action "attack with the off-hand sentinel cleaver"',
  isFatal: true,
  breadcrumb: { at: ts - 21850, what: 'action "attack"', phase: 'native:voice:done', phaseDetail: 'q0', phaseAt: ts, aliveAt: ts },
  launch: { ageMs: 152574, afterOtaApply: true, otaGapMs: 893, otaPath: 'mid-session' },
});

beforeEach(async () => {
  await AsyncStorage.clear();
  _setCrashLedgerForTests(null);
  _resetSentryTransportForTests();
  delete mockSentry.crashedLastRun;
});

describe('OTA-1685 — ⚠⚠⚠ the SDK is asked, three answers', () => {
  it('returns the native answer when the SDK has one, and null when it does not', async () => {
    mockSentry.crashedLastRun = jest.fn(async () => true);
    expect(await nativeSdkSawCrashLastRun()).toBe(true);
    mockSentry.crashedLastRun = jest.fn(async () => false);
    expect(await nativeSdkSawCrashLastRun()).toBe(false);
    mockSentry.crashedLastRun = jest.fn(async () => null);
    expect(await nativeSdkSawCrashLastRun()).toBeNull();
    delete mockSentry.crashedLastRun;
    expect(await nativeSdkSawCrashLastRun()).toBeNull();
  });

  it('⚠ a throwing SDK is "could not say", never a crash', async () => {
    mockSentry.crashedLastRun = jest.fn(async () => { throw new Error('native gone'); });
    expect(await nativeSdkSawCrashLastRun()).toBeNull();
  });
});

describe('OTA-1685 — ⚠⚠⚠ the verdict lands on the death minted this boot', () => {
  it('a death minted BEFORE the verdict arrives is annotated', async () => {
    recordCrash(death(Date.now() - 60_000));
    await settleCrashWrites();
    const line = await applyNativeSdkVerdict(false);
    expect(line).toContain('crashed=no');
    expect(line).toContain('1 record annotated');
    const [r] = await loadCrashLedger();
    expect(r!.sdkSawCrash).toBe(false);
  });

  it('a death minted AFTER the verdict arrives takes it at mint time', async () => {
    await applyNativeSdkVerdict(true);
    recordCrash(death(Date.now() - 30_000));
    await settleCrashWrites();
    const [r] = await loadCrashLedger();
    expect(r!.sdkSawCrash).toBe(true);
  });

  it('⚠⚠ a record from an EARLIER boot is left alone — nothing is invented about an old death', async () => {
    _setCrashLedgerForTests(null);
    const old: CrashRecord = {
      ...(death(Date.now() - 3_600_000) as CrashRecord), id: 'old_native-death', build: 'b', version: 'v',
      mintedAt: Date.now() - 3_600_000,
    };
    await AsyncStorage.setItem('@tartaria/crashLedger', JSON.stringify([old]));
    const line = await applyNativeSdkVerdict(false);
    expect(line).toBeNull();
    const [r] = await loadCrashLedger();
    expect(r!.sdkSawCrash).toBeUndefined();
  });

  it('a JS-side record never takes the verdict — it is about the native side only', async () => {
    await applyNativeSdkVerdict(true);
    recordCrash({ kind: 'js-fatal', ts: Date.now(), stage: 'x', message: 'boom' });
    await settleCrashWrites();
    const [r] = await loadCrashLedger();
    expect(r!.sdkSawCrash).toBeUndefined();
  });

  it('a "yes" with no death crumb is still said out loud', async () => {
    const line = await applyNativeSdkVerdict(true);
    expect(line).toContain('crashed=yes');
    expect(line).toContain('no death crumb was minted this boot');
    expect(await applyNativeSdkVerdict(false)).toBeNull();
  });
});

describe('OTA-1685 — ⚠⚠ the verdict is printed and carried', () => {
  it('About and the bug report say it under the launch line, in three distinct sentences', async () => {
    recordCrash(death(Date.now() - 10_000));
    await settleCrashWrites();
    await applyNativeSdkVerdict(false);
    const text = crashLedgerSummary();
    const launchAt = text.indexOf('launch: died');
    const verdictAt = text.indexOf('the native SDK saw NO crash');
    expect(launchAt).toBeGreaterThan(-1);
    expect(verdictAt).toBeGreaterThan(launchAt);
    expect(sdkVerdictLine(true)).toContain('SAW A CRASH');
    expect(sdkVerdictLine(null)).toContain('could not say');
    expect(sdkVerdictLine(undefined)).toBeNull();
  });

  it('the Sentry event carries it as nativeSdkSawCrash, with unknown for an unset record', () => {
    const rec = { ...(death(1000) as CrashRecord), id: 'x', build: 'b', version: 'v' };
    expect((toSentryEvent({ ...rec, sdkSawCrash: false }).extra as { nativeSdkSawCrash: string }).nativeSdkSawCrash).toBe('no');
    expect((toSentryEvent({ ...rec, sdkSawCrash: true }).extra as { nativeSdkSawCrash: string }).nativeSdkSawCrash).toBe('yes');
    expect((toSentryEvent(rec).extra as { nativeSdkSawCrash: string }).nativeSdkSawCrash).toBe('unknown');
  });

  it('the boot asks AFTER Sentry is installed and the ledger is loaded, inside a guard', () => {
    const install = APP.indexOf('st.installSentryIfAvailable();');
    const load = APP.indexOf('await cl.loadCrashLedger();');
    const ask = APP.indexOf('const verdict = await st.nativeSdkSawCrashLastRun();');
    const apply = APP.indexOf('const line = await cl.applyNativeSdkVerdict(verdict);');
    expect(install).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(install);
    expect(ask).toBeGreaterThan(load);
    expect(apply).toBeGreaterThan(ask);
  });
});
