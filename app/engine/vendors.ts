import vendorsData from '../data/npcs/vendors.json';
import roadsideData from '../data/npcs/roadside_traders.json';
import weaponsData from '../data/items/weapons.json';
import armorData from '../data/items/armor.json';
import ringsData from '../data/items/rings.json';
import materialsData from '../data/items/materials.json';
import gearData from '../data/items/gear.json';
import { pickWeighted } from './rng';
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
// material. Lookup sets are built once from the catalogs.
const FOOD_NAMES = new Set(
  (((gearData as unknown as { gear?: { name: string; tags?: string[] }[] }).gear ?? []))
    .filter((g) => (g.tags ?? []).includes('food'))
    .map((g) => g.name.toLowerCase()),
);
const MATERIAL_NAMES = new Set(
  (((materialsData as unknown as { materials?: { name: string }[] }).materials ?? []))
    .map((m) => m.name.toLowerCase()),
);
export function rollOfferQuantity(itemName: string): number {
  const n = itemName.toLowerCase();
  if (FOOD_NAMES.has(n)) return 1 + Math.floor(Math.random() * 5); // 1-5
  if (MATERIAL_NAMES.has(n)) return 1 + Math.floor(Math.random() * 10); // 1-10
  return 1;
}

// arb104 — faction-issue armor + weapons (tagged `faction_gear` + faction)
// stocked by the outpost Armory for the player's own faction.
interface FactionGearRow { name: string; faction?: string; tc?: number; rarity?: string; tags?: string[] }
const FACTION_GEAR: FactionGearRow[] = [
  ...(((weaponsData as unknown as { weapons?: FactionGearRow[] }).weapons ?? [])),
  ...(((armorData as unknown as { armor?: FactionGearRow[] }).armor ?? [])),
  // OTA-497 — faction-issue RINGS (perk-only, one per faction) now stock at the
  // player's own faction armory alongside its weapons + armor.
  ...(((ringsData as unknown as { rings?: FactionGearRow[] }).rings ?? [])),
].filter((it) => (it.tags ?? []).includes('faction_gear'));
export function factionGearOffers(factionId: string): VendorOffer[] {
  return FACTION_GEAR
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

// Random vendor pick. Used when a peaceful scene rolls a vendor encounter.
// Returns a fresh VendorInstance (mutable offers, decoupled from template).
export function pickRandomVendor(): VendorInstance {
  const v = VENDORS[Math.floor(Math.random() * VENDORS.length)]!;
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
  const arch = ROADSIDE.archetypes[Math.floor(Math.random() * ROADSIDE.archetypes.length)]!;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  switch (category) {
    case 'weapons': return ((weaponsData as any).weapons ?? []) as StallCatalogItem[];
    case 'armor': return ((armorData as any).armor ?? []) as StallCatalogItem[];
    case 'materials': return ((materialsData as any).materials ?? []) as StallCatalogItem[];
    case 'food':
      return (((gearData as any).gear ?? []) as StallCatalogItem[]).filter(
        (g) => (g.tags ?? []).includes('food'),
      );
    default: return [];
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
    const base = it.tc ?? it.tcBuy ?? estimatedStallValue(it, category);
    // Wider per-offer haggling spread (±~22%) on top of the value-based base so
    // even two of the same item vary a little visit to visit.
    const price = Math.max(2, Math.round(base * (0.8 + Math.random() * 0.45)));
    return { itemName: it.name, price, quantity: rollOfferQuantity(it.name) };
  });
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
  const v = VENDORS.find((vt) => vt.name.toLowerCase() === lowered);
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
