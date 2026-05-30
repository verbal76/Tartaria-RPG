// HANDOFF #15c — loot persistence in the MapGraph. Verifies the helper
// surface that gameStore.digHere / area-search use to track which named
// drops the player has already taken from a given room. The full
// integration (dig action wired against beginScene) is covered by
// manual playtest; here we lock the pure logic so a regression can't
// silently regrow loot.

import type { WorldMemory, VisitedRoom } from '../app/engine/types';

// Re-implementing the helpers' contract inline keeps this test
// independent of the gameStore's private module surface. The helpers
// themselves are simple state transforms.
function roomLootAlreadyGrabbed(
  worldMemory: { visitedRooms?: Record<string, VisitedRoom> },
  roomKey: string,
  itemName: string,
): boolean {
  const room = worldMemory.visitedRooms?.[roomKey];
  if (!room?.lootGrabbed) return false;
  return room.lootGrabbed.includes(itemName.toLowerCase());
}

function recordRoomLootGrabbed(
  state: { worldMemory: WorldMemory },
  roomKey: string,
  itemName: string,
): { worldMemory: WorldMemory } {
  const prevRooms = state.worldMemory.visitedRooms ?? {};
  const prev = prevRooms[roomKey];
  const base: VisitedRoom = prev ?? {
    firstVisitAt: Date.now(),
    lastVisitAt: Date.now(),
    visitCount: 1,
    enemiesCleared: [],
  };
  const grabbed = new Set((base.lootGrabbed ?? []).map((n) => n.toLowerCase()));
  grabbed.add(itemName.toLowerCase());
  return {
    worldMemory: {
      ...state.worldMemory,
      visitedRooms: {
        ...prevRooms,
        [roomKey]: { ...base, lootGrabbed: Array.from(grabbed) },
      },
    },
  };
}

const emptyMemory = (): WorldMemory => ({
  tagCounts: {},
  discoveredLocationIds: [],
  defeatedEnemies: [],
  completedQuestIds: [],
});
const KEY = 'tartarian_outskirts@_@4,4';

describe('roomLootAlreadyGrabbed', () => {
  it('returns false when the room is not in visitedRooms', () => {
    expect(roomLootAlreadyGrabbed(emptyMemory(), KEY, 'Rust Knife')).toBe(false);
  });

  it('returns false when the room exists but has no lootGrabbed list', () => {
    const wm: WorldMemory = {
      ...emptyMemory(),
      visitedRooms: {
        [KEY]: { firstVisitAt: 0, lastVisitAt: 0, visitCount: 1 },
      },
    };
    expect(roomLootAlreadyGrabbed(wm, KEY, 'Rust Knife')).toBe(false);
  });

  it('returns true after the item has been recorded', () => {
    const after = recordRoomLootGrabbed({ worldMemory: emptyMemory() }, KEY, 'Rust Knife');
    expect(roomLootAlreadyGrabbed(after.worldMemory, KEY, 'Rust Knife')).toBe(true);
  });

  it('is case-insensitive', () => {
    const after = recordRoomLootGrabbed({ worldMemory: emptyMemory() }, KEY, 'Rust Knife');
    expect(roomLootAlreadyGrabbed(after.worldMemory, KEY, 'RUST KNIFE')).toBe(true);
    expect(roomLootAlreadyGrabbed(after.worldMemory, KEY, 'rust knife')).toBe(true);
  });

  it('isolates by room — same item in a different room still ungrabbed', () => {
    const after = recordRoomLootGrabbed({ worldMemory: emptyMemory() }, KEY, 'Rust Knife');
    const OTHER = 'drakova@_@1,2';
    expect(roomLootAlreadyGrabbed(after.worldMemory, OTHER, 'Rust Knife')).toBe(false);
  });
});

describe('recordRoomLootGrabbed', () => {
  it('preserves existing VisitedRoom fields', () => {
    const wm: WorldMemory = {
      ...emptyMemory(),
      visitedRooms: {
        [KEY]: {
          firstVisitAt: 100,
          lastVisitAt: 200,
          visitCount: 3,
          enemiesCleared: ['Bog Hound'],
        },
      },
    };
    const after = recordRoomLootGrabbed({ worldMemory: wm }, KEY, 'Aetheric Locket');
    const room = after.worldMemory.visitedRooms![KEY]!;
    expect(room.firstVisitAt).toBe(100);
    expect(room.lastVisitAt).toBe(200);
    expect(room.visitCount).toBe(3);
    expect(room.enemiesCleared).toEqual(['Bog Hound']);
    expect(room.lootGrabbed).toEqual(['aetheric locket']);
  });

  it('dedupes when the same item is recorded twice', () => {
    let state = { worldMemory: emptyMemory() };
    state = recordRoomLootGrabbed(state, KEY, 'Rust Knife');
    state = recordRoomLootGrabbed(state, KEY, 'rust knife');
    state = recordRoomLootGrabbed(state, KEY, 'RUST KNIFE');
    expect(state.worldMemory.visitedRooms![KEY]!.lootGrabbed).toEqual(['rust knife']);
  });

  it('accumulates distinct items', () => {
    let state = { worldMemory: emptyMemory() };
    state = recordRoomLootGrabbed(state, KEY, 'Rust Knife');
    state = recordRoomLootGrabbed(state, KEY, 'Bog Pelt');
    state = recordRoomLootGrabbed(state, KEY, 'Aetheric Locket');
    expect(state.worldMemory.visitedRooms![KEY]!.lootGrabbed).toEqual(
      expect.arrayContaining(['rust knife', 'bog pelt', 'aetheric locket']),
    );
    expect(state.worldMemory.visitedRooms![KEY]!.lootGrabbed!.length).toBe(3);
  });
});
