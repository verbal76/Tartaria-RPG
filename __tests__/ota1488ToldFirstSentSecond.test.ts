// OTA-1488 — TOLD FIRST, SENT SECOND.
//
// ⚠⚠ Owner: *"let's have a popup explaining the automatic crash reporting has
// been turned on and explain to them where to turn it off and here is an image
// of where it is so they can visually see where to turn it off. this is just a
// one time pop-up."* — with his own SETTINGS screenshot attached, which is now
// the image inside the popup (cropped, row framed).
//
// ⚠⚠ THE PROPERTY THIS SUITE HOLDS: the notice is not decoration — it GATES
// the first send. App.tsx skips the boot flush while the notice is owed and
// the popup flushes on dismissal, so no player's first report leaves before
// the popup that says it will. Once seen (flag stored), boots flush normally.
// A player with a recorded OFF never sees the popup and never flushes — for
// them OTA-1487 changed nothing and there is nothing to announce.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// A destination, so reportingConfigured() can be true once a transport is
// installed — the notice logic is only reachable on a configured build.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { crashReportDsn: 'https://test@sentry.invalid/1' } } },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  crashNoticeNeeded, markCrashNoticeSeen, CRASH_NOTICE_SEEN_KEY,
  CRASH_REPORTING_PREF_KEY, installCrashTransport, _resetCrashReporterForTests,
} from '../app/diagnostics/crashReporter';
import { between } from '../test-utils/srcBlock';

const ROOT = join(__dirname, '..');
const OVERLAY = readFileSync(join(ROOT, 'app', 'components', 'CrashReportNoticeOverlay.tsx'), 'utf8');
const APP = readFileSync(join(ROOT, 'App.tsx'), 'utf8');

const fresh = async () => {
  await AsyncStorage.removeItem(CRASH_REPORTING_PREF_KEY);
  await AsyncStorage.removeItem(CRASH_NOTICE_SEEN_KEY);
  _resetCrashReporterForTests();
  installCrashTransport({ name: 'test', send: async () => {} });
};

afterEach(() => _resetCrashReporterForTests());

describe('OTA-1488 — who is owed the notice', () => {
  it('⚠⚠ a fresh, configured install is owed it exactly until it is seen', async () => {
    await fresh();
    expect(await crashNoticeNeeded()).toBe(true);
    await markCrashNoticeSeen();
    expect(await crashNoticeNeeded()).toBe(false);
    // And the flag PERSISTS — reload the module state, still not owed.
    _resetCrashReporterForTests();
    installCrashTransport({ name: 'test', send: async () => {} });
    expect(await crashNoticeNeeded()).toBe(false);
  });

  it('⚠⚠ a recorded OFF is never nagged — nothing changed for them', async () => {
    await fresh();
    await AsyncStorage.setItem(CRASH_REPORTING_PREF_KEY, 'false');
    _resetCrashReporterForTests();
    installCrashTransport({ name: 'test', send: async () => {} });
    expect(await crashNoticeNeeded()).toBe(false);
  });

  it('⚠ an unconfigured build shows nothing — there is no delivery to announce', async () => {
    await fresh();
    installCrashTransport(null);
    expect(await crashNoticeNeeded()).toBe(false);
  });
});

describe('OTA-1488 — the notice gates the first send', () => {
  it('⚠⚠ App.tsx boot flush is skipped while the notice is owed', () => {
    // The ota1380 pin that the boot path flushes still holds — the call is
    // there — but it now sits behind the notice check.
    expect(APP).toContain('if (!(await cr.crashNoticeNeeded())) await cr.flushCrashReports();');
  });

  it('⚠⚠ KEEP ON marks seen and THEN flushes — the popup is the release valve', () => {
    const keep = between(OVERLAY, 'const keepOn = () => {', 'const turnOff');
    const seenAt = keep.indexOf('markCrashNoticeSeen()');
    const flushAt = keep.indexOf('flushCrashReports()');
    expect(seenAt).toBeGreaterThan(-1);
    expect(flushAt).toBeGreaterThan(seenAt);
  });

  it('⚠⚠ TURN OFF stores the preference BEFORE the seen-flag — a kill between the two writes can never produce a boot that flushes', () => {
    const off = between(OVERLAY, 'const turnOff = () => {', '};');
    const prefAt = off.indexOf('setReportingEnabled(false)');
    const seenAt = off.indexOf('markCrashNoticeSeen()');
    expect(prefAt).toBeGreaterThan(-1);
    expect(seenAt).toBeGreaterThan(prefAt);
  });
});

describe('OTA-1488 — the popup says and shows what the owner asked', () => {
  it('⚠ it names the path to the switch — screen, tab, section, in order', () => {
    // Claim-level, not copy-level: the three landmarks appear in walking order.
    expect(OVERLAY).toMatch(/SETTINGS[\s\S]{0,30}SESSION[\s\S]{0,30}REPORTING/);
  });

  it('⚠⚠ the image is the real screenshot, shipped and required', () => {
    expect(OVERLAY).toContain("require('../../assets/crash-notice-where.png')");
    const asset = join(ROOT, 'assets', 'crash-notice-where.png');
    expect(existsSync(asset)).toBe(true);
    expect(statSync(asset).size).toBeGreaterThan(10_000); // a real image, not a stub
  });

  it('⚠ it offers BOTH answers as buttons, and says it appears only once', () => {
    expect(OVERLAY).toContain('TURN OFF');
    expect(OVERLAY).toContain('KEEP ON');
    // The one-time promise, as a claim rather than the sentence's spelling.
    expect(OVERLAY).toMatch(/notice once|one[- ]?time/i);
  });

  it('⚠⚠ the screenshot is sized in WINDOW pixels, never a bare percentage', () => {
    // The first shipped cut styled it `width: '100%'` inside a card with no
    // determinate width, so RN used the image's NATIVE 1020px and the owner
    // got one corner of a 2.4×-screen-wide picture ("waaaaaaaay to big").
    expect(OVERLAY).toContain('useWindowDimensions');
    expect(OVERLAY).toContain('{ width: shotW, height: shotH }');
    expect(OVERLAY).not.toMatch(/shot:\s*\{[^}]*width:\s*'100%'/);
  });

  it('⚠ it is mounted globally in App.tsx, inside a SilentBoundary', () => {
    expect(APP).toContain('<CrashReportNoticeOverlay />');
    expect(between(APP, 'SilentBoundary tag="CrashReportNoticeOverlay"', '</SilentBoundary>'))
      .toContain('<CrashReportNoticeOverlay />');
  });
});
