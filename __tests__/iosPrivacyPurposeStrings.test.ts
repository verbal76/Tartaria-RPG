/**
 * ⚠⚠⚠ iOS PRIVACY PURPOSE STRINGS — THE ONE APPLE ACTUALLY VALIDATES.
 *
 * Build 186 (2.4.1, the first fresh HAL iOS binary in ~3 months) compiled,
 * signed, auto-submitted, and was REJECTED by App Store Connect:
 *
 *     "Build upload was rejected by App Store Connect because Info.plist is
 *      missing one or more privacy purpose strings.
 *      Missing keys reported by App Store Connect:
 *      - NSPhotoLibraryUsageDescription"
 *
 * ⚠⚠ THE KEY WAS NOT MISSING. Running the repository's own CNG
 * (`expo prebuild --platform ios`) at the exact built SHA, with the exact
 * production env the workflow injects (TARTARIA_LINE=hal,
 * TARTARIA_STORE_BUILD=1), emitted `ios/TartariaRealmsHAL/Info.plist`
 * CONTAINING `NSPhotoLibraryUsageDescription`. So Apple was not reporting
 * absence — it was refusing the string's CONTENT. The value was
 * "Tartaria Realms does not access your photo library.", a DENIAL. A purpose
 * string has to state a purpose; a sentence explaining that there isn't one
 * is not a purpose string, and Apple's upload validation stopped accepting
 * that shape somewhere between 2026-06-14 (when build 33 shipped with it) and
 * now. That tightening is Apple's, not ours — which is exactly why no
 * repository diff explains the regression.
 *
 * ⚠ WHY THE KEY IS REQUIRED AT ALL, PROVEN RATHER THAN ASSUMED. Tartaria has
 * no photo-library API call of its own — no picker, no media library, no
 * camera roll, and no such package is installed. The requirement comes from
 * ONE transitive native dependency:
 *
 *     expo-file-system/ios/FileSystemHelpers.swift:106
 *         PHPhotoLibrary.authorizationStatus(for: .readWrite)
 *     expo-file-system/ios/EXFileSystemAssetLibraryHandler.m:5
 *         #import <Photos/Photos.h>
 *
 * `expo-file-system` is how the game stores saves and logs, and it can also
 * resolve a file the system identifies as a photo-library item. Apple's
 * scanner sees the linked API and demands the reason string.
 *
 * ⚠⚠ AND THAT IS ALSO WHY THIS FILE GUARDS EXACTLY ONE KEY. `app.json`
 * carries six more denial-shaped strings (camera, contacts, Bluetooth,
 * motion, Face ID, location) added by OTA-266 as a pre-emptive sweep. A
 * search of every installed package for AVCaptureDevice, CNContactStore,
 * CBCentralManager, CMMotionManager, LAContext and CLLocationManager found
 * NONE. Apple validates a purpose string only for an API the binary actually
 * references, so those six are inert declarations it never looks at. Widening
 * this test to them would assert a property Apple does not test and would
 * invite exactly the speculative privacy-key carpeting the owner ruled out.
 */
import appJson from '../app.json';

type InfoPlist = Record<string, unknown>;

/** Resolve the app config the way Expo does: app.config.js is handed
 *  app.json's `expo` block and has the last word. The env is read at module
 *  scope there, so it has to be set before the require and the module cache
 *  cleared between lines. */
function resolveIos(line: string, storeBuild: boolean): { bundleIdentifier: string; infoPlist: InfoPlist } {
  const prevLine = process.env.TARTARIA_LINE;
  const prevStore = process.env.TARTARIA_STORE_BUILD;
  process.env.TARTARIA_LINE = line;
  if (storeBuild) process.env.TARTARIA_STORE_BUILD = '1';
  else delete process.env.TARTARIA_STORE_BUILD;
  try {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const factory = require('../app.config.js') as (a: { config: unknown }) => { ios: { bundleIdentifier: string; infoPlist: InfoPlist } };
    return factory({ config: (appJson as { expo: unknown }).expo }).ios;
  } finally {
    if (prevLine === undefined) delete process.env.TARTARIA_LINE; else process.env.TARTARIA_LINE = prevLine;
    if (prevStore === undefined) delete process.env.TARTARIA_STORE_BUILD; else process.env.TARTARIA_STORE_BUILD = prevStore;
  }
}

const KEY = 'NSPhotoLibraryUsageDescription';

describe('iOS privacy purpose strings — the photo-library key App Store Connect validates', () => {
  /* The production HAL build is the one that goes to TestFlight. If this key
   * is absent there, the upload is rejected and the build is wasted — which
   * is what build 186 cost. */
  it('the production HAL iOS config carries a non-empty photo-library purpose string', () => {
    const ios = resolveIos('hal', true);
    expect(ios.bundleIdentifier).toBe('com.hotatticgames.tartarprim');
    const value = ios.infoPlist[KEY];
    expect(typeof value).toBe('string');
    expect((value as string).trim().length).toBeGreaterThan(0);
  });

  /* ⚠⚠ THE ASSERTION THAT WOULD HAVE CAUGHT BUILD 186, and the only one here
   * that is about MEANING rather than presence. A denial explains no purpose,
   * and Apple now rejects the upload for it while reporting the key as
   * "missing" — a message that sends you looking for an absent key that is
   * in fact present, which is precisely how this cost a build. */
  it('that string states a purpose rather than denying one', () => {
    const value = resolveIos('hal', true).infoPlist[KEY] as string;
    expect(value).not.toMatch(/\bdoes not\b/i);
    expect(value).not.toMatch(/\bnever (?:accesses|uses)\b/i);
    // it has to actually say what the access is for
    expect(value.toLowerCase()).toMatch(/photo/);
  });

  /* The exact approved wording. It is accurate on both halves: the game does
   * store saves through `expo-file-system`, and that component really can
   * read photo-library items — while the game itself opens no picker. */
  it('the approved wording is what ships', () => {
    expect(resolveIos('hal', true).infoPlist[KEY]).toBe(
      'Tartaria Realms saves your game with a file component that can also read '
      + 'photo-library items. The game never opens, uploads, or changes your photos.',
    );
  });

  /* ⚠ THE KEY IS OWNED BY THE SHARED CONFIG, NOT BY ONE PRODUCT. `app.config.js`
   * rebuilds `ios` per line; a future edit that spread the line table over
   * `infoPlist` instead of beside it would silently drop this from three of
   * the four products. Every line that can produce an iOS binary is asked. */
  it.each(['hal', 'golem', 'steam', 'html'])('line %s also resolves the key', (line) => {
    const value = resolveIos(line, false).infoPlist[KEY];
    expect(typeof value).toBe('string');
    expect((value as string).trim().length).toBeGreaterThan(0);
  });

  /* ⚠ SCOPE MARKER, DELIBERATE. The six other purpose strings are NOT asserted
   * here — nothing in node_modules links their APIs, so Apple never validates
   * them. This records that the omission is a decision, not an oversight, and
   * names what would have to change for it to become wrong: a dependency that
   * actually links one of those frameworks. */
  it('the store build resolves the bundle id the App Store listing expects', () => {
    expect(resolveIos('hal', true).bundleIdentifier).toBe('com.hotatticgames.tartarprim');
    expect(resolveIos('hal', false).bundleIdentifier).toBe('com.hotatticgames.tartarprim.hal2001');
  });
});
