// OTA-1049 — PHASE 1, SLICE 1: NPCs REMEMBER YOU.
//
// Before this, the only record of a person was `worldMemory.npcsMet` — a list
// appended once and never touched again (`recordNpcMet` returns the memory
// unchanged if the id is already present). It answered exactly one question:
// have you ever been in a room with this NPC? That is a checklist, not a
// relationship. Every vendor greeted you identically on visit 1 and visit 40,
// and the only thing that ever varied the greeting was your standing with
// their FACTION — a number they share with hundreds of strangers.
//
// This module is the per-person ledger the greeting layer reads instead.
//
// DETERMINISM IS THE POINT. Nothing here rolls dice. The Arbiter names the
// player on a per-line coin flip (arbiterAddress, ~60%) and that reads as
// variety because the Arbiter is one continuous voice. Applied to an NPC it
// would read as broken: a shopkeeper who uses your name, then doesn't, then
// does, is a shopkeeper with a head injury. So whether someone knows your name
// is a pure function of what has actually passed between you, and which line
// they greet you with is indexed off the meeting count rather than picked at
// random — varied across visits, identical on any replay of the same state.
import type { NpcRelation, NpcMet, OutpostRaid, WorldMemory, TalkTurn } from './types'; // OTA-1698 — TalkTurn
// OTA-1052 — rememberNpcMeeting pairs the two stores; see below.
import { recordNpcMet } from './worldMemory';
// OTA-1155 — see healFactionId, just above recordNpcSighting.
import { canonicalFactionId } from './factions';

/** Three separate arrivals in front of someone and they know your face. */
export const MEETINGS_FOR_NAME = 3;
/** TC across the table that marks you as real custom rather than a browser. */
export const TC_FOR_FAMILIAR = 400;
export const TC_FOR_TRUSTED = 1500;
/** In-game hours away before a greeting acknowledges the gap (3 days). */
export const LONG_ABSENCE_HOURS = 72;

/** OTA-1053 — TC of honest custom that buys back ONE caught theft.
 *
 *  OTA-1049 made `wronged` permanent and I flagged that as a decision the owner
 *  might want reversed. Permanent is the wrong call: it turns one failed DEX
 *  roll into a stall the player can never use properly again, in a game whose
 *  whole steal system is built to be attempted. But cheap forgiveness is worse
 *  — it would make theft free.
 *
 *  So amends are paid the only way that needs no new screen and reads true:
 *  you go back and give them your business, at their price. 600 TC is real
 *  money at the tier where stealing is tempting, and a SECOND theft doubles the
 *  bill, so a repeat thief digs a hole faster than they can fill it. */
export const AMENDS_TC_PER_WRONG = 600;

/** OTA-1057 — renamed from vendorLedgerId. It stopped being about vendors three
 *  OTAs ago (roadside, Hidden Market, overlay), and now covers wanderers and
 *  escort leaders too; a name that lies about its scope is how the "three
 *  install sites" comment in OTA-1055 got written. The old name stays as an
 *  alias so nothing has to churn.
 *
 *  OTA-1055 — THE ONE RULE FOR WHO SOMEBODY IS, moved here from gameStore.
 *
 *  It lived in the store as a private function, which meant the test suite
 *  re-implemented it and then tested the copy — change the real rule and every
 *  case stayed green. It also belongs here on the merits: ledger identity is
 *  this module's whole subject.
 *
 *  RUNTIME IDENTITY IS NOT LEDGER IDENTITY, and both directions have bitten:
 *   - roadside traders mint `roadside_<demeanor>_<Date.now()>`, a fresh id every
 *     spawn, while name and description come from a fixed archetype — one
 *     person split into unbounded strangers (OTA-1053).
 *   - Hidden Market stalls do the opposite: a FIXED `hidden_market_<category>`
 *     id while resolveStallIdentity rotates name, title AND faction daily across
 *     six authored reps — six people merged into one row, with the relation's
 *     faction flipping every real-world day. */
export function npcLedgerId(vendor: { id?: string; name: string }): string {
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const id = vendor.id ?? '';
  if (id.startsWith('roadside_')) return `roadside:${slug(vendor.name)}`;
  if (id.startsWith('hidden_market_')) return `${id}:${slug(vendor.name)}`;
  // OTA-1055 — elevated-overlay traders mint `overlay_<id>_<base36 ms>`, the
  // same per-spawn shape that made roadside traders litter the save. They are
  // five authored characters, so key them by who they are.
  if (id.startsWith('overlay_')) return `overlay:${slug(vendor.name)}`;
  // OTA-1057 — WANDERERS. makeWanderer mints `wanderer_<archetype>_<tile seed>`,
  // so the same person met on two tiles was two rows — the roadside leak again,
  // in a system that had no ledger presence at all. Archetype + name IS the
  // person: the cast is ARCHETYPES x FIRST_NAMES and both come off the seed.
  if (id.startsWith('wanderer_')) {
    const arch = id.split('_')[1] ?? 'traveler';
    return `wanderer:${arch}:${slug(vendor.name)}`;
  }
  // OTA-1057 — ESCORT LEADERS. The party is a POOL (label, hp, count) with no
  // individuals in it, so there was nobody to remember. The pool now names the
  // person walking at the front, and that is who goes on the ledger.
  if (id.startsWith('escort_')) return `escort:${slug(vendor.name)}`;
  return id || `vendor:${slug(vendor.name)}`;
}

/** OTA-1057 — the pre-rename name. Kept so the store's `vendorNpcId` alias and
 *  every existing import keep working. */
export const vendorLedgerId = npcLedgerId;

export type NpcRegard =
  | 'wronged'    // you stole from them, or drew on them
  | 'trusted'    // repeat business, finished work
  | 'familiar'   // a regular
  | 'known'      // they place you
  | 'met'        // seen once or twice, no dealings
  | 'stranger';  // never met

/** ⚠ OTA-1683 — WHO HOLDS EACH WRONG, AND WHAT CLEARS IT. The sheet's "N wrongs
 *  still standing" row summed these and opened nothing when tapped; this is the
 *  list behind the number, built from the SAME relations regardParts sums, so
 *  the two can never disagree. `owed` is what the next clear costs at THIS
 *  counter — AMENDS_TC_PER_WRONG per wrong outstanding, less what is already
 *  banked toward it (the recordNpcDealing rule, read back, not re-derived). */
