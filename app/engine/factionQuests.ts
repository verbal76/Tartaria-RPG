import factionQuestsData from '../data/quests/faction-quests.json';

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
export type StageAdvanceTrigger = 'kill' | 'travel' | 'any';

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
  title: string;
  description: string;
  objective: string;
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
  /** OTA-985 — ESCORT contract (engine_Dev model). When present (or when the quest
   *  id ends in `_escort`), accepting spawns a shared-pool escort party that
   *  takes real collateral damage in the player's fights — deliver them alive
   *  or the contract FAILS. `count` (1-5) sets party size, default 2-3;
   *  `label` is the one-word party name ("Surveyors"). */
  escort?: { count?: number; label?: string;
    /** OTA-987 — pay model. 'scaled' (the default): the TC reward tracks the
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
 *  the player's held quantity of a name (passed in so this stays store-free).
 *    • staged  → every stage played (stage >= stages.length)
 *    • fetch   → the required items are in hand
 *    • legacy  → single objective, always turn-in-able */
export function factionQuestReady(
  def: FactionQuestDef,
  stage: number,
  countItem: (name: string) => number,
): boolean {
  if (def.stages && def.stages.length > 0) return stage >= def.stages.length;
  if (def.fetch) return countItem(def.fetch.itemName) >= def.fetch.quantity;
  return true;
}

/** OTA-984 — item names an ACCEPTED fetch contract still wants (active OR paused —
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
      // OTA-993 — #117: field-rescue escorts (the `_stranded_` contracts) are
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

/** ⚠ OTA-1182 — WHY THE LIST IS EMPTY, WHICH IS NEVER "BECAUSE I HAVE NOT TRAVELLED".
 *
 *  The vendor's refusal used to read *"Nothing for you right now — check back after
 *  I've travelled."* There is NO restock anywhere in this file: the pool is authored
 *  and static, filtered only by rep and by what the player has already taken. So the
 *  line promised a mechanic that does not exist AND sent the player off to do the one
 *  thing that provably cannot help — the OTA-1181 defect class, in the one place it
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
export function fuzzyFindFactionQuest(text: string, pool: readonly FactionQuestDef[]): FactionQuestDef | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const exact = pool.find((q) => q.title.toLowerCase() === t);
  if (exact) return exact;
  return pool.find((q) => q.title.toLowerCase().includes(t) || t.includes(q.title.toLowerCase())) ?? null;
}
