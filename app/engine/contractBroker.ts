// OTA-1185 — THE TRADING POST TAKES ANY FACTION'S CONTRACT, FOR A CUT.
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

/** The trading post's cut. He keeps 20%, so the player is paid 80% of base.
 *
 *  ⚠ Deliberately worse than carrying it to the faction yourself, which pays base PLUS
 *  the long-haul bonus (up to 1.5× base). Going to the right people stays the better
 *  play by a wide margin — the fallback exists so the loop can always END, not so it
 *  can be the default. */
export const BROKER_PLAYER_SHARE = 0.8;

// ═══════════════════════════════════════════════════════════════════════════════════════
// OTA-1192 — THE HIDDEN MARKET BROKERS TURN-INS TOO (PUNCHLIST P10).
//
// ⚠⚠ THE DEFECT WAS AN ASYMMETRY. `isBrokerVendorId` has made `hidden_market_*` stalls
// post EVERY faction's open work since OTA-782 — *"so there's always a board to pick from
// no matter who you've been running with."* The TURN-IN gate was never given the same rule.
// **A stall rostered to a Stone Builders rep would hand you a Mud Monarch mystery and then
// refuse to take it back.** A broker that brokers in one direction only.
//
// ⚠⚠ AND IT TAKES A SMALLER CUT THAN THE TRADING POST — 10% against Halem's 20%. That is
// not generosity, it is geography. Halem stands at the gate of EVERY outpost in the world;
// the Hidden Market is ONE location out past the frontier camps in the Sunken Middens that
// you have to go to. Charging the same rate at both would make the trip pointless, and the
// long-haul principle this project just spent OTA-1187 fixing says travel should pay.
//
// So the ladder reads, best to worst:
//   • the posting faction's own agent — 100% + the long-haul bonus (up to 1.5× base)
//   • a Hidden Market stall             —  90%, no bonus  (you made a journey)
//   • the trading post at any gate      —  80%, no bonus  (you made none)
export const HIDDEN_MARKET_PLAYER_SHARE = 0.9;

/** Is this one of the Hidden Market's four canvas stalls?
 *
 *  ⚠ Matched on the id prefix, the same way the accept side has always matched them. The
 *  comment at `gameStore.ts:5892` records that nothing else can mint a `hidden_market_*`
 *  id, so the prefix is a safe key rather than a guess. */
export function isHiddenMarketStall(vendor: VendorLike | null | undefined): boolean {
  return !!vendor && typeof vendor.id === 'string' && vendor.id.startsWith('hidden_market_');
}

/** The share of base TC the player keeps when this vendor brokers somebody else's
 *  contract, or `null` when this vendor is not a broker at all.
 *
 *  ⚠ ONE function decides both WHO brokers and AT WHAT RATE. Splitting those into a
 *  boolean and a separate lookup is how a new broker gets added to one and not the other. */
export function brokerShareFor(vendor: VendorLike | null | undefined): number | null {
  if (isHiddenMarketStall(vendor)) return HIDDEN_MARKET_PLAYER_SHARE;
  if (!!vendor && vendor.id === CONTRACT_BROKER_VENDOR_ID) return BROKER_PLAYER_SHARE;
  return null;
}

/** Anything with an `id` — `VendorInstance`, a scene vendor, a test double. Kept
 *  structural so this module pulls in nothing from the vendor layer. */
interface VendorLike {
  id?: string | null;
}

/** Does this vendor broker other factions' contracts at all?
 *
 *  ⚠ Derived from `brokerShareFor` rather than listing ids again — OTA-1192 added a second
 *  broker, and two independent lists is how one of them silently stops being honoured. */
export function isContractBroker(vendor: VendorLike | null | undefined): boolean {
  return brokerShareFor(vendor) !== null;
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
  /** ⚠ OTA-1192 — the player's SHARE, or `null` for a direct hand-in. This was a boolean
   *  until the Hidden Market arrived at a different rate; a boolean cannot express two
   *  brokers, and adding a second flag beside it would have been the same mistake with
   *  more words. Pass `brokerShareFor(vendor)`. */
  brokerShare: number | null,
): number {
  const base = Math.max(0, Math.round(baseTc));
  if (brokerShare === null) return base + Math.max(0, Math.round(journeyBonusTc));
  // ⚠ Floor at 1 TC for any contract that paid anything at all. A rounding result of 0
  // on a small contract reads to the player as "the hand-in did nothing" — the precise
  // complaint PUNCHLIST P1 was filed for, and not a thing to reintroduce here.
  return base > 0 ? Math.max(1, Math.round(base * brokerShare)) : 0;
}

