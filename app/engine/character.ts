/* eslint-disable @typescript-eslint/no-require-imports */
import type { Race, Faction, PlayerCharacter, Stats, FactionStanding, InventoryItem } from './types';
import { rollDie, rollDice, rollFromNotation } from './rng';
import { resolveTable, resolveFlavor, startingAreaForFaction, isReskinActive } from './contentPack';
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';
import explorationData from '../data/items/exploration.json';
import armorData from '../data/items/armor.json';
import weaponsData from '../data/items/weapons.json';
import amuletsData from '../data/items/amulets.json';
import ringsData from '../data/items/rings.json';
import materialsData from '../data/items/materials.json';
import gearData from '../data/items/gear.json';
import locationsData from '../data/locations/locations.json';
import { stampDurability } from './durability';
import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y, canonicalCellOf } from './worldMap';
import { initMainQuest } from './mainQuest';

// Race + faction starter weapon kits. Every character begins with:
//   1) A "primary" — a low-tier weapon they would plausibly carry given
//      where they're from. Damage is reasonable for combat.
//   2) A "knife" — a cheap-but-sharp tool. Useful for digging without
//      sacrificing the primary. Faction-themed.
//   3) Two race-themed exploration items pulled from the Tartaria Prima
//      rulebook's "Starter Items" table (catalogued in exploration.json).
//
// The kit reflects WHO the character is: a True Tartarian carries
// Mud-fist Wraps, a Bone Shiv, and a Cavern Sound Stones + Aether-Breath
// Mask; a Reclaimer carries a Rusted Blade, a Trowel, a Reclaimer's Rope
// + Echoing Steps Boots. Etc.

const RACE_PRIMARY: Record<string, string> = require('../data/character/starter-maps.json').racePrimary;

// engine_Dev — the starter weapon. Priority: a race's own `startingWeapon`
// field (authors can set it on the uploaded race row) → the built-in
// per-Tartaria-race map → the first Common weapon from the LIVE weapons table
// (so a custom race without a mapping starts with a real weapon from the
// uploaded pack, e.g. an M1 Garand, not the Tartaria "Rusted Blade").
function starterWeaponName(race: Race): string {
  const explicit = (race as unknown as { startingWeapon?: unknown }).startingWeapon;
  if (typeof explicit === 'string' && explicit.trim().length > 0) return explicit.trim();
  if (RACE_PRIMARY[race.id]) return RACE_PRIMARY[race.id]!;
  const builtin = ((weaponsData as unknown as { weapons?: { name?: string; rarity?: string }[] }).weapons ?? []);
  const live = resolveTable('weapons', builtin) as { name?: string; rarity?: string }[];
  const pick = live.find((w) => w && typeof w.name === 'string' && w.rarity === 'Common')
    ?? live.find((w) => w && typeof w.name === 'string');
  return pick?.name ?? 'Rusted Blade';
}

const FACTION_KNIFE: Record<string, string> = require('../data/character/starter-maps.json').factionKnife;

// Each race ships with TWO items from their rulebook starter table —
// kept tight so the default 10-slot Player's Backpack still has room for
// the shared starter items (Hand Torch + Trail Rations + Locket) plus
// the primary weapon + faction knife. Total = 7 slots used. Remaining
// items from the table live in exploration.json and can be acquired from
// vendors / loot pools.
export const RACE_STARTER_EXPLORATION: Record<string, string[]> = require('../data/character/starter-maps.json').raceStarterExploration;

interface CatalogExplorationItem {
  name: string;
  abilityReq: string;
  kind: string;
  rarity: string;
  faction: string;
  tcBuy: number;
  tags: string[];
  description: string;
}
const EXPLORATION_BY_NAME = new Map<string, CatalogExplorationItem>();
for (const item of explorationData as CatalogExplorationItem[]) {
  EXPLORATION_BY_NAME.set(item.name, item);
}
// arb-fix — some race-starter worn gear (boots / gloves / gauntlets / mask)
// was reclassified exploration-tool → ARMOR, so buildStarterInventory must
// also resolve a starter name against armor.json. Mirrors EXPLORATION_BY_NAME
// (built inline to avoid a crafting.ts import + circular-dep risk).
interface CatalogArmorStarter { name: string; rarity?: string; tags?: string[]; description?: string }
const ARMOR_BY_NAME = new Map<string, CatalogArmorStarter>();
for (const item of (armorData as { armor: CatalogArmorStarter[] }).armor) {
  ARMOR_BY_NAME.set(item.name, item);
}
// arb-fix — and a starter name may be a weapon (e.g. the mud_golem's
// Mud-Rend Blade) that only lives in weapons.json; the grant previously only
// looked in exploration.json, so that starter was silently dropped.
const WEAPONS_BY_NAME = new Map<string, CatalogArmorStarter>();
for (const item of (weaponsData as { weapons: CatalogArmorStarter[] }).weapons) {
  WEAPONS_BY_NAME.set(item.name, item);
}

