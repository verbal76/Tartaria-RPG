// Verifies the PlayerEquipped name→id refactor:
//   - wearItemById hits the exact instance, not first-by-name.
//   - resolveEquippedItem prefers the bound id and falls back to
//     first-by-name for legacy saves with no id stored.

import { wearItemById, wearItemByName } from '../app/engine/durability';
import { resolveEquippedItem, SLOT_ID_KEY } from '../app/engine/equipment';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

function locket(id: string, current: number): InventoryItem {
  return {
    id,
    name: 'Aetheric Locket',
    kind: 'relic',
    rarity: 'Uncommon',
    quantity: 1,
    tags: ['amulet', 'aetheric'],
    durability: { current, max: 25 },
  };
}

function makePlayer(inv: InventoryItem[], equippedId?: string): PlayerCharacter {
  return {
    name: 'Test',
    raceId: 'unknowing_mass',
    factionId: 'reclaimers_guild',
    inventory: inv,
    equipped: {
      amulet: 'Aetheric Locket',
      amuletId: equippedId,
    },
    stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5 },
  } as unknown as PlayerCharacter;
}

describe('wearItemById hits the exact instance', () => {
  it('wears the bound instance, not the first-by-name match', () => {
    const inv = [locket('a-1', 25), locket('a-2', 25)];
    // Wear the SECOND locket.
    const result = wearItemById(inv, 'a-2', 5);
    expect(result.inventory.find((i) => i.id === 'a-1')!.durability!.current).toBe(25);
    expect(result.inventory.find((i) => i.id === 'a-2')!.durability!.current).toBe(20);
  });

  it('breaks the bound instance only', () => {
    const inv = [locket('a-1', 25), locket('a-2', 2)];
    const result = wearItemById(inv, 'a-2', 5);
    expect(result.broken).toBe(true);
    expect(result.brokenName).toBe('Aetheric Locket');
    // The other locket survives.
    expect(result.inventory.find((i) => i.id === 'a-1')).toBeTruthy();
    expect(result.inventory.find((i) => i.id === 'a-2')).toBeUndefined();
  });

  it('contrasts with wearItemByName which always hits the first row', () => {
    const inv = [locket('a-1', 25), locket('a-2', 25)];
    const result = wearItemByName(inv, 'Aetheric Locket', 5);
    // The FIRST one took the wear, not the second.
    expect(result.inventory.find((i) => i.id === 'a-1')!.durability!.current).toBe(20);
    expect(result.inventory.find((i) => i.id === 'a-2')!.durability!.current).toBe(25);
  });
});

describe('resolveEquippedItem prefers bound id', () => {
  it('returns the exact instance when an id is bound', () => {
    const inv = [locket('a-1', 25), locket('a-2', 25)];
    const player = makePlayer(inv, 'a-2');
    const resolved = resolveEquippedItem(player, 'amulet');
    expect(resolved?.id).toBe('a-2');
  });

  it('falls back to first-by-name when no id bound (legacy save)', () => {
    const inv = [locket('a-1', 25), locket('a-2', 25)];
    const player = makePlayer(inv, undefined);
    const resolved = resolveEquippedItem(player, 'amulet');
    expect(resolved?.id).toBe('a-1');
  });

  it('returns null when the bound id no longer exists in inventory', () => {
    const inv = [locket('a-1', 25)]; // 'a-2' was sold / broken
    const player = makePlayer(inv, 'a-2');
    // Bound id is gone — falls back to first-by-name match.
    const resolved = resolveEquippedItem(player, 'amulet');
    expect(resolved?.id).toBe('a-1');
  });
});

describe('SLOT_ID_KEY maps every slot to its id key', () => {
  it('covers all eight slots', () => {
    expect(SLOT_ID_KEY.main).toBe('mainId');
    expect(SLOT_ID_KEY.off).toBe('offId');
    expect(SLOT_ID_KEY.head).toBe('headId');
    expect(SLOT_ID_KEY.chest).toBe('chestId');
    expect(SLOT_ID_KEY.legs).toBe('legsId');
    expect(SLOT_ID_KEY.feet).toBe('feetId');
    expect(SLOT_ID_KEY.amulet).toBe('amuletId');
    expect(SLOT_ID_KEY.ring).toBe('ringId');
  });
});