export interface WrongsLedgerEntry {
  npcId: string;
  name: string;
  role?: string;
  /** Wrongs not yet made good with this person. */
  outstanding: number;
  /** TC already spent at their counter toward the next clear. */
  banked: number;
  /** TC still to spend with them before the next wrong clears. */
  owed: number;
}

export function wrongsLedger(
  memory: Pick<WorldMemory, 'npcRelations'> | null | undefined,
): WrongsLedgerEntry[] {
  const out: WrongsLedgerEntry[] = [];
  for (const r of Object.values(memory?.npcRelations ?? {})) {
    const outstanding = Math.max(0, (r.wrongs ?? 0) - (r.amendsCleared ?? 0));
    if (outstanding <= 0) continue;
    const banked = Math.max(0, r.amendsTc ?? 0);
    out.push({
      npcId: r.id,
      name: r.name || r.id,
      role: r.role,
      outstanding,
      banked,
      owed: Math.max(0, AMENDS_TC_PER_WRONG * outstanding - banked),
    });
  }
  return out.sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));
}

export function emptyRelation(npc: NpcMet, nowMs: number, hours: number): NpcRelation {
  return {
    id: npc.id,
    name: npc.name,
    role: npc.role,
    factionId: npc.factionId,
    firstMetAt: npc.firstMetAt ?? nowMs,
    lastSeenAt: nowMs,
    lastSeenHours: hours,
    meetings: 0,
    trades: 0,
    tcTraded: 0,
    contractsTaken: 0,
    contractsTurnedIn: 0,
    wrongs: 0,
  };
}

/** Bring a legacy save forward. Saves written before this OTA hold `npcsMet`
 *  and no relations, and a player who has already spent forty hours building
 *  rapport should not be demoted to a stranger by an update. Everyone on the
 *  old list starts as someone met once — the honest floor, since the old
 *  record genuinely does not say how often or what passed between you. */
export function seedRelationsFromMet(memory: WorldMemory): WorldMemory {
  if (memory.npcRelations) return memory;
  const rels: Record<string, NpcRelation> = {};
  for (const npc of memory.npcsMet ?? []) {
    const at = npc.firstMetAt ?? 0;
    rels[npc.id] = {
      ...emptyRelation(npc, at, npc.hoursElapsed ?? 0),
      meetings: 1,
    };
  }
  return { ...memory, npcRelations: rels };
}

export function getRelation(memory: WorldMemory, id: string): NpcRelation | null {
  return memory.npcRelations?.[id] ?? null;
}

/** One arrival in front of this NPC. Unlike recordNpcMet this is NOT
 *  idempotent — repetition is the whole signal. */
/** ⚠ OTA-1155 — A RECORDED factionId IS STICKY, so a bad one is permanent.
 *
 *  OTA-834 found four stall reps carrying RACE ids where faction ids belong and
 *  fixed the ROSTER — but never the saves. A player who met one of those vendors
 *  before that OTA keeps the race id, `applyRepChange` silently ignores it, and
 *  every rep gain through that person quietly goes nowhere (device log
 *  2026-08-06: a Rare Core Relic to Odar Flameforge, "Standing +2 — architectural
 *  sentinels", nothing moved). Healing on the WRITE means the save corrects
 *  itself the next time you stand in front of them, rather than needing every
 *  reader to remember. An id nothing answers to is kept as-is: it is somebody
 *  else's data and this is not the place to guess at it.
 *
 *  ⚠ The `??` is not redundant with canonicalFactionId's null — that null means
 *  "unresolvable", and dropping the field on unresolvable would silently strip a
 *  faction from an NPC whose id is merely NEWER than this build's roster. */
function healFactionId(id: string | undefined): string | undefined {
  if (!id) return id;
  return canonicalFactionId(id) ?? id;
}

export function recordNpcSighting(
  memory: WorldMemory,
  npc: NpcMet,
  opts: { nowMs: number; hoursElapsed: number },
): WorldMemory {
  const seeded = seedRelationsFromMet(memory);
  const prev = seeded.npcRelations?.[npc.id];
  // ⚠ OTA-1055 — A SIGHTING AT THE SAME CLOCK IS THE SAME VISIT, not a new one.
  //
  // OTA-1049 counted every arrival, on the assumption that an arrival is a
  // visit. It is not. Walking between two Hidden Market stall tabs re-installs
  // both vendors with no in-game time passing at all, so a review measured a
  // stall rep at SIX meetings after six taps — past MEETINGS_FOR_NAME, so a
  // shopkeeper started using the player's name and reached the 'known' rung
  // having done no business whatsoever.
  //
  // ⚠ AND THE GUARD I FIRST WROTE FOR THIS WAS DEAD CODE. It compared the
  // incoming vendor against the one already in the scene, which cannot match:
  // goBuildingRoom early-returns when you re-tap the tab you are on, so the
  // only reachable case is ALTERNATING tabs — where the previous vendor is the
  // OTHER stall and the ids never match. It pinned the shape of a condition
  // that could not fire while the inflation it named carried on.
  //
  // The clock is the honest test, and it is one rule for every caller rather
  // than a per-site guard the next site can forget: display fields and the
  // wall clock still refresh (a vendor can be re-minted with a new title), but
  // `meetings` and `prevSeenHours` do not move, so re-entering a room, flicking
  // a tab and re-rendering a scene are all what they are — the same visit.
  if (prev && prev.meetings > 0 && prev.lastSeenHours === opts.hoursElapsed) {
    const refreshed: NpcRelation = {
      ...prev,
      name: npc.name || prev.name,
      role: npc.role ?? prev.role,
      factionId: healFactionId(npc.factionId ?? prev.factionId),
      lastSeenAt: opts.nowMs,
    };
    return { ...seeded, npcRelations: { ...(seeded.npcRelations ?? {}), [npc.id]: refreshed } };
  }
  const base = prev ?? emptyRelation(npc, opts.nowMs, opts.hoursElapsed);
  const next: NpcRelation = {
    ...base,
    // Refresh the display fields — a vendor can be re-minted with a new title.
    name: npc.name || base.name,
    role: npc.role ?? base.role,
    factionId: healFactionId(npc.factionId ?? base.factionId),
    meetings: base.meetings + 1,
    // OTA-1052 — remember WHEN THEY LAST SAW YOU before overwriting it with
    // "now". The greeting is composed after this write, so an absence line
    // measured against lastSeenHours always saw a gap of zero. Undefined on a
    // first meeting: someone cannot have missed you before they met you.
    prevSeenHours: base.meetings > 0 ? base.lastSeenHours : undefined,
    lastSeenAt: opts.nowMs,
    lastSeenHours: opts.hoursElapsed,
  };
  return { ...seeded, npcRelations: { ...(seeded.npcRelations ?? {}), [npc.id]: next } };
}

