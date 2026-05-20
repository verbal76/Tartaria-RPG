// APK release pointer — OTA-controlled. When a new APK build ships,
// bump LATEST_APK_BUILD and update LATEST_APK_URL via an OTA push.
// All installed APKs receive the OTA; those on an older build see a
// title-screen banner offering a tap-to-open link to the new install.
//
// This is the bridge for OTA-deliverable native-module features
// (immersive system bars, future native deps). The OTA reaches old
// APKs fine; the new feature only activates when the player installs
// the new APK. The banner makes that path one tap.
//
// Conventions:
//   - LATEST_APK_BUILD is the integer build number (Application.
//     nativeBuildVersion). When set <= 0, the banner is suppressed
//     (no APK to push yet).
//   - LATEST_APK_URL must be a direct, signed link to the new APK
//     OR a GitHub release page the player can grab the APK from.
//   - LATEST_APK_HIGHLIGHTS is the player-facing "what's new in
//     this APK that the current OTA can't deliver" line.

import * as Application from 'expo-application';

/** Most recent APK build number distributed to playtesters. Bumped
 *  whenever a new APK ships. 0 = no newer APK on offer; banner stays
 *  hidden. */
export const LATEST_APK_BUILD = 0;

/** Direct link to the newest APK. Update via OTA when you upload a
 *  new build to GitHub releases / a CDN / a shared drive. */
export const LATEST_APK_URL = '';

/** One-line summary of what the new APK enables that an OTA cannot.
 *  Surfaces on the banner so the player knows why they should install. */
export const LATEST_APK_HIGHLIGHTS = '';

/** Returns true when the installed APK build is older than the
 *  current LATEST_APK_BUILD pointer. Returns false on any failure
 *  to read the native build (dev builds, Expo Go, ROMs that don't
 *  report nativeBuildVersion).
 *
 *  Comparison is integer-numeric. If your build numbers ever go
 *  non-numeric (e.g. semver tags), parse them in the comparison
 *  layer; the pattern stays the same. */
export function isApkOutdated(): boolean {
  if (LATEST_APK_BUILD <= 0) return false;
  const raw = Application.nativeBuildVersion;
  if (!raw) return false;
  const installed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(installed)) return false;
  return installed < LATEST_APK_BUILD;
}