/**
 * Maps the catalog's loose `kind: 'exploration'` to a PlayerCharacter
 * InventoryItem kind. Weapons stay weapons; Aetheric-flavored items
 * become 'relic' (so they sort with the player's other Aetheric relics
 * in the InventoryScreen); everything else is 'misc'.
 */
function explorationToInventoryKind(item: CatalogExplorationItem): InventoryItem['kind'] {
  if (item.tags.includes('weapon')) return 'weapon';
  if (item.tags.includes('relic')) return 'relic';
  // arb-fix — worn pieces that live in the exploration starter table (e.g.
  // Echoing Steps Boots) carry an `armor` tag so they're granted as ARMOR,
  // not a generic misc tool. Without this they fell into the `misc` bucket
  // and their `tool`/`exploration` tags marked them tools in the pouch.
  if (item.tags.includes('armor')) return 'armor';
  return 'misc';
}

// engine_Dev — the shared starter kit every character begins with. The TAGS carry
// the mechanics (light reveals hooks, drink restores stamina, detection finds
// relics, food feeds), so a re-skinned game can rename these to its own props
// (Flashlight / K-Rations / Canteen / Geiger Counter) by uploading a 'starterItems'
// flavor array — keep the tags to keep the behavior. Built-in SETTING-NEUTRAL kit is the
// default when no override is uploaded (so it never seeds another setting's proper nouns).
const DEFAULT_STARTER_ITEMS: InventoryItem[] = [
  { id: 'aetheric_torch', name: 'Hand Torch', kind: 'relic', rarity: 'Common', quantity: 1, tags: ['light'], description: 'A hand-held torch that resonates with the buried. USE it in a room that still holds an unexplored lead for a chance to shake loose a rare or legendary find (higher Wisdom, better odds). A miss burns the charge. Scarce — spend it where a lead remains.' },
  { id: 'rations', name: 'Trail Rations', kind: 'consumable', quantity: 3, tags: ['food'], description: 'Enough to keep you walking another day.' },
  // OTA-375 — every character starts with a Water Bottle (the cheap,
  // refillable stamina recovery item) so exhaustion in an early fight
  // is never a dead end. Drink it for +10 stamina; refill free at water.
  { id: 'water_bottle', name: 'Water Bottle', kind: 'consumable', rarity: 'Common', quantity: 1, tags: ['drink', 'water', 'container'], description: 'A full bottle of water. Drink to get your wind back (+10 stamina). Refill free at any puddle, lake, or crevice-pool.' },
  { id: 'aether_locket', name: "Finder's Locket", kind: 'relic', rarity: 'Common', quantity: 1, tags: ['detection'], description: 'Hums when held close to a relic.' },
];

// engine_Dev — rows of a LIVE item catalog (uploaded override, else built-in). The
// per-table JSON is either a bare array or wrapped under its own key.
function liveRows(id: 'weapons' | 'armor' | 'amulets' | 'rings' | 'materials' | 'gear' | 'exploration', raw: unknown): Array<Record<string, unknown>> {
  const wrapped = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>)[id] : raw;
  const builtin = Array.isArray(wrapped) ? (wrapped as Array<Record<string, unknown>>) : [];
  return resolveTable(id, builtin as never) as Array<Record<string, unknown>>;
}

