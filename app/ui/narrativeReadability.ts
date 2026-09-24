// OTA — WHEN THE TRANSCRIPT STOPS BEING A READING SURFACE.
//
// ⚠⚠⚠ THIS IS A READABILITY THRESHOLD, NOT A LAYOUT FLOOR. Nothing here imposes
// a `minHeight` on the feed, and nothing here may ever be used to. OTA-179 made
// the feed DELIBERATELY sacrificial — `flex:1, flexShrink:1, minHeight:0` — so
// that when vertical space runs out the transcript yields and the bottom action
// row stays reachable. That trade is correct and is preserved exactly. The feed
// is still allowed to collapse to nothing.
//
// What was missing is that nobody NOTICED when it did. On a short screen with a
// tall combat control stack the feed reaches zero and the player simply has no
// narrative at all, with no way back to it. So this module answers one question
// and only one:
//
//     "has the inline transcript become too small to serve as the PRIMARY
//      reading surface?"
//
// Crossing the threshold does not resize anything. It arms an alternate reader.
//
// ⚠⚠ THE NUMBER IS DERIVED FROM THE FEED'S OWN TYPOGRAPHY, NOT CHOSEN. A
// threshold picked by eye is a threshold nobody can defend when the type changes
// underneath it. AdventureFeed imports these same three metrics into its
// StyleSheet, so they are the single owner of the feed's body line box and its
// frame — change the feed's padding or line height and this threshold follows on
// its own.
//
// ⚠ AND IT IS A HEIGHT, NEVER A DEVICE. No model name, no platform branch, no
// window-height comparison. The runtime signal is the MEASURED height of the
// feed container, which is the only value that already accounts for every
// pressure source at once: screen size, the combat control stack, wrapped place
// chips, a vendor or wanderer chip, the keyboard, rotation and safe areas.

/** Line box of an ordinary narrative body line (`AdventureFeed` styles.body). */
export const NARRATIVE_BODY_LINE_HEIGHT = 22;

/** Inner padding of the feed's own container, per edge. */
export const NARRATIVE_FEED_PADDING = 8;

/** Hairline on the feed's container AND on the panel frame around it, per edge. */
export const NARRATIVE_FEED_BORDER = 1;

/**
 * ⚠ FOUR LINES, AND WHY FOUR IS THE DETERMINISTIC READING OF "READABLE".
 *
 * The owner's definition is "roughly four readable lines of narrative". Four is
 * not arbitrary in this feed: an entry is a channel tag plus a wrapped body, and
 * the shortest thing the feed is asked to present as prose — an arbiter line or
 * a world beat — routinely wraps to three or four lines at `fontSize 14` in this
 * column width. Below four the surface can no longer show one complete thought,
 * which is exactly the point at which it stops being a reader and becomes a
 * status sliver.
 *
 * ⚠ MEASURED IN BODY LINES ONLY. The per-entry tag, its 4pt gap and the
 * paragraph margins are deliberately NOT counted: they are CONTENT and they
 * scroll. Counting them would inflate the threshold with pixels the player can
 * still reach by dragging. Only chrome that permanently costs VIEWPORT is
 * counted below.
 */
export const READABLE_NARRATIVE_LINES = 4;

/**
 * Chrome between the measured box and the first body line, both edges.
 *
 * The measured box is the feed's outer panel: `panelFrame` hairline, then
 * AdventureFeed's own container border and padding.
 */
export const NARRATIVE_FEED_CHROME =
  2 * (NARRATIVE_FEED_BORDER + NARRATIVE_FEED_PADDING + NARRATIVE_FEED_BORDER);

/**
 * The height the feed's outer panel needs in order to show
 * `READABLE_NARRATIVE_LINES` body lines.
 *
 *   4 × 22 (body lines)                                        = 88
 *   2 × (1 panelFrame + 8 container padding + 1 container rim) = 20
 *                                                               ---
 *                                                               108
 *
 * ⚠ Again: this is the height at which the inline feed stops being the primary
 * reader. It is NOT a size the feed is forced to take.
 */
export const CONSTRAINED_NARRATIVE_MIN_HEIGHT =
  READABLE_NARRATIVE_LINES * NARRATIVE_BODY_LINE_HEIGHT + NARRATIVE_FEED_CHROME;

/**
 * Is the narrative viewport too small to read from?
 *
 * ⚠ `null` means NOT YET MEASURED and must answer `false`. A first frame that
 * guessed "constrained" would flash the expand affordance onto every screen for
 * one frame before the real layout arrived, on phones that were never
 * constrained at all.
 */
export function isNarrativeConstrained(measuredHeight: number | null): boolean {
  if (measuredHeight === null) return false;
  return measuredHeight < CONSTRAINED_NARRATIVE_MIN_HEIGHT;
}
