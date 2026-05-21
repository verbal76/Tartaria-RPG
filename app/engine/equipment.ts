import type { InventoryItem, EquipSlot, PlayerCharacter, Stats } from './types';
import { findWeaponByName, findArmorByName, findAmuletByName, findRingByName, GEAR, findExplorationItemByName, findGearByName, findMaterialByName } from './crafting';
import { aggregateInventoryPassives, inventoryHasGate, isScanner, type EffectResolver, type GateKind } from './itemEffect';

/**
 * Return the list of slots an item could legally be equipped into.
 * Empty array = the item can't be equipped at all.
 */
export function validSlotsForItem(item: InventoryItem): EquipSlot[] {
  const nameLower = item.name.toLowerCase();
  if (findWeaponByName(item.name)) {
    return ['main', 'off']; // any weapon can go in either hand
  }
  // OTA 193 — exploration items with effect.kind='scanner' (Pulse
  // Scanner today, future Geiger-counter analogs tomorrow) are
  // off-hand equippable so they can sit alongside a one-handed
  // weapon. Check this BEFORE amulet/ring inference so a scanner
  // name containing "amulet" / "ring" wouldn't get re-routed.
  const exp = findExplorationItemByName(item.name);
  if (exp?.effect?.kind === 'scanner') {
    return [exp.effect.slot]; // currently always 'off'
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
  // Name-based fallback for items the catalog doesn't know yet.
  // Playtest report: player picked up "Mud-Rend Blade" — clearly a
  // weapon by name — but the inventory modal said "No record of this
  // item in the catalog" and only offered SCRAP / DROP / CLOSE. The
  // user's rule: anything that LOOKS equippable should BE equippable,
  // even if the catalog row hasn't been written yet. Damage rolls fall
  // back to the bare-hands path inside combat, so an unknown weapon
  // still swings — it just doesn't get bonus dice or special tags
  // until the catalog catches up.
  if (/\b(blade|sword|axe|spear|bow|crossbow|dagger|knife|club|mace|hammer|maul|staff|wand|rod|scepter|gun|rifle|pistol|sling|javelin|lance|glaive|halberd|pike|scythe|whip|claw|fang|baton|cudgel|cleaver|saber|sabre|katana|machete|tomahawk|trowel|hatchet|warblade|thornblade|shadowblade|nightblade|deathblade|etherblade)\b/i.test(nameLower)) {
    return ['main', 'off'];
  }
  if (/\b(helm|helmet|hood|headpiece|faceplate|faceguard|faceshroud|crown|circlet|coif|skullcap|mask)\b/i.test(nameLower)) {
    return ['head'];
  }
  if (/\b(chestplate|breastplate|chestpiece|cuirass|hauberk|jerkin|vest|tunic|robe|battlecoat|coat|mantle|cloak|chest|warplate|plate)\b/i.test(nameLower)) {
    return ['chest'];
  }
  if (/\b(leggings|legguards|legplates|greaves|chausses|trousers|breeches|pants|leg)\b/i.test(nameLower)) {
    return ['legs'];
  }
  if (/\b(boots|sandals|footwraps|sabatons|stompers|sole|shoe)\b/i.test(nameLower)) {
    return ['feet'];
  }
  if (/\b(amulet|locket|necklace|pendant|medallion|charm|talisman|brooch)\b/i.test(nameLower)) {
    return ['amulet'];
  }
  if (/\b(ring|band|signet)\b/i.test(nameLower)) {
    return ['ring'];
  }
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

// Shared resolver list — the effect system can be backed by any
// catalog row that carries an `effect` field. As of OTA 192 that's
// exploration / gear / material rows in addition to the existing
// armor / amulet / ring rows. Order doesn't matter (no item appears
// in more than one catalog by name).
const EFFECT_RESOLVERS: EffectResolver[] = [
  (n) => findExplorationItemByName(n),
  (n) => findGearByName(n),
  (n) => findMaterialByName(n),
  // Equipped-class catalogs also flow through so a future ring or
  // amulet author can attach an `effect` (e.g. a ring that grants
  // a gate) without needing extra wiring here.
  (n) => findAmuletByName(n),
  (n) => findRingByName(n),
];

/** OTA 192 — sum passive stat bonuses from items that just LIVE in
 *  the player's inventory (no equip required). Capped per stat by
 *  PASSIVE_STAT_CAP inside itemEffect.ts so a backpack full of
 *  +1 INT exploration tools can't inflate the build past +2 INT.
 *  Stackable items (e.g. 3 Communicators) contribute their effect
 *  per-stack-entry — the cap is the real ceiling. */
export function aggregateInventoryPassiveStatBonuses(player: PlayerCharacter): Partial<Stats> {
  const names = (player.inventory ?? []).map((i) => i.name);
  return aggregateInventoryPassives(names, EFFECT_RESOLVERS);
}

/** OTA 192 — public helper for scene/travel code that needs to gate
 *  a tile on owning the right tool. Pass the gate kind (e.g.
 *  'breathe_toxic'); we'll scan the player's inventory for any
 *  item whose effect.unlocks matches and return true on the first
 *  hit. False if no item grants it. */
export function playerHasGate(player: PlayerCharacter, gate: GateKind): boolean {
  const names = (player.inventory ?? []).map((i) => i.name);
  return inventoryHasGate(names, gate, EFFECT_RESOLVERS);
}

/** OTA 193 — true iff the player has a scanner with the given
 *  bias EQUIPPED in the off-hand. Carried-but-not-equipped
 *  scanners don't fire — the player has to commit the slot.
 *  Used by the search verb to grant Aetheric drops when
 *  searching physical features ("search the vent" + Pulse
 *  Scanner in off-hand → small chance at Aether Shard / Dust /
 *  Fungus). */
export function playerHasScannerEquipped(
  player: PlayerCharacter,
  bias: 'aetheric',
): boolean {
  const off = player.equipped?.off;
  if (!off) return false;
  return isScanner(off, bias, EFFECT_RESOLVERS);
}

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
  // OTA 192 — inventory passives stack on top (capped per-stat to
  // prevent backpack-build inflation).
  const inv = aggregateInventoryPassiveStatBonuses(player);
  const w = weatherMod ?? {};
  return {
    strength: player.stats.strength + (bonus.strength ?? 0) + (inv.strength ?? 0) + (w.strength ?? 0),
    dexterity: player.stats.dexterity + (bonus.dexterity ?? 0) + (inv.dexterity ?? 0) + (w.dexterity ?? 0),
    intelligence: player.stats.intelligence + (bonus.intelligence ?? 0) + (inv.intelligence ?? 0) + (w.intelligence ?? 0),
    wisdom: player.stats.wisdom + (bonus.wisdom ?? 0) + (inv.wisdom ?? 0) + (w.wisdom ?? 0),
    charisma: player.stats.charisma + (bonus.charisma ?? 0) + (inv.charisma ?? 0) + (w.charisma ?? 0),
  };
}