// engine_Dev — resolve an author's starting-gear ITEM NAME against the live
// catalogs (weapons → armor → amulets/rings → exploration → gear → materials), and
// build a creation InventoryItem with the right kind/tags/desc. Unknown names still
// grant a generic misc item (never silently dropped) so a typo is visible in-pack.
function resolveStarterByName(name: string, id: string): InventoryItem | null {
  const lc = name.trim().toLowerCase();
  if (!lc) return null;
  const find = (rows: Array<Record<string, unknown>>) => rows.find((r) => typeof r.name === 'string' && (r.name as string).toLowerCase() === lc);
  const mk = (r: Record<string, unknown>, kind: InventoryItem['kind'], dflt: string, dur: boolean): InventoryItem => {
    const item: InventoryItem = {
      id, name: r.name as string, kind,
      rarity: ((r.rarity as InventoryItem['rarity']) ?? 'Common'),
      quantity: 1,
      tags: Array.isArray(r.tags) ? [...(r.tags as string[]), 'starter'] : ['starter'],
      description: (typeof r.description === 'string' ? r.description : dflt),
    };
    return dur ? stampDurability(item) : item;
  };
  let r = find(liveRows('weapons', weaponsData));
  if (r) return mk(r, 'weapon', 'A starter weapon.', true);
  r = find(liveRows('armor', armorData));
  if (r) return mk(r, 'armor', 'Starter armor.', true);
  r = find(liveRows('amulets', amuletsData)) ?? find(liveRows('rings', ringsData));
  // amulets/rings are categorized + equipped by NAME lookup against their catalogs,
  // not by item kind, so 'misc' is the correct inventory kind for them.
  if (r) return mk(r, 'misc', 'A starter accessory.', false);
  r = find(liveRows('exploration', explorationData));
  if (r) { const kind = explorationToInventoryKind(r as unknown as CatalogExplorationItem); return mk(r, kind, 'A starter tool.', kind === 'weapon'); }
  r = find(liveRows('gear', gearData));
  if (r) { const k = (r.kind as InventoryItem['kind']) ?? 'misc'; return mk(r, k, 'Starter gear.', k === 'weapon' || k === 'armor'); }
  r = find(liveRows('materials', materialsData));
  if (r) return mk(r, 'misc', 'A starter material.', false);
  return { id, name: name.trim(), kind: 'misc', rarity: 'Common', quantity: 1, tags: ['starter'], description: 'A starter item.' };
}

// engine_Dev — infer an item kind from a loadout row's behavior tags, used when the named
// item isn't in any catalog (so there's no authored kind to borrow).
function inferKindFromTags(tags: string[]): InventoryItem['kind'] {
  const t = tags.map((x) => x.toLowerCase());
  if (t.includes('weapon')) return 'weapon';
  if (t.includes('food') || t.includes('drink') || t.includes('consumable')) return 'consumable';
  // light + detection items are 'relic' in the built-in kit (Hand Torch / Finder's Locket), so a
  // re-skin's Flashlight / Geiger Counter sorts + behaves the same.
  if (t.includes('relic') || t.includes('light') || t.includes('detection')) return 'relic';
  if (t.includes('armor')) return 'armor';
  return 'misc';
}