/** OTA-1052 — THE ONE WAY TO RECORD MEETING SOMEBODY.
 *
 *  Two stores have to move together and they have opposite rules: `npcsMet` is
 *  a list of PEOPLE and is idempotent (meeting someone twice does not make two
 *  of them), while the relation counts EVERY arrival because repetition is the
 *  only thing that turns a stranger into a regular.
 *
 *  OTA-1049 wired them as two calls at one site and left the other two
 *  recordNpcMet sites (both Core Guardians) unpaired, so a Guardian appeared in
 *  the Chronicle's people column with a blank where its regard should be. That
 *  gap could reopen every time someone adds an NPC. Pairing them here makes the
 *  correct thing the only convenient thing — callers cannot record half of it. */
export function rememberNpcMeeting(
  memory: WorldMemory,
  npc: NpcMet,
  opts: { nowMs: number; hoursElapsed: number },
): WorldMemory {
  // ⚠ SEED FIRST. OTA-1049 wrote these in the order (recordNpcMet, then
  // recordNpcSighting) and that DOUBLE-COUNTED every first meeting: on a save
  // with no npcRelations yet, the sighting's own seedRelationsFromMet ran
  // against an npcsMet list that already contained the person just added, so it
  // manufactured a relation at meetings=1 and then the sighting incremented it
  // to 2. A first-ever arrival therefore read as a SECOND meeting — which
  // OTA-1050's `seenBefore = meetings >= 2` turned into greeting a total
  // stranger as a returning face.
  //
  // Seeding before the append makes the inner seed a no-op (npcRelations is
  // already defined, even if empty), so the newly added row cannot be swept up
  // as a pre-existing acquaintance.
  const seeded = pruneSpawnKeyedRelations(seedRelationsFromMet(memory));
  return recordNpcSighting(recordNpcMet(seeded, npc), npc, opts);
}

/** OTA-1053 — clean up the rows the timestamped roadside id already leaked.
 *
 *  Builds 4.28.83–4.28.86 keyed roadside traders on `roadside_<demeanor>_<ms>`,
 *  so every spawn left a permanent, never-revisited row in BOTH stores. Anyone
 *  who played those builds is carrying that litter in their save; the id fix
 *  alone stops the bleeding but does not clear it.
 *
 *  Self-healing rather than a one-shot migration: it runs on vendor arrival,
 *  costs a cheap scan, and rebuilds nothing when there is nothing to drop. The
 *  rows removed are by definition worthless — a spawn-unique key can never be
 *  seen twice, so none of them holds a relationship that could still matter. */
export function pruneSpawnKeyedRelations(memory: WorldMemory): WorldMemory {
  // OTA-1055 — THE SECOND GENERATION OF LEDGER LITTER. 4.28.87/88 keyed every
  // roadside trader by ARCHETYPE, so live saves hold `roadside:road_hawker` and
  // `roadside:sketchy_stall`. Now that the archetypes have a real cast, nothing
  // will ever mint those two ids again — and an orphan is not harmless here:
  // the row sits in the Chronicle's people column forever as somebody the
  // player can never meet, and if it carries a `wrongs` it is a debt that can
  // NEVER be paid off, because amends require a dealing against the same id.
  // They are also a fiction: one row pooling every roadside trader on the map.
  const LEGACY_ARCHETYPE_KEYS = new Set(['roadside:road_hawker', 'roadside:sketchy_stall']);
  const stale = (id: string) =>
    /^roadside_[a-z]+_\d{10,}$/.test(id) || /^overlay_.+_[a-z0-9]{6,}$/.test(id) || LEGACY_ARCHETYPE_KEYS.has(id);
  const rels = memory.npcRelations ?? {};
  const keys = Object.keys(rels);
  // OTA-1055 — AND THE AMENDS BANK CARRIED BY THOSE SAME SAVES. 4.28.87 fed the
  // bank from `tcTraded`, which counts SALES, so a shipped save can hold
  // `wrongs: 0, amendsTc: 49_400` earned by offloading loot on somebody. Rob
  // them twice, buy a 1 TC trinket, and both wrongs evaporate. Rather than
  // version-stamp the save, enforce the invariant the current code maintains
  // anyway: a bank exists only against an OUTSTANDING debt, and can never
  // exceed what that debt would absorb.
  const overBanked = (r: NpcRelation) =>
    (r.amendsTc ?? 0) > 0 && (r.amendsTc ?? 0) >= AMENDS_TC_PER_WRONG * r.wrongs;
  const dirty =
    keys.some(stale) ||
    (memory.npcsMet ?? []).some((n) => stale(n.id)) ||
    keys.some((k) => overBanked(rels[k]!));
  if (!dirty) return memory;
  const kept: Record<string, NpcRelation> = {};
  for (const k of keys) {
    if (stale(k)) continue;
    const r = rels[k]!;
    kept[k] = overBanked(r) ? { ...r, amendsTc: 0 } : r;
  }
  return {
    ...memory,
    npcRelations: kept,
    npcsMet: (memory.npcsMet ?? []).filter((n) => !stale(n.id)),
  };
}

/** Everything that is not just being in the room: trades, contracts, thefts.
 *  A no-op when the NPC has never been sighted — dealings without a meeting
 *  would mean a bug upstream, and inventing a relation here would hide it. */
