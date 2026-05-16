import factionQuestsData from '../data/quests/faction-quests.json';

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
}

export const FACTION_QUESTS = (factionQuestsData as { quests: FactionQuestDef[] }).quests;

export function findFactionQuestById(id: string): FactionQuestDef | null {
  return FACTION_QUESTS.find((q) => q.id === id) ?? null;
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
