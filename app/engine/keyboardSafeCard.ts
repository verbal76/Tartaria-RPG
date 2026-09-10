// ⚠⚠⚠ OTA-1718 — CAN THE PLAYER REACH THE BUTTON WITH THE KEYBOARD OPEN?
//
// Reported on an iPhone 14: on REPORT A BUG, tapping DESCRIBE THE ISSUE opens
// the keyboard, the keyboard covers the SEND button, and the form cannot be
// scrolled far enough to expose it. The owner's read is the right one and it is
// why this file exists rather than a patch to one modal:
//
//   *"this is not really a 'keyboard won't collapse' bug. The Report Bug screen
//   is failing to remain actionable when the iOS keyboard is open. The user
//   shouldn't have to know how to dismiss the keyboard just to submit."*
//
// So a DONE button is not the fix. It is a courtesy on top of the fix. The fix
// is that a card with a text field in it must be laid out inside the space the
// keyboard leaves, not inside the whole screen.
//
// ⚠⚠ WHY THE ARITHMETIC LIVES HERE, AWAY FROM THE COMPONENTS. The failure needs
// a real OS keyboard and a real screen to reproduce, which means it cannot be
// caught by any test that runs here — the same reason keyboardPoll.ts exists.
// What CAN be tested is the decision: given a window height, the keyboard's top
// edge and a card's fixed chrome, is the footer inside the visible box? Put that
// in one pure function and the acceptance criteria stop being a claim in a
// commit message and become arithmetic a test can run for every device on the
// list — including the 4.7" SE, whose usable height with the keyboard open is
// the smallest target the game has.

/** Where the card has to fit. `keyboardTop` is the keyboard's top edge in SCREEN
 *  coordinates — iOS reports it directly as `endCoordinates.screenY`, and it
 *  already accounts for the home indicator and the predictive-text bar, which is
 *  precisely why this is measured rather than guessed at with a fixed offset.
 *  With the keyboard closed it equals `windowHeight`. */
export interface CardViewport {
  windowHeight: number;
  keyboardTop: number;
}

/** Breathing room kept above and below a centred card, top and bottom each. */
export const CARD_MARGIN = 16;

/** The least a scrolling body may shrink to before the card stops being a form
 *  and becomes a squeeze. Below this the caller should be showing less, not
 *  laying out smaller. */
export const MIN_BODY_HEIGHT = 64;

/** The bottom edge the card must stay above. Never below the window, and never
 *  above zero however strange the numbers a device reports. */
export function visibleBottom(vp: CardViewport): number {
  const top = Number.isFinite(vp.keyboardTop) ? vp.keyboardTop : vp.windowHeight;
  return Math.max(0, Math.min(vp.windowHeight, top));
}

/** How much of the keyboard is actually covering the window. 0 when closed. */
export function keyboardInset(vp: CardViewport): number {
  return Math.max(0, vp.windowHeight - visibleBottom(vp));
}

/** ⚠ THE ONE NUMBER EVERY CARD NEEDS: how tall it may be. A percentage of the
 *  WINDOW — which is what these modals used — is the defect, because it does not
 *  know the keyboard exists. */
export function cardMaxHeight(vp: UsableViewport): number {
  return Math.max(0, usableBottom(vp) - usableTop(vp) - CARD_MARGIN * 2);
}

/* ══════════════════════════════════════════════════════════════════════════
   ⚠⚠⚠ OTA-1799 — THE SAME QUESTION, ASKED BY EVERYTHING THAT SCROLLS.
   ══════════════════════════════════════════════════════════════════════════
   OTA-1718 built the arithmetic above for one question — can the player reach
   SEND with the keyboard open — and it has been right about that question ever
   since. The viewport audit found the question is more general than the file it
   lives in, and found a second shape of the same defect on a physical Android
   phone: APPLY ACID FLASK listed every coatable weapon in the pack as a PINNED
   action row, so the rows grew past the card's own boundary, off the bottom of
   the screen, and into the system navigation region.

   ⚠⚠ THAT IS THE MIRROR OF OTA-1614. OTA-1614 stopped the BODY growing the card
   past the screen by giving the body a scroll and pinning the buttons below it.
   It could not have anticipated a caller putting a DYNAMIC POPULATION into the
   pinned row — the one region whose whole job is never to move. The rule is the
   same either way, and it is worth stating once, plainly:

       NOTHING WHOSE HEIGHT COMES FROM DATA MAY BE UNBOUNDED.

   ⚠ WHAT IS ADDED HERE, AND WHAT DELIBERATELY IS NOT. Added: edge insets, so
   "usable" can mean what the platform actually leaves rather than the raw
   window; and `layoutCard`, which answers what each scrolling region ACTUALLY
   gets once the ceiling is applied. NOT added: any notion that a fixed size is
   suspect. A 44dp control is a 44dp control. This file answers one question —
   HOW MUCH SPACE DOES THIS FLEXIBLE BODY HAVE — and it now answers it for
   action rows as well as for prose.

   ⚠ EVERY EXISTING CONSUMER IS UNCHANGED. Insets default to zero, and with zero
   insets `usableBottom`/`usableTop` reduce to `visibleBottom`/0, so
   `cardMaxHeight` returns exactly what it returned before. */

/** What the platform reserves at the edges of the window: the notch and status
 *  bar above, the home indicator or Android navigation bar below. Zero on a
 *  device that reserves nothing, which is why zero is the default. */
export interface EdgeInsets {
  top: number;
  bottom: number;
}

export const NO_INSETS: EdgeInsets = { top: 0, bottom: 0 };

/** A viewport that also knows what the platform is keeping. `CardViewport` is
 *  this with no insets, which is why every existing caller still type-checks. */
export interface UsableViewport extends CardViewport {
  insets?: EdgeInsets;
}

