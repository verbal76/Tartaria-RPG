// ⚠⚠ OTA-1229 — THE PURE LAYOUT NUMBERS, WITH NO RUNTIME ATTACHED.
//
// These two constants were born in `displayScale.ts` (OTA-1227) alongside the
// UI-scale setting — and that setting needs AsyncStorage, which made a plain
// width number cost every importer a storage dependency.
//
// ⚠ THAT IS NOT TIDINESS, IT BROKE A TEST. `StatsPanel` needs one width and
// nothing else, so importing it from `displayScale` pulled AsyncStorage into
// the module graph of every suite that renders a stats panel —
// `healthCardTint` failed on a native-module require for a component that does
// not store anything. A layout constant should be importable from a pure render
// path, so it lives here: `Platform` only, no storage, no listeners, no hooks.
//
// `displayScale.ts` re-exports both names, so existing call sites (the five
// screens) keep their import unchanged.
import { Platform } from 'react-native';

/** ⚠ The reading column. 600 on a phone is the full screen; on desktop it was a
 *  ribbon down the middle of the window. 1024 keeps prose at a comfortable
 *  measure while leaving the layout CENTRED rather than stretched edge to edge,
 *  which is what a text game should look like on a wide monitor. */
export const CONTENT_MAX_WIDTH = Platform.OS === 'web' ? 1024 : 600;

/** ⚠⚠ THE CAP THAT STOPS THE STAT HEADER STRETCHING. Owner, on the PC build:
 *  *"the character portrait text and spacing didn't scale it stretched."*
 *
 *  StatsPanel lays its five stat columns out with `flex: 1` — equal shares of
 *  whatever width the panel has. On a phone the panel is ~360px, the columns
 *  land at ~70px, and the 9px labels sit snug against them; that pairing is the
 *  design. OTA-1227 widened the desktop column to 1024 without touching the
 *  type scale, so the same five cells stretched to ~100px each and the row read
 *  as five numbers adrift in a field of gaps.
 *
 *  420 is five ~84px columns — the phone measure, with slack for the widest
 *  value the row ever holds ("35/109"). Past that, extra width goes to the
 *  card's margin instead of between the columns.
 *
 *  ⚠ `undefined` ON NATIVE, DELIBERATELY, rather than a large number that
 *  merely never binds: an undefined style key is absent from the object, so the
 *  phone layout is not just unchanged in effect — it is untouched in fact. */
export const STAT_ROW_MAX_WIDTH: number | undefined = Platform.OS === 'web' ? 420 : undefined;