// engine_Dev — build ONE startingLoadout row into a creation InventoryItem. Catalog-backed when
// the name matches a catalog item (real rarity / description / durability / kind), else built from
// the row's own tags (kind inferred). The row's tags are merged in so behavior tags ('food'/'climb'
// /…) always stick, and explicit quantity / rarity / description on the row win.
function loadoutRowToItem(row: Record<string, unknown>, name: string, idx: number): InventoryItem {
  const authorTags = Array.isArray(row.tags) ? (row.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [];
  const qty = typeof row.quantity === 'number' && row.quantity > 0 ? Math.floor(row.quantity) : 1;
  const base = resolveStarterByName(name, `loadout_${idx}_${Date.now()}`)!; // never null for a non-empty name
  const tags = Array.from(new Set([...(base.tags ?? []), ...authorTags]));
  // Catalog gave a real kind → keep it; a generic 'misc' fallback → honor the row's explicit
  // kind, else infer from the behavior tags (so an authored "K-Ration" with tag food → consumable).
  let kind = base.kind;
  if (kind === 'misc') kind = (typeof row.kind === 'string' ? (row.kind as InventoryItem['kind']) : null) ?? inferKindFromTags(authorTags);
  let item: InventoryItem = {
    ...base,
    kind,
    tags,
    quantity: qty,
    ...(typeof row.rarity === 'string' ? { rarity: row.rarity as InventoryItem['rarity'] } : {}),
    ...(typeof row.description === 'string' ? { description: row.description } : {}),
  };
  // A weapon/armor not catalog-stamped (unknown name upgraded to weapon/armor by tags) still
  // needs durability tracking.
  if ((kind === 'weapon' || kind === 'armor') && !item.durability) item = stampDurability(item);
  return item;
}

// engine_Dev — the uploaded `startingLoadout` table, if any: the author's single source of creation
// gear. A row may carry an optional `faction` — rows with no faction are granted to EVERY new
// character, a faction-tagged row only to a member of that faction — so ONE array describes both
// shared kit and per-faction kit. Returns the (faction-filtered) granted items + which slots to
// auto-equip (explicit `equip`, else the first weapon → main hand), or null when the pack authored
// no loadout rows for this faction.
export function resolveStartingLoadout(factionId: string): { items: InventoryItem[]; equipped: Partial<Record<string, string>> } | null {
  const all = resolveTable('startingLoadout', [] as unknown[]) as Array<Record<string, unknown>>;
  if (!Array.isArray(all) || all.length === 0) return null;
  const rows = all.filter((r) => {
    const fac = r && typeof r.faction === 'string' ? r.faction.trim() : '';
    return !fac || fac === factionId;
  });
  if (rows.length === 0) return null;
  const items: InventoryItem[] = [];
  const equipped: Partial<Record<string, string>> = {};
  rows.forEach((row, i) => {
    const name = row && typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) return;
    const item = loadoutRowToItem(row, name, i);
    items.push(item);
    const eq = typeof row.equip === 'string' ? row.equip.trim().toLowerCase() : '';
    if (eq && !equipped[eq]) equipped[eq] = item.name;
  });
  if (items.length === 0) return null;
  // No explicit equip anywhere → arm the player with the first weapon in the main hand, so they
  // never spawn bare-handed (mirrors the built-in "auto-equip the starter weapon").
  if (!equipped.main) {
    const firstWeapon = items.find((it) => it.kind === 'weapon');
    if (firstWeapon) equipped.main = firstWeapon.name;
  }
  return { items, equipped };
}

