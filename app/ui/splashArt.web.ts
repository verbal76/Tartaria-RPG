// ⚠⚠ OTA-1384 — the web/PC half of the splash-art pair.
//
// See splashArt.ts for why this is a module PAIR rather than a `Platform.OS`
// ternary: Metro resolves `require()` statically, so a ternary would pull this
// 2.4MB asset into the phone bundle. Metro loads THIS file on web and never
// sees it on native, so the require below never enters a phone build's graph.
//
// ⚠ AND THE ASSET LIVES OUTSIDE `assets/`, WHICH IS THE OTHER HALF OF THE SAME
// PROBLEM. `app.json` sets `assetBundlePatterns: ["assets/**/*"]`, meaning Expo
// EMBEDS every file under assets/ into the native binary whether or not any code
// requires it. Under one trunk the phone products carry this repo too, so a PC
// asset sitting in assets/ would add 2.4MB to their download for art they can
// never display — on the device whose signature crash was an out-of-memory kill.
// Parking it in `assets-pc/` keeps it out of the embed glob; the require here is
// what pulls it into the web bundle, and only there.
import { StyleSheet } from 'react-native';
import type { ImageSourcePropType, StyleProp, ImageStyle } from 'react-native';

export const SPLASH_SOURCE: ImageSourcePropType = require('../../assets-pc/splash-art-pc.png') as ImageSourcePropType;

/** PC/web: the art is authored full-bleed, so it fills rather than letterboxes.
 *  The measured dimensions the phone path needs are irrelevant here. */
export function splashImageStyle(_imgW: number, _imgH: number): StyleProp<ImageStyle> {
  return StyleSheet.absoluteFillObject;
}
