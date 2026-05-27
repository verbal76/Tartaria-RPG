// OTA 23-005 — Global UI scale for small-screen devices.
//
// Problem: the game's screens, modals, fonts, padding, and label
// widths are all hand-tuned around a ~390 px-wide design baseline
// (iPhone 13). On phones narrower than that (older Androids at 320-
// 360 px, iPhone SE at 320 px, etc.) elements overflow horizontally
// and the layout reads as "huge" — fixed-width labels add up to more
// than the screen width, and the wider-target screens like the
// Player Sheet's stat rows overlap themselves.
//
// Fix: a single useUiScale() hook + a root-level transform wrapper
// in AppShell. The wrapper renders the screens at a LOGICAL width
// (always >= the design baseline) and scales the result DOWN to fit
// the actual device. This means every existing screen — without
// changing a single component — instantly shrinks proportionally on
// a small phone while staying full-size on a 390+ device.
//
// Tradeoffs accepted:
//   - Touch targets shrink proportionally (a 44pt button on a
//     320 px device becomes ~36pt, still well above the iOS HIG
//     11pt minimum).
//   - Slight blur on fractional scales — RN's native renderer
//     handles this acceptably; no observed playtest complaint.
//   - Modals rendered via RN's <Modal /> primitive render at the
//     OS's full viewport, so they bypass the scale. Most game
//     modals (Search/Approach/Climb/Take/Salvage/Feedback/Dice)
//     use flex layouts internally and shouldn't overflow, but
//     watch for this in future modal authoring.

import { useWindowDimensions } from 'react-native';

/** The width the game's screens were tuned for (iPhone 13 logical). */
export const DESIGN_BASE_WIDTH = 390;

/** Lower bound on scale so a tiny-width device doesn't shrink the
 *  UI past readability. 0.65 corresponds to a 254 px device, which
 *  is well below any real phone in 2026; the floor mostly guards
 *  against e.g. a desktop preview tool fed bogus dimensions. */
export const MIN_UI_SCALE = 0.65;

export interface UiScale {
  /** Multiplier applied via transform: scale on the root View. */
  scale: number;
  /** Logical width the screens think they have. Always >= the
   *  device's actual width when scale < 1. */
  logicalWidth: number;
  /** Logical height — same trick on the vertical axis. */
  logicalHeight: number;
  /** True when the device is below the design baseline and the
   *  scale transform is doing work. UI can branch on this for
   *  small-screen-specific tweaks. */
  isShrunk: boolean;
}

/**
 * Returns the active UI scale based on the current device width.
 *
 * Phones at or above DESIGN_BASE_WIDTH (390 px) get scale=1.0; the
 * design renders at native size with extra breathing room on bigger
 * phones. Phones below the baseline get a sub-1.0 scale so the
 * design's logical width is preserved while the rendered pixels
 * compress to fit the device.
 *
 * Reactive via useWindowDimensions — orientation changes and
 * foldable splits re-render through this hook.
 */
export function useUiScale(): UiScale {
  const { width, height } = useWindowDimensions();
  const raw = width / DESIGN_BASE_WIDTH;
  const scale = Math.max(MIN_UI_SCALE, Math.min(1, raw));
  return {
    scale,
    logicalWidth: width / scale,
    logicalHeight: height / scale,
    isShrunk: scale < 1,
  };
}

/**
 * Compute a UI scale value from explicit dimensions. Pure function,
 * separate from the hook so tests can pin behavior across the full
 * range of phone sizes without mounting a renderer.
 */
export function computeUiScale(deviceWidth: number, deviceHeight: number): UiScale {
  const raw = deviceWidth / DESIGN_BASE_WIDTH;
  const scale = Math.max(MIN_UI_SCALE, Math.min(1, raw));
  return {
    scale,
    logicalWidth: deviceWidth / scale,
    logicalHeight: deviceHeight / scale,
    isShrunk: scale < 1,
  };
}
