import type { InventoryItem, EquipSlot, PlayerCharacter, Stats } from './types';
import { findWeaponByName, findArmorByName, findAmuletByName, findRingByName, GEAR } from './crafting';

/**
 * Return the list of slots an item could legally be equipped into.
 * Empty array = the item can't be equipped at all.
 */
export function validSlotsForItem(item: InventoryItem): EquipSlot[] {
  const nameLower = item.name.toLowerCase();
  if (findWeaponByName(item.name)) {
    return ['main', 'off']; // any weapon can go in either hand
  }
  const armor = findArmorByName(item.name);
  if (armor) {
    const equipSlots: EquipSlot[] = ['main','off','head','chest','legs','feet','amulet','ring'];
    if (equipSlots.includes(armor.slot as EquipSlot)) return [armor.slot as EquipSlot];
    return []; // cloak/hands slots not yet in the equip system
  }
  if (findAmuletByName(item.name)) return ['amulet'];
  if (findRingByName(item.name)) return ['ring'];
  // Gear-side: relics with detection / locket-ish tags can be amulets.
  const gear = GEAR.find((g) => g.name.toLowerCase() === nameLower);
  if (gear) {
    if (gear.tags.includes('detection') || /locket|amulet|necklace/i.test(gear.name)) {
      return ['amulet'];
    }
    if (/ring|band/i.test(gear.name)) {
      return ['ring'];
    }
  }
  // Tag-based fallback for items not in the catalog yet.
  if (item.tags.some((t) => /amulet|locket|necklace/i.test(t))) return ['amulet'];
  if (item.tags.some((t) => /ring|band/i.test(t))) return ['ring'];
  return [];
}

/** Pretty label for a slot. Used in UI prompts and StatsPanel. */
export const SLOT_LABEL: Record<EquipSlot, string> = {
  main: 'Main hand',
  off: 'Off hand',
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
  amulet: 'Amulet',
  ring: 'Ring',
};

/** Slots that hold armor pieces (used to aggregate AC + resistances). */
export const ARMOR_SLOTS: readonly EquipSlot[] = ['head', 'chest', 'legs', 'feet'];

/** Map an equip slot to its corresponding `*Id` key on PlayerEquipped.
 *  When set, the id key identifies the exact inventory instance bound
 *  to that slot (important when the player holds two of the same item). */
export const SLOT_ID_KEY: Record<EquipSlot, 'mainId' | 'offId' | 'headId' | 'chestId' | 'legsId' | 'feetId' | 'amuletId' | 'ringId'> = {
  main: 'mainId',
  off: 'offId',
  head: 'headId',
  chest: 'chestId',
  legs: 'legsId',
  feet: 'feetId',
  amulet: 'amuletId',
  ring: 'ringId',
};

/** Resolve the InventoryItem currently equipped in the named slot.
 *  Prefers an id match on PlayerEquipped[slot+'Id'] (the instance the
 *  player actually wore); falls back to first-by-name for legacy
 *  saves where no id was recorded. Returns null when the slot is
 *  empty or the bound item has been consumed / removed. */
export function resolveEquippedItem(
  player: PlayerCharacter,
  slot: EquipSlot,
): InventoryItem | null {
  const eq = player.equipped;
  if (!eq) return null;
  const name = eq[slot];
  if (!name) return null;
  const idKey = SLOT_ID_KEY[slot];
  const wantedId = eq[idKey];
  if (wantedId) {
    const byId = player.inventory.find((i) => i.id === wantedId && i.quantity > 0);
    if (byId) return byId;
  }
  // Legacy save (no id stored) — first-by-name. Same behaviour as before
  // the refactor, so saves without ids still equip correctly.
  return player.inventory.find(
    (i) => i.name.toLowerCase() === name.toLowerCase() && i.quantity > 0,
  ) ?? null;
}

// Stat names the equipment system can boost. Includes 'constitution' for
// future use (some accessories grant it) — it routes to HP/stamina math.
type StatKey = keyof Stats;
const STAT_KEYS: StatKey[] = ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma'];

// Sum stat bonuses from every equipped piece (armor pieces with statBonus,
// amulets, rings). Items broken or unequipped contribute nothing. The
// returned object only includes the five base stats; non-stat bonuses
// (constitution, etc.) are dropped.
export function aggregateEquippedStatBonuses(player: PlayerCharacter): Partial<Stats> {
  const bonus: Partial<Record<StatKey, number>> = {};
  const eq = player.equipped ?? {};
  const add = (stat: string, amount: number) => {
    const key = stat as StatKey;
    if (!STAT_KEYS.includes(key)) return;
    bonus[key] = (bonus[key] ?? 0) + amount;
  };
  for (const slot of ARMOR_SLOTS) {
    const name = eq[slot];
    if (!name) continue;
    const piece = findArmorByName(name);
    if (piece?.statBonus) add(piece.statBonus.stat, piece.statBonus.amount);
  }
  if (eq.amulet) {
    const a = findAmuletByName(eq.amulet);
    if (a?.statBonus) add(a.statBonus.stat, a.statBonus.amount);
  }
  if (eq.ring) {
    const r = findRingByName(eq.ring);
    if (r?.statBonus) add(r.statBonus.stat, r.statBonus.amount);
  }
  return bonus;
}

// Apply the aggregated stat bonuses on top of the player's base stats.
// Used by combat (attack rolls, damage rolls, skill checks) so equipped
// gear actually changes the math. Optional `weatherMod` parameter folds
// in the active weather's stat modifiers (Iron Fog −1 DEX, Etheric Storm
// +1 INT, etc.) so the world has a voice in every roll.
export function effectiveStats(
  player: PlayerCharacter,
  weatherMod?: Partial<Stats>,
): Stats {
  const bonus = aggregateEquippedStatBonuses(player);
  const w = weatherMod ?? {};
  return {
    strength: player.stats.strength + (bonus.strength ?? 0) + (w.strength ?? 0),
    dexterity: player.stats.dexterity + (bonus.dexterity ?? 0) + (w.dexterity ?? 0),
    intelligence: player.stats.intelligence + (bonus.intelligence ?? 0) + (w.intelligence ?? 0),
    wisdom: player.stats.wisdom + (bonus.wisdom ?? 0) + (w.wisdom ?? 0),
    charisma: player.stats.charisma + (bonus.charisma ?? 0) + (w.charisma ?? 0),
  };
}
