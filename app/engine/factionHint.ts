// Helper for the accept / turn-in refusal messages. Given a player's
// typed contract name, find which faction owns that hunt / mystery /
// storyline / faction-quest in the catalog and return the faction name
// + a few sample vendor names so the refusal can be specific:
//
//   "Bog Dragon Bounty belongs to the Reclaimers Guild —
//    look for Tellin Mak, Tarek the Tinkerer, or another Reclaimer vendor."
//
// Returns null when nothing matches; caller falls back to the generic
// "no vendor here" line.

import { HUNTS, fuzzyFindHunt } from './hunts';
import { MYSTERIES, fuzzyFindMystery } from './mysteries';
import { STORYLINES, fuzzyFindStoryline } from './factionStorylines';
import { FACTION_QUESTS, fuzzyFindFactionQuest } from './factionQuests';
import { FACTIONS } from './factions';
import { VENDORS } from './vendors';

export type QuestKind = 'hunt' | 'mystery' | 'storyline' | 'quest';

export interface QuestFactionHint {
  factionId: string;
  factionLabel: string;
  contractTitle: string;
  kind: QuestKind;
  vendorNames: string[];
}

export function findQuestFactionHint(text: string): QuestFactionHint | null {
  if (!text || !text.trim()) return null;
  // Try each catalog in order. First catalog that returns a result with
  // a non-null factionId wins.
  const hunt = fuzzyFindHunt(text, HUNTS);
  if (hunt?.factionId) return packHint(hunt.factionId, hunt.title, 'hunt');
  const mystery = fuzzyFindMystery(text, MYSTERIES);
  if (mystery?.factionId) return packHint(mystery.factionId, mystery.title, 'mystery');
  const storyline = fuzzyFindStoryline(text, STORYLINES);
  if (storyline?.factionId) return packHint(storyline.factionId, storyline.title, 'storyline');
  const quest = fuzzyFindFactionQuest(text, FACTION_QUESTS);
  if (quest?.factionId) return packHint(quest.factionId, quest.title, 'quest');
  return null;
}

function packHint(factionId: string, contractTitle: string, kind: QuestKind): QuestFactionHint {
  const faction = FACTIONS.find((f) => f.id === factionId);
  const factionLabel = faction?.name ?? factionId.replace(/_/g, ' ');
  // First 3 vendor names from this faction, deterministic catalog order
  // for stable narration.
  const vendorNames = VENDORS
    .filter((v) => v.faction === factionId)
    .slice(0, 3)
    .map((v) => v.name);
  return { factionId, factionLabel, contractTitle, kind, vendorNames };
}
