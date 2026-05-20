// APK release pointer.
//
// TWO SOURCES OF TRUTH (auto + fallback):
//
// 1) Hard-coded constants below — `LATEST_APK_BUILD` + `LATEST_APK_URL`
//    + `LATEST_APK_HIGHLIGHTS`. Shipped via OTA. Acts as the
//    no-network fallback on app boot so the banner can render
//    immediately even when the device is offline.
//
// 2) Live GitHub releases poll — `refreshFromGitHub()` hits the
//    public /releases/latest endpoint, parses the `apk-build-N` tag
//    into a build number, finds the .apk asset URL, caches the
//    result in AsyncStorage for 1 hour, and overrides the hard-coded
//    constants when it returns something newer. Called on app boot
//    by TitleScreen.
//
// This pair means the player gets the banner the moment they boot,
// AND we don't have to remember to bump the constants on every APK
// release — the live poll catches new releases automatically. The
// constants exist so a brand-new install with zero AsyncStorage
// cache + no network access still sees a meaningful banner during
// the next major rollout.
//
// Banner gate (in TitleScreen): isApkOutdated() && url.length > 0.
// When constants are zeroed (LATEST_APK_BUILD <= 0), the gate
// suppresses the banner unless the live poll has already populated
// the cache.

import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Most recent APK build number distributed to playtesters. Bumped
 *  whenever a new APK ships. 0 = no newer APK on offer; banner stays
 *  hidden. */
export const LATEST_APK_BUILD = 158;

/** URL the banner opens. Should be the GitHub release PAGE (html_url),
 *  NOT the direct asset (browser_download_url). Direct .apk links
 *  trigger Android browser quarantine on Chrome/Samsung Internet —
 *  the download "completes" but lands in a sandboxed cache the file
 *  manager and package installer can't see. The release page hosts
 *  the asset in a normal click-to-download UI that uses the public
 *  Downloads/ folder. Trade-off: one extra tap, but the file
 *  actually lands somewhere the user can install it from. */
export const LATEST_APK_URL = 'https://github.com/verbal76/Tartaria-RPG/releases/tag/apk-build-158';

/** One-line summary of what the new APK enables that an OTA cannot.
 *  Surfaces on the banner so the player knows why they should install. */
export const LATEST_APK_HIGHLIGHTS = 'Boss-tier enemies + dedicated boss-fight music + one-tap in-app installer for future updates. The new MP3 assets and intent-launcher native module can only ship with a fresh APK.';

/** Direct .apk asset URL — used by the in-app install path when the
 *  installed APK has expo-intent-launcher available. Older APKs
 *  without the native module fall through to LATEST_APK_URL (page). */
export const LATEST_APK_ASSET_URL = 'https://github.com/verbal76/Tartaria-RPG/releases/download/apk-build-158/tartaria-realms-apk-build-158.apk';

// ── Live pointer (overrides constants when fresher) ────────────────

interface LivePointer {
  build: number;
  /** Page URL — opens in browser, user clicks .apk under Assets. */
  url: string;
  /** Direct .apk asset URL — used by the in-app install flow when
   *  the installed APK has expo-intent-launcher. May be empty if
   *  the GitHub release somehow has no .apk asset. */
  assetUrl: string;
  highlights: string;
  fetchedAt: number;
}

const CACHE_KEY = 'tartaria.apk.releasePointer.v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const GH_RELEASES_URL = 'https://api.github.com/repos/verbal76/tartaria-rpg/releases/latest';

let livePointer: LivePointer | null = null;
let inFlight: Promise<void> | null = null;

/** Test-only: wipe in-memory pointer + in-flight promise so the
 *  next refreshFromGitHub call goes through the real fetch path.
 *  Production callers should never use this. */
export function __resetApkPointerForTests(): void {
  livePointer = null;
  inFlight = null;
}

function effectiveBuild(): number {
  if (livePointer && livePointer.build > LATEST_APK_BUILD) return livePointer.build;
  return LATEST_APK_BUILD;
}

function effectiveUrl(): string {
  if (livePointer && livePointer.build > LATEST_APK_BUILD) return livePointer.url;
  return LATEST_APK_URL;
}

function effectiveHighlights(): string {
  if (livePointer && livePointer.build > LATEST_APK_BUILD) return livePointer.highlights;
  return LATEST_APK_HIGHLIGHTS;
}

