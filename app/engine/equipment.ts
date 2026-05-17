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
