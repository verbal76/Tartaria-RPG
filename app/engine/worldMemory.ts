import type { NpcMet, WorldMemory } from './types';

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

/** OTA 454 — record a named-NPC encounter. Idempotent on `id`: a
 *  second meeting with the same NPC is a no-op so the milestone list
 *  doesn't double up. */
export function recordNpcMet(memory: WorldMemory, npc: NpcMet): WorldMemory {
  const existing = memory.npcsMet ?? [];
  if (existing.some((n) => n.id === npc.id)) return memory;
  return { ...memory, npcsMet: [...existing, npc] };
}
