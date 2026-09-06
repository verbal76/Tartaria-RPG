import factionQuestsData from '../data/quests/faction-quests.json';
import { findByTitle } from './titleMatch';

/** What kind of player action advances this stage.
 *   - 'kill'   — only enemy defeats trigger progress (the quest is
 *                about combat)
 *   - 'travel' — only completed travels trigger progress (the quest
 *                is about exploration / pilgrimage)
 *   - 'any'    — both trigger (legacy default; mostly used for
 *                quests where the stage is just a beat the player
 *                can't directly satisfy and is meant to advance on
 *                the next significant action)
 * Default is 'any' so legacy JSON without the field keeps current
 * behavior. QA flagged that defaulting to 'any' was the source of
 * 4-stage pilgrimages auto-completing on 3 generic rat-kills — each
 * stage of the new JSON now sets this explicitly. */
// ⚠⚠ OTA-1594 — `steal` joins the vocabulary, because "Pinch from the Monarchs"
// — *"Steal something from a Mud Monarchs vendor without being caught"* — shipped
// with `advanceOn: 'any'` on both stages and the owner completed it, in play,
// off an investigate, a flee and a Mud Spider kill. He then typed the bug report
// into the game itself: *"mission completed on stage 1?"*. A theft quest that
// any action pays is the OTA-1584 class (a promise the machine cannot pay) in
// the one family the P19 audits never fully reached.
export type StageAdvanceTrigger = 'kill' | 'travel' | 'steal' | 'any';

export interface FactionQuestStageDef {
  /** What the player sees in the world feed when this stage opens. */
  narration: string;
  /** Optional Arbiter remark layered under the narration. */
  arbiter?: string | null;
  /** Which player-action kind advances PAST this stage to the next.
   *  Omit to mean 'any'. */
  advanceOn?: StageAdvanceTrigger;
}

export interface FactionQuestDef {
  id: string;
  factionId: string;
  /** ⚠ The place the quest SENDS you, when it sends you anywhere. Same field and
   *  same resolver as a hunt's. Deliberately RARE on this family: 18 of the 65
   *  mention a location, but almost all of them are escorts and turn-ins that end
   *  at a faction AGENT ("escort the pilgrims to a Forgotten Order agent") — for
   *  those, the faction home IS the destination and routing them elsewhere would
   *  send the player the wrong way. Only set this where the objective itself names
   *  a place to travel to. */
  targetLocationName?: string;
  title: string;
  description: string;
  objective: string;
  /** ⚠ OTA-1594 — a WEALTH gate on completion. "Run the haul" reads
   *  "Reach 100 TC, then complete the quest" and its stages advanced on ANY
   *  action, so two arbitrary taps completed it with 3 TC in the purse. When
   *  set, the FINAL stage refuses to close (and says so) until the purse holds
   *  this much — same shape as the tribute quest's destination gate. */
  tcThreshold?: number;
  /** Minimum rep with the faction required to accept the quest. */
  requirement: { rep: number };
  /** Reward on completion. */
  reward: { tc: number; rep: number };
  /** Narrative stages. Each accepted quest plays stage 0 immediately
   *  and advances on player progress. Turn-in is allowed when stage >=
   *  stages.length. When omitted (legacy data), the engine treats it as
   *  a single objective whose narration is the existing description. */
  stages?: FactionQuestStageDef[];
  /** OTA-450 — a literal FETCH requirement. When present, turn-in is gated
   *  on the player actually holding `quantity` of `itemName`, and those
   *  items are consumed on turn-in. Used by the generic per-faction starter
   *  quests (a real "gather N, bring them back" on-ramp). Quests with a
   *  `fetch` requirement carry no stages — the fetch IS the objective. */
  fetch?: { itemName: string; quantity: number };
  /** OTA-962 — ESCORT contract (engine_Dev model). When present (or when the quest
   *  id ends in `_escort`), accepting spawns a shared-pool escort party that
   *  takes real collateral damage in the player's fights — deliver them alive
   *  or the contract FAILS. `count` (1-5) sets party size, default 2-3;
   *  `label` is the one-word party name ("Surveyors"). */
  escort?: { count?: number; label?: string;
    /** OTA-964 — pay model. 'scaled' (the default): the TC reward tracks the
     *  fraction of the party still standing at delivery ("delivered 2 of 3,
     *  get 2/3 pay"). 'all_or_nothing': the higher-tier drop-offs — deliver
     *  them alive for FULL pay, or lose everything when the pool dies. */
    mode?: 'scaled' | 'all_or_nothing' };
  /** Optional explicit ROUTE destination for this contract's objective (a
   *  location id). When present it overrides the engine's text-derived guess for
   *  "ROUTE TO"; absent → the engine infers it from the mission text, falling
   *  back to the faction home / turn-in. */
  objectiveLocationId?: string;
}

/** A faction quest the player has accepted. Mirrors ActiveHunt /
 *  ActiveMystery / ActiveStoryline so the same render + turn-in flow
 *  works across every contract type. */
