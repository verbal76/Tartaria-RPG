// Settings → About: the release identity a person reads, and the same facts in
// full for COPY ALL.
//
// ABOUT IS FOR HUMANS. COPY ALL IS FOR TROUBLESHOOTING.
//
// The visible About block used to be the whole diagnostic dump (device, install,
// ML health, crash ledger, runtime pressure, memory timeline, touch path, model
// internals…) painted as monospace text, because the text that was shown was the
// same string COPY ALL copied. This module splits the two WITHOUT removing a
// single diagnostic: the visible half is a short, labelled identity (application,
// install, device, update); the full half is the header COPY ALL leads with,
// followed by every block that was always in the copied report.
//
// Pure on purpose. `buildAboutIdentity(facts)` takes plain data and returns
// plain data, so the layout is testable without a native runtime and a missing
// value can only ever render as "—", never throw. `collectAboutFacts()` is the
// one place that touches expo-application / expo-updates / Platform, and every
// read is individually guarded.

import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { OTA_BUILD_ID, DISPLAY_VERSION } from '../buildInfo';
import { getBuildCodename, getApkCodename } from '../buildCodename';

export interface AboutFacts {
  appName: string;
  /** DISPLAY_VERSION — the JS-side version the player sees. */
  appVersion: string;
  /** The APK/IPA's own version name (expo-application). */
  nativeVersionName: string | null;
  packageId: string | null;
  /** expo-updates runtimeVersion — what decides whether an OTA applies. */
  runtimeVersion: string | null;
  /** Android versionCode / iOS build number. */
  nativeBuild: string | null;
  aabCodename: string | null;

  deviceName: string | null;
  osName: string;
  osRelease: string | null;
  apiLevel: number | null;
  locale: string | null;
  timezone: string | null;

  otaCodename: string;
  otaBuildId: string;
  channel: string | null;
  updateId: string | null;
  updateCreatedAt: string | null;
  /** true = the app's embedded bundle; false = a downloaded OTA; null = unknown. */
  isEmbedded: boolean | null;
  updatesEnabled: boolean | null;
  isEmergencyLaunch: boolean | null;
  emergencyReason: string | null;
  manifestId: string | null;
  launchAssetHash: string | null;
  /** The commit this bundle was built from. Null when the bundle does not carry it. */
  sourceSha: string | null;
  /** A staged OTA waiting for the next open, from the store. */
  updateStaged: boolean;
  /** The "applying update" transition is under way right now. */
  updateApplying: boolean;

  capturedAt: string;
}

export interface IdentityRow { label: string; value: string }
export interface IdentitySection { title: string; rows: IdentityRow[] }

const MISSING = '—';
const v = (s: string | null | undefined): string => (s == null || s === '' ? MISSING : s);

/** Visual shortening only — COPY ALL always carries the whole value. */
export function shortSha(sha: string | null): string | null {
  if (!sha) return null;
  return /^[0-9a-f]{40}$/i.test(sha) ? sha.slice(0, 7) : sha;
}

function osLine(f: AboutFacts): string {
  if (f.osName === 'android') {
    const rel = f.osRelease ? `Android ${f.osRelease}` : 'Android';
    return f.apiLevel != null ? `${rel} (API ${f.apiLevel})` : rel;
  }
  if (f.osName === 'ios') return f.osRelease ? `iOS ${f.osRelease}` : 'iOS';
  return f.osRelease ? `${f.osName} ${f.osRelease}` : f.osName;
}

function updateStatus(f: AboutFacts): string {
  if (f.updateApplying) return 'Applying update';
  if (f.updatesEnabled === false) return 'Updates are off in this build';
  if (f.isEmergencyLaunch) return 'Recovered to the built-in version';
  if (f.updateStaged) return 'Update downloaded — applies on next open';
  return 'Up to date as of the last check';
}

/** The short, human-readable identity shown on the About screen. */
export function buildAboutIdentity(f: AboutFacts): IdentitySection[] {
  const update: IdentityRow[] = [
    { label: 'Running', value: f.otaCodename },
    { label: 'Source', value: f.isEmbedded === true ? 'Built into the app' : f.isEmbedded === false ? 'Downloaded update' : MISSING },
    { label: 'Channel', value: v(f.channel) },
    { label: 'Status', value: updateStatus(f) },
  ];
  // Only when the bundle really carries it — an empty row would read as a bug.
  const sha = shortSha(f.sourceSha);
  if (sha) update.splice(2, 0, { label: 'Source SHA', value: sha });

  return [
    {
      title: 'APPLICATION',
      rows: [
        { label: 'Game', value: f.appName },
        { label: 'Version', value: f.appVersion },
      ],
    },
    {
      title: 'INSTALL',
      rows: [
        { label: 'Package', value: v(f.packageId) },
        { label: 'Runtime', value: v(f.runtimeVersion) },
        { label: 'Build', value: v(f.nativeBuild) },
      ],
    },
    {
      title: 'DEVICE',
      rows: [
        { label: 'Device', value: v(f.deviceName) },
        { label: 'System', value: osLine(f) },
      ],
    },
    { title: 'UPDATE', rows: update },
  ];
}

/** The same identity in full — the header COPY ALL leads with. Every value the
 *  visible block shortens or omits is complete here. */
