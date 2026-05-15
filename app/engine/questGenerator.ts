import type { Quest, QuestObjective, QuestComplication, QuestReward, Location, WorldMemory } from './types';
import { pick, pickWeighted } from './rng';
import objectivesData from '../data/quests/objectives.json';
import complicationsData from '../data/quests/complications.json';
import rewardsData from '../data/quests/rewards.json';
import locationsData from '../data/locations/locations.json';

const objectives = objectivesData as QuestObjective[];
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
  const reward = pickWeighted(rewards, (r) => weightByMemory(r.tags, memory));

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

  return {
    id: `quest_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
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
