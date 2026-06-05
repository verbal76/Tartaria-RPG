import vendorsData from '../data/npcs/vendors.json';
import roadsideData from '../data/npcs/roadside_traders.json';
import weaponsData from '../data/items/weapons.json';
import armorData from '../data/items/armor.json';
import materialsData from '../data/items/materials.json';
import gearData from '../data/items/gear.json';
import { pickWeighted } from './rng';
import type { Enemy } from './types';
import type { StallCategory } from './buildings';

export interface VendorOffer {
  itemName: string;
  price: number;
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
    offers: v.offers.map((o) => ({ ...o })),
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
    offers.push({ itemName: item.itemName, price });
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
interface StallCatalogItem { name: string; rarity?: string; tc?: number; tcBuy?: number; tags?: string[] }

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
  if (r === 'legendary') return 120 + Math.floor(Math.random() * 130);
  if (r === 'rare') return 40 + Math.floor(Math.random() * 40);
  if (r === 'uncommon') return 15 + Math.floor(Math.random() * 16);
  return 5 + Math.floor(Math.random() * 8);
}

export function buildStallVendor(category: StallCategory, stallName: string): VendorInstance {
  const items = stallCatalog(category);
  const n = Math.min(items.length, 3 + Math.floor(Math.random() * 4)); // 3-6
  const shuffled = [...items].sort(() => Math.random() - 0.5).slice(0, n);
  const offers: VendorOffer[] = shuffled.map((it) => {
    const base = it.tc ?? it.tcBuy ?? rarityPrice(it.rarity);
    const price = Math.max(2, Math.round(base * (0.85 + Math.random() * 0.3)));
    return { itemName: it.name, price };
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
    offers: v.offers.map((o) => ({ ...o })),
    voiceId: v.voiceId,
    gender: v.gender,
  };
}
