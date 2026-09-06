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
export function cardMaxHeight(vp: CardViewport): number {
  return Math.max(0, visibleBottom(vp) - CARD_MARGIN * 2);
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
export function footerIsReachable(vp: CardViewport, chrome: CardChrome): boolean {
  return bodyHeight(vp, chrome) >= MIN_BODY_HEIGHT;
}

/** What is left for the scrolling middle once the chrome is paid for. */
export function bodyHeight(vp: CardViewport, chrome: CardChrome): number {
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