export function recordNpcDealing(
  memory: WorldMemory,
  id: string,
  patch: Partial<Pick<NpcRelation, 'trades' | 'tcTraded' | 'contractsTaken' | 'contractsTurnedIn' | 'wrongs'
    /** OTA-1081 — clean lifts and mumbles delivered; see the NpcRelation fields. */
    | 'pocketsLifted' | 'pocketsMumbled'
    /** OTA-1086 — hour-stamp of the newest raid they've told the player about
     *  (max-merged, not incremented). Gates raidNewsFor so a sacking is news
     *  exactly once per person. */
    | 'raidHeardAtHours'>>
    /** OTA-1055 — TC the player SPENT here, which is the only kind that can pay
     *  a debt. `tcTraded` counts business in both directions, so inferring
     *  amends from it meant SELLING to someone you robbed settled the debt AND
     *  paid you for it. Restitution has to cost something. */
    & { spent?: number }
    /** ⚠⚠ OTA-1438 — THE IN-GAME HOUR, so `trades` can mean VISITS. */
    & { atHours?: number },
): WorldMemory {
  const seeded = seedRelationsFromMet(memory);
  const prev = seeded.npcRelations?.[id];
  if (!prev) return seeded;
  // ⚠⚠ OTA-1438 — ONE TRADE PER VISIT. Owner: *"I think the advanced
  // conversations unlock a little too quick. I use the fuse crucible 3 times
  // with Halem and it unlocks most of his conversation tree."*
  //
  // `trades >= 3` is the `familiar` rung, and familiar opens two thirds of an
  // NPC's topics. It was counting LINE ITEMS: the sell screen passes
  // `social: i === 0` so a stack of twenty is one trade — but three DIFFERENT
  // items are three separate calls, each one a fresh first unit. The owner's own
  // log has fifteen sales to Bran inside four hundred milliseconds, which is
  // fifteen trades and a stranger promoted twice over from one inventory dump.
  //
  // ⚠ The buy path already knew this shape — its comment says counting units
  // "would let a stack purchase vault a stranger to trusted in a single tap" —
  // and the guard it grew was per-stack, so it never covered the second item.
  // This is the same rule one level up, where it should have been.
  //
  // Same-hour means same visit, which is the rule recordNpcSighting already uses
  // for repeat-visit suppression. An ABSENT stamp credits: old relations simply
  // start counting visits from here rather than being retro-promoted or
  // retro-demoted.
  const sameVisit = patch.atHours !== undefined && prev.lastTradeHours === patch.atHours;
  const tradeCredit = sameVisit ? 0 : (patch.trades ?? 0);
  let next: NpcRelation = {
    ...prev,
    trades: prev.trades + tradeCredit,
    lastTradeHours: tradeCredit > 0 && patch.atHours !== undefined
      ? patch.atHours
      : prev.lastTradeHours,
    tcTraded: prev.tcTraded + (patch.tcTraded ?? 0),
    contractsTaken: prev.contractsTaken + (patch.contractsTaken ?? 0),
    contractsTurnedIn: prev.contractsTurnedIn + (patch.contractsTurnedIn ?? 0),
    wrongs: prev.wrongs + (patch.wrongs ?? 0),
    // OTA-1081 — the mumble ledger. Increment-only, like every other dealing.
    pocketsLifted: (prev.pocketsLifted ?? 0) + (patch.pocketsLifted ?? 0),
    pocketsMumbled: (prev.pocketsMumbled ?? 0) + (patch.pocketsMumbled ?? 0),
    // OTA-1086 — a STAMP, not a counter: keep the newest raid hour they've
    // reported. Max-merge so a stale caller can never un-tell a newer raid.
    raidHeardAtHours: patch.raidHeardAtHours !== undefined
      ? Math.max(prev.raidHeardAtHours ?? 0, patch.raidHeardAtHours)
      : prev.raidHeardAtHours,
  };
  // OTA-1053 — RESTITUTION. Coin that crosses the table of somebody you were
  // caught stealing from is banked as amends; enough of it buys one wrong back.
  // Deliberately only counts custom AFTER the theft (patch.tcTraded), never the
  // history that preceded it — you cannot pre-pay for a robbery.
  // ⚠ Amends are settled against the wrongs that were ALREADY OUTSTANDING when
  // this patch arrived (prev.wrongs), never against one the same patch adds.
  // Live code never does both at once — the theft path passes only `wrongs`,
  // the buy path only `trades`/`tcTraded` — but a rule that depends on callers
  // behaving is not a rule. Without this, a single patch carrying both would
  // let the player pay for a robbery in the same breath as committing it.
  const spent = patch.spent ?? 0;
  const addedWrongs = patch.wrongs ?? 0;
  let outstanding = prev.wrongs;
  if (spent > 0 && outstanding > 0) {
    let bank = (prev.amendsTc ?? 0) + spent;
    let cleared = 0;
    while (outstanding > 0 && bank >= AMENDS_TC_PER_WRONG * outstanding) {
      // The price scales with how many wrongs are outstanding, so a repeat
      // thief digs the hole faster than they can fill it.
      bank -= AMENDS_TC_PER_WRONG * outstanding;
      outstanding -= 1;
      cleared += 1;
    }
    // ⚠ OTA-1055 — THE BANK IS SPENT WHEN THE DEBT IS. Keeping the residue let
    // it pre-pay the NEXT robbery: settle a 600 debt with 1100 TC and 500 sits
    // in the bank; rob them again and 100 TC clears it. That is the exact
    // inverse of this feature's own rule ("a repeat thief digs the hole faster
    // than they can fill it"), and it survived review because every amends test
    // spent an exact multiple of 600, so a residue never existed.
    // Change is not credit. Only an OUTSTANDING debt banks anything.
    // ⚠ OTA-1055, SECOND PASS — THE FIRST FIX ONLY COVERED FULL SETTLEMENT.
    // Zeroing on `outstanding === 0` left the residue of a PARTIAL clear alive,
    // and a partial residue can be as large as 600*outstanding-1. Measured: three
    // thefts, spend 2999 -> one cleared with 1199 banked; rob again -> the bank
    // survives the new theft; spend 601 -> the fourth wrong's 1800 TC bill is
    // paid with 601 TC of new money. The same exploit one layer down, and it
    // survived for the same reason as the first: every amends test spent an
    // exact multiple of 600, so a residue never existed to be caught.
    // The rule that matches the intent stated above — a repeat thief digs the
    // hole faster than they can fill it — is that ROBBING THEM AGAIN COSTS YOU
    // YOUR PROGRESS. Change is not credit, and neither is a part-payment made
    // before a fresh betrayal.
    const settled = outstanding === 0;
    next = {
      ...next,
      wrongs: outstanding + addedWrongs,
      amendsTc: settled || addedWrongs > 0 ? 0 : bank,
      ...(cleared > 0 ? { amendsCleared: (prev.amendsCleared ?? 0) + cleared } : {}),
    };
  }
  // OTA-1055 — and the same rule when the patch is a theft ALONE (spent === 0
  // skips the block above entirely, which is how a banked residue survived a
  // fresh robbery in the first place).
  if (addedWrongs > 0 && (next.amendsTc ?? 0) > 0) next = { ...next, amendsTc: 0 };
  return { ...seeded, npcRelations: { ...(seeded.npcRelations ?? {}), [id]: next } };
}