// OTA — unique starter instance ids (was static literals / bare Date.now()). A
// monotonic counter makes each id unique regardless of clock resolution.
let _starterSeq = 0;
function starterId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(_starterSeq++).toString(36)}`;
}

function buildStarterInventory(race: Race, faction: Faction): InventoryItem[] {
  // Clone so per-character inventory never shares object refs with the template.
  const items: InventoryItem[] = resolveFlavor('starterItems', DEFAULT_STARTER_ITEMS).map(
    (it) => ({ ...it, id: starterId('starter') }),
  );
  const primaryName = starterWeaponName(race);
  items.push(stampDurability({
    id: starterId('starter_primary'),
    name: primaryName,
    kind: 'weapon',
    rarity: 'Common',
    quantity: 1,
    tags: ['weapon', 'starter'],
    description: 'Your starter primary — given to you by your race tradition.',
  }));
  // engine_Dev — FACTION starting gear: the author's uploaded faction.startingGear
  // (resolved against the live catalogs) replaces the built-in faction "knife" map.
  const factionGear = Array.isArray(faction.startingGear) ? faction.startingGear : null;
  if (factionGear && factionGear.length > 0) {
    factionGear.forEach((nm, i) => {
      const it = resolveStarterByName(nm, starterId(`starter_fac_${i}`));
      if (it) items.push(it);
    });
  } else {
    const knifeName = FACTION_KNIFE[faction.id] ?? 'Pocket Knife';
    items.push(stampDurability({
      id: starterId('starter_knife'),
      name: knifeName,
      kind: 'weapon',
      rarity: 'Common',
      quantity: 1,
      tags: ['weapon', 'starter', 'knife', 'tool'],
      description: 'Your faction starter knife — primarily a dig tool, sharp enough in a pinch.',
    }));
  }
  // engine_Dev — RACE starting gear: the author's uploaded race.startingGear
  // (resolved against the live catalogs) replaces the built-in per-race map.
  const raceGear = Array.isArray(race.startingGear) ? race.startingGear : null;
  if (raceGear && raceGear.length > 0) {
    raceGear.forEach((nm, i) => {
      const it = resolveStarterByName(nm, starterId(`starter_race_${i}`));
      if (it) items.push(it);
    });
    return items;
  }
  // Race-themed exploration items from the rulebook starter table.
  const raceStarterNames = RACE_STARTER_EXPLORATION[race.id] ?? [];
  for (let i = 0; i < raceStarterNames.length; i++) {
    const itemName = raceStarterNames[i]!;
    const catalog = EXPLORATION_BY_NAME.get(itemName);
    if (catalog) {
      const kind = explorationToInventoryKind(catalog);
      const item: InventoryItem = {
        id: starterId(`starter_explore_${i}`),
        name: catalog.name,
        kind,
        rarity: 'Common',
        quantity: 1,
        tags: catalog.tags,
        description: catalog.description,
      };
      // Weapons need durability stamped; relics and misc don't track it.
      items.push(kind === 'weapon' ? stampDurability(item) : item);
      continue;
    }
    // arb-fix — the starter item was reclassified into armor.json (boots /
    // gloves / gauntlets / mask). Grant it as ARMOR so it equips + carries its
    // stat bonus / resistance / gate, instead of silently dropping it.
    const armorCat = ARMOR_BY_NAME.get(itemName);
    if (armorCat) {
      items.push(stampDurability({
        id: starterId(`starter_armor_${i}`),
        name: armorCat.name,
        kind: 'armor',
        rarity: (armorCat.rarity as InventoryItem['rarity']) ?? 'Common',
        quantity: 1,
        tags: armorCat.tags ?? ['armor'],
        description: armorCat.description ?? '',
      }));
      continue;
    }
    const weaponCat = WEAPONS_BY_NAME.get(itemName);
    if (weaponCat) {
      items.push(stampDurability({
        id: starterId(`starter_weapon_${i}`),
        name: weaponCat.name,
        kind: 'weapon',
        rarity: (weaponCat.rarity as InventoryItem['rarity']) ?? 'Common',
        quantity: 1,
        tags: weaponCat.tags ?? ['weapon'],
        description: weaponCat.description ?? '',
      }));
    }
    // else: skip silently if the catalog is missing
  }
  return items;
}

const races = racesData as Race[];
const factions = factionsData as Faction[];

// engine_Dev — resolve through the content-pack registry so uploaded races /
// factions replace the built-ins at call time (character creation, stats panel,
// race mechanics, etc. all read these). `races`/`factions` stay the built-in
// defaults the override falls back to.
export function getRaces(): Race[] { return resolveTable<Race>('races', races) as Race[]; }
export function getFactions(): Faction[] { return resolveTable<Faction>('factions', factions) as Faction[]; }

export function rollStats(): Stats {
  return {
    strength: rollDie(10),
    dexterity: rollDie(10),
    intelligence: rollDie(10),
    wisdom: rollDie(10),
    charisma: rollDie(10),
    // OTA-348 — placeholder; createCharacter overwrites with a per-race roll
    // (rollRaceStealth). Stealth is NOT a uniform 1d10 — it's race-defined.
    stealth: 0,
  };
}

// OTA-348 — per-race starting Stealth dice. Stealth is a race-defined trait,
// not a uniform roll: a lumbering Giant has none; constructs barely any; a
// tunnel-dwelling Mud Dweller or scavenging Reclaimer a lot. `null` = none (0).
// Unknown race → 1d6 (middle). Rolled once at creation and backfilled per-race
// for legacy saves (backfillPlayer).
const STEALTH_DICE: Record<string, string | null> = {
  tartarian_giant: null,          // none — far too big to go unseen
  mud_golem: '1d4',               // construct: heavy, slow
  architectural_sentinel: '1d6',  // construct, but can hold perfectly still
  unknowing_mass: '1d6',          // shambling, formless
  aetherborn: '1d8',              // half-there — can slip a watcher
  mud_dweller: '1d10',            // Tunnel Sense — at home unseen in the dark
  reclaimer: '1d12',              // scavenger's instinct — the best sneaks
};

export function rollRaceStealth(raceId: string): number {
  const die = STEALTH_DICE[raceId];
  if (die === undefined) return rollDie(6); // unknown race → middle of the pack
  if (die === null) return 0;               // explicitly none (Giants)
  return rollFromNotation(die);
}

function rollFromTCFormula(formula: string): number {
  // engine_Dev — a re-skin race may omit startingTCFormula; don't crash creation.
  // Fall back to a sane starting purse formula when it's missing/blank.
  const src = typeof formula === 'string' && formula.trim().length > 0 ? formula.trim() : '2d6 x 10';
  // "Nd6 x 10"
  const m = /^(\d+)d6\s*x\s*10$/i.exec(src);
  if (!m) return rollFromNotation(src);
  const count = parseInt(m[1]!, 10);
  return rollDice(count, 6) * 10;
}

export function rollStartingHP(race: Race): number {
  const base = rollDice(5, 10);
  return base + race.startingHPBonus;
}

export interface CreateCharacterInput {
  name: string;
  raceId: string;
  factionId: string;
  startingLocationId?: string;
}

// v2.4.1 (OTA 029) — canonical per-faction starting location.
//
// Each faction has ONE fixed starting tile that never changes for
// that faction. Derived from the world-atlas doc's "Faction
// strongholds" section. If the player passes an explicit
// startingLocationId, it overrides this map; otherwise the
// factionId is the source of truth.
//
// Notes:
//   - Reclaimers stay at the Outpost (only hub with a full interior).
//   - Mud Monarchs canonically have "no fixed base" but rule from
//     Asgardar/Nimari fragments — picked Asgardar as the primary.
//   - Conspiracy Architects live in the modern surface world (no
//     Tartaria base); start at the Outskirts as the surface analog.
//   - Stone Builders + True Tartarians live in the Subterranean
//     Empire (Aethercraft Workshop / True Tartarian Catacombs);
//     buried_cities is the closest top-level location entry.
// arb92 — every faction now starts at a low-danger (danger-2) themed
// frontier outpost, NOT inside a Lost Capital (Core site) or a danger-4/5
// zone. The capitals are the JOURNEY, not the spawn — this restores the
// hook → travel → first-capital "revelation" arc and stops fresh characters
// from being dropped on top of an endgame Core (and the Legendary spawns
// that go with danger-5 tiles). Reclaimers / Architects / Forgotten Order
// already started on safe frontier tiles and keep them.
// arb93 — every faction now has its OWN distinct frontier outpost (Reclaimers
// and Architects used to share Tartarian Outskirts). All 9 are danger-2,
// non-capital, hub-capable. Tartarian Outskirts + Varakush remain in the
// world as frontier regions/destinations.
export const FACTION_STARTING_LOCATION: Record<string, string> = {
  reclaimers_guild: 'reclaimer_stake',
  forgotten_order: 'varakush',
  mud_monarchs: 'monarch_waystation',
  true_tartarians: 'pilgrim_waycamp',
  eternal_dynasty: 'dynasty_border_post',
  conspiracy_architects: 'architect_blind',
  servants_of_giants: 'giant_watch_shrine',
  stone_builders: 'builders_survey_camp',
  tartarian_revivalists: 'revivalist_field_camp',
};

/** engine_Dev — the engine's structural fallback location: the FIRST row of the
 *  live locations table (author pack → generic pack → built-in JSON). Use this
 *  wherever code needs "some valid location" and nothing better is known —
 *  never a hardcoded setting id. Pulls a fixed POINT in whatever locations
 *  JSON the game runs on, not flavor. */
export function defaultLocationId(): string {
  const locs = resolveTable<{ id?: string }>('locations', locationsData as { id?: string }[]);
  return locs.find((l) => !!l.id)?.id ?? 'origin';
}

export function startingLocationForFaction(factionId: string): string {
  // engine_Dev — resolve to a REAL location in the live (possibly uploaded) world.
  const locs = resolveTable<{ id?: string }>('locations', locationsData as { id?: string }[]);
  const exists = (id: string | undefined | null): id is string =>
    !!id && locs.some((l) => l.id === id);
  // 0. An uploaded STARTING AREA's placement wins — the faction spawns inside it.
  const area = startingAreaForFaction(factionId);
  if (exists(area?.locationId)) return area!.locationId;
  // 1. The faction's own declared starter complex (data-driven).
  const faction = getFactions().find((f) => f.id === factionId);
  if (exists(faction?.baseLocationId)) return faction!.baseLocationId!;
  // 2. The built-in Tartaria per-faction outpost.
  if (exists(FACTION_STARTING_LOCATION[factionId])) return FACTION_STARTING_LOCATION[factionId]!;
  // 3. Any valid location — first row of the table — so a re-skin that hasn't
  //    declared a base still spawns at a REAL place in ITS world instead of the
  //    missing Tartaria fallback (which silently bounced to locations[0] and left
  //    currentLocationId pointing at a non-existent tile).
  return locs[0]?.id ?? defaultLocationId();
}

export function createCharacter(input: CreateCharacterInput): PlayerCharacter {
  // engine_Dev — resolve through the content-pack registry so an uploaded races /
  // factions table drives character creation (lore-agnostic).
  const allRaces = getRaces();
  const allFactions = getFactions();
  const race = allRaces.find((r) => r.id === input.raceId) ?? allRaces[0]!;
  const faction = allFactions.find((f) => f.id === input.factionId) ?? allFactions[0]!;
  const stats = rollStats();
  // OTA-348 — overwrite the placeholder Stealth with a race-proportional roll
  // (Giants 0, constructs low, Mud Dwellers / Reclaimers high).
  stats.stealth = rollRaceStealth(race.id);
  const hpMax = rollStartingHP(race);
  // Stamina scales lightly off STR (1d10 stat → +0..+5 bonus over base 12).
  // 2026-05-24 — bumped base 8 → 12 so the Tired status (< 25%) triggers
  // after sustained activity instead of after 3 actions. Tied to the
  // wider stamina overhaul (rest cost + hunger + combat depth).
  const staminaMax = 12 + Math.floor(stats.strength / 2);

  const factionStanding: FactionStanding[] = allFactions.map((f) => ({
    factionId: f.id,
    standing: f.id === faction.id ? Math.max(10, f.startingStanding + 10) : f.startingStanding,
  }));

  // engine_Dev — the starter complex (faction base) the character spawns in.
  // Resolved once so currentLocationId, the safe-zone marker (startLocationId),
  // and the canon grid cell all agree.
  const startLocationId = input.startingLocationId ?? startingLocationForFaction(input.factionId);

  // engine_Dev — creation gear resolution, in priority order:
  //   1. an uploaded `startingLoadout` (faction-filtered) → grant EXACTLY that, nothing else;
  //   2. else a RE-SKIN is active but its pack authored no loadout → grant NOTHING (the author must
  //      provide a loadout; the engine never leaks the built-in Tartaria starter into a re-skin);
  //   3. else the bare built-in Tartaria game (no re-skin) → its native per-race/faction starter kit.
  const loadout = resolveStartingLoadout(faction.id);
  const reskinNoLoadout = !loadout && isReskinActive();

  return {
    name: input.name,
    raceId: race.id,
    factionId: faction.id,
    stats,
    hp: hpMax,
    hpMax,
    stamina: staminaMax,
    staminaMax,
    milestones: { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 },
    // Loadout wins; a re-skin without a loadout spawns empty-handed; the built-in game keeps its
    // native starter weapon + kit.
    equipped: (loadout ? loadout.equipped : reskinNoLoadout ? {} : { main: starterWeaponName(race) }) as PlayerCharacter['equipped'],
    ac: race.baseAC,
    tc: rollFromTCFormula(race.startingTCFormula),
    corruption: 0,
    inventory: loadout ? loadout.items : reskinNoLoadout ? [] : buildStarterInventory(race, faction),
    factionStanding,
    // v2.4.1 (OTA 029) — explicit startingLocationId wins; otherwise
    // fall back to the canonical per-faction start tile.
    currentLocationId: startLocationId,
    // engine_Dev — remember the spawn so the starter-complex peace zone knows
    // when the player has left it (combat resumes on first exit).
    startLocationId,
    activeQuests: [],
    // Procedural map seed — combines name + race + faction + a timestamp
    // so two characters with identical names still get different maps.
    mapSeed: `${input.name}|${race.id}|${faction.id}|${Date.now()}`,
    // Start at the procedural grid center — generateWorldMap places
    // the starting location there. Any other default (the old 4,4)
    // makes the first cardinal step walk from the wrong tile.
    mapX: WORLD_MAP_CENTER_X,
    mapY: WORLD_MAP_CENTER_Y,
    // arb47 — the authoritative ABSOLUTE position: the starting location's fixed
    // canon cell. Cardinal steps + routing move this directly; it never warps.
    ...(() => {
      const cell = canonicalCellOf(startLocationId);
      return { gridX: cell.x, gridY: cell.y };
    })(),
    // OTA-510 — a freshly created character is born at their start cell and must
    // NOT be repositioned by the one-shot west-of-Hidden-Market dev placement;
    // pre-set the guard so only pre-OTA-510 SAVES (the existing game) get moved.
    _placedWestOfHiddenMarket510: true,
    // v2.4.1 (OTA 033) — initialize the Mud Flood Nexus main quest at
    // the 'hook' phase. The Arbiter's first-scene intro mentions the
    // Nexus once and seeds the arc.
    mainQuest: initMainQuest(),
  };
}
