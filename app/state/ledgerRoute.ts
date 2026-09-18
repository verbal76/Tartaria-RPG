/* ⚠⚠⚠ OTA-1845 — THE DOOR THAT WAS ALREADY THERE AND NOBODY WAS STANDING AT.
 *
 * The audit found the native half of deep linking complete on both platforms:
 * `scheme: "tartariarealms"` has been in app.json since the scaffold commit, so
 * Expo's prebuild has been writing an Android VIEW/BROWSABLE intent-filter and
 * an iOS CFBundleURLTypes entry into every binary ever built. What was missing
 * was entirely on this side — nothing in JavaScript ever called
 * `getInitialURL` or listened for a `url` event, so an opened link launched the
 * app to its ordinary first screen and the link itself evaporated.
 *
 * ⚠⚠ THE LINK IS A COURIER, NOT A WARRANT. Everything that arrives here is
 * treated as a string somebody could have typed: it is parsed by a total
 * function that answers `null` for anything unexpected, and whatever it yields
 * still has to satisfy the house card's checksum and then `acceptHouseCode`.
 * No link accepts a pairing, no link imports anything, and no link can reach
 * past the gate that has decided who may ride with this install since OTA-1362.
 *
 * ⚠ AND IT NEVER AUTO-ACCEPTS. The most a link does is put the app on the
 * Ledger screen with a card already in the box. A person still presses the
 * button.
 */
import { Linking } from 'react-native';
import { parseLedgerLink } from '../engine/ledgerLinks';

/** The card a link delivered, waiting for the Ledger screen to pick it up. */
let PENDING_CARD: string | null = null;
const LISTENERS = new Set<() => void>();

function announce(): void {
  for (const fn of LISTENERS) { try { fn(); } catch { /* a bad listener is not a routing failure */ } }
}

/** ⚠ TAKE, not read: the card is consumed, so re-entering the screen later does
 *  not silently re-offer a pairing the player already dealt with. */
export function takePendingHouseCard(): string | null {
  const c = PENDING_CARD;
  PENDING_CARD = null;
  return c;
}

export function onPendingHouseCard(fn: () => void): () => void {
  LISTENERS.add(fn);
  return () => { LISTENERS.delete(fn); };
}

export function _setPendingCardForTests(c: string | null): void { PENDING_CARD = c; }

/** ⚠⚠ THE WHOLE ROUTING DECISION, AND IT IS TOTAL. A foreign scheme, a wrong
 *  path, a missing parameter, a broken encoding — every one of them answers
 *  false and changes nothing. A malformed link is not an error state the player
 *  has to be told about; it is simply not one of ours. */
export function routeLedgerUrl(url: unknown, go: (screen: string) => void): boolean {
  const parsed = parseLedgerLink(url);
  if (!parsed) return false;
  PENDING_CARD = parsed.card;
  announce();
  try { go('fallen'); } catch { /* the card is still pending; the screen will find it */ }
  return true;
}

/** Start listening. COLD launch is `getInitialURL`; WARM delivery is the `url`
 *  event, which Android reaches through `singleTask` → `onNewIntent` and iOS
 *  through `openURL`. Returns its own teardown, for the reason OTA-1798 gave:
 *  an instrument that does not stop when the app does is a leak. */
export function startLedgerRouting(go: (screen: string) => void): () => void {
  let stopped = false;
  const sub = Linking.addEventListener('url', ({ url }) => {
    if (!stopped) routeLedgerUrl(url, go);
  });
  void Linking.getInitialURL()
    .then((url) => { if (!stopped && url) routeLedgerUrl(url, go); })
    .catch(() => { /* no initial url is the ordinary case */ });
  return () => {
    stopped = true;
    try { sub.remove(); } catch { /* already gone */ }
  };
}
