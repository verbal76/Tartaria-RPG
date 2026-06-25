import vendorsData from '../data/npcs/vendors.json';
import roadsideData from '../data/npcs/roadside_traders.json';
import weaponsData from '../data/items/weapons.json';
import armorData from '../data/items/armor.json';
import ringsData from '../data/items/rings.json';
import materialsData from '../data/items/materials.json';
import gearData from '../data/items/gear.json';
import dogGearData from '../data/items/dogGear.json';
import { pickWeighted } from './rng';
import { resolveTable } from './contentPack';
import type { Enemy } from './types';
import type { StallCategory } from './buildings';

export interface VendorOffer {
  itemName: string;
  price: number;
  /** arb92 — how many of this item the trader has in stock. Food stocks
   *  up to 5, materials up to 10, everything else 1. The buy flow lets the
   *  player purchase 1..quantity at once and decrements it; the offer drops
   *  off the menu when it hits 0. Older offers without this field read as 1. */
  quantity?: number;
}

// arb92 — food / material stocking. Traders carry multiples of perishables
// and crafting stock so the player can buy a handful at once; weapons /
// armor / relics stay one-of. Caps per the player's spec: ≤5 food, ≤10
// material.
// engine_Dev — these read through resolveTable() at CALL time (not import time),
// so an uploaded gear/material/weapon/armor override actually reaches vendor
// stocking instead of the built-in Tartaria catalog. Built-in arrays below are
// the defaults handed to resolveTable.
const BUILTIN_GEAR = ((gearData as unknown as { gear?: { name: string; tags?: string[] }[] }).gear ?? []);
const BUILTIN_MATERIALS = ((materialsData as unknown as { materials?: { name: string }[] }).materials ?? []);
function foodNames(): Set<string> {
  return new Set(
    resolveTable('gear', BUILTIN_GEAR)
      .filter((g) => (g.tags ?? []).includes('food'))
      .map((g) => g.name.toLowerCase()),
  );
}
function materialNames(): Set<string> {
  return new Set(resolveTable('materials', BUILTIN_MATERIALS).map((m) => m.name.toLowerCase()));
}
export function rollOfferQuantity(itemName: string): number {
  const n = itemName.toLowerCase();
  if (foodNames().has(n)) return 1 + Math.floor(Math.random() * 5); // 1-5
  if (materialNames().has(n)) return 1 + Math.floor(Math.random() * 10); // 1-10
  return 1;
}

// arb104 — faction-issue armor + weapons (tagged `faction_gear` + faction)
// stocked by the outpost Armory for the player's own faction.
interface FactionGearRow { name: string; faction?: string; tc?: number; rarity?: string; tags?: string[] }
const BUILTIN_WEAPONS = ((weaponsData as unknown as { weapons?: FactionGearRow[] }).weapons ?? []);
const BUILTIN_ARMOR = ((armorData as unknown as { armor?: FactionGearRow[] }).armor ?? []);
// Rings aren't an overridable table; keep the built-in list.
const BUILTIN_RINGS = ((ringsData as unknown as { rings?: FactionGearRow[] }).rings ?? []);
function factionGear(): FactionGearRow[] {
  return [
    ...resolveTable('weapons', BUILTIN_WEAPONS),
    ...resolveTable('armor', BUILTIN_ARMOR),
    // OTA-497 — faction-issue RINGS (perk-only, one per faction) stock alongside.
    ...resolveTable('rings', BUILTIN_RINGS),
  ].filter((it) => (it.tags ?? []).includes('faction_gear'));
}
export function factionGearOffers(factionId: string): VendorOffer[] {
  return factionGear()
    .filter((it) => it.faction === factionId)
    .map((it) => ({ itemName: it.name, price: Math.max(2, Math.round(it.tc ?? 50)), quantity: 1 }));
}

// OTA 030 — roadside trader archetype shape. JSON-authored in
// data/npcs/roadside_traders.json. demeanor drives the steal DC
// (sketchy = easier to lift from, but bigger fight on a miss).
interface RoadsidePoolEntry {
  itemName: string;
  priceMin: number;
  priceMax: number;
  weight: number;
}
interface RoadsideArchetype {
  id: string;
  name: string;
  title: string;
  demeanor: 'honest' | 'sketchy';
  description: string;
  pool: RoadsidePoolEntry[];
}
const ROADSIDE = (roadsideData as { archetypes: RoadsideArchetype[] });

