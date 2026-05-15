import type { WorldMemory } from './types';

export function emptyMemory(): WorldMemory {
  return {
    tagCounts: {},
    discoveredLocationIds: [],
    defeatedEnemies: [],
    completedQuestIds: [],
  };
}

export function recordTags(memory: WorldMemory, tags: readonly string[]): WorldMemory {
  const next = { ...memory.tagCounts };
  for (const tag of tags) next[tag] = (next[tag] ?? 0) + 1;
  return { ...memory, tagCounts: next };
}

export function discoverLocation(memory: WorldMemory, locationId: string): WorldMemory {
  if (memory.discoveredLocationIds.includes(locationId)) return memory;
  return { ...memory, discoveredLocationIds: [...memory.discoveredLocationIds, locationId] };
}

export function recordEnemyDefeat(memory: WorldMemory, enemyName: string): WorldMemory {
  return { ...memory, defeatedEnemies: [...memory.defeatedEnemies, enemyName] };
}

export function completeQuest(memory: WorldMemory, questId: string): WorldMemory {
  return { ...memory, completedQuestIds: [...memory.completedQuestIds, questId] };
}