export interface ActiveFactionQuest {
  id: string;
  stage: number;
  /** ID of the faction whose vendor handed it out — used to validate
   *  turn-in (you turn in to someone of the same faction). */
  postedByFaction: string;
  acceptedAt: number;
  /** Whether this contract is ACTIVE (the one you're running) vs PAUSED.
   *  Absent/true → active. SINGLE-ACTIVE: activating one pauses the rest. A
   *  paused contract stays on the slate (never dropped — that's ABANDON) but
   *  doesn't auto-advance until re-activated. */
  tracked?: boolean;
}

export const FACTION_QUESTS = (factionQuestsData as { quests: FactionQuestDef[] }).quests;

export function findFactionQuestById(id: string): FactionQuestDef | null {
  return FACTION_QUESTS.find((q) => q.id === id) ?? null;
}

/** arb171 — is this quest's WORK finished (only the turn-in remains)?
 *  Mirrors the gates in turnInFactionQuest so the UI tag, the auto-submit-on-
 *  arrival path, and the turn-in itself all agree on "ready". `countItem` counts
 *  the player's held quantity of a name and `purse` is their TC (both passed in
 *  so this stays store-free).
 *    • staged  → every stage played (stage >= stages.length)
 *    • fetch   → the required items are in hand
 *    • tc      → and, on top of staged, the purse holds the number
 *    • legacy  → single objective, always turn-in-able
 *
 *  ⚠⚠⚠ STEP 3c / OTA-1710 — THE PURSE WAS MISSING HERE, AND THAT IS HOW A
 *  WEALTH-GATED CONTRACT PAID OUT BROKE.
 *
 *  OTA-1594 put a `tcThreshold` gate on "Run the haul" (*"Reach 100 TC, then
 *  complete the quest"*) because two arbitrary taps had been closing it with 3
 *  TC in hand. But it put the gate on the STAGE-ADVANCE path only, so what it
 *  actually enforced was *"you held 100 TC at the moment of one particular
 *  action"* — and the docstring above claimed this function mirrored the
 *  turn-in's gates while neither of them knew about the purse at all.
 *
 *  ⚠ MEASURED on a plain player path, no cheat anywhere in it: earn 500 TC,
 *  close both stages by travelling (every stage is `advanceOn: 'any'`), spend
 *  down to 3 TC — which is the ordinary thing to do with money between
 *  finishing work and finding an agent — and hand it in. It completed and paid
 *  +100 TC. The requirement the objective names had simply stopped being
 *  checked.
 *
 *  ⚠ `purse` IS REQUIRED, not optional with a default. An optional argument
 *  would let a call site forget it and quietly re-open this exact hole; a
 *  required one makes the compiler name every reader. That is the difference
 *  between a fix and a fix that holds.
 *
 *  ⚠ It is a THRESHOLD, not a price: the coin is not consumed on turn-in, and
 *  this OTA does not change that. The contract pays 40 TC; taking 100 would
 *  make completing it a net loss, which is a balance decision nobody made. */
export function factionQuestReady(
  def: FactionQuestDef,
  stage: number,
  countItem: (name: string) => number,
  purse: number,
): boolean {
  if (def.tcThreshold && purse < def.tcThreshold) return false;
  if (def.stages && def.stages.length > 0) return stage >= def.stages.length;
  if (def.fetch) return countItem(def.fetch.itemName) >= def.fetch.quantity;
  return true;
}

/** OTA-961 — item names an ACCEPTED fetch contract still wants (active OR paused —
 *  a paused contract stays on the slate and the player may gather for it).
 *  Drives the inventory's CONTEXT-AWARE "Save for quest" earmark: the button
 *  only appears for items a live "gather N, bring them back" contract
 *  actually names. Owner: "I would only like it to say save for quest when
 *  you actually have an active quest that needs them" — specific objective
 *  items are hard-locked automatically and never need the earmark. */
export function activeFetchItemNames(
  active: ReadonlyArray<{ id: string }> | null | undefined,
): Set<string> {
  const names = new Set<string>();
  for (const a of active ?? []) {
    const def = findFactionQuestById(a.id);
    if (def?.fetch) names.add(def.fetch.itemName.toLowerCase());
  }
  return names;
}

// Quests offered by `factionId` that the player has not yet accepted or
// completed, and where the player meets the rep requirement.
export function availableFactionQuests(
  factionId: string,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
): FactionQuestDef[] {
  return FACTION_QUESTS.filter(
    (q) =>
      q.factionId === factionId &&
      // OTA-970 — #117: field-rescue escorts (the `_stranded_` contracts) are
      // HOOK-sourced only — you find the stranded soul in the wild and take
      // the charge there (owner: "give the missions at the appropriate
      // location"). An outpost board never posts one; the stranded_traveler
      // hook grants them straight from FACTION_QUESTS by id suffix.
      !/_stranded_/.test(q.id) &&
      playerRep >= q.requirement.rep &&
      !active.includes(q.id) &&
      !completed.includes(q.id),
  );
}

