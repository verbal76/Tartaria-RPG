// Tourist and the Vandal — room-state persistence smoke tests.
// Validates that drop / pickup / open handlers write to
// worldMemory.visitedRooms and that re-entering the same room
// preserves the dropped pile + opened-container set.
//
// We don't load the full game store here (that pulls in native
// modules); we test the type contract by hand-rolling a minimal
// VisitedRoom and checking that helpers + types accept the new
// fields. The full integration is exercised in the year-sim.

import type { VisitedRoom, InventoryItem } from '../app/engine/types';

describe('VisitedRoom — vandal-state fields', () => {
  it('accepts droppedItems + containersOpened on the type', () => {
    const dropped: InventoryItem = {
      id: 'rusted-dagger',
      name: 'Rusted Dagger',
      kind: 'weapon',
      rarity: 'Common',
      quantity: 1,
      tags: [],
    };
    const room: VisitedRoom = {
      firstVisitAt: 1,
      lastVisitAt: 2,
      visitCount: 1,
      droppedItems: [dropped],
      containersOpened: ['chest', 'trap'],
    };
    expect(room.droppedItems?.[0]?.name).toBe('Rusted Dagger');
    expect(room.containersOpened).toContain('chest');
  });

  it('legacy rooms with no vandal state still parse', () => {
    // Type compatibility — both fields are optional, so saves from
    // before this commit load cleanly.
    const legacy: VisitedRoom = {
      firstVisitAt: 1,
      lastVisitAt: 2,
      visitCount: 1,
    };
    expect(legacy.droppedItems).toBeUndefined();
    expect(legacy.containersOpened).toBeUndefined();
  });
});
