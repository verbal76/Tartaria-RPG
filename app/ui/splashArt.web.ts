// ⚠ OTA-1370 — the web/PC half of the splash-art pair. See splashArt.ts for why
// this is a module pair rather than a Platform.OS ternary (Metro resolves
// `require()` statically, so a ternary would drag this 2.4MB asset into the
// phone bundle). Metro loads THIS file on web and never sees it on native.
import { StyleSheet } from 'react-native';
import type { ImageSourcePropType, StyleProp, ImageStyle } from 'react-native';

export const SPLASH_SOURCE: ImageSourcePropType = require('../../assets/splash-art-pc.png') as ImageSourcePropType;

/** PC/web: the art is authored full-bleed, so it fills rather than letterboxes.
 *  The measured dimensions the phone path needs are irrelevant here. */
export function splashImageStyle(_imgW: number, _imgH: number): StyleProp<ImageStyle> {
  return StyleSheet.absoluteFillObject;
}
