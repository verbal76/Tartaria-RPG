import type { NpcMet, WorldMemory, CanonLocation } from './types';

export function emptyMemory(): WorldMemory {
  return {
    tagCounts: {},
    discoveredLocationIds: [],
    canonLocations: [],
    defeatedEnemies: [],
    completedQuestIds: [],
  };
}

// OTA-500 — register a dynamically-mentioned place as install-canon. Idempotent by
// id; enriches an existing entry if a later mention is richer. Once registered it
// gets a permanent grid cell + is plotted/routable like a static location.
export function registerCanonLocation(memory: WorldMemory, loc: CanonLocation): WorldMemory {
  const list = memory.canonLocations ?? [];
  const existing = list.find((l) => l.id === loc.id);
  if (existing) {
    const merged: CanonLocation = {
      ...existing,
      name: existing.name || loc.name,
      type: existing.type ?? loc.type,
      danger: existing.danger ?? loc.danger,
      source: existing.source ?? loc.source,
      gx: existing.gx ?? loc.gx,
      gy: existing.gy ?? loc.gy,
    };
    if (merged.name === existing.name && merged.type === existing.type
      && merged.danger === existing.danger && merged.source === existing.source
      && merged.gx === existing.gx && merged.gy === existing.gy) {
      return memory;
    }
    return { ...memory, canonLocations: list.map((l) => (l.id === loc.id ? merged : l)) };
  }
  return { ...memory, canonLocations: [...list, loc] };
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

/** OTA-437 — [audit #20-adjacent / #17] bound the "nothing" search re-roll.
 *  Records one more null area-search of `noun` in the room at `roomKey`. A null
 *  search doesn't consume the noun (so an unlucky roll isn't punishing), but
 *  after NOTHING_SEARCH_CAP nulls the noun is added to searchedAmbientNouns so
 *  it's spent — restoring the gamble and closing the "retry until guaranteed
 *  payout" loop. Returns the updated memory and whether the noun is now
 *  exhausted (so the caller can print a definitive "nothing more here" line). */
export const NOTHING_SEARCH_CAP = 2;
export function recordNothingSearch(
  memory: WorldMemory,
  roomKey: string,
  noun: string,
  cap: number = NOTHING_SEARCH_CAP,
): { memory: WorldMemory; exhausted: boolean } {
  const lower = noun.toLowerCase();
  const rooms = memory.visitedRooms ?? {};
  const room = rooms[roomKey] ?? { firstVisitAt: Date.now(), lastVisitAt: Date.now(), visitCount: 1 };
  const counts = { ...(room.searchNothingCounts ?? {}) };
  const next = (counts[lower] ?? 0) + 1;
  counts[lower] = next;
  const exhausted = next >= cap;
  const searched = room.searchedAmbientNouns ?? [];
  const nextSearched = exhausted && !searched.includes(lower) ? [...searched, lower] : searched;
  return {
    memory: {
      ...memory,
      visitedRooms: {
        ...rooms,
        [roomKey]: { ...room, searchNothingCounts: counts, searchedAmbientNouns: nextSearched },
      },
    },
    exhausted,
  };
}

/** OTA 454 — record a named-NPC encounter. Idempotent on `id`: a
 *  second meeting with the same NPC is a no-op so the milestone list
 *  doesn't double up. */
export function recordNpcMet(memory: WorldMemory, npc: NpcMet): WorldMemory {
  const existing = memory.npcsMet ?? [];
  if (existing.some((n) => n.id === npc.id)) return memory;
  return { ...memory, npcsMet: [...existing, npc] };
}
