// ⚠⚠ OTA-1366 — THE SPLASH ART, RESOLVED BY PLATFORM RATHER THAN BY BRANCH.
//
// The PC lines paint a different splash (`splash-art-pc.png`, 2.4MB, full-bleed)
// from the phone lines (`splash-art.jpg`, letterboxed to the image's own aspect).
// That difference used to live in `SplashOverlay.tsx`, which meant the file
// differed between products for a reason that is not a product decision at all —
// it is a screen-shape decision.
//
// ⚠ IT CANNOT SIMPLY BE A `Platform.OS` TERNARY INSIDE THE COMPONENT, and that
// is the whole reason this file exists. Metro resolves `require()` STATICALLY:
// both branches of `isWeb ? require(pc) : require(phone)` enter the bundle
// graph, so unifying the component that way would ship 2.4MB of art the phone
// build can never display — onto the device whose signature crash was an
// out-of-memory kill. A `.web` module pair keeps the require out of the native
// graph entirely, because the native bundle never loads this file's web twin.
//
// Same stub pattern the codebase already uses for GamepadNav and kokoroWeb.
import type { ImageSourcePropType, StyleProp, ImageStyle } from 'react-native';

export const SPLASH_SOURCE: ImageSourcePropType = require('../../assets/splash-art.jpg') as ImageSourcePropType;

/** Phone: letterbox to the art's own aspect, positioned by the caller's
 *  measured width/height. Web overrides this with an absolute fill. */
export function splashImageStyle(imgW: number, imgH: number): StyleProp<ImageStyle> {
  return { position: 'absolute', top: 0, left: 0, width: imgW, height: imgH };
}