/** The first row of pixels the app may actually paint into. */
export function usableTop(vp: UsableViewport): number {
  const t = vp.insets?.top;
  return typeof t === 'number' && Number.isFinite(t) ? Math.max(0, t) : 0;
}

/** The last row of pixels the app may actually paint into: whichever comes
 *  first, the keyboard's top edge or the start of the system's own furniture. */
export function usableBottom(vp: UsableViewport): number {
  const b = vp.insets?.bottom;
  const reserved = typeof b === 'number' && Number.isFinite(b) ? Math.max(0, b) : 0;
  return Math.max(0, Math.min(visibleBottom(vp), vp.windowHeight - reserved));
}

/** Everything between the two — the number a scrolling body is entitled to ask
 *  about before it decides how tall to be. */
export function usableHeight(vp: UsableViewport): number {
  return Math.max(0, usableBottom(vp) - usableTop(vp));
}

/** A card's parts, sorted by what they can do under pressure. */
export interface CardRegions {
  /** Chrome that cannot give: header, padding, borders, a pinned rule. */
  fixed: number;
  /** Natural heights of the regions that CAN scroll, in render order. A
   *  region's natural height is what it would be with nothing in its way. */
  scrollable: number[];
}

/** ⚠⚠ WHAT THE CARD ACTUALLY BECOMES. Given the room available and the parts,
 *  return the card's height and what each scrolling region really gets.
 *
 *  The rule matches Yoga's, because the layout IS Yoga's: regions that may
 *  shrink absorb the shortfall in proportion to their natural height, which is
 *  what equal `flexShrink` does. When there is room, every region gets its
 *  natural height and the card is exactly as tall as it was before this file
 *  existed — that is the property the audit's negative control turns on, and it
 *  is why adopting this costs nothing on a roomy screen.
 *
 *  `overflowed` is the honest failure: chrome alone taller than the ceiling.
 *  Nothing can scroll its way out of that, and a caller that sees it is being
 *  told to show less rather than to lay out smaller. */
export function layoutCard(
  vp: UsableViewport,
  regions: CardRegions,
): { cardHeight: number; regionHeights: number[]; overflowed: boolean } {
  const ceiling = cardMaxHeight(vp);
  const fixed = Math.max(0, regions.fixed);
  const natural = regions.scrollable.map((h) => Math.max(0, h));
  const naturalTotal = natural.reduce((a, b) => a + b, 0);

  if (fixed >= ceiling) {
    return { cardHeight: ceiling, regionHeights: natural.map(() => 0), overflowed: true };
  }
  const forRegions = ceiling - fixed;
  if (naturalTotal <= forRegions) {
    return { cardHeight: fixed + naturalTotal, regionHeights: natural, overflowed: false };
  }
  const scale = forRegions / naturalTotal;
  return { cardHeight: ceiling, regionHeights: natural.map((h) => h * scale), overflowed: false };
}

/** ⚠ THE CHOOSER INVARIANT, AS ARITHMETIC. A chooser is sound when the card
 *  stays inside its ceiling and its chrome still fits — however many targets the
 *  player's pack happens to hold. Growing the population must grow the
 *  SCROLLABLE CONTENT, never the card. */
export function cardStaysBounded(vp: UsableViewport, regions: CardRegions): boolean {
  const out = layoutCard(vp, regions);
  return !out.overflowed && out.cardHeight <= cardMaxHeight(vp) + 0.5;
}

/** Fixed chrome: the parts of a card that do not scroll. The footer is the row
 *  the report is about. */
export interface CardChrome {
  header: number;
  footer: number;
  /** The card's own vertical padding + borders. */
  padding: number;
}

/** ⚠⚠⚠ THE ACCEPTANCE TEST, AS ARITHMETIC. "Focus the description field, type
 *  enough to make several lines, leave the keyboard open, and verify the player
 *  can reach and activate SEND." That is true exactly when the header, the
 *  footer and a usable body all fit above the keyboard — the body scrolls, so
 *  the amount of text typed cannot change the answer. */
export function footerIsReachable(vp: UsableViewport, chrome: CardChrome): boolean {
  return bodyHeight(vp, chrome) >= MIN_BODY_HEIGHT;
}

/** What is left for the scrolling middle once the chrome is paid for. */
export function bodyHeight(vp: UsableViewport, chrome: CardChrome): number {
  return cardMaxHeight(vp) - chrome.header - chrome.footer - chrome.padding;
}

/** ⚠ THE TEST TARGETS, IN THE SOURCE. The owner: *"Do not solve this only for
 *  iPhone 14 dimensions. It needs to work across small iPhones as well,
 *  particularly iPhone SE 3 / 4.7-inch, since that is now a test target."*
 *
 *  Portrait point heights, with a deliberately PESSIMISTIC keyboard: the figures
 *  below are at or above the tallest ordinary configuration (letters keyboard
 *  plus predictive bar plus home-indicator inset), because a layout rule that
 *  only holds for the average keyboard fails the first time somebody turns on a
 *  third-party one. Nothing in the app reads these at runtime — they exist so
 *  the reachability rule is checked against real devices in the suite. */
export const DEVICE_PROFILES: Record<string, CardViewport> = {
  // 4.7" — the smallest target, and the brutal one.
  'iPhone SE 3': { windowHeight: 667, keyboardTop: 667 - 260 },
  'iPhone 8': { windowHeight: 667, keyboardTop: 667 - 260 },
  // 5.4" — the smallest of the modern notch phones.
  'iPhone 13 mini': { windowHeight: 812, keyboardTop: 812 - 336 },
  'iPhone 14': { windowHeight: 844, keyboardTop: 844 - 336 },
  'iPhone 15 Pro Max': { windowHeight: 932, keyboardTop: 932 - 346 },
};
