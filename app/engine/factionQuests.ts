import factionQuestsData from '../data/quests/faction-quests.json';
import { resolveMissions } from './contentPack';

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
  /** Reward on completion. `items` are crafted-item names granted into the pack on
   *  turn-in (TC + rep are halved on a remote turn-in; items are always granted in
   *  full since they can't be split). */
  reward: { tc: number; rep: number; items?: string[] };
  /** Narrative stages. Each accepted quest plays stage 0 immediately
   *  and advances on player progress. Turn-in is allowed when stage >=
   *  stages.length. When omitted (legacy data), the engine treats it as
   *  a single objective whose narration is the existing description. */
  stages?: FactionQuestStageDef[];
  /** ESCORT contract. When present (or when the quest id ends in `_escort`),
   *  accepting the quest spawns live escortee NPCs that take real combat damage
   *  — keep them alive to the destination or the quest fails. `count` overrides
   *  the default 2-3 party size. Content-agnostic: escortee names come from
   *  data/escortNames.json or a pack's `flavor.escortNames`. */
  escort?: { count?: number };
  /** OTA-907 — optional explicit ROUTE destination for this contract's objective
   *  (a location id in the active world). When present it overrides the engine's
   *  text-derived guess for "ROUTE TO". Absent → the engine infers the objective
   *  location from the mission text, falling back to the faction home/turn-in. */
  objectiveLocationId?: string;
  /** OTA-450 — a literal FETCH requirement. When present, turn-in is gated
   *  on the player actually holding `quantity` of `itemName`, and those
   *  items are consumed on turn-in. Used by the generic per-faction starter
   *  quests (a real "gather N, bring them back" on-ramp). Quests with a
   *  `fetch` requirement carry no stages — the fetch IS the objective. */
  fetch?: { itemName: string; quantity: number };
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
  /** Whether this contract is ACTIVE (being worked) vs DEACTIVATED (parked).
   *  Absent/true → active. When false: its stages don't auto-advance and, for
   *  escort contracts, the escort party is parked (off the HUD, no combat
   *  damage) until re-activated. Lets the player accept many quests but only
   *  drive the one(s) they're actually running. */
  tracked?: boolean;
}

const FACTION_QUESTS_BUILTIN = (factionQuestsData as { quests: FactionQuestDef[] }).quests;
/** Live faction-quest list — uploaded 'missions.factionQuests' override or built-in. */
export function getFactionQuests(): FactionQuestDef[] {
  return resolveMissions('factionQuests', FACTION_QUESTS_BUILTIN) as FactionQuestDef[];
}
/** Built-in faction quests only — dev-console template. */
export const FACTION_QUESTS = FACTION_QUESTS_BUILTIN;

export function findFactionQuestById(id: string): FactionQuestDef | null {
  return getFactionQuests().find((q) => q.id === id) ?? null;
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

// Quests offered by `factionId` that the player has not yet accepted or
// completed, and where the player meets the rep requirement.
export function availableFactionQuests(
  factionId: string,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
): FactionQuestDef[] {
  return getFactionQuests().filter(
    (q) =>
      q.factionId === factionId &&
      playerRep >= q.requirement.rep &&
      !active.includes(q.id) &&
      !completed.includes(q.id),
  );
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
