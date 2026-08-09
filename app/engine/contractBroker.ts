// OTA-1208 — THE TRADING POST TAKES ANY FACTION'S CONTRACT, FOR A CUT.
//
// ⚠⚠ WHAT THIS CLOSES (PUNCHLIST P2). A mystery or storyline can only be handed to a
// vendor whose faction posted it. Four vendors are anchored in the shared outpost layout
// and stand at EVERY outpost in the game — but between them they answer for only three
// factions, and any other faction's agent can arrive solely through `pickRandomVendor()`,
// a uniform roll over 30 vendors. Sixteen to twenty contracts (the count depends on the
// player's own faction — see PUNCHLIST P2) were therefore closable only by grinding a
// 1-in-30 spawn.
//
// ⚠⚠ WHY THE BROKER AND NOT THE COURIER. The obvious fix is to switch the OTA-456 remote
// "send word" hand-in back on. That reverses a decision the owner made deliberately
// (OTA-824: *"kill all remote hand-ins, make all routable, but make the journey worth the
// loot"*). A hand-in to the trading post reverses **nothing** — it is still face to face,
// still at an outpost the player travelled to, still routable. It simply stops requiring
// that a specific 1-in-30 stranger be standing there when you arrive.
//
// ⚠⚠ SCOPED TO ONE VENDOR BY ID, AND THAT IS LOAD-BEARING. Six vendors carry
// `faction: null`, and four of them — Naha, Thalan, Velar Shadowblade, Elara Lightfinger —
// are wanderers and specialists who spawn ON THE ROAD via the roadside-trader roll. Keying
// this on `faction === null` would let a player close contracts at any drifter they bumped
// into between tiles, which deletes the travel that OTA-824 exists to protect. Keying it
// on the trading post keeps the rule "reach an outpost."
//
// Halem is the right — and only — vendor for it on the merits, not just by elimination:
// he anchors `outpost_gate` and `outpost_messhall` in `static_hub.json`, the layout every
// outpost shares, so he is the first face inside any gate in the world; and he is already
// written as the man everything passes through — *"Everything on this post came off
// somebody who needed something else more… things that have changed hands enough times to
// look new."* (`dialogue_topics.json:173`)

/** The one vendor who brokers other factions' contracts. Matched on `id`, never on
 *  `faction === null` — see the header. */
export const CONTRACT_BROKER_VENDOR_ID = 'halem_trader';

/** The broker's cut. He keeps 20%, so the player is paid 80% of base.
 *
 *  ⚠ Deliberately worse than carrying it to the faction yourself, which pays base PLUS
 *  the long-haul bonus (up to 1.5× base). Going to the right people stays the better
 *  play by a wide margin — the fallback exists so the loop can always END, not so it
 *  can be the default. */
export const BROKER_PLAYER_SHARE = 0.8;

/** Anything with an `id` — `VendorInstance`, a scene vendor, a test double. Kept
 *  structural so this module pulls in nothing from the vendor layer. */
interface VendorLike {
  id?: string | null;
}

/** Is this the trading post that brokers contracts? */
export function isContractBroker(vendor: VendorLike | null | undefined): boolean {
  return !!vendor && vendor.id === CONTRACT_BROKER_VENDOR_ID;
}

/** ⚠ THE ONE PLACE THE FACTION GATE IS DECIDED, so the four turn-in handlers cannot
 *  drift apart — they already had three different refusal wordings for the same rule.
 *
 *  `contractFactionId` of `null`/`undefined` means an unaligned contract, which every
 *  vendor has always accepted; that behaviour is preserved exactly. */
export function vendorCanTakeContract(
  vendor: (VendorLike & { faction?: string | null }) | null | undefined,
  contractFactionId: string | null | undefined,
): boolean {
  if (!vendor) return false;
  if (!contractFactionId) return true;
  if (isContractBroker(vendor)) return true;
  return contractFactionId === vendor.faction;
}

/** What the player is actually paid.
 *
 *  ⚠ THE BROKER FORFEITS THE LONG-HAUL BONUS ENTIRELY — he does not merely take a cut of
 *  it. The bonus is paid for making the trip to the faction; a hand-in that skips finding
 *  them has not made that trip, so it does not earn it. Stacking a journey bonus on top of
 *  a broker's cut would have made the fallback competitive with the real thing at distance,
 *  which is exactly backwards.
 *
 *  Rep is NOT reduced anywhere — the work was done, and word reaches them either way.
 *  Only the coin moves. */
export function contractPayoutTc(
  baseTc: number,
  journeyBonusTc: number,
  viaBroker: boolean,
): number {
  const base = Math.max(0, Math.round(baseTc));
  if (!viaBroker) return base + Math.max(0, Math.round(journeyBonusTc));
  // ⚠ Floor at 1 TC for any contract that paid anything at all. A rounding result of 0
  // on a small contract reads to the player as "the hand-in did nothing" — the precise
  // complaint PUNCHLIST P1 was filed for, and not a thing to reintroduce here.
  return base > 0 ? Math.max(1, Math.round(base * BROKER_PLAYER_SHARE)) : 0;
}

/** The line Halem says when he takes somebody else's contract. Kept here beside the
 *  numbers so the cut and the sentence describing it can never disagree. */
export function brokerAcceptLine(vendorName: string, contractFactionLabel: string): string {
  const pct = Math.round((1 - BROKER_PLAYER_SHARE) * 100);
  return `${vendorName} reads it twice, then reaches under the counter for his ledger. "The ${contractFactionLabel} aren't here, and you're not carrying this around until they are. I'll see it reaches them — word and proof both." He counts out your share and taps the column he wrote it in. "${pct} percent for the carrying. Cheaper than the walk."`;
}
