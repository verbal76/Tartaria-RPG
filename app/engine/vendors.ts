import vendorsData from '../data/npcs/vendors.json';
import roadsideData from '../data/npcs/roadside_traders.json';
import weaponsData from '../data/items/weapons.json';
import armorData from '../data/items/armor.json';
import ringsData from '../data/items/rings.json';
import materialsData from '../data/items/materials.json';
import gearData from '../data/items/gear.json';
import dogGearData from '../data/items/dogGear.json';
import recipesData from '../data/items/recipes.json';
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
// OTA-1034 — SCARCE materials. Owner asked for "limited amounts of Aether Mud
// to named vendors for sale". Mud is a MATERIAL, and materials otherwise roll
// 1-10 per visit — enough to walk away with five golems' worth from one
// counter. These roll a deliberately tight band instead: a real supply you can
// plan around, never a stockpile. Keyed by lowercased item name; anything not
// listed keeps its normal roll. Stock re-rolls per vendor INSTANCE — each time
// you arrive — so the shelf refills between visits without ever being deep.
const SCARCE_STOCK: Readonly<Record<string, readonly [number, number]>> = {
  'aether mud': [2, 5],
};

export function rollOfferQuantity(itemName: string): number {
  const n = itemName.toLowerCase();
  const scarce = SCARCE_STOCK[n];
  if (scarce) {
    const [lo, hi] = scarce;
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }
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
  /** OTA-1055 — the CAST that works this archetype's stall. See
   *  pickRoadsideTrader. Optional so a pack that omits it still loads (the
   *  archetype name is then used, which is the pre-OTA-1055 behaviour). */
  people?: string[];
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
  /** arb-fix — the vendor's OWN faction, when it differs from `faction`. For an
   *  outpost anchor re-skinned into another faction's outpost, `faction` is the
   *  HOST (drives prices, buy-rep, and the peace-break penalty) while
   *  `nativeFaction` is who the vendor actually is (drives the "you harmed our
   *  member" penalty on theft/kill). Unset when the vendor belongs to their host. */
  nativeFaction?: string | null;
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
/** ⚠⚠ OTA-1722 — how many recent roadside names the picker steers around. Ten
 *  against a 24-name pool (twelve per archetype) leaves at least fourteen
 *  choices, so this can narrow the draw without ever starving it. */
export const ROADSIDE_NAME_MEMORY = 10;

export function pickRoadsideTrader(recentNames?: readonly string[]): VendorInstance {
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
  // OTA-729 — the fence/roadside trader sometimes carries a premium ware too.
  const roadsidePremium = maybePremiumOffer(offers);
  if (roadsidePremium) offers.push(roadsidePremium);
  // OTA-1055 — A PERSON, NOT A STALL TYPE.
  //
  // There are exactly two archetypes, and their `name` fields are furniture:
  // "Road Hawker" and "Sketchy Stall". OTA-1053 fixed a real leak — the runtime
  // id carried Date.now(), so the ledger split one trader into an unbounded run
  // of one-encounter strangers — but keyed the replacement off that name, which
  // over-corrected into the opposite error: every honest roadside trader on the
  // map collapsed into ONE ledger person called Road Hawker. From the second
  // roadside stall a save ever saw, arrival narration was skipped as a familiar
  // face, tcTraded pooled across strangers, and one caught theft made every
  // roadside trader in the world charge the wronged markup.
  //
  // Neither id was ever an identity, because the data had no people in it. So
  // the fix is content rather than keying: twelve named traders per archetype.
  // The archetype still supplies demeanor, stock and description; the person
  // supplies the name the ledger — and the player — remembers.
  // ⚠⚠⚠ OTA-1722 — AND NOT ONE YOU JUST MET. OTA-1055 gave these archetypes
  // twelve people each so a roadside trader would be a person rather than a
  // stall type. It worked, and it exposed the next thing: twelve is small enough
  // that the same name lands on the very next tile regularly, and from the
  // player's chair a trader with the same name one step later is a trader who
  // followed them. Measured before the fix, on a 118-tile serpentine walk: 16
  // sightings, three repeated names, one of them on consecutively-visited tiles.
  //
  // ⚠ FAILS OPEN, ALWAYS. If every name in this archetype is in the recent ring
  // the filter is dropped rather than the trader — a stall that does not appear
  // because the game ran out of names is a worse bug than a repeated name.
  const pool = arch.people?.length ? arch.people : [arch.name];
  const recent = new Set(recentNames ?? []);
  const fresh = pool.filter((n) => !recent.has(n));
  const choices = fresh.length > 0 ? fresh : pool;
  const person = choices[Math.floor(Math.random() * choices.length)]!;
  return {
    id: `roadside_${arch.demeanor}_${Date.now()}`,
    name: person,
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

// OTA-729 — PREMIUM STOCK. Traders sometimes carry one genuinely worth-saving-for
// ware so money has a purpose: strong healing, throwables, and Uncommon/Rare
// weapons/armor. Derived from THIS game's own catalogs (never hardcoded names),
// so it stays lore-clean per game; priced at full value (a real sink), and
// construct/faction/for-sale-0 rows are excluded.
interface PremiumEntry { name: string; price: number; weight: number }
function buildPremiumPool(): PremiumEntry[] {
  const pool: PremiumEntry[] = [];
  const seen = new Set<string>();
  const add = (name: string, base: number, weight: number) => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    pool.push({ name, price: Math.max(20, Math.round(base * 1.1)), weight });
  };
  // Strong healing + throwables (gear/consumables).
  for (const g of (((gearData as any).gear ?? []) as any[])) {
    const heal = typeof g.effect?.healHP === 'number' ? g.effect.healHP : 0;
    const isThrow = ((g.tags ?? []) as string[]).includes('throwable');
    if (heal >= 20 || isThrow) {
      add(g.name, g.tc || g.tcBuy || rarityPrice(g.rarity), heal >= 40 ? 5 : 3);
    }
  }
  // Uncommon (common-premium) / Rare (aspirational) weapons + armor — skip the
  // construct-only + faction-only + not-for-open-sale rows.
  const grade = (it: any): number | null => {
    const tags = (it.tags ?? []) as string[];
    if (tags.includes('golem_weapon') || tags.includes('faction_gear')) return null;
    const r = (it.rarity ?? '').toLowerCase();
    if (r === 'uncommon') return 4;
    if (r === 'rare') return 2;
    return null;
  };
  for (const w of (((weaponsData as any).weapons ?? []) as any[])) {
    const wt = grade(w);
    if (wt) add(w.name, w.tc || w.tcBuy || rarityPrice(w.rarity), wt);
  }
  for (const a of (((armorData as any).armor ?? []) as any[])) {
    const wt = grade(a);
    if (wt) add(a.name, a.tc || a.tcBuy || rarityPrice(a.rarity), wt);
  }
  return pool;
}
const PREMIUM_POOL: PremiumEntry[] = buildPremiumPool();

/** ~45% of the time, one premium ware to add to a trader's stock — a thing worth
 *  banking TC toward. Null when the pool is empty or the roll misses. */
export function maybePremiumOffer(existing: VendorOffer[]): VendorOffer | null {
  if (PREMIUM_POOL.length === 0 || Math.random() >= 0.45) return null;
  const pick = pickWeighted(PREMIUM_POOL, (p) => p.weight);
  if (existing.some((o) => o.itemName.toLowerCase() === pick.name.toLowerCase())) return null;
  return { itemName: pick.name, price: pick.price, quantity: 1 };
}

// ── OTA-774 — The Hidden Market as a Jita-style fight-restock hub ─────────
// The 4-stall market now exists ONLY at the hidden_market location (the random
// wild-tile spawn was removed in buildings.ts). buildStallVendor therefore
// builds the Hidden Market's stalls, and is tuned to be a RELIABLE pre-mission
// restock: bulk-buyable low-tier consumables/materials, a scarce premium gear
// piece to fill a weak slot, and — guaranteed every visit — the healing wares
// and the crafting materials that feed healing + coating recipes.

/** Existing lore-named vendors reused to staff the four stalls (they also
 *  appear at their home hubs). Neutral-ish traders for a neutral bazaar. */
// OTA-784 — the market's faction reps ROTATE daily in REAL time. Each stall
// draws from a roster of lore vendors (different factions), re-picked at local
// midnight — the device here runs on America/New_York, so that's ET midnight.
// The stall id stays stable (hidden_market_<category>) so broker contracts +
// sigil turn-in keep working; only the name/title/faction rotate.
interface StallRep { name: string; title: string; faction: string | null }
// OTA-834 — every stall `faction` must be a CANONICAL faction id from
// factions.json, or its rapport/CHA-discount silently no-ops (vendorPriceMod +
// applyRepChange only recognize real factions). Pre-fix four reps carried RACE ids
// (unknowing_masses / aetherborn / mud_golems / architectural_sentinels), so on
// those rotation days the stall could never earn rep or grant the discount. Remapped
// each to the faction that actually owns that theme: unknowing_masses →
// conspiracy_architects (they "keep the Unknowing Masses ignorant"), aetherborn →
// eternal_dynasty (the "Aetherborn Cabal"), mud_golems → mud_monarchs (mud),
// architectural_sentinels → stone_builders (Sacred Architecture). true_tartarians IS
// canonical and was left as-is.
const STALL_ROSTER: Record<StallCategory, StallRep[]> = {
  weapons: [
    { name: 'Zorin Nightblade', title: 'Exotic Weapons Dealer', faction: 'conspiracy_architects' },
    { name: 'Drakos the Mercenary', title: 'Two-Handed Weapons Dealer', faction: 'true_tartarians' },
    { name: 'Cassia Nightwind', title: 'Ranged Weapons Specialist', faction: 'eternal_dynasty' },
    { name: 'Korr Stonefoot', title: 'Heavy Weapons Dealer', faction: 'mud_monarchs' },
    { name: 'Odar Flameforge', title: 'Fire-Weaponsmith', faction: 'stone_builders' },
    { name: 'Nalren Frostgrip', title: 'Frost-Gear Specialist', faction: 'reclaimers_guild' },
  ],
  armor: [
    { name: 'Vela Ironheart', title: 'Melee Armorer', faction: 'true_tartarians' },
    { name: 'Irma Ironhand', title: 'Heavy Armorer', faction: 'true_tartarians' },
    { name: 'Korash of the Deep', title: 'True Tartarian Quartermaster', faction: 'true_tartarians' },
    { name: 'Mara Stoneskin', title: 'Earth-Gear Vendor', faction: 'mud_monarchs' },
  ],
  food: [
    { name: 'Halem the Trader', title: 'General Goods', faction: null },
    { name: 'Naha', title: 'Wandering Drifter', faction: null },
    { name: 'Thalan the Wanderer', title: 'Provisioner', faction: null },
    { name: 'Bran the Beastmaster', title: 'Wilderness Outfitter', faction: 'reclaimers_guild' },
    { name: 'Sister Yune Ashfall', title: 'Revival Quartermaster', faction: 'tartarian_revivalists' },
    { name: 'Vael of the Listening Stone', title: 'Devout Quartermaster', faction: 'servants_of_giants' },
  ],
  materials: [
    { name: 'Tellin Mak', title: 'Scrap Broker', faction: 'reclaimers_guild' },
    { name: 'Tarek the Tinkerer', title: 'Mechanical Outfitter', faction: 'reclaimers_guild' },
    { name: 'Silvan the Quiet', title: 'Relic Dealer', faction: 'eternal_dynasty' },
    { name: 'Foreman Drest Holloway', title: 'Master Mason', faction: 'stone_builders' },
    { name: 'Magister Caul Veyre', title: 'Dynastic Factor', faction: 'eternal_dynasty' },
    { name: 'The Cartographer', title: 'Keeper of Quiet Plans', faction: 'conspiracy_architects' },
  ],
};
// A per-category prime so the four stalls don't rotate in lockstep.
const STALL_ROTATION_OFFSET: Record<StallCategory, number> = { weapons: 0, armor: 3, food: 7, materials: 11 };

/** Real-world local calendar day (YYYYMMDD) — the rotation seed. Rolls over at
 *  local midnight; the target device runs on America/New_York, i.e. ET. */
function marketRotationDay(now: Date = new Date()): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

/** Today's rep for a stall — stable within a real day, rotates at local midnight. */
function resolveStallIdentity(category: StallCategory): { id: string; name: string; title: string; faction: string | null; description: string } {
  const roster = STALL_ROSTER[category];
  const idx = ((marketRotationDay() + STALL_ROTATION_OFFSET[category]) % roster.length + roster.length) % roster.length;
  const rep = roster[idx]!;
  return {
    id: `hidden_market_${category}`,
    name: rep.name,
    title: rep.title,
    faction: rep.faction,
    description: `Today ${rep.name} works the ${category} stall of the Hidden Market — a neutral-ground broker. The faces here change with the day; the truce does not.`,
  };
}

// Rarity-tiered stock depth. Stackable stalls (materials, food/consumables) are
// bulk-buyable at the low end (grab 10 eggs / 10 commons); rare/legendary wares
// stay scarce. Instance stalls (weapons, armor) are always 1 per line.
function stallStockQuantity(rarity: string | undefined, category: StallCategory): number {
  // Weapons/armor are per-instance gear — never bulk-stack a shelf line.
  const stackable = category === 'materials' || category === 'food';
  if (!stackable) return 1;
  const r = (rarity ?? 'Common').toLowerCase();
  if (r === 'legendary') return 1;
  if (r === 'rare') return 1 + Math.floor(Math.random() * 2);   // 1-2
  if (r === 'uncommon') return 3 + Math.floor(Math.random() * 4); // 3-6
  return 6 + Math.floor(Math.random() * 7);                      // 6-12
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_GEAR = (((gearData as any).gear ?? []) as any[]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_MATERIAL_NAMES = new Set((((materialsData as any).materials ?? []) as any[]).map((m) => String(m.name).toLowerCase()));

const isHealingItem = (g: { effect?: { healHP?: number; cureBleed?: boolean; curePoison?: boolean; reduceCorruption?: number } }): boolean => {
  const fx = g.effect;
  return !!fx && ((fx.healHP ?? 0) >= 1 || !!fx.cureBleed || !!fx.curePoison || (fx.reduceCorruption ?? 0) >= 1);
};
const isCoatingItem = (g: { effect?: { coating?: unknown; kind?: string } }): boolean =>
  !!g.effect && (!!g.effect.coating || g.effect.kind === 'coating');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_RECIPES = (Array.isArray(recipesData) ? recipesData : (recipesData as any).recipes ?? []) as any[];
const RECIPE_RESULTS = new Set(ALL_RECIPES.map((r) => String(r.result ?? '').toLowerCase()));

// Every healing consumable (for deriving recipe-ingredient staples) …
const HEALING_CONSUMABLES: string[] = ALL_GEAR.filter(isHealingItem).map((g) => String(g.name));
// … but the provisions stall only GUARANTEES the CRAFTED medical items — the
// kits, tonics, stews you deliberately restock (First Aid Kit, Trauma Kit,
// Antivenom, …). Raw foraged foods still flow through the random draw in bulk.
const HEALING_STAPLES: string[] = HEALING_CONSUMABLES.filter((n) => RECIPE_RESULTS.has(n.toLowerCase()));
// Coating products (Static Paste, Incendiary Paste, …) — guaranteed at the
// provisions stall too, so you can buy the counter-element outright.
const COATING_PRODUCTS: string[] = ALL_GEAR.filter(isCoatingItem).map((g) => String(g.name));

// Materials that feed healing OR coating recipes — the materials stall
// guarantees these in bulk. Data-driven from recipes so it stays correct as
// recipes change (no hardcoded material list).
const FIGHT_STAPLE_MATERIALS: string[] = (() => {
  const products = new Set([...HEALING_CONSUMABLES, ...COATING_PRODUCTS].map((n) => n.toLowerCase()));
  const mats = new Set<string>();
  for (const rec of ALL_RECIPES) {
    if (!products.has(String(rec.result ?? '').toLowerCase())) continue;
    for (const ing of (rec.ingredients ?? [])) {
      if (ALL_MATERIAL_NAMES.has(String(ing.name).toLowerCase())) mats.add(String(ing.name));
    }
  }
  return [...mats];
})();

/** Price an item name by looking it up in its catalog (tc/tcBuy first, else a
 *  rarity/value estimate) and applying the stall haggle spread. */
function stallPriceFor(name: string, category: StallCategory): { price: number; rarity?: string } {
  const lc = name.toLowerCase();
  const pools: { list: StallCatalogItem[]; cat: StallCategory }[] = [
    { list: stallCatalog('materials'), cat: 'materials' },
    { list: stallCatalog('food'), cat: 'food' },
    { list: (((gearData as unknown) as { gear: StallCatalogItem[] }).gear ?? []), cat: 'food' },
  ];
  for (const { list, cat } of pools) {
    const it = list.find((x) => x.name.toLowerCase() === lc);
    if (it) {
      const base = it.tc || it.tcBuy || estimatedStallValue(it, cat);
      return { price: Math.max(2, Math.round(base * (0.8 + Math.random() * 0.45))), rarity: it.rarity };
    }
  }
  const base = estimatedStallValue({ name } as StallCatalogItem, category);
  return { price: Math.max(2, Math.round(base * (0.8 + Math.random() * 0.45))) };
}

export function buildStallVendor(category: StallCategory, stallName: string): VendorInstance {
  const items = stallCatalog(category);
  // Deeper shelf (6-10 random wares) on top of the guaranteed staples below.
  const n = Math.min(items.length, 6 + Math.floor(Math.random() * 5));
  const shuffled = [...items].sort(() => Math.random() - 0.5).slice(0, n);
  const offers: VendorOffer[] = shuffled.map((it) => {
    // arb119 — `||` not `??`: an authored `tc:0` means "not for open sale".
    const base = it.tc || it.tcBuy || estimatedStallValue(it, category);
    const price = Math.max(2, Math.round(base * (0.8 + Math.random() * 0.45)));
    return { itemName: it.name, price, quantity: stallStockQuantity(it.rarity, category) };
  });
  const addStaple = (name: string) => {
    if (offers.some((o) => o.itemName.toLowerCase() === name.toLowerCase())) return;
    const { price, rarity } = stallPriceFor(name, category);
    offers.push({ itemName: name, price, quantity: stallStockQuantity(rarity, category) });
  };
  // GUARANTEED fight-restock staples — the whole point of a Jita-style hub.
  if (category === 'materials') {
    for (const m of FIGHT_STAPLE_MATERIALS) addStaple(m);
  } else if (category === 'food') {
    for (const h of HEALING_STAPLES) addStaple(h);
    for (const c of COATING_PRODUCTS) addStaple(c);
  }
  // OTA-603 — armor stalls also carry a rarity-weighted dog vest.
  if (category === 'armor' && BUYABLE_DOG_VESTS.length > 0 && Math.random() < 0.5) {
    const vest = pickWeighted(BUYABLE_DOG_VESTS, (v) => dogVestRarityWeight(v.rarity));
    if (!offers.some((o) => o.itemName === vest.name)) {
      const vbase = estimatedStallValue(vest as StallCatalogItem, 'armor');
      const vprice = Math.max(2, Math.round(vbase * (0.8 + Math.random() * 0.45)));
      offers.push({ itemName: vest.name, price: vprice, quantity: 1 });
    }
  }
  // Gear stalls: a hub should reliably let you fill a weak slot. Always offer a
  // premium (Uncommon/Rare) piece; ~25% of the time a scarce Legendary too.
  if (category === 'weapons' || category === 'armor') {
    const p1 = maybePremiumOfferForced(offers);
    if (p1) offers.push(p1);
    if (Math.random() < 0.25) {
      const leg = pickLegendaryGear(category, offers);
      if (leg) offers.push(leg);
    }
  } else {
    const stallPremium = maybePremiumOffer(offers);
    if (stallPremium) offers.push(stallPremium);
  }
  const who = resolveStallIdentity(category);
  return {
    id: who.id,
    name: who.name,
    title: who.title,
    faction: who.faction,
    description: who.description,
    offers,
    demeanor: 'honest',
  };
}

/** Like maybePremiumOffer but ALWAYS returns a premium ware (no 45% gate) so a
 *  gear stall reliably has one worth-saving-for piece. */
function maybePremiumOfferForced(existing: VendorOffer[]): VendorOffer | null {
  if (PREMIUM_POOL.length === 0) return null;
  for (let tries = 0; tries < 4; tries++) {
    const pick = pickWeighted(PREMIUM_POOL, (p) => p.weight);
    if (!existing.some((o) => o.itemName.toLowerCase() === pick.name.toLowerCase())) {
      return { itemName: pick.name, price: pick.price, quantity: 1 };
    }
  }
  return null;
}

/** A single Legendary weapon/armor piece for the hub's "fill your weak slot"
 *  fantasy. Excludes construct/faction rows; priced at full value (a real sink). */
function pickLegendaryGear(category: 'weapons' | 'armor', existing: VendorOffer[]): VendorOffer | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src = (category === 'weapons' ? (weaponsData as any).weapons : (armorData as any).armor) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legs = (src as any[]).filter((it) => {
    const tags = (it.tags ?? []) as string[];
    return String(it.rarity).toLowerCase() === 'legendary'
      && !tags.includes('golem_weapon') && !tags.includes('faction_gear')
      && !tags.includes('collect_only') // OTA-910 — Skyreacher set is climb-only, never for sale
      && (category !== 'weapons' || tags.includes('weapon')); // real weapons only
  });
  if (legs.length === 0) return null;
  const pick = legs[Math.floor(Math.random() * legs.length)];
  if (existing.some((o) => o.itemName.toLowerCase() === String(pick.name).toLowerCase())) return null;
  const base = pick.tc || pick.tcBuy || estimatedStallValue(pick as StallCatalogItem, category);
  return { itemName: String(pick.name), price: Math.max(20, Math.round(base * (0.9 + Math.random() * 0.35))), quantity: 1 };
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
  // arb-fix — carry the vendor's faction onto the enemy so KILLING a merchant
  // actually shifts faction standing (the kill→standing path is gated on
  // enemy.factionId, which trader enemies never set — so murdering a faction
  // vendor was consequence-free). Roadside traders with no faction stay
  // undefined → no standing change, same as before.
  const factionId = vendor.faction ?? undefined;
  // arb-fix — carry the vendor's OWN faction too (when a hosted guest differs from
  // the host), so killing them also angers their own faction, not just the host
  // whose peace was broken.
  const nativeFactionId = vendor.nativeFaction && vendor.nativeFaction !== vendor.faction
    ? vendor.nativeFaction
    : undefined;
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
      factionId,
      nativeFactionId,
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
      factionId,
      nativeFactionId,
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
    factionId,
    nativeFactionId,
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
