import type { InventoryItem } from './types';
import {
  findWeaponByName,
  findArmorByName,
  findAmuletByName,
  findRingByName,
  findExplorationItemByName,
  GEAR,
} from './crafting';
import { scrapOutputFor } from './scrapEngine';

// OTA-188 — when a durability-tracked item breaks, drop ONE low-tier
// material so the player has a foothold to repair / re-craft. Ropes
// drop "Broken Rope" (which is the recipe ingredient for crafting a
// new Climbing Rope). Other items drop the first material from
// their scrap output — the base component for the equivalent
// repair recipe. Player ask: "when the rope finally breaks I have
// never seen it turn into the broken rope item and populate my
// inventory. also when weapons break from durability what happens
// to them? so they have a chance to drop 1 single low level
// material that would be needed to repair that item?"
function brokenSalvageFor(item: InventoryItem): { name: string; quantity: number } | null {
  const nameLower = item.name.toLowerCase();
  // Ropes always salvage to Broken Rope (which 2× of crafts a new
  // Climbing Rope via the OTA-008 recipe).
  if (/\b(rope|line|cord|cable)\b/.test(nameLower)) {
    return { name: 'Broken Rope', quantity: 1 };
  }
  // Everything else: first scrap output. scrapOutputFor returns 1+
  // material grants tagged off the item's catalog tags + kind.
  const out = scrapOutputFor(item);
  if (out.grants.length === 0) return null;
  return { name: out.grants[0]!.name, quantity: 1 };
}

// Default durability for catalog entries that don't declare one. Materials,
// consumables, and generic loot are NOT durability-tracked.
const DEFAULT_DURABILITY = 25;

// Resolve the catalog baseDurability for a named item, or null if the item
// is not a durability-tracked category (consumable, material, etc.).
function lookupBaseDurability(name: string): number | null {
  const w = findWeaponByName(name);
  if (w) return w.baseDurability ?? DEFAULT_DURABILITY;
  const a = findArmorByName(name);
  if (a) return a.baseDurability ?? DEFAULT_DURABILITY;
  const am = findAmuletByName(name);
  if (am) return am.baseDurability ?? DEFAULT_DURABILITY;
  const r = findRingByName(name);
  if (r) return r.baseDurability ?? DEFAULT_DURABILITY;
  // GEAR catalog entries typed as 'relic' (Aetheric Torch, Aetheric
  // Locket, Aetheric Compass, etc.) were previously skipped — the
  // 'every relic has durability' invariant broke for them. Stress
  // test caught the gap. Treat any GEAR row whose kind is 'relic' /
  // 'weapon' / 'armor' as durability-tracked.
  const nameLower = name.toLowerCase();
  const g = GEAR.find((x) => x.name.toLowerCase() === nameLower);
  if (g && g.kind === 'relic') {
    // GEAR rows don't currently declare baseDurability, but the door
    // is open for them to do so. Honor it if present.
    const gAny = g as typeof g & { baseDurability?: number };
    return gAny.baseDurability ?? DEFAULT_DURABILITY;
  }
  // Exploration catalog: Reclaimer's Rope (and any future durability-tracked
  // exploration item) carries baseDurability now that rope is wear-tracked.
  // Honor it the same way we honor relic-kind GEAR rows.
  const e = findExplorationItemByName(name);
  if (e) {
    const eAny = e as typeof e & { baseDurability?: number };
    if (eAny.baseDurability != null) return eAny.baseDurability;
  }
  return null;
}