/** The live roadside-trader archetypes: author override → installed GENERIC default →
 *  built-in pool. Malformed rows (missing name/pool) are dropped so a bad upload can't
 *  crash the spawner. */
export function getActiveRoadside(): RoadsideArchetype[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cp = require('./contentPack') as typeof import('./contentPack');
  const clean = (list: unknown): RoadsideArchetype[] => (Array.isArray(list) ? list : []).filter(
    (a): a is RoadsideArchetype =>
      !!a && typeof a === 'object' &&
      typeof (a as RoadsideArchetype).name === 'string' &&
      Array.isArray((a as RoadsideArchetype).pool) && (a as RoadsideArchetype).pool.length > 0,
  );
  const ov = clean(cp.getRoadsideOverride());
  if (ov.length > 0) return cp.isVendorsAppendGeneric() ? [...ov, ...buildGenericRoadside()] : ov;
  // No author override: a custom/generic game uses the DATA-DRIVEN roadside pool (sampled from the
  // loaded catalog, like the named vendors); stock Tartaria keeps its authored archetypes.
  if (cp.getGenericRoadside() != null) {
    const g = buildGenericRoadside();
    return g.length > 0 ? g : ROADSIDE.archetypes;
  }
  return ROADSIDE.archetypes;
}

export interface VendorTemplate {
  id: string;
  name: string;
  title: string;
  faction: string | null;
  description: string;
  offers: VendorOffer[];
  /** Per-NPC Kokoro voice id. Authored per vendor in vendors.json
   *  so each speaker sounds distinct on the bundled engine. The
   *  vendor's voice slot in the Kokoro pool is lazy-loaded by
   *  beginScene when the vendor enters the scene and disposed when
   *  the player walks away. */
  voiceId?: string;
  /** 'male' / 'female' — used as a hint for the system-TTS fallback
   *  and (eventually) for any gender-flavoured narration. */
  gender?: 'male' | 'female';
}

// A live vendor in the current scene. Carries a mutable offer list so
// items sold to the player disappear from the menu for the rest of the
// session at that scene.
export interface VendorInstance {
  id: string;
  name: string;
  title: string;
  faction: string | null;
  description: string;
  offers: VendorOffer[];
  voiceId?: string;
  gender?: 'male' | 'female';
  /** OTA 030 — roadside traders only. Drives steal DC and
   *  hostility-flip stats. Undefined on hub vendors → hub default
   *  applies (DC 16 + armored guard). */
  demeanor?: 'honest' | 'sketchy';
  /** OTA 23-009 — stacking steal-streak counter. Each steal
   *  attempt (success OR caught) bumps this by 1 for the rest of
   *  the vendor's session. Each point adds +2 to the next steal
   *  DC, so back-to-back theft gets steadily harder against the
   *  same vendor. Resets implicitly when the vendor is cleared
   *  (scene transition, hostility flip, roadside despawn). */
  stealAttempts?: number;
}

export const VENDORS = (vendorsData as { vendors: VendorTemplate[] }).vendors;

// ── Data-driven generic storefront (engine_Dev) ─────────────────────
// Five SETTING-NEUTRAL vendors whose wares are SAMPLED from the LOADED catalogs
// (resolveTable weapons/armor/gear/materials) at spawn time — so they only ever
// sell items that exist in THIS game. No hardcoded item names, no dangling refs
// (the failure mode the old hardcoded GENERIC_VENDORS had). They restock — i.e.
// re-sample — each time the pool is built, so the same vendor offers vary per
// encounter. faction:null → they can roll on any tile during travel.
interface CatRow { name: string; rarity?: string; tags?: string[]; tc?: number; tcBuy?: number; kind?: string }
const RARITY_PRICE: Record<string, number> = { common: 12, uncommon: 35, rare: 80, epic: 160, legendary: 300 };
function priceFor(it: CatRow): number {
  const tc = typeof it.tcBuy === 'number' ? it.tcBuy : typeof it.tc === 'number' ? it.tc : null;
  if (tc != null) return Math.max(2, Math.round(tc));
  return RARITY_PRICE[(it.rarity ?? 'common').toLowerCase()] ?? 15;
}
function sampleRows(rows: CatRow[], n: number): CatRow[] {
  const pool = rows.filter((r) => r && typeof r.name === 'string' && r.name.trim());
  if (pool.length <= n) return pool.slice();
  const picked: CatRow[] = []; const used = new Set<number>(); let safety = 0;
  while (picked.length < n && used.size < pool.length && safety++ < 200) {
    const i = Math.floor(Math.random() * pool.length);
    if (used.has(i)) continue; used.add(i); picked.push(pool[i]!);
  }
  return picked;
}
function offersFrom(rows: CatRow[], n: number): VendorOffer[] {
  return sampleRows(rows, n).map((it) => ({ itemName: it.name, price: priceFor(it), quantity: rollOfferQuantity(it.name) }));
}
/** Five generic vendors built from the effective item catalogs. Empty tables are
 *  skipped, so a game with (say) no materials simply has no Supplier. */