/** DETERMINISTIC. Same relation in, same answer out, every time.
 *
 *  Someone knows your name once something has actually passed between you —
 *  coin, a contract, or enough repeat visits that your face is furniture. A
 *  wrong counts too, and deliberately so: the person you stole from learns
 *  your name faster than the person you bought bread from. */
export function knowsPlayerName(rel: NpcRelation | null | undefined): boolean {
  if (!rel) return false;
  return rel.trades >= 1
    || rel.contractsTaken >= 1
    || rel.contractsTurnedIn >= 1
    || rel.wrongs >= 1
    || rel.meetings >= MEETINGS_FOR_NAME;
}

/** The regard ladder. Ordered most-specific first; `wronged` outranks every
 *  amount of custom, because a knife at the stall is not offset by receipts. */
export function npcRegard(rel: NpcRelation | null | undefined): NpcRegard {
  if (!rel || rel.meetings <= 0) return 'stranger';
  if (rel.wrongs > 0) return 'wronged';
  if (rel.contractsTurnedIn >= 2 || rel.tcTraded >= TC_FOR_TRUSTED) return 'trusted';
  // ⚠ OTA-1439 — FOUR visits, up from three, by the owner's call. Three was
  // tuned when `trades` counted line items; OTA-1438 made a trade mean a VISIT,
  // and with honest counting the owner set the regular's bar at four.
  if (rel.trades >= 4 || rel.contractsTurnedIn >= 1 || rel.tcTraded >= TC_FOR_FAMILIAR) return 'familiar';
  // OTA-1050 — contractsTaken belongs on this rung. Slice 1 let it earn the
  // player's NAME (knowsPlayerName) but not any regard, so someone who had
  // handed you work was ranked below someone you had merely walked past three
  // times. Found by a slice-2 test; the ladder was wrong, not the test.
  //
  // ⚠⚠ OTA-1451 — BUT NOT ON THE VISIT YOU MET THEM. Owner: *"look at all the
  // vendor conversations I had in this log, it seems too easy to get to the
  // later tiers of topics."* He is right, and the log has the whole story with
  // timestamps: Tarek the Tinkerer first appears at 16:09:39, a contract is
  // accepted at 16:09:57 — EIGHTEEN SECONDS later — and by 16:11:58, without
  // the player ever leaving the room, Tarek is answering "Ask about their
  // people" and "Ask how they learned the craft."
  //
  // ⚠ WHY THIS RUNG AND NOT THE ONES ABOVE IT. Everything else on this ladder
  // costs the player something real: `trades` is a visit where money changed
  // hands, `contractsTurnedIn` means you went out, did the work and came back,
  // `tcTraded` is 400/1500 TC actually spent, `meetings` is clock-guarded so a
  // re-render cannot inflate it (OTA-1055). ACCEPTING is the one rung you can
  // climb by tapping — it is a promise, not a payment — and this rung holds 93
  // of the cast's 344 topics, the whole "Ask about their people" tier.
  //
  // ⚠ AND OTA-1050's ORDERING SURVIVES INTACT, which is why this is a second
  // condition rather than a deletion. Compare at equal visits: after one visit a
  // contract-giver and a passer-by are both `met`; after two the contract-giver
  // is `known` and the passer-by is still `met`; only at three does the
  // passer-by catch up. Handing you work still counts for MORE than walking
  // past — it never counts for less, which was the whole complaint.
  //
  // ⚠⚠ AND THE SAME RULE FOR A PURCHASE, ADDED IN THE SAME OTA AFTER A SECOND
  // REPORT. The first cut only slowed `contractsTaken`; the owner came straight
  // back with Halem the Trader, who reaches this rung on ONE PURCHASE and then
  // opens the whole middle of his conversation — *"way too familiar with these
  // guys. way too quick. look at all these conversation options I just opened up
  // with Halem with barely any contact."*
  //
  // A single sale is not a relationship, it is a transaction, and it was buying
  // the same rung that three separate visits buy. Buying and COMING BACK is a
  // customer; buying once is a stranger with a receipt. One rule now covers both
  // ways in — coin and contract — so neither can be the cheap one.
  //
  // ⚠ `meetings` is clock-guarded (OTA-1055): a same-hour re-entry is the same
  // visit, and hub room moves cost no time at all, so walking out of the Atrium
  // and back in cannot manufacture the return trip. It has to be a real one.
  //
  // ⚠ THREE VISITS STILL STAND ALONE, deliberately. Being around often enough
  // that your face is furniture is its own way to be placed, and it is the
  // slowest of the three — nothing to do with what you spent.
  const cameBack = rel.meetings >= 2;
  if ((cameBack && (rel.trades >= 1 || rel.contractsTaken >= 1)) || rel.meetings >= MEETINGS_FOR_NAME) return 'known';
  return 'met';
}

/** OTA-1054 — how many raid records to keep. Enough that a player who has been
 *  away a long while still hears about it; short enough that the save does not
 *  grow a war diary. */
export const RAID_MEMORY_CAP = 12;

/** The raid this NPC would bring up, or null.
 *
 *  Gated hard, because the whole point of Phase 0 was that a line which fires
 *  whenever it CAN is noise:
 *    - it has to be THEIR outpost (their faction's home ground);
 *    - it has to have happened since they last saw you, so it is news rather
 *      than a rehash — undefined prevSeenHours means a first meeting, and a
 *      stranger does not open with the state of the war;
 *    - and they have to actually know you. A shopkeeper who has seen you twice
 *      does not confide, and one who caught you stealing tells you nothing.
 *  Deterministic: the most recent qualifying raid, ties broken on location id. */
