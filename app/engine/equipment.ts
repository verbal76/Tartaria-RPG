import type { InventoryItem, EquipSlot, PlayerCharacter, Stats } from './types';
import { canonicalItemKind, canonicalItemTags, findWeaponByName, findArmorByName, findAmuletByName, findRingByName, GEAR, findExplorationItemByName, findGearByName, findMaterialByName } from './crafting';
import { isWeaponCoatingItem } from './weaponCoating';
import { itemIsThrowable } from './bandolierEligibility';
import { aggregateInventoryPassives, inventoryHasGate, isScanner, type EffectResolver, type GateKind, type ScannerBias } from './itemEffect';
import { racialStatBonusesFor } from './raceMechanics';
import { corruptionTierOf, corruptionStatPenalty } from './corruption';
import { resolveDisplayArmorByName } from './itemResolution';

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
  if (canonicalItemKind(item) === 'dog_armor') return [];
  // OTA-496 — weapon-coating consumables (Poison Vial, Acid Flask, Searing Paste,
  // …) are APPLIED to a weapon via the "Coat a weapon" flow, never equipped. Guard
  // here so a coating never gets an equip slot — e.g. "Sea·RING· Paste" matched the
  // ring regex below and wrongly offered "Equip (Ring)".
  if (isWeaponCoatingItem(item)) return [];
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
  if (itemIsThrowable(item)) {
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
  // OTA-927 — the aether-sight gadgets (Aetheric Vision Lens, Aether Goggles, the
  // beacons/locators/analyzer/compass/tuner) all grant the `detect_aether` gate.
  // They equip into the dedicated `lens` slot and the detect_aether passive is
  // active ONLY while one is worn (was: active just by being carried). Its own slot
  // so it never competes with an off-hand weapon/scanner.
  if (exp?.effect?.kind === 'gate' && exp.effect.unlocks === 'detect_aether') {
    return ['lens'];
  }
  // arb102 / OTA-911 — `wardrobe`-tagged worn gear that isn't catalog armor
  // (the Hardened Climbing Strap) equips in the LEGS slot: it's a harness rigged
  // around the hips and thighs, so it displaces leg armor while worn. (Was the
  // cloak slot pre-OTA-911; moved to legs per the mountaineering rework so the
  // strap is worn like a climbing harness, not a mantle.)
  if (canonicalItemTags(item).includes('wardrobe')) {
    return ['legs'];
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
    if (gear.tags.includes('detection') || /\b(locket|amulet|necklace)\b/i.test(gear.name)) {
      return ['amulet'];
    }
    // OTA-496 — word-bounded so a name that merely CONTAINS "ring"/"band"
    // (Searing, Soaring, Headband…) isn't mis-routed to the ring slot.
    if (/\b(ring|band)\b/i.test(gear.name)) {
      return ['ring'];
    }
  }
  // Tag-based fallback for items not in the catalog yet. OTA-496 — word-bounded
  // so a tag merely CONTAINING the token doesn't mis-route.
  if (item.tags.some((t) => /\b(amulet|locket|necklace)\b/i.test(t))) return ['amulet'];
  if (item.tags.some((t) => /\b(ring|band)\b/i.test(t))) return ['ring'];
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

// OTA-1114 — GROUP EQUIP / UNEQUIP. Owner: "you should be able to pick your
// armor hold and select a group and either equip all or unequip all depending
// on what you selected."
//
// ⚠ WHY THIS IS A PLANNER AND NOT A FOR-LOOP OVER equipItem(). Slots have
// CAPACITY. Two chest pieces cannot both go on, a two-handed weapon eats both
// hands, and there are three ring slots rather than one. A naive loop would
// still "succeed" on every call — it would just equip each piece and let the
// next one displace it, so a group of five armor pieces would end with ONE worn
// and four quietly set aside, while the button had promised five. The whole
// point of the group bar is that its count is a promise; this resolves the
// contention BEFORE the button is drawn, so the number on it is what lands.
//
// Capacity is seeded FULL, not from what is already worn, because equipping
// swaps: putting a helm on replaces the helm you had. What the plan refuses is
// two selected items racing for the same slot, which is the only case where the
// player could not have known what they were asking for.
export interface GroupEquipPlan {
  /** In list order — the pieces that will actually go on, and where. */
  equip: Array<{ item: InventoryItem; slot: EquipSlot }>;
  /** Equippable, but a piece earlier in the list already claimed the slot. */
  crowdedOut: InventoryItem[];
  /** Nothing in the selection fits any slot (materials, consumables, quest junk). */
  notEquippable: InventoryItem[];
}

/** Slots that hold more than one piece at a time. Rings have three. */
const SLOT_CAPACITY: Partial<Record<EquipSlot, number>> = { ring: 3 };

// Catalog-only, matching every other two-handed read on this screen
// (equippedSlotLabelFor, slotFillLabelFor): a FUSED weapon carries no style, so
// it is treated as one-handed here exactly as it is everywhere else. Getting
// that wrong in only this one place would be worse than being uniformly wrong.
function takesBothHands(item: InventoryItem): boolean {
  return findWeaponByName(item.name)?.style === 'two_handed';
}

/**
 * OTA-1114 — resolve a multi-selection into a conflict-free equip plan.
 * `worn` is the set of instance ids already on the body: those belong to the
 * UNEQUIP side of the bar and are skipped here rather than counted as failures,
 * so a mixed selection produces an honest number on each button.
 */
export function planGroupEquip(
  items: readonly InventoryItem[],
  worn: ReadonlySet<string>,
): GroupEquipPlan {
  const plan: GroupEquipPlan = { equip: [], crowdedOut: [], notEquippable: [] };
  const used: Partial<Record<EquipSlot, number>> = {};
  const free = (slot: EquipSlot) => (used[slot] ?? 0) < (SLOT_CAPACITY[slot] ?? 1);
  const claim = (slot: EquipSlot) => { used[slot] = (used[slot] ?? 0) + 1; };

  for (const item of items) {
    if (worn.has(item.id)) continue;
    const slots = validSlotsForItem(item);
    if (slots.length === 0) { plan.notEquippable.push(item); continue; }
    // A two-hander needs BOTH hands, so it is only placeable when neither is
    // spoken for, and it consumes both. Otherwise the second selected weapon
    // would be counted as equippable and then silently displaced on arrival.
    if (takesBothHands(item)) {
      if (free('main') && free('off')) {
        claim('main'); claim('off');
        plan.equip.push({ item, slot: 'main' });
      } else {
        plan.crowdedOut.push(item);
      }
      continue;
    }
    const target = slots.find(free);
    if (target) { claim(target); plan.equip.push({ item, slot: target }); }
    else plan.crowdedOut.push(item);
  }
  return plan;
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
  lens: 'Lens',
};

/** Slots that hold armor pieces (used to aggregate AC + resistances). */
export const ARMOR_SLOTS: readonly EquipSlot[] = ['head', 'chest', 'hands', 'legs', 'feet', 'cloak'];

/** Map an equip slot to its corresponding `*Id` key on PlayerEquipped.
 *  When set, the id key identifies the exact inventory instance bound
 *  to that slot (important when the player holds two of the same item). */
export const SLOT_ID_KEY: Record<EquipSlot, 'mainId' | 'offId' | 'headId' | 'chestId' | 'handsId' | 'legsId' | 'feetId' | 'cloakId' | 'amuletId' | 'ringId' | 'lensId'> = {
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
  lens: 'lensId',
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
  const inventory = player.inventory ?? [];
  const idKey = SLOT_ID_KEY[slot];
  const wantedId = eq[idKey];
  if (wantedId) {
    const byId = inventory.find((i) => i.id === wantedId && i.quantity > 0);
    if (byId) return byId;
  }
  // Legacy save (no id stored) — first-by-name. Same behaviour as before
  // the refactor, so saves without ids still equip correctly.
  return inventory.find(
    (i) => i.name.toLowerCase() === name.toLowerCase() && i.quantity > 0,
  ) ?? null;
}

/** OTA-687 — the exact inventory instance ids the player currently has equipped.
 *  Built on resolveEquippedItem per slot, so it honors the id-bound instance AND
 *  the legacy first-by-name fallback, plus the extra ring2/ring3 instance slots.
 *  Lets the vendor sell list exclude ONLY worn gear (by instance) without hiding
 *  spare copies of the same name — before, one equipped "Stone-Grip Gloves" hid
 *  every copy you owned from the shop. */
export function equippedInstanceIds(player: PlayerCharacter): Set<string> {
  const ids = new Set<string>();
  const eq = player.equipped;
  if (!eq) return ids;
  for (const slot of Object.keys(SLOT_ID_KEY) as EquipSlot[]) {
    const it = resolveEquippedItem(player, slot);
    if (it) ids.add(it.id);
  }
  // ring2 / ring3 are id-only extra ring slots (no name field / SLOT_ID_KEY entry).
  for (const idKey of ['ring2Id', 'ring3Id'] as const) {
    const id = eq[idKey];
    if (id) ids.add(id);
  }
  return ids;
}

/** OTA-1094 — everything the player has WORN right now, the dog's vest included.
 *  equippedInstanceIds only knows the player's own slots; the vest lives on
 *  `player.dog.equipped` and so never counted, which is why "float what I'm
 *  wearing to the top" quietly skipped the dog. Every gear list that floats worn
 *  pieces (repair, coating pickers, inventory, the Crucible upgrade list) resolves
 *  through THIS, so they cannot drift apart again. Falls back to name-matching the
 *  vest for saves written before vestId existed. */
export function wornInstanceIds(player: PlayerCharacter): Set<string> {
  const ids = equippedInstanceIds(player);
  const vestId = player.dog?.equipped?.vestId ?? null;
  if (vestId) {
    ids.add(vestId);
    return ids;
  }
  const vestName = player.dog?.equipped?.vest ?? null;
  if (vestName) {
    const owner = player.inventory.find(
      (i) => i.name.toLowerCase() === vestName.toLowerCase() && i.quantity > 0,
    );
    if (owner) ids.add(owner.id);
  }
  return ids;
}

/** OTA-1094 — the comparator every gear list uses to float worn pieces. A stable
 *  PRE-key: worn before unworn, ties handed back to the caller's own sort axis.
 *  Owner: "whenever a list of armor or weapons pops up sort equipped items to the
 *  top." */
export function byWornFirst(
  worn: ReadonlySet<string>,
): (a: { id: string }, b: { id: string }) => number {
  return (a, b) => Number(worn.has(b.id)) - Number(worn.has(a.id));
}

// Stat names the equipment system can boost. Includes 'constitution' for
// future use (some accessories grant it) — it routes to HP/stamina math.
type StatKey = keyof Stats;
// OTA-348 — 'stealth' added so equipped stealth bonuses (Salvager's Trench Coat
// + ~16 other authored pieces) actually apply through aggregateEquippedStatBonuses.
const STAT_KEYS: StatKey[] = ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma', 'stealth'];

// engine_Dev — STAT GLOSSARY. Tartaria's built-in catalog authored ~100 stat bonuses with names the
// engine doesn't track (constitution / acrobatics / investigation / aetheria / perception …), which
// were silently dropped. This maps those synonyms to the real engine stat (or the hp pool) so the
// bonuses finally count. Lowercased keys; aligned to the closest real stat.
const STAT_ALIAS: Record<string, string> = {
  str: 'strength', power: 'strength', might: 'strength', brawn: 'strength',
  dex: 'dexterity', agility: 'dexterity', acrobatics: 'dexterity', reflexes: 'dexterity', finesse: 'dexterity', sleight: 'dexterity',
  int: 'intelligence', logic: 'intelligence', investigation: 'intelligence', knowledge: 'intelligence', arcana: 'intelligence', aetheria: 'intelligence', aether: 'intelligence',
  wis: 'wisdom', perception: 'wisdom', awareness: 'wisdom', insight: 'wisdom', intuition: 'wisdom', willpower: 'wisdom',
  cha: 'charisma', presence: 'charisma', persuasion: 'charisma', charm: 'charisma',
  ste: 'stealth', sneak: 'stealth', sneaking: 'stealth',
  constitution: 'hp', con: 'hp', vitality: 'hp', endurance: 'hp', toughness: 'hp', health: 'hp', fortitude: 'hp',
};
/** Canonicalize a stat name: lowercase + map a known synonym to the engine stat / hp pool key. */
export function canonicalStatKey(raw: string | null | undefined): string {
  const lc = (raw ?? '').toLowerCase();
  return STAT_ALIAS[lc] ?? lc;
}

// Shared resolver list — the effect system can be backed by any
// catalog row that carries an `effect` field. As of OTA 192 that's
// exploration / gear / material rows in addition to the existing
// armor / amulet / ring rows. Order doesn't matter (no item appears
// in more than one catalog by name).
const EFFECT_RESOLVERS: EffectResolver[] = [
  (n) => findExplorationItemByName(n),
  // arb-fix — worn gear that carries a functional `effect` (e.g. the Aether
  // masks' `gate: breathe_toxic`) now lives in armor.json after the
  // exploration-tool → armor reclassification, so armor must flow through the
  // gate/passive resolver chain too. (Armor stat bonuses still apply only when
  // EQUIPPED, via aggregateEquippedStatBonuses + statBonus; the reclassified
  // armor rows carry no `effect.passive`, so this doesn't double-apply.)
  (n) => findArmorByName(n),
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
/** OTA-927 — the aether-sight passive (`detect_aether`) is equip-gated now: true only
 *  while an aether-sight gadget is worn in the dedicated `lens` slot. Mirrors the
 *  scanner-in-off-hand pattern; used by the search bonuses + the HUD 'scanning' badge. */
export function aethericVisionEquipped(player: PlayerCharacter): boolean {
  const worn = resolveEquippedItem(player, 'lens');
  if (!worn) return false;
  const exp = findExplorationItemByName(worn.name);
  if (exp?.effect?.kind === 'gate' && exp.effect.unlocks === 'detect_aether') return true;
  return false;
}

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
    const key = canonicalStatKey(stat) as StatKey; // map synonyms (acrobatics→dexterity…); hp falls out here and routes to the pool
    if (!STAT_KEYS.includes(key)) return;
    bonus[key] = (bonus[key] ?? 0) + amount;
  };
  for (const slot of ARMOR_SLOTS) {
    const name = eq[slot];
    if (!name) continue;
    // Per-instance rolled perks (stampDurability) take precedence over the
    // catalog so two copies of the same piece grant different bonuses. They
    // carry attribute stats only (never hp — that stays catalog/hpMax-baked).
    const inst = resolveEquippedItem(player, slot);
    if (inst?.instanceStats?.statBonuses) {
      for (const b of inst.instanceStats.statBonuses) add(b.stat, b.amount);
      continue;
    }
    const piece = findArmorByName(name);
    if (!piece) continue;
    // arb-fix — apply EVERY stat bonus on a piece, not just the primary
    // `statBonus`. `add` filters to the base stats (STAT_KEYS — now incl.
    // stealth, OTA-348), so the `hp` entry (handled separately via hpMax) and
    // the remaining non-attribute flavor stats (constitution / acrobatics /
    // investigation / aetheria, which have no PlayerCharacter field) are
    // dropped here — but a multi-base-stat piece like "INT+2, CHA+1" grants BOTH.
    const bonuses = piece.statBonuses ?? (piece.statBonus ? [piece.statBonus] : []);
    for (const b of bonuses) add(b.stat, b.amount);
  }
  // OTA-349 — weapon slots (main/off) can carry stealth (finesse daggers,
  // quiet bows, balanced throwing knives). Same STAT_KEYS filter, so a weapon's
  // `hp` bonus (baked into hpMax via weaponHpBonus) is dropped here — only
  // base-stat bonuses like stealth apply, with no double-count.
  for (const slot of ['main', 'off'] as const) {
    const name = eq[slot];
    if (!name) continue;
    const inst = resolveEquippedItem(player, slot);
    // OTA-386 — an etheric coating painted on this weapon grants a passive stat
    // bonus (+1 stealth / charisma / …) while it's wielded, on top of whatever
    // the weapon itself grants. Applies independent of the catalog/instance perks.
    if (inst?.coating?.statBonus) add(inst.coating.statBonus.stat, inst.coating.statBonus.amount);
    // OTA-873 — a dual-coat weapon's SECOND coating grants its passive stat bonus too.
    if (inst?.coating2?.statBonus) add(inst.coating2.statBonus.stat, inst.coating2.statBonus.amount);
    if (inst?.instanceStats?.statBonuses) {
      for (const b of inst.instanceStats.statBonuses) add(b.stat, b.amount);
      continue;
    }
    const wpn = findWeaponByName(name);
    if (!wpn) continue;
    for (const b of wpn.statBonuses ?? []) add(b.stat, b.amount);
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
  // OTA-349 — equipped FUSED items carry their stat bonus on the inventory
  // item's uniqueStats (their unique names aren't in the catalog, so the
  // findArmor/Weapon lookups above miss them). Apply those here so a fused
  // stealth piece counts. Fused names never collide with catalog names, so
  // no double-count.
  const equippedNames = new Set(Object.values(eq).filter(Boolean) as string[]);
  for (const item of player.inventory ?? []) {
    if (!equippedNames.has(item.name)) continue;
    const sb = item.uniqueStats?.statBonus;
    if (sb) add(sb.stat, sb.amount);
  }
  return bonus;
}

// OTA-376 — per-action regen caps. Sum across worn armor, then clamp so a
// fully-stacked regen build stays "noticeable, not OP": in combat each
// basic action costs ~1 stamina, so a capped +2 stamina/action sustains
// light fighting without making exhaustion impossible (heavier / multiple
// actions still drain). HP regen is deliberately tighter — a slow trickle,
// not a tank's fountain.
export const STAMINA_REGEN_CAP = 3;
export const HP_REGEN_CAP = 2;

/** OTA-376 — sum the passive per-action regen from every equipped ARMOR
 *  piece (head / chest / legs / feet / hands / cloak), clamped to the caps.
 *  Returns whole-number amounts to add to the player's stamina / HP on each
 *  action. Weapons / amulets / rings don't carry regen. */
export function aggregateEquippedRegen(player: PlayerCharacter): { stamina: number; hp: number } {
  const eq = player.equipped ?? {};
  let stamina = 0;
  let hp = 0;
  for (const slot of ARMOR_SLOTS) {
    const name = eq[slot];
    if (!name) continue;
    const piece = findArmorByName(name);
    if (!piece) continue;
    stamina += Math.max(0, piece.staminaRegen ?? 0);
    hp += Math.max(0, piece.hpRegen ?? 0);
  }
  return {
    stamina: Math.min(STAMINA_REGEN_CAP, stamina),
    hp: Math.min(HP_REGEN_CAP, hp),
  };
}

// arb-fix — total max-HP bonus from a single equipped armor piece, read from
// its `statBonuses` array (the `hp` entry, which is a SECONDARY bonus so it's
// not picked up by aggregateEquippedStatBonuses' primary-only `statBonus`).
// Returns 0 for non-armor names / pieces with no hp bonus. The gameStore
// equip/unequip handlers bake this delta into `player.hpMax` (Option B: hpMax
// is read in 100+ sites, so adjusting it on equip is simpler + drift-free vs an
// effective-max computed everywhere).
// OTA-924 — LIGHT AC TAIL-TRIM. Raw standing AC climbs untouched up to `knee`; every
// point past it counts at `rate`, so a fully-fused Legendary set stays strong (a raw ~37
// lands ~28) without buying literal immunity — a d20+atk vs AC 37 could only ever land on
// a natural 20. Every equipped piece still adds AC; only the runaway tail bends. Shared by
// the combat resolver (applyEnemyCounter) and the StatsPanel so the shown AC = the fought AC.
export function trimStandingAc(rawAc: number, knee = 22, rate = 0.4): number {
  if (rawAc <= knee) return rawAc;
  return Math.round(knee + (rawAc - knee) * rate);
}

/** ⚠ OTA-1133 — THE ONE ANSWER TO "WHAT IS MY AC", AND WHY IT HAD TO EXIST.
 *
 *  The owner reported this three times as a DROP — *"AC 16 → AC 10, recurring"* —
 *  and it was never a drop. It was two surfaces disagreeing, permanently.
 *
 *  ⚠ `player.ac` IS THE RACIAL BASE, NOT THE EFFECTIVE AC. There is exactly one
 *  write to it in the whole codebase — `ac: race.baseAC` at character creation
 *  (character.ts) — and nothing updates it when armour is equipped, ever. Five
 *  consumers knew that and added the gear stack themselves; TWO printed the raw
 *  field as though it were the finished number:
 *
 *    · the LLM prompt          `AC ${player.ac}`  → the model was told AC 10
 *    · the Arbiter status line                    → and SAID "AC 10" out loud
 *
 *  So the character sheet showed 16 (base 10 + six points of worn armour) while
 *  the Arbiter, asked the same question a moment later, answered 10. The device
 *  log has the player in eight pieces of gear with `AC 10` in the same breath.
 *
 *  ⚠ AND THE FIVE "CORRECT" CONSUMERS DID NOT AGREE WITH EACH OTHER EITHER —
 *  each re-derived the sum inline, which is how a field like this drifts in the
 *  first place. This is now the single place that answers the question, so a
 *  sixth surface cannot invent a seventh number.
 *
 *  ⚠ SCOPE — deliberately the STANDING number: racial base + worn armour,
 *  trimmed. It is what the sheet shows and what the player means when they ask.
 *  Combat's `applyEnemyCounter` legitimately adds more (scene-conditional racial
 *  context, the ruins-defence title, live status effects) because those exist
 *  only inside a fight; `effectiveACBreakdown` remains the authority there, and
 *  it starts from this same base. */
export function standingAc(player: PlayerCharacter | null | undefined): number {
  if (!player) return 10;
  const gear = equippedGearAc(player);
  return trimStandingAc((player.ac ?? 10) + gear.worn + gear.accessories);
}

/** ⚠ OTA-1135 — THE GEAR STACK, ONCE, WITH THE JEWELLERY IN IT.
 *
 *  OTA-1133 said "one function, one answer, everywhere" and then shipped a
 *  function that answered a DIFFERENT question from the one combat asks. The
 *  owner found it in one screen: *"my base AC is 10, on the character card's
 *  small form it says 15 (armor), when I click on it to expand it it says 18."*
 *
 *  ⚠ THE THREE MISSING POINTS ARE JEWELLERY. `aggregateArmor` — which is what
 *  the enemy-attack resolver and the sheet's DEFENCE card both stand on — has
 *  summed an equipped amulet and up to three rings since OTA-730. `standingAc`
 *  walked ARMOR_SLOTS only. So a player wearing a +1 amulet and two +1 rings
 *  reads 15 on the panel, 18 on the sheet, and is defended at 18. The panel was
 *  not showing a smaller number for a reason; it simply could not see the rings.
 *
 *  ⚠ AND A SECOND, QUIETER DRIFT IN THE SAME GAP. `resolveDisplayArmorByName`
 *  finds a piece FIRST-BY-NAME and returns the CATALOG acBonus, while combat
 *  resolves the exact worn instance by id and prefers its rolled
 *  `instanceStats.acBonus`. Two copies of the same piece are supposed to differ
 *  — that is what stampDurability's roll is for — so the panel could read the
 *  other copy's number even before the rings were considered.
 *
 *  ⚠ THIS IS THE IMPLEMENTATION, AND `aggregateArmor` CALLS IT. Making the
 *  panel add rings on its own would have produced a third inline copy of the
 *  same arithmetic — the exact failure OTA-1133 was written to end. The store
 *  keeps its resistance walk (it needs the per-slot tagging combat weights) but
 *  no longer owns an AC sum of its own.
 *
 *  Returns the two halves separately so the DEFENCE card can name them: a
 *  player who reads "armor +5 · accessories +3" can see where every point comes
 *  from, which is the whole reason this took three reports to find. */
export function equippedGearAc(
  player: PlayerCharacter | null | undefined,
): { worn: number; accessories: number } {
  if (!player) return { worn: 0, accessories: 0 };
  const eq = player.equipped ?? {};
  let worn = 0;
  for (const slot of ARMOR_SLOTS) {
    const name = eq[slot];
    if (!name) continue;
    // ⚠ THE PRECEDENCE IS COPIED FROM `aggregateArmor`, DELIBERATELY UNCHANGED.
    // This function's job is to end a disagreement, not to start one: the number
    // combat resolves against must come out bit-identical, so the fused lookup
    // stays by name+slot (OTA-195) rather than being "improved" to an id lookup
    // here. A rolled instance then overrides the catalog row (stampDurability),
    // and a name in no catalog contributes nothing.
    const fused = (player.inventory ?? []).find((it) =>
      it.uniqueStats
      && it.uniqueStats.kind === 'armor'
      && it.uniqueStats.armorSlot === slot
      && it.name.toLowerCase() === name.toLowerCase(),
    );
    if (fused?.uniqueStats) { worn += fused.uniqueStats.acBonus ?? 0; continue; }
    // `findArmorByName`, NOT `resolveDisplayArmorByName` — the latter will happily
    // resolve a fused piece whose armorSlot does not match this slot, and combat
    // never counted that. Bit-identical or it is not a fix.
    const piece = findArmorByName(name);
    if (!piece) continue;
    worn += resolveEquippedItem(player, slot)?.instanceStats?.acBonus ?? piece.acBonus;
  }
  // OTA-730 — defensive accessories: one amulet plus up to three rings, each
  // able to carry a flat acBonus. A natural 20 always hits, so this can never
  // buy immunity.
  let accessories = 0;
  if (eq.amulet) accessories += findAmuletByName(eq.amulet)?.acBonus ?? 0;
  for (const ringName of [eq.ring, eq.ring2, eq.ring3]) {
    if (!ringName) continue;
    accessories += findRingByName(ringName)?.acBonus ?? 0;
  }
  return { worn, accessories };
}

export function armorHpBonus(name: string | null | undefined): number {
  if (!name) return 0;
  const piece = findArmorByName(name);
  if (!piece) return 0;
  const bonuses = piece.statBonuses ?? (piece.statBonus ? [piece.statBonus] : []);
  return bonuses
    .filter((b) => canonicalStatKey(b.stat) === 'hp')
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);
}