export function buildGenericStorefront(): VendorTemplate[] {
  const weapons = resolveTable('weapons', BUILTIN_WEAPONS) as CatRow[];
  const armor = resolveTable('armor', BUILTIN_ARMOR) as CatRow[];
  const gear = resolveTable('gear', BUILTIN_GEAR) as CatRow[];
  const materials = resolveTable('materials', BUILTIN_MATERIALS) as CatRow[];
  const consumables = gear.filter((g) => g.kind === 'consumable' || (g.tags ?? []).some((t) => ['food', 'medical', 'heal', 'drink', 'consumable'].includes(t)));
  const supplies = consumables.length ? consumables : gear;
  const v: VendorTemplate[] = [];
  if (weapons.length) v.push({ id: 'gen_weapons_dealer', name: 'Weapons Dealer', title: 'Arms Dealer', faction: null, description: 'Deals in weapons of every make. Buys blades, sells worse ones for more.', offers: offersFrom(weapons, 6) });
  if (armor.length) v.push({ id: 'gen_blacksmith', name: 'Blacksmith', title: 'Armorer', faction: null, description: 'Plates, vests, and whatever will keep you breathing a little longer.', offers: offersFrom(armor, 6) });
  if (supplies.length) v.push({ id: 'gen_quartermaster', name: 'Quartermaster', title: 'Quartermaster', faction: null, description: 'Field supplies — rations, kits, and the small things that save a life.', offers: offersFrom(supplies, 6) });
  if (materials.length) v.push({ id: 'gen_supplier', name: 'Supplier', title: 'Materials Supplier', faction: null, description: 'Raw stock and crafting components by the crate.', offers: offersFrom(materials, 8) });
  const mixed = [...offersFrom(weapons, 2), ...offersFrom(armor, 2), ...offersFrom(supplies, 2), ...offersFrom(materials, 2)];
  if (mixed.length) v.push({ id: 'gen_trader', name: 'General Trader', title: 'Travelling Trader', faction: null, description: 'Carries a bit of everything and an opinion on all of it.', offers: mixed });
  return v;
}

/** Two data-driven roadside archetypes (honest + sketchy) whose pools are sampled from the loaded
 *  catalog at spawn, so they only ever stock items that exist. demeanor drives the steal DC. */
export function buildGenericRoadside(): RoadsideArchetype[] {
  const weapons = resolveTable('weapons', BUILTIN_WEAPONS) as CatRow[];
  const armor = resolveTable('armor', BUILTIN_ARMOR) as CatRow[];
  const gear = resolveTable('gear', BUILTIN_GEAR) as CatRow[];
  const materials = resolveTable('materials', BUILTIN_MATERIALS) as CatRow[];
  const consumables = gear.filter((g) => g.kind === 'consumable' || (g.tags ?? []).some((t) => ['food', 'medical', 'heal', 'drink', 'consumable'].includes(t)));
  const supplies = consumables.length ? consumables : gear;
  const entry = (it: CatRow, weight: number): RoadsidePoolEntry => {
    const p = priceFor(it);
    return { itemName: it.name, priceMin: Math.max(1, Math.round(p * 0.8)), priceMax: Math.max(2, Math.round(p * 1.25)), weight };
  };
  const pool = (rows: CatRow[], n: number, w: number) => sampleRows(rows, n).map((it) => entry(it, w));
  const arch: RoadsideArchetype[] = [];
  const honest = [...pool(supplies, 4, 12), ...pool(materials, 3, 10), ...pool(weapons, 2, 5)];
  if (honest.length) arch.push({ id: 'gen_roadside_vendor', name: 'Roadside Vendor', title: 'wandering trader', demeanor: 'honest', description: 'A stall thrown together from cart-boards and tarp. Watches the road with one eye and the goods with the other.', pool: honest });
  const sketchy = [...pool(materials, 3, 8), ...pool(weapons, 2, 6), ...pool(armor, 2, 5)];
  if (sketchy.length) arch.push({ id: 'gen_fence', name: 'Black-Market Fence', title: 'fence', demeanor: 'sketchy', description: 'No stall, just a coat full of pockets and a quick way out. Prices are good; provenance is not.', pool: sketchy });
  return arch;
}