/** ⚠ OTA-1159 — WHY THE LIST IS EMPTY, WHICH IS NEVER "BECAUSE I HAVE NOT TRAVELLED".
 *
 *  The vendor's refusal used to read *"Nothing for you right now — check back after
 *  I've travelled."* There is NO restock anywhere in this file: the pool is authored
 *  and static, filtered only by rep and by what the player has already taken. So the
 *  line promised a mechanic that does not exist AND sent the player off to do the one
 *  thing that provably cannot help — the OTA-1158 defect class, in the one place it
 *  costs the player time rather than just misinforming them.
 *
 *  An empty list is always one of exactly two situations, and they call for opposite
 *  actions from the player:
 *    - LOCKED  — more work exists here, the player's standing is too low. Earn rep.
 *    - CLEARED — they have genuinely taken everything this faction offers. Move on.
 *  This returns the count and the CHEAPEST rep still out of reach, so the caller can
 *  say which one it is instead of guessing. `_stranded_` is excluded on the same
 *  grounds as above: a board never posts one, so it is not work the player is
 *  "missing" and naming it would send them looking for something unfindable. */
export function repLockedFactionQuests(
  factionId: string,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
): { count: number; nextRep: number | null } {
  const locked = FACTION_QUESTS.filter(
    (q) =>
      q.factionId === factionId &&
      !/_stranded_/.test(q.id) &&
      playerRep < q.requirement.rep &&
      !active.includes(q.id) &&
      !completed.includes(q.id),
  );
  return {
    count: locked.length,
    nextRep: locked.length
      ? locked.reduce((lo, q) => Math.min(lo, q.requirement.rep), Infinity)
      : null,
  };
}

// Pick a quest by partial-title match. Used when the player types
// "accept salvage" — finds "Salvage the buried lens".
// ⚠ OTA-1188 — delegates to the shared three-tier resolver. The first two tiers are
// the exact behaviour this function always had; the third catches the case the
// parser creates by stripping stop words ("fragment red tower" vs "Fragment of the
// Red Tower"), and only ever runs where this used to return null. See titleMatch.ts.
export function fuzzyFindFactionQuest(text: string, pool: readonly FactionQuestDef[]): FactionQuestDef | null {
  return findByTitle(text, pool);
}

/**
 * ⚠⚠⚠ OTA-1475 — THE HIDDEN MARKET POSTS FOR EVERYBODY.
 *
 * THE OWNER, 4.32.11, standing in the Market square:
 *
 *   "also, I think in the hidden market in the square should be a version of the
 *    missions board like in the starter outpost, since it's a no fighting zone,
 *    then I'm guessing that all of the factions should be able to post there
 *    without interaction from each other"
 *
 * ⚠⚠ THE TRUCE IS ALREADY IN THE FICTION, and the Market says so itself when a
 * hostile party finds you there: *"The Market's truce is older than any grudge;
 * whoever wants you settles for watching you trade."* Nine factions that will
 * not fight in the square have no reason not to nail work to the same post — and
 * a broker stall in that same market ALREADY searches every faction's hunt pool
 * (`isBrokerVendorId`). This is the same idea, for the contract board, which had
 * exactly one shape: `{ faction: string }`, one faction, outpost_central only.
 *
 * ⚠ "WITHOUT INTERACTION FROM EACH OTHER" IS THE LOAD-BEARING PHRASE, and it is
 * why this returns rows GROUPED BY FACTION rather than a merged list. Taking a
 * Reclaimers posting off the Market board is a Reclaimers contract: it costs and
 * pays Reclaimers standing, and it does not touch what the Eternal Dynasty will
 * post you tomorrow. Nothing here mixes the pools; it only puts them side by side
 * under one roof.
 */
export interface NeutralBoardGroup {
  factionId: string;
  factionName: string;
  postings: FactionQuestDef[];
}

/**
 * Every faction's open postings, side by side, each still its own faction's
 * business. `standingFor` is injected rather than read here so the board and the
 * accept path cannot end up with two different ideas of the player's standing.
 *
 * ⚠ Factions with nothing open are dropped: a board showing five empty headings
 * buries the two that have work, which is the same reasoning that keeps
 * `huntBoardWithReasons` from listing somebody else's business.
 */
export function neutralBoardPostings(
  factions: readonly { id: string; name: string }[],
  standingFor: (factionId: string) => number,
  active: readonly string[],
  completed: readonly string[],
): NeutralBoardGroup[] {
  const out: NeutralBoardGroup[] = [];
  for (const f of factions) {
    const postings = availableFactionQuests(f.id, standingFor(f.id), active, completed);
    if (postings.length > 0) out.push({ factionId: f.id, factionName: f.name, postings });
  }
  return out;
}

/**
 * ⚠⚠ WHICH FACTION'S WORK IS THIS? The neutral board has no faction of its own,
 * so the contract the player names supplies it — which is precisely what "all
 * factions post there without interaction" means in code. Resolved by the SAME
 * fuzzy matcher the accept path already uses, so a title that finds a posting on
 * the board cannot fail to find it a second later at the accept.
 */
export function factionOfFactionQuest(titleOrId: string): string | null {
  const byId = findFactionQuestById(titleOrId);
  if (byId) return byId.factionId;
  return fuzzyFindFactionQuest(titleOrId, FACTION_QUESTS)?.factionId ?? null;
}
