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
      // OTA-503 — register enriches but NEVER downgrades a lifecycle: a 'done'
      // event stays done; a marker is only filled in if it was absent. Use
      // setCanonLocationMarker for explicit pending→done transitions.
      marker: existing.marker ?? loc.marker,
    };
    if (merged.name === existing.name && merged.type === existing.type
      && merged.danger === existing.danger && merged.source === existing.source
      && merged.gx === existing.gx && merged.gy === existing.gy
      && merged.marker === existing.marker) {
      return memory;
    }
    return { ...memory, canonLocations: list.map((l) => (l.id === loc.id ? merged : l)) };
  }
  return { ...memory, canonLocations: [...list, loc] };
}

// OTA-503 — given the pending events sharing the player's arrival cell + the route
// id they came by, pick which ONE resolves (the player's rule): a LONE event at the
// cell fires on ANY arrival, routed or not; when SEVERAL share the cell, only the
// one matching the route's id resolves (you came for that one) and the rest stay
// pending. Returns the id to resolve, or null (ambiguous / none). Pure.
export function pickResolvedEvent(
  eventsAtCell: ReadonlyArray<{ id: string }>,
  routedId?: string | null,
): string | null {
  if (eventsAtCell.length === 0) return null;
  if (routedId && eventsAtCell.some((e) => e.id === routedId)) return routedId;
  if (eventsAtCell.length === 1) return eventsAtCell[0]!.id;
  return null;
}

// OTA-503 — explicit event-lifecycle transition (e.g. pending → done on arrival).
// No-op if the id isn't a canon event or is already in that state.
export function setCanonLocationMarker(
  memory: WorldMemory,
  id: string,
  marker: 'pending' | 'done',
): WorldMemory {
  const list = memory.canonLocations ?? [];
  const existing = list.find((l) => l.id === id);
  if (!existing || existing.marker === marker) return memory;
  return { ...memory, canonLocations: list.map((l) => (l.id === id ? { ...l, marker } : l)) };
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
  // OTA-1085 — defeatedEnemies is a DISTINCT-name set of first kills, not a
  // running kill tally (the lifetime total lives in player.milestones.
  // enemiesDefeated). Every consumer already reads it as a set — Set(), the
  // "N unique" Contracts label, includes()/Set.size for the milestone gate,
  // defeated[0] for the "first thing you put down" Arbiter line. Appending on
  // every kill let it grow unbounded (re-killable enemies farmed hundreds of
  // duplicate strings → save bloat, eventual save-loss). Collapse through a Set
  // so growth is bounded to the finite enemy catalog; this also SELF-HEALS old
  // saves that already carry duplicates (they dedup on the next kill) and keeps
  // insertion order so defeated[0] stays the true first kill.
  const deduped = [...new Set(memory.defeatedEnemies)]; // Set keeps insertion order
  if (deduped.includes(enemyName)) {
    // No new name. Only touch state if we actually collapsed legacy duplicates,
    // so a clean save stays referentially stable.
    return deduped.length === memory.defeatedEnemies.length
      ? memory
      : { ...memory, defeatedEnemies: deduped };
  }
  return { ...memory, defeatedEnemies: [...deduped, enemyName] };
}

// OTA-1085 — wild-water re-arm. A cupped drink / bottle refill from a wild water
// source used to be bounded by a per-SCENE one-shot flag (currentScene.
// barehandDrinkUsed / bottleRefillUsed), which reset every time the scene did —
// so leaving and returning, or bouncing between two adjacent OUTDOOR water tiles,
// handed the player an infinite +3-stamina tap (the playtest floodwater loop
// out-recovered sleeping 36:1). These persist the last-use game-hours per water
// SOURCE (keyed by the composite room key) so the same source re-arms only after
// WATER_REARM_HOURS of in-game time — bouncing tiles no longer resets it.
//
// Tunable design knob. 6 game-hours ≈ a quarter-day of downtime between draws
// from the same spring, so wild water is a real resource with a cadence near
// sleep's rather than a free spam.
export const WATER_REARM_HOURS = 6;
export type WaterUseKind = 'drink' | 'fill';

/** True if this water source may be used for `kind` again — never used, or the
 *  re-arm window has elapsed in game-hours since the last use. */
export function waterSourceReady(
  memory: WorldMemory,
  roomKey: string,
  kind: WaterUseKind,
  nowHours: number,
): boolean {
  const last = memory.waterUsedAt?.[roomKey]?.[kind];
  if (last == null) return true;
  return nowHours - last >= WATER_REARM_HOURS;
}

/** Record a use of this water source at the current game-hours, and prune any
 *  source whose every timestamp has already re-armed (keeps the map tiny — it
 *  only ever holds sources currently on cooldown). */
export function recordWaterUse(
  memory: WorldMemory,
  roomKey: string,
  kind: WaterUseKind,
  nowHours: number,
): WorldMemory {
  const prev = memory.waterUsedAt ?? {};
  const rec = { ...(prev[roomKey] ?? {}), [kind]: nowHours };
  const nextMap: Record<string, { drink?: number; fill?: number }> = { ...prev, [roomKey]: rec };
  for (const [key, entry] of Object.entries(nextMap)) {
    const stillCooling =
      (entry.drink != null && nowHours - entry.drink < WATER_REARM_HOURS)
      || (entry.fill != null && nowHours - entry.fill < WATER_REARM_HOURS);
    if (!stillCooling) delete nextMap[key];
  }
  return { ...memory, waterUsedAt: nextMap };
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
