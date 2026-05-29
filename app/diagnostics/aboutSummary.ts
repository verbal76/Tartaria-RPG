// OTA-063 — shared "basic device + install" summary used by:
//   1. The About screen (rendered at the top of the diagnostic
//      block so player + dev see the same identifying info)
//   2. The bug-report flow on the title screen (so every report
//      lands with a consistent device/build header in the email
//      body the player pastes into Gmail)
//
// Kept synchronous + dependency-free so the About screen's
// useMemo path can render it without an async fetch + suspended
// re-render. Free-disk is intentionally NOT pulled here — the
// expo-file-system call is async and tends to throw on some
// Androids, and the field is rarely the deciding clue for bug
// triage. The build/runtime/locale/screen fields together cover
// 95% of "which device is this?" questions.
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform, Dimensions, PixelRatio } from 'react-native';
import { OTA_BUILD_ID } from '../buildInfo';

export function buildBasicDeviceSummary(): string {
  const apkBuild = Application.nativeBuildVersion ?? '(unknown)';
  const apkVersion =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
  const appId = Application.applicationId ?? '(unknown)';
  // Constants.deviceName is iOS-set (user's chosen device name in
  // Settings → General → About → Name); on Android it's null in
  // managed Expo unless a custom config plugin exposes it. Either
  // way we tolerate the missing case.
  const deviceName = Constants.deviceName ?? '(not exposed by platform)';

  // Intl is available on Hermes; both `.locale` and `.timeZone`
  // are RFC-standard fields on resolvedOptions(). Guarded anyway
  // because some lower-end Androids ship a partial Intl polyfill.
  let locale = '(unknown)';
  let timeZone = '(unknown)';
  try {
    const r = new Intl.DateTimeFormat().resolvedOptions();
    locale = r.locale ?? '(unknown)';
    timeZone = r.timeZone ?? '(unknown)';
  } catch {
    // Hermes Intl missing — leave as unknown.
  }

  const win = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  const screenStr =
    `window ${Math.round(win.width)}×${Math.round(win.height)}` +
    ` / screen ${Math.round(screen.width)}×${Math.round(screen.height)}` +
    ` @ ${PixelRatio.get()}x density`;

  const hermes =
    typeof (globalThis as { HermesInternal?: unknown }).HermesInternal !==
    'undefined';

  const lines = [
    `Device`,
    `  Name: ${deviceName}`,
    `  Platform: ${Platform.OS} ${Platform.Version}`,
    `  Hermes: ${hermes ? 'yes' : 'no'}`,
    `  Locale: ${locale}`,
    `  Timezone: ${timeZone}`,
    `  Screen: ${screenStr}`,
    `  Captured at: ${new Date().toISOString()}`,
    ``,
    `Install`,
    `  App ID: ${appId}`,
    `  App version: ${apkVersion}`,
    `  APK build: ${apkBuild}`,
    `  OTA build ID: ${OTA_BUILD_ID}`,
  ];
  return lines.join('\n');
}

// 2026-05-27 OTA-101 — stampLogExport. Single source of truth
// for the envelope-wrapped log + appended device/install
// summary that ships with every COPY / SHARE / CHUNK button
// across LogScreen + AboutScreen. Player request: "when a
// playtester pushes a big report have it also copy and paste
// the about information." Done — every log export now bundles
// both, so I don't have to ask the player to send the about
// info separately + their captures always carry build context.
//
// Format mirrors what playtesters were already manually doing
// (envelope first, blank line, "Tartaria Realms" header, then
// the buildBasicDeviceSummary block):
//
//   === TARTARIA LOG · 9243 CHARS · BEGIN ===
//   ... log body ...
//   === END LOG · 9243 CHARS ===
//
//   Tartaria Realms
//
//   Device
//     ...
//   Install
//     ...
//
// Multipart variant uses PART N of M markers but otherwise
// the same shape. The about block ALWAYS goes after the
// closing marker so it doesn't interfere with the byte-count
// envelope check (which compares chars between BEGIN/END to
// detect paste-side truncation).
export interface StampLogOptions {
  chunk?: { index: number; total: number };
  /** Optional player name to surface alongside Tartaria Realms
   *  in the header. Used by the TitleScreen export which has
   *  per-slot context. */
  playerName?: string;
}

export function stampLogExport(logBody: string, opts: StampLogOptions = {}): string {
  const { chunk, playerName } = opts;
  const begin = chunk
    ? `=== TARTARIA LOG · PART ${chunk.index} of ${chunk.total} · ${logBody.length} CHARS · BEGIN ===`
    : `=== TARTARIA LOG · ${logBody.length} CHARS · BEGIN ===`;
  const end = chunk
    ? `=== END PART ${chunk.index} of ${chunk.total} ===`
    : `=== END LOG · ${logBody.length} CHARS ===`;
  const header = playerName ? `Tartaria Realms · ${playerName}` : 'Tartaria Realms';
  return `${begin}\n${logBody}\n${end}\n\n${header}\n\n${buildBasicDeviceSummary()}\n`;
}