function cleanVendorList(list: unknown): VendorTemplate[] {
  return (Array.isArray(list) ? list : []).filter(
    (v): v is VendorTemplate =>
      !!v && typeof v === 'object' &&
      typeof (v as VendorTemplate).name === 'string' &&
      Array.isArray((v as VendorTemplate).offers),
  );
}

/** The live vendor pool. FEATURES toggle off → no vendors at all. Otherwise:
 *  author override REPLACES the generic storefront (default) or is APPENDED to it
 *  (vendorsAppendGeneric); with no author vendors a custom/generic game uses the
 *  data-driven storefront, while the built-in Tartaria game keeps its authored pool. */
export function getActiveVendors(): VendorTemplate[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cp = require('./contentPack') as typeof import('./contentPack');
  if (!cp.isVendorsEnabled()) return []; // vendors switched off
  const ov = cleanVendorList(cp.getVendorsOverride());
  if (ov.length > 0) {
    return cp.isVendorsAppendGeneric() ? [...ov, ...buildGenericStorefront()] : ov;
  }
  // No author vendors: generic pack installed (a custom game) → data-driven storefront;
  // otherwise (stock Tartaria) → the built-in authored pool.
  if (cp.getGenericVendors() != null) {
    const generic = buildGenericStorefront();
    return generic.length > 0 ? generic : VENDORS;
  }
  return VENDORS;
}

// Random vendor pick. Used when a peaceful scene rolls a vendor encounter.
// Returns a fresh VendorInstance (mutable offers, decoupled from template).
export function pickRandomVendor(): VendorInstance {
  const active = getActiveVendors();
  const pool = active.length > 0 ? active : VENDORS; // vendors-off pools are empty; never index undefined
  const v = pool[Math.floor(Math.random() * pool.length)]!;
  return {
    id: v.id,
    name: v.name,
    title: v.title,
    faction: v.faction,
    description: v.description,
    // arb92 — authored vendors.json offers carry no quantity; roll one for
    // food / material entries (keeps weapons / armor / relics one-of) unless
    // the template already specified a quantity.
    offers: v.offers.map((o) => ({ ...o, quantity: o.quantity ?? rollOfferQuantity(o.itemName) })),
    voiceId: v.voiceId,
    gender: v.gender,
  };
}

// OTA 030 — procedural roadside trader. Picks an archetype, samples
// 3-6 items from its weighted pool, mints a fresh VendorInstance with
// per-spawn randomized prices and no faction. Used by beginScene for
// outdoor (non-hub) peaceful scenes so the player has somewhere cheap
// to spend small TC drops.
export function pickRoadsideTrader(): VendorInstance {
  const pool = getActiveRoadside();
  const arch = pool[Math.floor(Math.random() * pool.length)]!;
  const n = 3 + Math.floor(Math.random() * 4); // 3-6 offers
  const picked = new Set<string>();
  const offers: VendorOffer[] = [];
  let safety = 0;
  while (offers.length < n && picked.size < arch.pool.length && safety++ < 50) {
    const item = pickWeighted(arch.pool, (p) => p.weight);
    if (picked.has(item.itemName)) continue;
    picked.add(item.itemName);
    const price = item.priceMin + Math.floor(Math.random() * (item.priceMax - item.priceMin + 1));
    offers.push({ itemName: item.itemName, price, quantity: rollOfferQuantity(item.itemName) });
  }
  return {
    id: `roadside_${arch.demeanor}_${Date.now()}`,
    name: arch.name,
    title: arch.title,
    faction: null,
    description: arch.description,
    offers,
    demeanor: arch.demeanor,
  };
}

// arb26 — market stall vendors. Each stall (weapons / armor / food /
// materials) mints a FRESH trader with a random mix of items from the
// matching catalog every time the player steps up to it, so the stock
// changes each visit. Prices come from the item's own tc / tcBuy when it
// has one, else a rarity-based default with a little spread.
interface StallCatalogItem {
  name: string; rarity?: string; tc?: number; tcBuy?: number; tags?: string[];
  // Armor value inputs (present on armor.json rows) — used to ground the price
  // of a piece that carries no authored tc in its actual worth.
  acBonus?: number;
  statBonus?: { stat: string; amount: number };
  statBonuses?: { stat: string; amount: number }[];
  baseDurability?: number;
  resistances?: string[];
}