export function raidNewsFor(
  memory: WorldMemory,
  rel: NpcRelation | null | undefined,
  hoursNow: number,
): OutpostRaid | null {
  if (!rel?.factionId || rel.prevSeenHours === undefined) return null;
  const regard = npcRegard(rel);
  if (regard !== 'known' && regard !== 'familiar' && regard !== 'trusted') return null;
  const since = rel.prevSeenHours;
  // OTA-1055 — the upper bound was missing: the parameter was received and
  // ignored, so a raid stamped in the future would still have qualified. It
  // cannot happen today (atHours comes off the same player clock), but a
  // silently unused parameter is a hole waiting for the next caller.
  // OTA-1086 — "since they last saw you" was the WRONG gate for repeat
  // suppression: quick room-hops don't advance prevSeenHours, so the same
  // sacking was re-told on every re-entry (Tarek, four visits in a row).
  // Told-ness is now recorded on the relation (raidHeardAtHours, stamped by
  // the caller when the line is delivered) and only NEWER raids qualify.
  const alreadyTold = rel.raidHeardAtHours ?? -1;
  const mine = (memory.recentRaids ?? []).filter(
    (r) => r.defenderId === rel.factionId && r.atHours > since && r.atHours <= hoursNow && r.atHours > alreadyTold,
  );
  if (mine.length === 0) return null;
  // OTA-1055 — the locationId tie-break below is BELT AND BRACES, not a live
  // discriminator: locationId is FACTION_STARTING_LOCATION[defenderId] and the
  // filter has already pinned defenderId, so every candidate shares it. It
  // stays because it makes the reduce total-ordered rather than array-ordered,
  // which is what the determinism claim actually needs — but a reader should
  // not believe it is choosing between different places.
  return mine.reduce((best, r) => {
    if (r.atHours !== best.atHours) return r.atHours > best.atHours ? r : best;
    return r.locationId < best.locationId ? r : best;
  });
}

/** What they say about it. Warmer the better they know you — a regular gets the
 *  fact, someone who trusts you gets what it cost them. */
export function raidNewsLine(
  rel: NpcRelation,
  raid: OutpostRaid,
  npcName: string,
  playerName: string | null | undefined,
): string {
  const you = npcAddress(rel, playerName);
  // OTA-1055 — say the place's NAME. This de-slugged the id, so a person who
  // lives at Reclaimer's Stake called it "reclaimer stake" and the Tartarian
  // Pilgrim Camp came out as "pilgrim waycamp". The store now stamps the
  // authored name onto the record; the humanised id remains only as the
  // fallback for raids written before this OTA.
  const where = raid.locationName?.trim() || raid.locationId.replace(/_/g, ' ');
  switch (npcRegard(rel)) {
    case 'trusted':
      return `${npcName} lowers their voice. "You missed it, ${you}. The ${raid.attackerName} came over the wall at ${where} while you were gone. We are still counting what they took."`;
    case 'familiar':
      return `"You've been away," ${npcName} says. "The ${raid.attackerName} hit us at ${where}. Stock's thin because of it."`;
    default:
      return `${npcName} jerks their chin north. "The ${raid.attackerName} raided our outpost while you were out there. Word travels slower than they do."`;
  }
}

/** OTA-1053 — what the relationship is worth at the counter.
 *
 *  Deliberately small. Faction standing, CHA/rapport, tides and war heat
 *  already move prices; if the relationship swung harder than all of those it
 *  would become the only lever worth pulling. ±10% is enough to notice on a
 *  Legendary and enough to make being a regular somewhere feel like it pays.
 *
 *  The wronged markup is the one that bites — a quarter over the odds — and it
 *  is not a punishment so much as the mechanism of restitution: paying it IS
 *  how the debt gets settled (see AMENDS_TC_PER_WRONG). */
export function regardPriceMult(regard: NpcRegard): number {
  switch (regard) {
    case 'wronged': return 1.25;
    case 'trusted': return 0.90;
    case 'familiar': return 0.95;
    default: return 1;
  }
}

/** True when enough in-game time has passed that a greeting should say so.
 *
 *  OTA-1052 — MUST be read AFTER this arrival's recordNpcSighting, which is
 *  where the store calls it. The gap is measured against `prevSeenHours` (the
 *  visit before this one), NOT `lastSeenHours` — the sighting sets that to the
 *  current clock, so the original version compared now against now and returned
 *  false every single time. The absence line was unreachable in play from the
 *  day it shipped; the unit tests missed it because they hand-built relations
 *  in which lastSeenHours still held the previous visit, so they were asserting
 *  the rule without ever exercising the wiring.
 *
 *  Undefined prevSeenHours — a first meeting, or a relation migrated from a
 *  pre-OTA-1049 save — is not an absence. There is no prior visit to be absent
 *  from, and inventing one would greet a brand-new face with "it's been a long
 *  stretch". */
export function longAbsence(rel: NpcRelation | null | undefined, hoursNow: number): boolean {
  if (!rel || rel.meetings <= 0) return false;
  if (rel.prevSeenHours === undefined) return false;
  return hoursNow - rel.prevSeenHours >= LONG_ABSENCE_HOURS;
}

/** How this NPC addresses the player, out loud.
 *
 *  Uses the first whitespace-separated token so a long custom name ("Verbal of
 *  the Tartarian Giants") doesn't read absurd inside a line of dialogue — the
 *  same rule arbiterAddress has always followed, so the Arbiter and the world
 *  agree on what you are called. */
/** ⚠ OTA-1441 — HOW A NAME IS SAID ALOUD, in one place. The first-token rule
 *  exists so "Verbal of the Tartarian Giants" does not read absurd inside a
 *  line of dialogue — but applied to "Great Scott" it produced the owner's log
 *  line *"Welcome back, Great."*, which is a different absurdity. A SHORT name
 *  is said whole: two words and sixteen characters is the widest a name can be
 *  and still sit naturally in speech. Shared by npcAddress, arbiterAddress and
 *  welcomeBackLine, so the Arbiter and the world can never disagree about what
 *  you are called. */
export function spokenName(name: string | null | undefined): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length <= 2 && trimmed.length <= 16) return trimmed;
  return tokens[0];
}

