import type { InventoryItem, EquipSlot, PlayerCharacter, Stats } from './types';
import { findWeaponByName, findArmorByName, findAmuletByName, findRingByName, GEAR, findExplorationItemByName, findGearByName, findMaterialByName } from './crafting';
import { aggregateInventoryPassives, inventoryHasGate, isScanner, type EffectResolver, type GateKind, type ScannerBias } from './itemEffect';
import { racialStatBonusesFor } from './raceMechanics';
import { corruptionTierOf, corruptionStatPenalty } from './corruption';

/**
 * Return the list of slots an item could legally be equipped into.
 * Empty array = the item can't be equipped at all.
 */
export function validSlotsForItem(item: InventoryItem): EquipSlot[] {
  const nameLower = item.name.toLowerCase();
  // OTA-120 Phase 5 — dog vests have kind 'dog_armor' and never go in
  // any player slot. The Inventory screen surfaces a [fits dog] tap-to-
  // equip-on-dog affordance instead. Returning [] here ensures the
  // generic "vest" regex below (which would otherwise route to
  // 'chest') doesn't grab them onto the player.
  if (item.kind === 'dog_armor') return [];
  // OTA-224 — fused items carry uniqueStats but their names are
  // synthesized (e.g. "Resonant Cleaver") and won't appear in any
  // catalog. validSlotsForItem used to short-circuit to [] for them
  // because findWeaponByName / findArmorByName / etc. all missed.
  // Now we route directly off the uniqueStats.kind. Fused dog vests
  // also route correctly via the armorSlot:undefined → dog_armor
  // check at the top.
  if (item.uniqueStats) {
    const u = item.uniqueStats;
    if (u.kind === 'weapon') return ['main', 'off'];
    if (u.kind === 'armor' && u.armorSlot) return [u.armorSlot];
    if (u.kind === 'dog_armor') return [];
  }
  if (findWeaponByName(item.name)) {
    return ['main', 'off']; // any weapon can go in either hand
  }
  // OTA-208 — throwable tag = one-shot weapon. The Shaped Aetheric
  // Shard and plain Aetheric Shard (per OTA-198/200) deal 2d20 on
  // throw; treating them as ranged weapons lets the player equip,
  // attack, and the engine knows to throw + consume. UX matches the
  // player's mental model: "equip it, use it from combat, it's gone."
  if ((item.tags ?? []).some((t) => /throwable/i.test(t))) {
    return ['main', 'off'];
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
  // arb102 — `wardrobe`-tagged worn gear that isn't catalog armor (the
  // Hardened Climbing Strap) equips in the cloak / outer-layer slot, so it's
  // worn like apparel rather than stowed as a tool.
  if (item.tags?.some((t) => t.toLowerCase() === 'wardrobe')) {
    return ['cloak'];
  }
  const armor = findArmorByName(item.name);
  if (armor) {
    const equipSlots: EquipSlot[] = ['main','off','head','chest','hands','legs','feet','cloak','amulet','ring'];
    if (equipSlots.includes(armor.slot as EquipSlot)) return [armor.slot as EquipSlot];
    return []; // unknown/region-less armor
  }
  if (findAmuletByName(item.name)) return ['amulet'];
  if (findRingByName(item.name)) return ['ring'];
  // OTA-207 — crafting materials (MATERIALS catalog) should NEVER
  // fall through to the name-regex equip routing. The Sentinel Core
  // Plate is in materials.json with kind=misc tags=[automation,tech,
  // salvage,scrap]; the existing armor name-regex (line ~67) caught
  // 'plate' and routed it to ['chest']. Same trap for any future
  // material whose name happens to contain helm / boot / blade
  // tokens. Guard early — if the item lives in MATERIALS, it has
  // no equip slot, full stop.
  if (findMaterialByName(item.name)) return [];
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
  // arb63 — hands (gauntlets/gloves) + cloak (back) fallbacks. Placed before
  // chest so "cloak"/"mantle" no longer get mis-routed to the chest slot.
  if (/\b(gauntlet|gauntlets|glove|gloves|handguard|handguards|bracer|bracers|vambrace|vambraces|mitt|mitts|knuckle|knuckles)\b/i.test(nameLower)) {
    return ['hands'];
  }
  if (/\b(cloak|cape|mantle|shroud|drape|cloakwrap)\b/i.test(nameLower)) {
    return ['cloak'];
  }
  if (/\b(chestplate|breastplate|chestpiece|cuirass|hauberk|jerkin|vest|tunic|robe|battlecoat|coat|chest|warplate|plate)\b/i.test(nameLower)) {
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
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
  cloak: 'Cloak',
  amulet: 'Amulet',
  ring: 'Ring',
};

/** Slots that hold armor pieces (used to aggregate AC + resistances). */
export const ARMOR_SLOTS: readonly EquipSlot[] = ['head', 'chest', 'hands', 'legs', 'feet', 'cloak'];

/** Map an equip slot to its corresponding `*Id` key on PlayerEquipped.
 *  When set, the id key identifies the exact inventory instance bound
 *  to that slot (important when the player holds two of the same item). */
export const SLOT_ID_KEY: Record<EquipSlot, 'mainId' | 'offId' | 'headId' | 'chestId' | 'handsId' | 'legsId' | 'feetId' | 'cloakId' | 'amuletId' | 'ringId'> = {
  main: 'mainId',
  off: 'offId',
  head: 'headId',
  chest: 'chestId',
  hands: 'handsId',
  legs: 'legsId',
  feet: 'feetId',
  cloak: 'cloakId',
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
  bias: ScannerBias,
): boolean {
  const off = player.equipped?.off;
  if (off && isScanner(off, bias, EFFECT_RESOLVERS)) return true;
  // OTA-269 — pouched scanners count too. The tool pouch is an
  // alternate "equipped" surface for tools; a Pulse Scanner stowed
  // on the belt is just as accessible as one in the off-hand for
  // search-feature gating. Player ask: "in the pouch is technically
  // equipped. so you 'grab the item from your pouch' scan and then
  // a swap back." Loop over pouch ids → look up item name in
  // inventory → run the same isScanner check.
  const pouchIds = player.equipped?.toolPouchIds ?? [];
  for (const id of pouchIds) {
    const item = player.inventory.find((i) => i.id === id);
    if (item && isScanner(item.name, bias, EFFECT_RESOLVERS)) return true;
  }
  return false;
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
  // OTA-239 — three concurrent ring slots. Each ring's statBonus
  // stacks; future ring catalog can author per-slot synergies later.
  for (const ringName of [eq.ring, eq.ring2, eq.ring3]) {
    if (!ringName) continue;
    const r = findRingByName(ringName);
    if (r?.statBonus) add(r.statBonus.stat, r.statBonus.amount);
  }
  return bonus;
}

// Apply the aggregated stat bonuses on top of the player's base stats.
// Used by combat (attack rolls, damage rolls, skill checks) so equipped
// gear actually changes the math. Optional `weatherMod` parameter folds
// in the active weather's stat modifiers (Iron Fog −1 DEX, Etheric Storm
// +1 INT, etc.) so the world has a voice in every roll.
// OTA 038 — also folds in always-on racial stat bonuses (Tartarian
// Giant +2 STR, Architectural Sentinel +2 STR +1 INT, Aetherborn +1 CHA,
// etc.). Context-conditional bonuses (Mud Dweller +2 INT when using
// Aethercraft, Aetherborn +2 INT near relics) stay strings in
// race.traits for now; a follow-up OTA will wire them through a
// contextMods arg.
export function effectiveStats(
  player: PlayerCharacter,
  weatherMod?: Partial<Stats>,
): Stats {
  const bonus = aggregateEquippedStatBonuses(player);
  // OTA 192 — inventory passives stack on top (capped per-stat to
  // prevent backpack-build inflation).
  const inv = aggregateInventoryPassiveStatBonuses(player);
  // OTA 003 — timed food/potion buffs stack on top of everything
  // else. Each food_buff status carries (buffStat, buffBonus); sum
  // them per stat. No cap — these expire on their own.
  const food: Partial<Stats> = {};
  for (const eff of player.statusEffects ?? []) {
    if (eff.kind !== 'food_buff' || !eff.buffStat || !eff.buffBonus) continue;
    food[eff.buffStat] = (food[eff.buffStat] ?? 0) + eff.buffBonus;
  }
  // OTA-211 — Aether Dust food additive grants +3 to a player-chosen
  // stat for 5 real-world minutes. Stored on player.aetherBuff with a
  // wall-clock expiresAtMs; we apply IF still active. Stacks on top
  // of food_buff (the additive is supposed to feel meaningful).
  if (player.aetherBuff && Date.now() < player.aetherBuff.expiresAtMs) {
    food[player.aetherBuff.stat] = (food[player.aetherBuff.stat] ?? 0) + player.aetherBuff.bonus;
  }
  const w = weatherMod ?? {};
  // OTA 038 — race-derived always-on stat bonuses.
  const racial = racialStatBonusesFor(player.raceId);
  // OTA 039 — corruption tier penalty. Tainted=-1 CHA, Corrupted=-1
  // all, Hollowed=-2 all. Subtracts at every skill-check site so the
  // aether under your skin actually costs you something.
  const tier = corruptionTierOf(player.corruption ?? 0);
  const corrPen = corruptionStatPenalty(tier);
  return {
    strength: player.stats.strength + (bonus.strength ?? 0) + (inv.strength ?? 0) + (food.strength ?? 0) + (w.strength ?? 0) + (racial.strength ?? 0) + (corrPen.strength ?? 0),
    dexterity: player.stats.dexterity + (bonus.dexterity ?? 0) + (inv.dexterity ?? 0) + (food.dexterity ?? 0) + (w.dexterity ?? 0) + (racial.dexterity ?? 0) + (corrPen.dexterity ?? 0),
    intelligence: player.stats.intelligence + (bonus.intelligence ?? 0) + (inv.intelligence ?? 0) + (food.intelligence ?? 0) + (w.intelligence ?? 0) + (racial.intelligence ?? 0) + (corrPen.intelligence ?? 0),
    wisdom: player.stats.wisdom + (bonus.wisdom ?? 0) + (inv.wisdom ?? 0) + (food.wisdom ?? 0) + (w.wisdom ?? 0) + (racial.wisdom ?? 0) + (corrPen.wisdom ?? 0),
    charisma: player.stats.charisma + (bonus.charisma ?? 0) + (inv.charisma ?? 0) + (food.charisma ?? 0) + (w.charisma ?? 0) + (racial.charisma ?? 0) + (corrPen.charisma ?? 0),
  };
}

// OTA 040 — annotated effective-stats. Same math as effectiveStats
// but returns per-source labels so the Player Sheet can show
// "STR 12 (base 10, +2 race, +1 helm, +1 weather, −1 corruption)".
// Doesn't change the existing effectiveStats signature; all 30+ call
// sites that just want the value-only object stay on the old one.
export type StatSource = { label: string; delta: number };
export interface StatBreakdown {
  base: number;
  total: number;
  sources: StatSource[];
}
export type EffectiveStatsBreakdown = Record<keyof Stats, StatBreakdown>;

export function effectiveStatsBreakdown(
  player: PlayerCharacter,
  weatherMod?: Partial<Stats>,
): EffectiveStatsBreakdown {
  const bonus = aggregateEquippedStatBonuses(player);
  const inv = aggregateInventoryPassiveStatBonuses(player);
  // Food buffs — sum per stat, but also record each individual buff
  // so the breakdown can show the source food name.
  const foodBuffs: Array<{ stat: keyof Stats; delta: number; label: string }> = [];
  for (const eff of player.statusEffects ?? []) {
    if (eff.kind !== 'food_buff' || !eff.buffStat || !eff.buffBonus) continue;
    foodBuffs.push({
      stat: eff.buffStat,
      delta: eff.buffBonus,
      label: eff.label ? `${eff.label}` : `food (+${eff.buffBonus})`,
    });
  }
  const racial = racialStatBonusesFor(player.raceId);
  const tier = corruptionTierOf(player.corruption ?? 0);
  const corrPen = corruptionStatPenalty(tier);
  const w = weatherMod ?? {};

  const build = (stat: keyof Stats): StatBreakdown => {
    const base = player.stats[stat];
    const sources: StatSource[] = [];
    if ((racial[stat] ?? 0) !== 0) sources.push({ label: 'race', delta: racial[stat]! });
    if ((bonus[stat] ?? 0) !== 0) sources.push({ label: 'equipped', delta: bonus[stat]! });
    if ((inv[stat] ?? 0) !== 0) sources.push({ label: 'pack passive', delta: inv[stat]! });
    for (const fb of foodBuffs) {
      if (fb.stat === stat) sources.push({ label: fb.label, delta: fb.delta });
    }
    if ((w[stat] ?? 0) !== 0) sources.push({ label: 'weather', delta: w[stat]! });
    if ((corrPen[stat] ?? 0) !== 0) sources.push({ label: `corruption (${tier})`, delta: corrPen[stat]! });
    const total = base + sources.reduce((s, x) => s + x.delta, 0);
    return { base, total, sources };
  };
  return {
    strength: build('strength'),
    dexterity: build('dexterity'),
    intelligence: build('intelligence'),
    wisdom: build('wisdom'),
    charisma: build('charisma'),
  };
}