// Attribute stats an instance perk may carry. Mirrors equipment.ts STAT_KEYS
// (base stats incl. stealth). Deliberately EXCLUDES `hp` — hp bonuses stay
// catalog-driven because they're baked into hpMax on equip (gearHpBonus); an
// instance-varied hp would drift that bookkeeping.
const ATTRIBUTE_STATS = new Set([
  'strength', 'dexterity', 'intelligence', 'wisdom', 'charisma', 'stealth',
]);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Per-instance perk ceiling so two copies of the same piece differ in BOTH
// magnitude and count. Indexed by rarity — rarer gear can roll a fatter perk
// budget. The `temper` roll (0 = fragile, 1 = sturdy) splits a piece's "power"
// between durability and perks: fragile rolls trade longevity for a bigger
// perk budget, sturdy rolls do the reverse.
function perkCeilMult(rarity: string | undefined): number {
  switch (rarity) {
    case 'Legendary': return 3.2;
    case 'Rare': return 2.8;
    case 'Uncommon': return 2.4;
    default: return 2.0;
  }
}
const PERK_FLOOR_MULT = 0.5; // sturdiest roll still keeps ~half the base perks
const PERK_CAP = 5;          // no single perk channel exceeds +5

// Roll the per-instance perk loadout for a weapon/armor, given its `temper`
// (0 = fragile/strong-perks, 1 = sturdy/weak-perks). Returns null for non-gear
// or pieces with no perk channels. The catalog perks define the piece's
// IDENTITY (a stealth cloak leans stealth); we vary the magnitude/count of
// those channels rather than inventing unrelated stats. Weapons with no
// authored statBonuses seed a single channel from their scaling stat so they
// still roll a flavour-appropriate perk.
function rollInstancePerks(
  item: InventoryItem,
  temper: number,
): { acBonus?: number; statBonuses?: { stat: string; amount: number }[] } | null {
  const armor = findArmorByName(item.name);
  const weapon = armor ? null : findWeaponByName(item.name);
  if (!armor && !weapon) return null; // amulets/rings/relics keep catalog perks

  const channels: { key: string; base: number }[] = [];
  if (armor) {
    if (armor.acBonus > 0) channels.push({ key: 'ac', base: armor.acBonus });
    const bonuses = armor.statBonuses ?? (armor.statBonus ? [armor.statBonus] : []);
    for (const b of bonuses) {
      if (ATTRIBUTE_STATS.has(b.stat) && b.amount > 0) channels.push({ key: b.stat, base: b.amount });
    }
  } else if (weapon) {
    for (const b of weapon.statBonuses ?? []) {
      if (ATTRIBUTE_STATS.has(b.stat) && b.amount > 0) channels.push({ key: b.stat, base: b.amount });
    }
    if (channels.length === 0 && weapon.stat && ATTRIBUTE_STATS.has(weapon.stat)) {
      channels.push({ key: weapon.stat, base: 1 }); // seed from scaling stat
    }
  }
  if (channels.length === 0) return null;

  const baseTotal = channels.reduce((s, c) => s + c.base, 0);
  const rarity = item.rarity ?? armor?.rarity ?? weapon?.rarity;
  // temper 0 → ceil multiplier (big budget); temper 1 → floor multiplier.
  const budget = Math.max(1, Math.round(baseTotal * lerp(perkCeilMult(rarity), PERK_FLOOR_MULT, temper)));

  channels.sort((x, y) => y.base - x.base); // primary (highest base) first
  let acBonus: number | undefined;
  const statBonuses: { stat: string; amount: number }[] = [];
  let funded = false;
  for (const c of channels) {
    let amt = Math.min(PERK_CAP, Math.round(budget * (c.base / baseTotal)));
    if (!funded && amt < 1) amt = 1; // the primary channel never drops out
    if (amt < 1) continue;           // secondaries can drop → perk COUNT varies
    funded = true;
    if (c.key === 'ac') acBonus = amt;
    else statBonuses.push({ stat: c.key, amount: amt });
  }
  if (acBonus === undefined && statBonuses.length === 0) return null;
  return {
    ...(acBonus !== undefined ? { acBonus } : {}),
    ...(statBonuses.length ? { statBonuses } : {}),
  };
}

