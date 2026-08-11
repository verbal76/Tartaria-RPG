import type { Quest, QuestObjective, QuestComplication, QuestReward, Location, WorldMemory } from './types';
import { pick, pickWeighted } from './rng';
import objectivesData from '../data/quests/objectives.json';
import complicationsData from '../data/quests/complications.json';
import rewardsData from '../data/quests/rewards.json';
import locationsData from '../data/locations/locations.json';

const objectives = objectivesData as QuestObjective[];

/** ⚠⚠ OTA-1214 — EVERY LEAD VERB HAS A TRIGGER. The owner asked, after the hunt
 *  fix: "every mission, hunt, whisper, and every other style of side quest?" —
 *  and the check found LEADS effectively 100% uncompletable: the only
 *  completion trigger was kill-verb name matching ('kill/slay/defeat/hunt/
 *  retrieve'), and not one of the 18 authored objectives uses those verbs.
 *  Every lead ever generated accumulated forever (the OTA-011 note even
 *  recorded that history, then fixed only the kill shape).
 *
 *  The contract, same law as OTA-1213: AT the lead's own pinned location,
 *  performing a verb-matched intent completes it; kill-shaped verbs also
 *  complete on any enemy defeated at the site. The audit test walks
 *  objectives.json and fails the build if a verb ever ships without an entry
 *  here — an uncompletable lead can no longer be authored. */
export const LEAD_VERB_TRIGGERS: Record<string, { intents?: readonly string[]; onKillAtSite?: boolean }> = {
  // search-the-place shapes
  investigate: { intents: ['investigate'] },
  trace: { intents: ['investigate'] },
  map: { intents: ['investigate'] },
  recover: { intents: ['investigate'] },
  extract: { intents: ['investigate'] },
  collect: { intents: ['investigate'] },
  retrieve: { intents: ['investigate'] },
  rescue: { intents: ['investigate'] },
  seal: { intents: ['investigate', 'cast'] },
  // talk-at-the-place shapes
  deliver: { intents: ['diplomacy'] },
  escort: { intents: ['diplomacy'] },
  broker: { intents: ['diplomacy'] },
  interrogate: { intents: ['diplomacy'] },
  smuggle: { intents: ['diplomacy'] },
  // violence shapes — the attempt at the site completes, and so does any kill there
  silence: { intents: ['attack'], onKillAtSite: true },
  destroy: { intents: ['attack'], onKillAtSite: true },
  disable: { intents: ['attack'], onKillAtSite: true },
  raid: { intents: ['investigate'], onKillAtSite: true },
};
const complications = complicationsData as QuestComplication[];
const rewards = rewardsData as QuestReward[];
const locations = locationsData as Location[];

function weightByMemory(tags: readonly string[], memory: WorldMemory, baseWeight = 1): number {
  let weight = baseWeight;
  for (const tag of tags) {
    const seen = memory.tagCounts[tag] ?? 0;
    weight += Math.max(0, 3 - seen);
  }
  return weight;
}

export function generateQuest(memory: WorldMemory, preferredLocationId?: string): Quest {
  const objective = pickWeighted(objectives, (o) => weightByMemory(o.tags, memory));
  const complication = pickWeighted(complications, (c) => weightByMemory(c.tags, memory));

  // Location is chosen BEFORE the reward now, so the reward tier can lean on its
  // danger (OTA-923).
  let location: Location;
  if (preferredLocationId) {
    const found = locations.find((l) => l.id === preferredLocationId);
    location = found ?? pick(locations.filter((l) => l.discoverable));
  } else {
    location = pickWeighted(
      locations.filter((l) => l.discoverable),
      (l) => weightByMemory(l.tags, memory) + (memory.discoveredLocationIds.includes(l.id) ? 0 : 2),
    );
  }

  // OTA-923 — bias the currency-reward TIER by the quest location's danger, so a
  // trivial early-zone quest doesn't roll a 400-TC jackpot as often as a 30-TC one,
  // and a deep dangerous quest leans large — a monotone early→late cash lean. This
  // only NUDGES the size-tag weight; the anti-repetition novelty rotation
  // (weightByMemory) still drives variety, so rewards feel fresh, not on rails.
  const dangerRewardBias = (tags: readonly string[]): number => {
    const d = location.danger;
    if (tags.includes('small')) return d <= 2 ? 3 : d >= 4 ? -2 : 0;
    if (tags.includes('large')) return d >= 4 ? 3 : d <= 2 ? -2 : 0;
    return 0; // 'medium' + non-currency rewards stay novelty-only
  };
  const reward = pickWeighted(rewards, (r) => Math.max(0.1, weightByMemory(r.tags, memory) + dangerRewardBias(r.tags)));

  return {
    // OTA 011 — was Math.floor(Math.random() * 1000) which
    // collides at ~1-in-1000 odds within the same Date.now()
    // millisecond. Higher-entropy slug with base-36 random
    // makes collisions astronomical.
    id: `quest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    objective,
    location,
    complication,
    reward,
    generatedAt: Date.now(),
    state: 'open',
  };
}

export function describeQuest(quest: Quest): string {
  return `${quest.objective.verb} ${quest.objective.target} at ${quest.location.name}, ${quest.complication.text}. Reward: ${quest.reward.label}.`;
}