export function npcAddress(
  rel: NpcRelation | null | undefined,
  playerName: string | null | undefined,
  sex?: 'male' | 'female' | null,
): string {
  const first = spokenName(playerName);
  if (!knowsPlayerName(rel) || !first) {
    // ⚠ OTA-1439 — SIR/MISS IS WHAT STRANGERS CALL YOU. The honorific slots
    // into the exact rung where an NPC does not know your name yet, which is
    // where address actually works that way: a shopkeeper says "sir" until
    // they can say "Verbal", and the switch from one to the other is the
    // relationship becoming visible in speech. No authored line changes —
    // every {name} slot inherits it. 'wronged' keeps the cold bare 'you':
    // civility is exactly what someone you robbed has withdrawn.
    if (npcRegard(rel) === 'wronged') return 'you';
    if (sex === 'male') return 'sir';
    if (sex === 'female') return 'miss';
    return 'traveler';
  }
  return first;
}

/** Greeting variants per rung of the ladder. `{name}` is substituted with
 *  npcAddress(), so a tier the player has reached WITHOUT earning the name
 *  still reads correctly ("Back again, traveler."). */
const GREETINGS: Record<NpcRegard, readonly string[]> = {
  stranger: [
    `{npc} looks up as you approach — the flat, unhurried look of someone sizing up a customer they have never seen.`,
    `{npc} watches you come in without recognition, one hand resting near the strongbox.`,
  ],
  met: [
    `{npc} glances up. "You again." Not warm, not cold — noted.`,
    `{npc} half-recognises you and doesn't say so. The wares stay where they are.`,
  ],
  known: [
    `{npc} places you as you come in. "{name}. What are you after?"`,
    `{npc} nods once. "{name}. Come look — a few things moved since you were last through."`,
    `{npc} sets down what they're holding. "Didn't expect you today, {name}."`,
  ],
  familiar: [
    `{npc} catches your eye and nods — the kind of nod that knows your name. "{name}. Come look at what came in this week."`,
    `{npc} is already reaching under the table before you've said anything. "{name}. Held something back for you."`,
    `{npc} grins. "{name}. Sit a minute. The road's been generous or it hasn't — which is it?"`,
  ],
  trusted: [
    `{npc} looks up before you've finished crossing the room — already reaching for the pot, already smiling. "{name}. Sit. Tell me what kind of day it's been."`,
    `{npc} waves off the customer they were serving. "{name}'s here. Give me a moment." The other one waits.`,
    `{npc} pushes the good stock to the front without being asked. "{name}. You know where everything is."`,
  ],
  wronged: [
    `{npc} sees you and goes still. The strongbox is closed before you're halfway across the floor.`,
    `{npc}'s hand finds the counter's edge. "I know what you are, {name}. Say what you want and go."`,
    `{npc} does not greet you. They watch your hands.`,
  ],
};

const ABSENCE_LINES: Record<NpcRegard, string | null> = {
  stranger: null,
  met: null,
  known: `"Been a while," {npc} says. "Thought the mud had you."`,
  familiar: `{npc} looks you over. "It's been a long stretch, {name}. I'd started asking after you."`,
  trusted: `"{name}." {npc} says it like setting down something heavy. "You've been gone. I kept your usual back anyway."`,
  wronged: null,
};

/** DETERMINISTIC line choice: indexed off the meeting count, not rolled. Two
 *  visits in the same regard tier read differently; the SAME visit replayed
 *  from the same save reads identically. */
export function npcGreeting(
  rel: NpcRelation | null | undefined,
  npcName: string,
  playerName: string | null | undefined,
  sex?: 'male' | 'female' | null,
): string {
  const regard = npcRegard(rel);
  const pool = GREETINGS[regard];
  const idx = pool.length > 0 ? Math.abs(rel?.meetings ?? 0) % pool.length : 0;
  return (pool[idx] ?? '')
    .replace(/\{npc\}/g, npcName)
    .replace(/\{name\}/g, npcAddress(rel, playerName, sex));
}

/** The extra beat for someone you've been away from. Null when the tier has
 *  nothing to say about absence — a stranger cannot miss you. */
export function npcAbsenceLine(
  rel: NpcRelation | null | undefined,
  npcName: string,
  playerName: string | null | undefined,
  hoursNow: number,
  sex?: 'male' | 'female' | null,
): string | null {
  if (!longAbsence(rel, hoursNow)) return null;
  const line = ABSENCE_LINES[npcRegard(rel)];
  if (!line) return null;
  return line
    .replace(/\{npc\}/g, npcName)
    .replace(/\{name\}/g, npcAddress(rel, playerName, sex));
}

// ---------------------------------------------------------------------------
// OTA-1050 — PHASE 1, SLICE 2.
// ---------------------------------------------------------------------------

/** Player-facing name for a rung of the ladder, for the Chronicle's people
 *  column. Deliberately plain nouns rather than a number: a relationship the
 *  UI renders as "familiar" is legible; one it renders as "62" invites the
 *  player to grind it. */
export const REGARD_LABEL: Record<NpcRegard, string> = {
  stranger: 'unknown',
  met: 'seen once',
  known: 'knows you',
  familiar: 'a regular',
  trusted: 'trusted',
  wronged: 'wary of you',
};

/** One line of what has actually passed between you, for the Chronicle. Empty
 *  string when nothing has — an honest blank beats inventing a history. */
export function dealingsSummary(rel: NpcRelation | null | undefined): string {
  if (!rel) return '';
  const bits: string[] = [];
  if (rel.trades > 0) bits.push(`${rel.trades} trade${rel.trades === 1 ? '' : 's'}`);
  if (rel.tcTraded > 0) bits.push(`${rel.tcTraded} TC`);
  const contracts = rel.contractsTurnedIn;
  if (contracts > 0) bits.push(`${contracts} contract${contracts === 1 ? '' : 's'} finished`);
  else if (rel.contractsTaken > 0) bits.push(`${rel.contractsTaken} taken`);
  if (rel.wrongs > 0) bits.push(rel.wrongs === 1 ? 'caught stealing' : `caught stealing ×${rel.wrongs}`);
  // OTA-1055 — amendsCleared was WRITE-ONLY. types.ts documents it as existing
  // "so the Chronicle can say a debt was settled rather than silently erasing
  // that it ever happened", and then nothing read it, so a paid debt vanished
  // without trace — the exact outcome the field was added to prevent.
  // OTA-1055 — "old", because `wrongs` and `amendsCleared` are independent
  // counters and a player who steals, pays, then steals again has both. The
  // bare wording rendered as "caught stealing · a debt settled", which reads as
  // a contradiction and implies the wrong shown was the one paid for.
  const settled = rel.amendsCleared ?? 0;
  if (settled > 0) {
    const aged = rel.wrongs > 0;
    bits.push(settled === 1
      ? (aged ? 'an old debt settled' : 'a debt settled')
      : `${settled} ${aged ? 'old ' : ''}debts settled`);
  }
  return bits.join(' · ');
}