// Populate durability + per-instance perks on a freshly-created item. Called at
// every item-creation chokepoint (vendor buys, loot drops, crafting, salvage).
// Two copies of the same catalog weapon/armor come out different: a single
// `temper` roll scales durability up while scaling the perk budget down (and
// vice-versa), giving the inverse "sturdy workhorse vs fragile glass-cannon"
// tradeoff. Idempotent: an item that already carries durability is returned
// untouched (re-stamps + legacy saves keep their values), so perks are only
// rolled once at birth.
export function stampDurability(item: InventoryItem): InventoryItem {
  if (item.durability) return item;
  const base = lookupBaseDurability(item.name);
  if (base == null) return item;
  const temper = Math.random(); // 0 = fragile (strong perks), 1 = sturdy (weak perks)
  const max = Math.max(1, Math.round(base * lerp(0.4, 1.8, temper)));
  const instanceStats = rollInstancePerks(item, temper);
  return {
    ...item,
    durability: { current: max, max },
    ...(instanceStats ? { instanceStats } : {}),
  };
}

// Reduce one inventory item's durability by `amount`. Matches by name; the
// first matching instance with the highest current durability wins so the
// "freshest" copy bears the wear. Returns the new inventory and whether
// the worn item broke (durability hit 0).
export function wearItemByName(
  inventory: readonly InventoryItem[],
  itemName: string,
  amount = 1,
): { inventory: InventoryItem[]; broken: boolean; brokenName: string | null; salvageDrop: { name: string; quantity: number } | null } {
  const target = itemName.toLowerCase();
  // Pick the candidate by name, preferring an instance that already has a
  // durability record. (Stackable items without durability never wear.)
  const idx = inventory.findIndex((i) => i.name.toLowerCase() === target && i.durability);
  if (idx < 0) {
    return { inventory: inventory.map((i) => ({ ...i })), broken: false, brokenName: null, salvageDrop: null };
  }
  const next = inventory.map((i) => ({ ...i }));
  const item = next[idx]!;
  const cur = item.durability!.current - amount;
  if (cur <= 0) {
    // Item destroyed — remove from inventory.
    next.splice(idx, 1);
    return { inventory: next, broken: true, brokenName: item.name, salvageDrop: brokenSalvageFor(item) };
  }
  item.durability = { ...item.durability!, current: cur };
  return { inventory: next, broken: false, brokenName: null, salvageDrop: null };
}

/** Wear a specific item instance by id. Preferred over wearItemByName
 *  when the caller knows which copy is equipped — e.g. the player
 *  holds two Aetheric Lockets and only the one in the amulet slot
 *  should take durability damage. Falls back silently when the id
 *  isn't in the inventory (item already removed / never had
 *  durability). */
export function wearItemById(
  inventory: readonly InventoryItem[],
  itemId: string,
  amount = 1,
): { inventory: InventoryItem[]; broken: boolean; brokenName: string | null; salvageDrop: { name: string; quantity: number } | null } {
  const idx = inventory.findIndex((i) => i.id === itemId && i.durability);
  if (idx < 0) {
    return { inventory: inventory.map((i) => ({ ...i })), broken: false, brokenName: null, salvageDrop: null };
  }
  const next = inventory.map((i) => ({ ...i }));
  const item = next[idx]!;
  const cur = item.durability!.current - amount;
  if (cur <= 0) {
    next.splice(idx, 1);
    return { inventory: next, broken: true, brokenName: item.name, salvageDrop: brokenSalvageFor(item) };
  }
  item.durability = { ...item.durability!, current: cur };
  return { inventory: next, broken: false, brokenName: null, salvageDrop: null };
}

// Compute the TC cost to fully restore an item's durability. Convention:
// 1 TC per point missing, with a minimum of 1.
export function repairCost(item: InventoryItem): number {
  if (!item.durability) return 0;
  const missing = item.durability.max - item.durability.current;
  return Math.max(1, missing);
}

// Restore an item's durability to max in place. Returns a fresh inventory.
export function repairItem(
  inventory: readonly InventoryItem[],
  itemId: string,
): InventoryItem[] {
  return inventory.map((i) =>
    i.id === itemId && i.durability ? { ...i, durability: { ...i.durability, current: i.durability.max } } : i,
  );
}
