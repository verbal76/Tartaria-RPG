/**
 * ABOUT IS FOR HUMANS. COPY ALL IS FOR TROUBLESHOOTING.
 *
 * The visible About block is a short labelled release identity; the engineering
 * dump is still gathered and still copied. This suite pins both halves, and
 * that nothing secret can reach the clipboard report.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildAboutIdentity,
  buildAboutIdentityText,
  collectAboutFacts,
  shortSha,
  type AboutFacts,
} from '../app/diagnostics/aboutIdentity';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

const FULL_SHA = '0123456789abcdef0123456789abcdef01234567';
const base: AboutFacts = {
  appName: 'Tartaria Realms',
  appVersion: '4.32.11',
  nativeVersionName: '2.5.0',
  packageId: 'com.hotatticgames.tartarprim',
  runtimeVersion: '2.5.0',
  nativeBuild: '476',
  aabCodename: 'Some AAB',
  deviceName: 'Pixel 8',
  osName: 'android',
  osRelease: '15',
  apiLevel: 35,
  locale: 'en-US',
  timezone: 'America/Chicago',
  otaCodename: 'Quiet Anvil',
  otaBuildId: '2026-09-27-1889-the-native-door-never-trades-the-save',
  channel: 'hal2001',
  updateId: '019e836b-cd5f-70fc-0000-000000000000',
  updateCreatedAt: '2026-09-27T12:00:00.000Z',
  isEmbedded: false,
  updatesEnabled: true,
  isEmergencyLaunch: false,
  emergencyReason: null,
  manifestId: '019e836b-cd5f-70fc-0000-000000000000',
  launchAssetHash: 'abc123hash',
  sourceSha: FULL_SHA,
  updateStaged: false,
  updateApplying: false,
  capturedAt: '2026-10-03T00:00:00.000Z',
};

const rows = (f: AboutFacts) => Object.fromEntries(
  buildAboutIdentity(f).flatMap((s) => s.rows.map((r) => [`${s.title}/${r.label}`, r.value])),
);

describe('visible About — clean release identity', () => {
  it('shows application, install, device and update identity, and only that', () => {
    const sections = buildAboutIdentity(base);
    expect(sections.map((s) => s.title)).toEqual(['APPLICATION', 'INSTALL', 'DEVICE', 'UPDATE']);
    const r = rows(base);
    expect(r['APPLICATION/Game']).toBe('Tartaria Realms');
    expect(r['APPLICATION/Version']).toBe('4.32.11');
    expect(r['INSTALL/Package']).toBe('com.hotatticgames.tartarprim');
    expect(r['INSTALL/Runtime']).toBe('2.5.0');
    expect(r['INSTALL/Build']).toBe('476');
    expect(r['DEVICE/Device']).toBe('Pixel 8');
    expect(r['DEVICE/System']).toBe('Android 15 (API 35)');
    expect(r['UPDATE/Running']).toBe('Quiet Anvil');
    expect(r['UPDATE/Source']).toBe('Downloaded update');
    expect(r['UPDATE/Channel']).toBe('hal2001');
    expect(r['UPDATE/Status']).toBe('Up to date as of the last check');
  });

  it('is short — the telemetry dump is not painted', () => {
    const rowCount = buildAboutIdentity(base).reduce((n, s) => n + s.rows.length, 0);
    expect(rowCount).toBeLessThanOrEqual(14);
    const visible = JSON.stringify(buildAboutIdentity(base));
    for (const deep of ['Hermes', 'onnx', 'Qwen', 'MiniLM', 'Sentry', 'Boot stage', 'Memory timeline', 'Touch path', 'Crash ledger', 'Embedding dim']) {
      expect(visible).not.toContain(deep);
    }
  });

  it('shortens the SHA visually only when the bundle carries one, and omits the row otherwise', () => {
    expect(rows(base)['UPDATE/Source SHA']).toBe('0123456');
    expect(shortSha(FULL_SHA)).toBe('0123456');
    expect(rows({ ...base, sourceSha: null })['UPDATE/Source SHA']).toBeUndefined();
  });

  it('missing values fail gracefully as an em dash, never throw', () => {
    const empty: AboutFacts = {
      ...base, packageId: null, runtimeVersion: null, nativeBuild: null, deviceName: null,
      channel: null, osRelease: null, apiLevel: null, isEmbedded: null, updatesEnabled: null,
    };
    const r = rows(empty);
    expect(r['INSTALL/Package']).toBe('—');
    expect(r['INSTALL/Build']).toBe('—');
    expect(r['DEVICE/Device']).toBe('—');
    expect(r['UPDATE/Source']).toBe('—');
    expect(() => buildAboutIdentityText(empty)).not.toThrow();
  });

  it('update status follows real state', () => {
    expect(rows({ ...base, updateStaged: true })['UPDATE/Status']).toBe('Update downloaded — applies on next open');
    expect(rows({ ...base, updateApplying: true })['UPDATE/Status']).toBe('Applying update');
    expect(rows({ ...base, updatesEnabled: false })['UPDATE/Status']).toBe('Updates are off in this build');
    expect(rows({ ...base, isEmergencyLaunch: true })['UPDATE/Status']).toBe('Recovered to the built-in version');
  });

  it('iOS reads as iOS, not Android', () => {
    const r = rows({ ...base, osName: 'ios', osRelease: '17.4', apiLevel: null });
    expect(r['DEVICE/System']).toBe('iOS 17.4');
  });
});

describe('COPY ALL — the full report', () => {
  const text = buildAboutIdentityText(base);

  it('carries every identity field uncut, including the full SHA', () => {
    for (const must of [
      'com.hotatticgames.tartarprim', '4.32.11', '2.5.0', 'versionCode', '476', 'Pixel 8',
      'API level: 35', 'en-US', 'America/Chicago', '2026-10-03T00:00:00.000Z',
      'Quiet Anvil', base.otaBuildId, base.updateId!, 'hal2001', base.updateCreatedAt!,
      'downloaded OTA', 'abc123hash', FULL_SHA,
    ]) expect(text).toContain(must);
  });

  it('says plainly when the bundle carries no source SHA instead of inventing one', () => {
    expect(buildAboutIdentityText({ ...base, sourceSha: null })).toContain('not embedded in this bundle');
  });

  it('contains no secret material', () => {
    expect(text).not.toMatch(/password|secret|token|private key|BEGIN [A-Z ]*KEY|keystore|dsn|@o\d+\.ingest/i);
  });
});

describe('wiring in AboutScreen', () => {
  const about = src('app', 'screens', 'AboutScreen.tsx');

  it('paints the identity, not the diagnostic string', () => {
    expect(about).not.toContain('{info}</Text>');
    expect(about).toContain('identity.map((sec)');
  });

  it('the seven-tap owner ritual still rides on the identity block', () => {
    const i = about.indexOf('style={styles.identityBlock}');
    expect(i).toBeGreaterThan(0);
    expect(about.slice(i, i + 200)).toContain('onPress={handleOwnerTap}');
  });

  it('COPY ALL still copies `info`, which leads with the full identity and keeps every deep block', () => {
    expect(about).toContain('await Clipboard.setStringAsync(info);');
    const lead = about.indexOf('buildAboutIdentityText(collectAboutFacts({');
    expect(lead).toBeGreaterThan(about.indexOf('const info = useMemo'));
    for (const kept of [
      'buildBasicDeviceSummary()', '`OTA status`', '`Cognitive layer (classifier)`',
      '`Qwen generator (Arbiter narration)`', '`Classifier model`', '`Session`',
    ]) expect(about).toContain(kept);
  });

  it('the device summary that feeds bug reports and log exports is untouched (Sentry, ML health, crash ledger, memory flight, touch path)', () => {
    const sum = src('app', 'diagnostics', 'aboutSummary.ts');
    for (const kept of ['mlHealthSummary()', 'crashLedgerSummary()', 'reportingStatusLine()', 'memoryFlightBlock()', 'touchPathBlock()', 'contextLedgerBlock()']) {
      expect(sum).toContain(kept);
    }
  });
});

describe('collector', () => {
  it('reads the live runtime without throwing and stamps a capture time', () => {
    const f = collectAboutFacts({ updateStaged: false, updateApplying: false });
    expect(f.appName).toBe('Tartaria Realms');
    expect(f.otaBuildId).toMatch(/^\d{4}-\d{2}-\d{2}-/);
    expect(new Date(f.capturedAt).toString()).not.toBe('Invalid Date');
    expect(f.sourceSha).toBeNull();
  });
});