// arb-fix — total max-HP bonus from a single equipped WEAPON, read from its
// `statBonuses` array (populated from the "Grants +X HP" rebalance text). Some
// shields/maces/etc. grant HP just like a chestpiece; the main/off equip slots
// route through the same handler, so this lets a wielded weapon raise hpMax too.
export function weaponHpBonus(name: string | null | undefined): number {
  if (!name) return 0;
  const wpn = findWeaponByName(name);
  if (!wpn) return 0;
  const bonuses = wpn.statBonuses ?? [];
  return bonuses
    .filter((b) => canonicalStatKey(b.stat) === 'hp')
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);
}

// arb-fix — unified max-HP bonus for ANYTHING equippable (armor OR weapon).
// The gameStore equip/unequip handlers call this once per slot, so a piece is
// resolved against whichever catalog owns it. A name is only ever in one
// catalog, so the sum is just "whichever matched".
export function gearHpBonus(name: string | null | undefined): number {
  return armorHpBonus(name) + weaponHpBonus(name);
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
  // OTA-831 — a `chilled` status (from a cold-typed hit) slows the hands: −2 DEX while
  // it lasts. Folds into the food-buff bucket so it flows through the ≥1 floor below.
  // Cleared by a warming coating drink (coatingDrinkRemedy) or by expiry.
  if ((player.statusEffects ?? []).some((e) => e.kind === 'chilled')) {
    food.dexterity = (food.dexterity ?? 0) - 2;
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
  // OTA-835 — Unknowing Masses "Curious Mind": a persistent +2 INT / +2 WIS that
  // AWAKENS the first time the character is exposed to Tartaria's secrets (a relic
  // or a ruin sets player.curiousMindAwakened). Flat-static racialStatBonusesFor
  // can't express a flag-gated bonus, so it folds in here.
  const curious = player.raceId === 'unknowing_mass' && player.curiousMindAwakened
    ? { intelligence: 2, wisdom: 2 }
    : {};
  // OTA 039 — corruption tier penalty. Tainted=-1 CHA, Corrupted=-1
  // all, Hollowed=-2 all. Subtracts at every skill-check site so the
  // aether under your skin actually costs you something.
  const tier = corruptionTierOf(player.corruption ?? 0);
  const corrPen = corruptionStatPenalty(tier);
  // OTA-910 — Skyreacher (all five great climbs crested) grants a passive +DEX.
  // Read via the title-perk aggregate so it flows through every effectiveStats
  // call site (combat, dodge, climb, checks). Lazy require avoids a static
  // import cycle and is module-cached.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const titlePerks = require('./titles').titlePerkModifiers(player);
  const titleDex = titlePerks.dexterityBonus ?? 0;
  // ⚠ OTA-1189 — the Siren story's +CHA rides the same aggregate, for the same reason:
  // one injection point means diplomacy checks and the CHA vendor discount both honour it.
  const titleCha = titlePerks.charismaBonus ?? 0;
  // engine_Dev — floor every effective stat at 1 so stacked debuffs (weather + corruption + damage-
  // type onHit) can't drive a roll stat to 0 or negative.
  return {
    strength: Math.max(1, player.stats.strength + (bonus.strength ?? 0) + (inv.strength ?? 0) + (food.strength ?? 0) + (w.strength ?? 0) + (racial.strength ?? 0) + (corrPen.strength ?? 0)),
    dexterity: Math.max(1, player.stats.dexterity + (bonus.dexterity ?? 0) + (inv.dexterity ?? 0) + (food.dexterity ?? 0) + (w.dexterity ?? 0) + (racial.dexterity ?? 0) + (corrPen.dexterity ?? 0) + titleDex),
    intelligence: Math.max(1, player.stats.intelligence + (bonus.intelligence ?? 0) + (inv.intelligence ?? 0) + (food.intelligence ?? 0) + (w.intelligence ?? 0) + (racial.intelligence ?? 0) + (curious.intelligence ?? 0) + (corrPen.intelligence ?? 0)),
    wisdom: Math.max(1, player.stats.wisdom + (bonus.wisdom ?? 0) + (inv.wisdom ?? 0) + (food.wisdom ?? 0) + (w.wisdom ?? 0) + (racial.wisdom ?? 0) + (curious.wisdom ?? 0) + (corrPen.wisdom ?? 0)),
    charisma: Math.max(1, player.stats.charisma + (bonus.charisma ?? 0) + (inv.charisma ?? 0) + (food.charisma ?? 0) + (w.charisma ?? 0) + (racial.charisma ?? 0) + (corrPen.charisma ?? 0) + titleCha),
    // OTA-348 — stealth. `?? 0` guards a pre-backfill in-memory player. Floored at 0, not 1: unlike the
    // five core attributes (which always have a positive base, so the ≥1 clamp only ever catches debuff
    // overshoot), an untrained character legitimately has 0 stealth — clamping it to 1 would fabricate a
    // phantom point. 0 still blocks debuffs from driving it negative.
    stealth: Math.max(0, (player.stats.stealth ?? 0) + (bonus.stealth ?? 0) + (inv.stealth ?? 0) + (food.stealth ?? 0) + (w.stealth ?? 0) + (racial.stealth ?? 0) + (corrPen.stealth ?? 0)),
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
  // OTA-835 — Curious Mind persistent +2 INT/+2 WIS (see effectiveStats).
  const curious: Partial<Stats> = player.raceId === 'unknowing_mass' && player.curiousMindAwakened
    ? { intelligence: 2, wisdom: 2 }
    : {};
  const tier = corruptionTierOf(player.corruption ?? 0);
  const corrPen = corruptionStatPenalty(tier);
  const w = weatherMod ?? {};

  const build = (stat: keyof Stats): StatBreakdown => {
    const base = player.stats[stat] ?? 0; // OTA-348 — guard pre-backfill stealth
    const sources: StatSource[] = [];
    if ((racial[stat] ?? 0) !== 0) sources.push({ label: 'race', delta: racial[stat]! });
    if ((curious[stat] ?? 0) !== 0) sources.push({ label: 'Curious Mind', delta: curious[stat]! });
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
    stealth: build('stealth'), // OTA-348
  };
}