export function buildAboutIdentityText(f: AboutFacts): string {
  const L = (label: string, value: string | null | undefined) => `  ${label}: ${v(value)}`;
  return [
    `RELEASE IDENTITY`,
    `Application`,
    L('Name', f.appName),
    L('Version (versionName shown to players)', f.appVersion),
    L('Native version name', f.nativeVersionName),
    ``,
    `Install`,
    L('Package ID', f.packageId),
    L('Runtime version', f.runtimeVersion),
    L('Native build (versionCode)', f.nativeBuild),
    L('AAB codename', f.aabCodename),
    ``,
    `Device`,
    L('Device', f.deviceName),
    L('System', osLine(f)),
    L('Platform', `${f.osName} ${f.osRelease ?? ''}`.trim()),
    L('API level', f.apiLevel == null ? null : String(f.apiLevel)),
    L('Locale', f.locale),
    L('Timezone', f.timezone),
    L('Captured at', f.capturedAt),
    ``,
    `Update`,
    L('Running OTA', f.otaCodename),
    L('OTA build ID', f.otaBuildId),
    L('OTA update ID', f.updateId),
    L('Channel', f.channel),
    L('OTA published at', f.updateCreatedAt),
    L('Launch source', f.isEmbedded === true ? 'embedded native baseline' : f.isEmbedded === false ? 'downloaded OTA' : null),
    L('Updates enabled', f.updatesEnabled == null ? null : String(f.updatesEnabled)),
    L('Emergency launch (fell back to embedded)', f.isEmergencyLaunch == null ? null : String(f.isEmergencyLaunch)),
    L('Emergency reason', f.emergencyReason),
    L('Manifest ID', f.manifestId),
    L('Launch bundle hash', f.launchAssetHash),
    L('Source SHA (full)', f.sourceSha ?? 'not embedded in this bundle'),
    L('Update status', updateStatus(f)),
    L('Staged update waiting', String(f.updateStaged)),
  ].join('\n');
}

function safe<T>(fn: () => T): T | null {
  try {
    const x = fn();
    return x === undefined ? null : x;
  } catch {
    return null;
  }
}
const str = (x: unknown): string | null => (x == null || x === '' ? null : String(x));

/** Read the live runtime. Every field is individually guarded: a platform that
 *  does not expose one yields null, never an exception on the About screen. */
export function collectAboutFacts(opts: { updateStaged: boolean; updateApplying: boolean }): AboutFacts {
  const U = Updates as unknown as {
    runtimeVersion?: string | null; channel?: string | null; updateId?: string | null;
    createdAt?: Date | string | null; isEmbeddedLaunch?: boolean; isEnabled?: boolean;
    isEmergencyLaunch?: boolean; emergencyLaunchReason?: string | null;
    manifest?: { id?: string; launchAsset?: { hash?: string } } | null;
  };
  const created = safe(() => U.createdAt);
  let locale: string | null = null;
  let timezone: string | null = null;
  try {
    const r = new Intl.DateTimeFormat().resolvedOptions();
    locale = r.locale ?? null;
    timezone = r.timeZone ?? null;
  } catch { /* partial Intl on some Androids */ }
  const consts = safe(() => (Platform as unknown as { constants?: { Release?: string } }).constants);
  const release = Platform.OS === 'android' ? str(consts?.Release) : str(Platform.Version);
  const apkBuild = safe(() => Application.nativeBuildVersion);

  return {
    appName: 'Tartaria Realms',
    appVersion: DISPLAY_VERSION,
    nativeVersionName: str(safe(() => Application.nativeApplicationVersion)),
    packageId: str(safe(() => Application.applicationId)),
    runtimeVersion: str(safe(() => U.runtimeVersion)),
    nativeBuild: str(apkBuild),
    aabCodename: apkBuild ? safe(() => getApkCodename(apkBuild)) : null,

    deviceName: str(safe(() => Constants.deviceName)),
    osName: Platform.OS,
    osRelease: release,
    apiLevel: Platform.OS === 'android' && typeof Platform.Version === 'number' ? Platform.Version : null,
    locale,
    timezone,

    otaCodename: getBuildCodename(OTA_BUILD_ID),
    otaBuildId: OTA_BUILD_ID,
    channel: str(safe(() => U.channel)),
    updateId: str(safe(() => U.updateId)),
    updateCreatedAt: created instanceof Date ? created.toISOString() : str(created),
    isEmbedded: safe(() => (typeof U.isEmbeddedLaunch === 'boolean' ? U.isEmbeddedLaunch : null)),
    updatesEnabled: safe(() => (typeof U.isEnabled === 'boolean' ? U.isEnabled : null)),
    isEmergencyLaunch: safe(() => (typeof U.isEmergencyLaunch === 'boolean' ? U.isEmergencyLaunch : null)),
    emergencyReason: str(safe(() => U.emergencyLaunchReason)),
    manifestId: str(safe(() => U.manifest?.id)),
    launchAssetHash: str(safe(() => U.manifest?.launchAsset?.hash)),
    // No source SHA is embedded in the bundle today: the commit appears only in
    // the EAS publish message ("<ref>@<sha7>"), which the runtime cannot read.
    // Surfaced as null (and "not embedded in this bundle" in COPY ALL) rather
    // than invented; wiring a build-time SHA is a separate, release-pipeline
    // decision and is deliberately not made here.
    sourceSha: null,
    updateStaged: opts.updateStaged,
    updateApplying: opts.updateApplying,

    capturedAt: new Date().toISOString(),
  };
}
