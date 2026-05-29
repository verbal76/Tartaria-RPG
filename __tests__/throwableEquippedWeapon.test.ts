// OTA-208 — verifies the equipped-throwable combat path. Player ask:
//   "I should equip my shaped etheric shard in my main hand and then
//    I'm in combat and it's in my main hand cuz it's equipped and I
//    use it. it should know that I'm throwing it and that it's going
//    to hit somebody and it's going to be a one-time use and then
//    that weapon's just gone"
//
// Surface under test:
//   - validSlotsForItem routes 'throwable' tag → ['main', 'off']
//   - getEquippedWeapon synthesizes a CatalogWeapon for throwables
//     with damageDice '2d20' for Aetheric Shards
//   - throwDamageNotation returns '2d20' for Aetheric Shard names

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve(); }),
    },
  };
});

import { validSlotsForItem } from '../app/engine/equipment';
import { getEquippedWeapon } from '../app/engine/combatRules';
import { throwDamageNotation } from '../app/engine/itemWeight';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

function mkShard(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'shard_1',
    name: 'Shaped Aetheric Shard',
    kind: 'misc',
    quantity: 1,
    tags: ['throwable', 'aether', 'shaped'],
    rarity: 'Rare',
    description: 'X',
    ...overrides,
  };
}

function mkPlayer(inv: InventoryItem[], equipped: Record<string, string | null> = {}): PlayerCharacter {
  return {
    name: 'Test',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
    stats: { strength: 10, dexterity: 12, intelligence: 10, wisdom: 10, charisma: 10 },
    hp: 40, hpMax: 50,
    stamina: 18, staminaMax: 20,
    ac: 12, tc: 0,
    corruption: 0,
    inventory: inv,
    factionStanding: [],
    currentLocationId: 'x',
    activeQuests: [],
    equipped,
  } as unknown as PlayerCharacter;
}

describe('OTA-208 — throwable items equip as weapons', () => {
  it("Shaped Aetheric Shard's slots are ['main', 'off']", () => {
    const slots = validSlotsForItem(mkShard());
    expect(slots).toContain('main');
    expect(slots).toContain('off');
  });

  it("Plain Aetheric Shard with 'throwable' tag also routes to main/off", () => {
    const slots = validSlotsForItem(mkShard({
      name: 'Aetheric Shard',
      tags: ['throwable', 'aether'],
    }));
    expect(slots).toContain('main');
    expect(slots).toContain('off');
  });

  it("a non-throwable misc item (Scrap Metal) does NOT route to weapon slots", () => {
    const slots = validSlotsForItem({
      id: 'sm',
      name: 'Scrap Metal',
      kind: 'misc',
      quantity: 1,
      tags: ['metal'],
      rarity: 'Common',
      description: 'X',
    });
    expect(slots).not.toContain('main');
    expect(slots).not.toContain('off');
  });
});

describe('OTA-208 — getEquippedWeapon synthesizes a throwable weapon', () => {
  it('returns a CatalogWeapon with damageDice "2d20" for Shaped Aetheric Shard', () => {
    const shard = mkShard();
    const player = mkPlayer([shard], { main: shard.name });
    const w = getEquippedWeapon(player, 'main');
    expect(w).not.toBeNull();
    expect(w?.damageDice).toBe('2d20');
    expect(w?.weaponKind).toBe('ranged');
    expect(w?.damageType).toBe('aetheric');
    expect(w?.stat).toBe('dexterity');
    expect((w?.tags ?? []).some((t) => /throwable/i.test(t))).toBe(true);
  });

  it('returns the synthetic weapon for plain Aetheric Shard too', () => {
    const shard = mkShard({ name: 'Aetheric Shard', tags: ['throwable', 'aether'] });
    const player = mkPlayer([shard], { main: shard.name });
    const w = getEquippedWeapon(player, 'main');
    expect(w?.damageDice).toBe('2d20');
  });

  it('falls back to barehand (null) when the throwable name does not match the equipped slot', () => {
    const shard = mkShard();
    const player = mkPlayer([shard], { main: 'Iron Spear' });
    const w = getEquippedWeapon(player, 'main');
    // Iron Spear is a real catalog weapon; the throwable check skips
    // because the name doesn't match the equipped slot name.
    expect(w?.damageDice).not.toBe('2d20');
  });
});

describe('OTA-208 — throwDamageNotation', () => {
  it('returns "2d20" for both shard names', () => {
    expect(throwDamageNotation(mkShard())).toBe('2d20');
    expect(throwDamageNotation(mkShard({ name: 'Aetheric Shard' }))).toBe('2d20');
  });

  it('returns the weight-based default for a regular rock', () => {
    const rock: InventoryItem = {
      id: 'r',
      name: 'Small Rock',
      kind: 'misc',
      quantity: 1,
      tags: ['stone'],
      rarity: 'Common',
      description: 'X',
    };
    const notation = throwDamageNotation(rock);
    expect(notation).not.toBe('2d20');
    expect(notation).toMatch(/^\d/);
  });

  it('returns "1" for a null item (bare-handed throw)', () => {
    expect(throwDamageNotation(null)).toBe('1');
  });
});
