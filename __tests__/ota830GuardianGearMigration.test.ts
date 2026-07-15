// OTA-830 — OTA-828 stamped uniqueStats in the Guardian weapon()/armor() BUILDERS, so
// only NEWLY granted drops became usable. A drop earned BEFORE 828 sits in the save
// with NO uniqueStats, so it still resolves barehanded / 0-AC — device report:
// "Atalan's Trident still doesn't work" (while Vaelka's Halberd worked by accident,
// its name fuzzy-matching a catalog 'Halberd'). The save-load migration now backfills
// uniqueStats from the canonical set entry, matched by name.

import { guardianGearUniqueStats } from '../app/engine/coreGuardians';
import { getEquippedWeapon } from '../app/engine/combatRules';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

// A pre-828 stored drop: canonical name + tags, a freshDrop-suffixed id, NO uniqueStats.
const oldTrident = (): InventoryItem => ({
  id: 'cg_weapon_atalan_trident_1700000000_ab12',
  name: "Atalan's Trident",
  kind: 'weapon',
  rarity: 'Legendary',
  quantity: 1,
  tags: ['core_guardian_set', 'aether_born', 'piercing', 'reach', 'slow_chance'],
  durability: { current: 55, max: 55 },
} as InventoryItem);

describe('OTA-830 — backfill uniqueStats onto pre-828 Guardian drops', () => {
  it('re-derives the Trident stats by name (was missing from the old save)', () => {
    const old = oldTrident();
    expect(old.uniqueStats).toBeUndefined();
    const us = guardianGearUniqueStats(old);
    expect(us).not.toBeNull();
    expect(us!.kind).toBe('weapon');
    expect(us!.damageDice).toBe('1d10+2');
    expect(us!.damageType).toBe('piercing');
    expect(us!.scalesWith).toBe('strength');
  });

  it('grafted onto the instance, getEquippedWeapon now resolves it (was barehanded)', () => {
    const migrated = { ...oldTrident(), uniqueStats: guardianGearUniqueStats(oldTrident())! };
    const player = {
      inventory: [migrated],
      equipped: { main: migrated.name, mainId: migrated.id },
    } as unknown as PlayerCharacter;
    const w = getEquippedWeapon(player, 'main');
    expect(w).not.toBeNull();
    expect(w!.damageDice).toBe('1d10+2');
    expect(w!.damageType).toBe('piercing');
    expect(w!.stat).toBe('strength');
  });

  it('no-ops on an item that already has uniqueStats, or a non-Guardian item', () => {
    expect(guardianGearUniqueStats({ name: "Atalan's Trident", tags: ['core_guardian_set'], uniqueStats: {} })).toBeNull();
    expect(guardianGearUniqueStats({ name: 'Random Sword', tags: ['weapon'] })).toBeNull();
  });

  it('also covers armor (Drowned Mantle → AC via uniqueStats)', () => {
    const oldMantle = {
      id: 'cg_armor_drowned_mantle_x_y', name: 'Drowned Mantle', kind: 'armor',
      rarity: 'Legendary', quantity: 1,
      tags: ['core_guardian_set', 'aether_born', 'ac:3', 'chest', 'light', 'water_resist', 'corruption_resist'],
    } as InventoryItem;
    const us = guardianGearUniqueStats(oldMantle);
    expect(us?.kind).toBe('armor');
    expect(us?.acBonus).toBe(3);
    expect(us?.armorSlot).toBe('chest');
  });
});
