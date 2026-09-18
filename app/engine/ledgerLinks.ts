/* ⚠⚠⚠ OTA-1845 — THE LEDGER OF THE FALLEN: THE INVITATION, AND THE DOOR IT OPENS.
 *
 * Everything in this file is PURE — string in, string out, no I/O, no platform.
 * That is deliberate: the one thing a link handler must never be is a place
 * where authority quietly accumulates. Parsing a link answers exactly one
 * question — "is there a house card in here?" — and the pairing gate that has
 * decided who may ride with this install since OTA-1362 goes on deciding it.
 *
 * ⚠⚠ THE SCHEME IS NOT NEW AND WAS NOT ADDED HERE. `tartariarealms` has been in
 * app.json since the scaffold commit, which means every binary ever built
 * already carries it: Expo's prebuild writes it into the Android manifest as a
 * VIEW/BROWSABLE intent-filter and into the iOS Info.plist as CFBundleURLTypes,
 * from the same config key, through plugins that are in its DEFAULT list. What
 * was missing was never native — it was that nothing in JavaScript ever LISTENED.
 *
 * ⚠⚠ A LEDGER ENTRY DOES NOT TRAVEL IN A LINK, AND THAT IS MEASURED, NOT FEARED.
 * At the existing caps a sealed exchange body is 101,709 bytes and the link that
 * would carry it is 163,061 characters; a SINGLE Fallen is still 4,101. A house
 * request is 183. So the two use different transports because they are different
 * sizes, and the entry keeps the OS share path OTA-1842 proved.
 */

/** The app's own scheme. Read from here, never re-typed. */
export const LEDGER_SCHEME = 'tartariarealms';

/** The one route this OTA owns. */
export const LEDGER_REQUEST_HOST = 'ledger';
export const LEDGER_REQUEST_PATH = 'request';

/** ⚠ What a link may weigh before a mail client is likely to mangle or truncate
 *  it. It is a PRESENTATION bound, not a security one — nothing downstream
 *  trusts a link's length — and it is why an entry is not offered as one. */
export const LINK_SAFE_CHARS = 2000;

/** The invitation link. The card rides as a query value and is encoded once
 *  here; `makeHouseCode` has already encoded its own body, so a card containing
 *  a house name with a space survives both layers intact. */
export function buildRequestLink(houseCard: string): string {
  return `${LEDGER_SCHEME}://${LEDGER_REQUEST_HOST}/${LEDGER_REQUEST_PATH}?c=${encodeURIComponent(houseCard)}`;
}

export type LedgerRoute = { kind: 'request'; card: string };

/** ⚠⚠ TOTAL BY CONTRACT. Anything that is not one of this app's own ledger links
 *  answers `null` — a foreign scheme, a wrong host, a missing parameter, a
 *  string that is not a string, an encoding that will not decode. It never
 *  throws at the caller, and it never decides anything: a card returned from
 *  here still has to satisfy `parseHouseCode`'s checksum and then the pairing
 *  gate, exactly as a pasted card does. The link is a courier, not a warrant. */
export function parseLedgerLink(url: unknown): LedgerRoute | null {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return null;
  const prefix = `${LEDGER_SCHEME}://${LEDGER_REQUEST_HOST}/${LEDGER_REQUEST_PATH}?`;
  if (!raw.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const query = raw.slice(prefix.length);
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    if (pair.slice(0, eq) !== 'c') continue;
    let card: string;
    try { card = decodeURIComponent(pair.slice(eq + 1)); } catch { return null; }
    card = card.trim();
    if (!card) return null;
    return { kind: 'request', card };
  }
  return null;
}

// ---------------------------------------------------------------------------
// the message a person actually sends
// ---------------------------------------------------------------------------
/** ⚠ The subject line. Named for what it is to the RECEIVER — a person asking
 *  for something — never for the mechanism carrying it. */
export function inviteSubject(house: string): string {
  const h = house.trim() || 'a house';
  return `${h} asks for your help — Tartaria`;
}

/** ⚠⚠ THE BODY, AND WHY IT CARRIES BOTH HALVES.
 *
 *  A mail client will often render `tartariarealms://…` as plain text rather
 *  than as something tappable, because it is not a web address. Sending ONLY
 *  the link would therefore leave some receivers holding a dead line of text —
 *  §5's "do not fake an OPEN IN TARTARIA link that opens a dead end". So the
 *  message carries the link AND the house card itself: tap it if your mail app
 *  lets you, paste the card if it does not. Both roads end at the same preview,
 *  and neither is a fallback pretending to be the main path.
 *
 *  ⚠ NOTHING ELSE OF THE SENDER'S SAVE IS IN HERE. No inventory, no stats, no
 *  currency, no quest state, no device identifier in readable prose. The card
 *  is the one technical string, and it is the same one the player has been able
 *  to text since OTA-1362. */
export function inviteBody(a: { character?: string; house: string; card: string; link: string }): string {
  const house = a.house.trim() || 'an unnamed house';
  const who = a.character?.trim()
    ? `${a.character.trim()} of ${house}`
    : `A rider of ${house}`;
  return [
    `${who} is asking for your help.`,
    ``,
    `Some of my people died out in the wastes and are still walking. I cannot`,
    `put them down from here. If you take my house into your Ledger of the`,
    `Fallen, they can cross into your world — and if you find them, you can end`,
    `it for them.`,
    ``,
    `Open in Tartaria:`,
    a.link,
    ``,
    `If that line does not open the game, copy the house card below and paste it`,
    `into THE LEDGER OF THE FALLEN → ACCEPT THEIR CARD.`,
    ``,
    a.card,
    ``,
  ].join('\n');
}

/** ⚠⚠ THE COMPOSE SURFACE, AND TARTARIA NEVER PRESSES SEND.
 *
 *  This builds a `mailto:` for the operating system to open. The recipient is
 *  left EMPTY on purpose: the player types or picks who they are asking, and
 *  the send is their finger on their own mail app's button. There is no SMTP
 *  here, no API mailer, no relay and no background service — the precedent is
 *  INVITE PLAYTESTER in AboutScreen, and OTA-1665's ruling that mail is for
 *  "a short human request to a person", which is exactly what this is. */
export function buildInviteMailto(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The same invitation for a share sheet, where there is no subject line. */
export function inviteShareText(subject: string, body: string): string {
  return `${subject}\n\n${body}`;
}