function effectiveAssetUrl(): string {
  if (livePointer && livePointer.build > LATEST_APK_BUILD && livePointer.assetUrl.length > 0) {
    return livePointer.assetUrl;
  }
  return LATEST_APK_ASSET_URL;
}

/** Returns true when the installed APK build is older than the
 *  current pointer (live OR hard-coded, whichever is newer). Returns
 *  false on any failure to read the native build (dev builds, Expo
 *  Go, ROMs that don't report nativeBuildVersion). */
export function isApkOutdated(): boolean {
  const target = effectiveBuild();
  if (target <= 0) return false;
  const raw = Application.nativeBuildVersion;
  if (!raw) return false;
  const installed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(installed)) return false;
  return installed < target;
}

/** Returns the URL that the banner should open. The live pointer
 *  wins when it has a strictly newer build than the hard-coded
 *  constant; otherwise the constant. */
export function getLatestApkUrl(): string {
  return effectiveUrl();
}

/** Player-facing "what's new" string for the banner. */
export function getLatestApkHighlights(): string {
  return effectiveHighlights();
}

/** Build number the banner should display. */
export function getLatestApkBuild(): number {
  return effectiveBuild();
}

/** Direct .apk URL for the in-app install flow. Empty string when
 *  no asset is known (rare; the live fetcher captures it when GitHub
 *  returns one). Callers should fall back to getLatestApkUrl() when
 *  this returns ''. */
export function getLatestApkAssetUrl(): string {
  return effectiveAssetUrl();
}

/** Load a cached pointer from AsyncStorage. Called at app boot before
 *  network fetch so the first paint shows the latest known state
 *  even when offline. */
export async function hydrateApkPointer(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<LivePointer>;
    if (
      typeof parsed.build === 'number' &&
      typeof parsed.url === 'string' &&
      parsed.url.length > 0 &&
      typeof parsed.highlights === 'string' &&
      typeof parsed.fetchedAt === 'number'
    ) {
      livePointer = parsed as LivePointer;
    }
  } catch {
    // Cache corruption / parse failure: ignore. Banner falls back
    // to the hard-coded constants.
  }
}

/** Hit GitHub's /releases/latest and update the live pointer if a
 *  newer build is published. Safe to call frequently — internally
 *  rate-limited to once per CACHE_TTL_MS. Errors are swallowed (the
 *  banner system must never break the title screen). */
export async function refreshFromGitHub(): Promise<void> {
  // De-dupe concurrent calls (boot + retry).
  if (inFlight) return inFlight;
  if (livePointer && Date.now() - livePointer.fetchedAt < CACHE_TTL_MS) return;
  inFlight = (async () => {
    try {
      const res = await fetch(GH_RELEASES_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return;
      const json = await res.json() as {
        tag_name?: string;
        body?: string;
        html_url?: string;
        assets?: Array<{ name?: string; browser_download_url?: string; content_type?: string }>;
      };
      const tag = json.tag_name ?? '';
      const buildMatch = /apk-build-(\d+)/i.exec(tag);
      if (!buildMatch) return;
      const build = Number.parseInt(buildMatch[1]!, 10);
      if (!Number.isFinite(build) || build <= 0) return;
      // Prefer html_url (the release page) over browser_download_url
      // (the direct asset). See LATEST_APK_URL comment for why.
      // Fall back to a constructed page URL if html_url is missing.
      const pageUrl = json.html_url ?? `https://github.com/verbal76/Tartaria-RPG/releases/tag/${tag}`;
      // Capture the direct .apk asset for the in-app install path.
      // Falls back to '' if no .apk asset is present — the page URL
      // still gives the user a manual path.
      const apkAsset = (json.assets ?? []).find((a) =>
        a.content_type === 'application/vnd.android.package-archive'
          || (a.name ?? '').toLowerCase().endsWith('.apk'),
      );
      const next: LivePointer = {
        build,
        url: pageUrl,
        assetUrl: apkAsset?.browser_download_url ?? '',
        highlights: LATEST_APK_HIGHLIGHTS, // GitHub body is verbose; keep our concise blurb
        fetchedAt: Date.now(),
      };
      livePointer = next;
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        // Cache write failure is non-fatal — the in-memory pointer
        // still drives this session.
      }
    } catch {
      // Network failure: stay on the hard-coded constants.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