function stallCatalog(category: StallCategory): StallCatalogItem[] {
  // arb119 — keep gear that ISN'T meant for the open market off a random
  // stall's shelf. `golem_weapon` rows are construct-only (authored `tc:0`)
  // and `faction_gear` is sold ONLY at the player's own faction armory.
  // Both slipped into the generic weapon/armor stall pool, and because they
  // carry `tc:0` the price math floored them at 2 TC — a 2-TC Rare 2d8 Golem
  // Sledge. Filtering them here is the real fix; the `||` price fallback
  // below is belt-and-suspenders for any other tc:0 row.
  const stallable = (it: StallCatalogItem) => {
    const tags = (it.tags ?? []);
    return !tags.includes('golem_weapon') && !tags.includes('faction_gear');
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  switch (category) {
    case 'weapons': return (((weaponsData as any).weapons ?? []) as StallCatalogItem[]).filter(stallable);
    case 'armor': return (((armorData as any).armor ?? []) as StallCatalogItem[]).filter(stallable);
    case 'materials': return ((materialsData as any).materials ?? []) as StallCatalogItem[];
    case 'food':
      return (((gearData as any).gear ?? []) as StallCatalogItem[]).filter(
        (g) => (g.tags ?? []).includes('food'),
      );
    default: return [];
  }
}

// OTA-603 — dog vests (kind 'dog_armor') as vendor stock. The four vests in
// dogGear.json were never sourced (no recipe / vendor / loot). Armory + armor
// stalls now occasionally carry one so a dog owner can actually buy armor for
// the hound. The Reclaimer Pattern Vest is FACTION-gated (drop-only per its
// catalog note "Only drops from Reclaimer-aligned encounters"), so it's
// excluded from the open-market pool here.
interface DogVestRow { name: string; rarity?: string; acBonus?: number; baseDurability?: number; faction?: string; tags?: string[] }
const BUYABLE_DOG_VESTS: DogVestRow[] = (
  ((dogGearData as unknown as { dogGear?: DogVestRow[] }).dogGear ?? [])
).filter((v) => !v.faction);
function dogVestRarityWeight(rarity?: string): number {
  switch ((rarity ?? 'Common').toLowerCase()) {
    case 'common': return 6;
    case 'uncommon': return 3;
    case 'rare': return 1;
    default: return 0.5;
  }
}

function rarityPrice(rarity?: string): number {
  const r = (rarity ?? 'Common').toLowerCase();
  if (r === 'legendary') return 140 + Math.floor(Math.random() * 160); // 140-299
  if (r === 'rare') return 50 + Math.floor(Math.random() * 60);        // 50-109
  if (r === 'uncommon') return 18 + Math.floor(Math.random() * 28);    // 18-45
  return 6 + Math.floor(Math.random() * 20);                           // 6-25
}

// Estimate a stall price for an item that carries no authored tc/tcBuy. Grounds
// the price in the item's actual worth so two pieces of the same rarity differ:
// armor folds in AC, stat bonuses, durability and resistances on top of the
// rarity base. Without this, every tc-less Common piece collapsed onto the
// narrow rarity floor (~5 TC) and the shelf looked flat.
function estimatedStallValue(it: StallCatalogItem, category: StallCategory): number {
  const base = rarityPrice(it.rarity);
  if (category === 'armor') {
    const bonuses = it.statBonuses ?? (it.statBonus ? [it.statBonus] : []);
    const bonusTotal = bonuses.reduce((s, b) => s + (b.amount ?? 0), 0);
    return base
      + (it.acBonus ?? 0) * 9
      + bonusTotal * 6
      + Math.floor((it.baseDurability ?? 0) / 3)
      + (it.resistances?.length ?? 0) * 8;
  }
  return base;
}

export function buildStallVendor(category: StallCategory, stallName: string): VendorInstance {
  const items = stallCatalog(category);
  const n = Math.min(items.length, 3 + Math.floor(Math.random() * 4)); // 3-6
  const shuffled = [...items].sort(() => Math.random() - 0.5).slice(0, n);
  const offers: VendorOffer[] = shuffled.map((it) => {
    // arb119 — `||` not `??`: an authored `tc:0` means "not for open sale",
    // not "free". `0 ?? x` keeps the 0 and the price floors at 2 TC; `0 || x`
    // falls through to the value estimate so nothing prices at the 2-TC floor.
    const base = it.tc || it.tcBuy || estimatedStallValue(it, category);
    // Wider per-offer haggling spread (±~22%) on top of the value-based base so
    // even two of the same item vary a little visit to visit.
    const price = Math.max(2, Math.round(base * (0.8 + Math.random() * 0.45)));
    return { itemName: it.name, price, quantity: rollOfferQuantity(it.name) };
  });
  // OTA-603 — armor stalls sometimes carry a dog vest (rarity-weighted, so a
  // Burlap Vest is common and an Aetheric Padded Vest is rare). Priced off its
  // AC + durability like any armor piece. One per stall, no dupes.
  if (category === 'armor' && BUYABLE_DOG_VESTS.length > 0 && Math.random() < 0.5) {
    const vest = pickWeighted(BUYABLE_DOG_VESTS, (v) => dogVestRarityWeight(v.rarity));
    if (!offers.some((o) => o.itemName === vest.name)) {
      const vbase = estimatedStallValue(vest as StallCatalogItem, 'armor');
      const vprice = Math.max(2, Math.round(vbase * (0.8 + Math.random() * 0.45)));
      offers.push({ itemName: vest.name, price: vprice, quantity: 1 });
    }
  }
  return {
    id: `stall_${category}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: `${stallName} Trader`,
    title: `${category} stall`,
    faction: null,
    description: `A trader minding the ${stallName.toLowerCase()} stall, wares laid out for haggling.`,
    offers,
    demeanor: 'honest',
  };
}

// OTA 030 — turn a vendor into an Enemy when a steal attempt is
// caught. Stats scale by tier:
//   sketchy (DC 11) → 18 HP, 1d8+1, quick + ambush_strike
//   honest  (DC 14) → 12 HP, 1d6
//   hub     (DC 16, no demeanor) → 24 HP, 1d10, armored
// Loot inherits 1-2 entries from the vendor's current offers so
// beating them yields their merchandise.
export function buildTraderEnemy(vendor: VendorInstance): Enemy {
  const tier = vendor.demeanor ?? 'hub';
  const baseLoot = vendor.offers.slice(0, 2).map((o) => o.itemName);
  const loot = baseLoot.length > 0 ? baseLoot : ['Aether Residue'];
  if (tier === 'sketchy') {
    return {
      name: vendor.name,
      type: 'Human',
      abilityPoint: 'Dexterity 3',
      attack: 'Hidden Blade',
      damage: '1D8+1',
      hp: 18,
      rarity: 'Uncommon',
      loot,
      traits: ['quick', 'ambush_strike'],
    };
  }
  if (tier === 'honest') {
    return {
      name: vendor.name,
      type: 'Human',
      abilityPoint: 'Strength 2',
      attack: 'Cudgel Swing',
      damage: '1D6',
      hp: 12,
      rarity: 'Common',
      loot,
    };
  }
  // Hub vendor — established merchant with help nearby.
  return {
    name: vendor.name,
    type: 'Human',
    abilityPoint: 'Strength 3',
    attack: 'Guard Strike',
    damage: '1D10',
    hp: 24,
    rarity: 'Uncommon',
    loot,
    traits: ['armored'],
  };
}

// Look up a vendor by display name. Used by the hub system to spawn
// the anchored NPC for a given hub room (Halem the Trader at the gate,
// Irma Ironhand at the armory, etc.). Returns a fresh VendorInstance
// or null if no template matches.
export function findVendorByName(name: string): VendorInstance | null {
  const lowered = name.toLowerCase();
  const v = getActiveVendors().find((vt) => vt.name.toLowerCase() === lowered);
  if (!v) return null;
  return {
    id: v.id,
    name: v.name,
    title: v.title,
    faction: v.faction,
    description: v.description,
    // arb92 — authored vendors.json offers carry no quantity; roll one for
    // food / material entries (keeps weapons / armor / relics one-of) unless
    // the template already specified a quantity.
    offers: v.offers.map((o) => ({ ...o, quantity: o.quantity ?? rollOfferQuantity(o.itemName) })),
    voiceId: v.voiceId,
    gender: v.gender,
  };
}
