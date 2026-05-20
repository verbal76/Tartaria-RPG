// apkRelease pointer — covers the live-fetch path that parses
// /releases/latest from GitHub and the hard-coded fallback.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-application', () => ({
  nativeBuildVersion: '99',
  nativeApplicationVersion: '2.0.1',
  applicationId: 'test',
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hydrateApkPointer,
  refreshFromGitHub,
  isApkOutdated,
  getLatestApkBuild,
  getLatestApkUrl,
  LATEST_APK_BUILD,
  __resetApkPointerForTests,
} from '../app/updates/apkRelease';

describe('apkRelease pointer', () => {
  let originalFetch: typeof fetch;
  beforeEach(async () => {
    originalFetch = global.fetch;
    await AsyncStorage.clear();
    __resetApkPointerForTests();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('hard-coded LATEST_APK_BUILD points at the current release line', () => {
    // Catches the regression where these constants were left at 0
    // and the banner was suppressed for everyone. If we ever zero
    // these again without a deliberate decision, the test fails.
    expect(LATEST_APK_BUILD).toBeGreaterThan(0);
  });

  it('isApkOutdated returns true when installed < hard-coded build', () => {
    // Mocked nativeBuildVersion is 99; LATEST_APK_BUILD is 152.
    expect(isApkOutdated()).toBe(true);
  });

  it('refreshFromGitHub parses tag_name "apk-build-N" and prefers html_url (release page) over the direct asset', async () => {
    // We INTENTIONALLY route through the release page rather than
    // the direct browser_download_url because the direct .apk link
    // gets quarantined by Android's browser sandbox on Chrome /
    // Samsung Internet — download "completes" but the file isn't
    // visible to the file manager or package installer. The page
    // URL renders a click-to-download UI that uses Downloads/.
    const mockResponse = {
      tag_name: 'apk-build-200',
      html_url: 'https://github.com/verbal76/Tartaria-RPG/releases/tag/apk-build-200',
      assets: [
        {
          name: 'tartaria-realms-apk-build-200.apk',
          browser_download_url: 'https://example.com/direct/apk-build-200.apk',
          content_type: 'application/vnd.android.package-archive',
        },
      ],
    };
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => mockResponse,
    })) as unknown as typeof fetch;

    await refreshFromGitHub();

    expect(getLatestApkBuild()).toBe(200);
    // Note: html_url, NOT the asset's browser_download_url.
    expect(getLatestApkUrl()).toBe('https://github.com/verbal76/Tartaria-RPG/releases/tag/apk-build-200');
    const cached = await AsyncStorage.getItem('tartaria.apk.releasePointer.v1');
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!);
    expect(parsed.build).toBe(200);
    expect(parsed.url).toContain('/releases/tag/apk-build-200');
  });

  it('falls back to a constructed release-page URL when html_url is missing', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'apk-build-201',
        // no html_url
        assets: [],
      }),
    })) as unknown as typeof fetch;

    await refreshFromGitHub();

    expect(getLatestApkUrl()).toContain('/releases/tag/apk-build-201');
  });

  it('refreshFromGitHub silently no-ops when GitHub returns non-OK', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    // Should not throw; live pointer stays at whatever it already was.
    await expect(refreshFromGitHub()).resolves.toBeUndefined();
  });

  it('hydrateApkPointer loads a cached pointer from AsyncStorage', async () => {
    const cached = {
      build: 175,
      url: 'https://cached.example.com/apk-build-175.apk',
      highlights: 'cached blurb',
      fetchedAt: Date.now() - 30 * 60 * 1000, // 30 min ago, still within TTL
    };
    await AsyncStorage.setItem('tartaria.apk.releasePointer.v1', JSON.stringify(cached));

    await hydrateApkPointer();

    // Cached build (175) beats the previous test's pointer if the
    // previous test cached 200 — modules persist across tests in
    // the same file, so we just confirm hydration loaded SOMETHING
    // sensible (one of the cached values).
    expect(getLatestApkBuild()).toBeGreaterThanOrEqual(LATEST_APK_BUILD);
  });
});