/** The line Halem says when he takes somebody else's contract. Kept here beside the
 *  numbers so the cut and the sentence describing it can never disagree. */
export function brokerAcceptLine(
  vendorName: string,
  contractFactionLabel: string,
  /** ⚠ The share actually applied, so the sentence and the maths cannot disagree. It used
   *  to read `BROKER_PLAYER_SHARE` directly, which would have quoted 20% at a Hidden Market
   *  stall charging 10%. */
  brokerShare: number = BROKER_PLAYER_SHARE,
): string {
  const pct = Math.round((1 - brokerShare) * 100);
  return `${vendorName} reads it twice, then reaches under the counter for a ledger. "The ${contractFactionLabel} aren't here, and you're not carrying this around until they are. I'll see it reaches them — word and proof both." They count out your share and tap the column they wrote it in. "${pct} percent for the carrying. Cheaper than the walk."`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// OTA-1188 — THE COURIER, RESTORED (PUNCHLIST P3).
//
// OTA-456 shipped a remote "send word" hand-in; OTA-824 killed it on the owner's call:
// *"kill all remote hand-ins, make all routable, but make the journey worth the loot — no
// 32-time trip worth 20 TC."* The P3 audit established that the anti-farming rationale it
// was later remembered for was never the actual rationale — the words farm/grind/repeat
// appear in none of OTA-456/810/824/900 — and that farming cannot occur on this content
// anyway: all 115 contracts are one-shot, and the one repeatable contract (the faction
// bounty) already pays out remotely on the killing blow and always did.
//
// ⚠⚠ WHAT THE COURIER MAY AND MAY NOT CARRY, and neither line is arbitrary:
//   • HUNTS — NEVER. OTA-810 is the owner's explicit call: *"a bounty is paid face to
//     face."* The trophy is the proof and proof is shown in person.
//   • FETCH QUESTS — NEVER. OTA-456: *"you can't mail the goods."* A delivery names a
//     destination; a runner does not carry freight.
//   • Mysteries, storylines, non-fetch faction deeds — YES. These are REPORTS. A runner
//     can carry a report, which is precisely the distinction OTA-456 drew.
export const COURIER_PLAYER_SHARE = 0.75;   // the runner's 25% cut
export const COURIER_DELAY_HOURS = 12;      // in-game hours the runner costs you

/** ⚠⚠ THE DELAY IS CHARGED UP FRONT, NOT DEFERRED — AND THAT IS A DELIBERATE DEPARTURE
 *  FROM THE AUDIT'S OWN PROPOSAL, which said "12 in-game hours before it credits."
 *
 *  A deferred payout needs a persisted pending-payout queue, a tick that matures it, a
 *  credit path, and a save migration — a new system whose failure mode is **a payout that
 *  never arrives.** PUNCHLIST P1 and P2 were both filed for loops that end in nothing;
 *  closing P3 by building a fourth way for one to happen would be an own goal.
 *
 *  Charging the hours immediately costs the player exactly the same thing — bounty
 *  deadlines, weather, dog loyalty and contract lapse all tick against them — with no
 *  queue, no migration, and no way for the reward to go missing. Same intent, none of the
 *  risk. */
export function courierPayoutTc(baseTc: number): number {
  const base = Math.max(0, Math.round(baseTc));
  // ⚠ No long-haul bonus is passed in on purpose: the bonus pays for making the trip, and
  // a courier hand-in is the trip not being made.
  return base > 0 ? Math.max(1, Math.round(base * COURIER_PLAYER_SHARE)) : 0;
}

/** The line the Arbiter speaks when a runner takes it. Kept beside the numbers so the
 *  copy and the maths cannot disagree about the cut or the hours. */
export function courierSentLine(contractTitle: string, paidTc: number): string {
  const pct = Math.round((1 - COURIER_PLAYER_SHARE) * 100);
  return `You find a runner and send word on ${contractTitle}. `
    + `They take ${pct}% for the road and hand you ${paidTc} TC — no long-haul bonus, `
    + `you did not make the haul. Waiting on their return costs you ${COURIER_DELAY_HOURS} hours.`;
}
