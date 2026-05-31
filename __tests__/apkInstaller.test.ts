// apkInstaller — covers the guarded require() so older APKs that
// predate expo-intent-launcher bail gracefully instead of crashing.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-application', () => ({
  nativeBuildVersion: '99',
  nativeApplicationVersion: '2.0.1',
  applicationId: 'test',
}));

import {
  isInAppInstallAvailable,
  downloadAndInstallApk,
  __resetInstallerAvailabilityCache,
} from '../app/updates/apkInstaller';

describe('apkInstaller', () => {
  beforeEach(() => {
    __resetInstallerAvailabilityCache();
    jest.resetModules();
  });

  it('isInAppInstallAvailable returns true when expo-intent-launcher resolves with startActivityAsync', () => {
    jest.doMock('expo-intent-launcher', () => ({
      startActivityAsync: jest.fn(),
    }), { virtual: true });
    __resetInstallerAvailabilityCache();
    // The probe lazily requires; the mock is in place.
    expect(isInAppInstallAvailable()).toBe(true);
  });

  it('isInAppInstallAvailable returns false on older APKs where the require throws', () => {
    jest.doMock('expo-intent-launcher', () => {
      throw new Error('Native module not found');
    }, { virtual: true });
    __resetInstallerAvailabilityCache();
    expect(isInAppInstallAvailable()).toBe(false);
  });

  it('downloadAndInstallApk rejects when the native module is unavailable', async () => {
    jest.doMock('expo-intent-launcher', () => {
      throw new Error('Native module not found');
    }, { virtual: true });
    __resetInstallerAvailabilityCache();
    await expect(downloadAndInstallApk('https://example.com/x.apk', 200)).rejects.toThrow(
      /expo-intent-launcher not available/,
    );
  });

  it('downloadAndInstallApk rejects when given an empty asset URL', async () => {
    jest.doMock('expo-intent-launcher', () => ({
      startActivityAsync: jest.fn(),
    }), { virtual: true });
    __resetInstallerAvailabilityCache();
    await expect(downloadAndInstallApk('', 200)).rejects.toThrow(/No .apk asset URL/);
  });
});