/** Everyone the player has actually met, best-regarded first, for the
 *  Chronicle. Ties break on meeting count so the list is stable. */
const REGARD_RANK: NpcRegard[] = ['wronged', 'trusted', 'familiar', 'known', 'met', 'stranger'];
export function knownPeople(memory: WorldMemory): NpcRelation[] {
  const all = Object.values(memory.npcRelations ?? {}).filter((r) => r.meetings > 0);
  return all.sort((a, b) => {
    const d = REGARD_RANK.indexOf(npcRegard(a)) - REGARD_RANK.indexOf(npcRegard(b));
    if (d !== 0) return d;
    if (b.meetings !== a.meetings) return b.meetings - a.meetings;
    return a.name.localeCompare(b.name);
  });
}

/** Every fourth visit, a familiar face mentions someone else. Deterministic —
 *  the cadence is read off the meeting count, not rolled — and rare on purpose:
 *  Phase 0 was spent cutting the noise floor, and gossip that fires on every
 *  arrival would put it straight back. */
export const GOSSIP_EVERY = 4;

/** Whoever this NPC would talk about: another person in the same faction the
 *  player is genuinely well regarded by. Returns null when there is nobody
 *  worth mentioning, which is most of the game — word only travels once the
 *  player has actually built something for it to travel about. */
export function gossipSubject(
  memory: WorldMemory,
  speaker: NpcRelation | null | undefined,
): NpcRelation | null {
  if (!speaker || !speaker.factionId) return null;
  if (speaker.meetings <= 0 || speaker.meetings % GOSSIP_EVERY !== 0) return null;
  const speakerRegard = npcRegard(speaker);
  if (speakerRegard !== 'familiar' && speakerRegard !== 'trusted') return null;
  const peers = knownPeople(memory).filter(
    (r) => r.id !== speaker.id
      && r.factionId === speaker.factionId
      && (npcRegard(r) === 'familiar' || npcRegard(r) === 'trusted'),
  );
  return peers[0] ?? null;
}

export function gossipLine(
  speakerName: string,
  subject: NpcRelation,
  playerName: string | null | undefined,
): string {
  // The subject is at familiar-or-better, which cannot be reached without real
  // dealings, so they demonstrably know the player's name — npcAddress here is
  // belt and braces rather than a live fallback.
  const you = npcAddress(subject, playerName);
  return `${speakerName} tilts their head. "${subject.name} mentioned you, ${you}. Said you were worth dealing with — and ${subject.name} doesn't say that about many."`;
}

/** OTA-1081 — THE MUMBLE. Someone whose pocket was lifted CLEAN eventually
 *  notices the loss — out loud, on a later meeting, without ever looking at
 *  the player. The owner's spec in as many words: "they should eventually
 *  mumble about always losing things or some other statement so you know
 *  they realized it, and that you're not suspected."
 *
 *  Returns the line while a mumble is owed (pocketsLifted > pocketsMumbled),
 *  else null. Deterministic — the variant is indexed off how many they have
 *  already delivered, never rolled. The CALLER must record
 *  `pocketsMumbled: 1` when it speaks the line, or the mumble repeats. */
export function pocketLossMumble(rel: NpcRelation | undefined, name: string): string | null {
  if (!rel) return null;
  const owed = (rel.pocketsLifted ?? 0) - (rel.pocketsMumbled ?? 0);
  if (owed <= 0) return null;
  const lines = [
    `${name} pats at a pocket and frowns. "Swear I'm always losing things on this road."`,
    `${name} turns out a pocket, stares into it, and shakes their head. "Could've sworn I still had that."`,
    `${name} mutters something about holes in coats and the price of thread — and never once looks your way.`,
  ];
  return lines[(rel.pocketsMumbled ?? 0) % lines.length]!;
}

// ---------------------------------------------------------------------------
// OTA-1698 — THE COUNTER REMEMBERS THE QUESTION. Narrative-agency audit, hole
// 7: `worldMemory.npcTranscripts` is the durable record of every question put
// to every person (OTA-1151) — stored, and read by nothing but the talk sheet's
// EARLIER column. Nothing ever quoted it back. One reader: on a return visit,
// after the greeting and the absence beat, the person names the last thing you
// asked them. Deterministic like the greeting (variant off the meeting count);
// never for a stranger or a wronged counter (their own lines carry the mood);
// and only when the last exchange is at least LAST_ASKED_MIN_GAP_MS old, so
// flicking between two stalls in one sitting does not make them parrot it.
// ---------------------------------------------------------------------------

/** The last exchange must be this much older than now (wall clock) to be recalled. */
export const LAST_ASKED_MIN_GAP_MS = 30 * 60_000;

const LAST_ASKED_LINES = [
  `{npc} picks up where you left off. "You were asking about {q}. I've had time to think on it."`,
  `"Last time it was {q} you wanted to know about," {npc} says. "Ask, if there's more."`,
  `{npc} nods you closer. "Still chewing on {q}, or is it something new today?"`,
];

export function lastAskedLine(
  turns: readonly TalkTurn[] | undefined,
  rel: NpcRelation | null | undefined,
  npcName: string,
  nowMs: number = Date.now(),
): string | null {
  const last = turns && turns.length > 0 ? turns[turns.length - 1] : undefined;
  const q = last?.q?.trim();
  if (!last || !q) return null;
  if (nowMs - last.ts < LAST_ASKED_MIN_GAP_MS) return null;
  const regard = npcRegard(rel);
  if (regard === 'stranger' || regard === 'wronged') return null;
  const idx = Math.abs(rel?.meetings ?? 0) % LAST_ASKED_LINES.length;
  return (LAST_ASKED_LINES[idx] ?? '')
    .replace(/\{npc\}/g, npcName)
    .replace(/\{q\}/g, `\u2018${q}\u2019`);
}
