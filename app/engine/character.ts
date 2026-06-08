import type { Race, Faction, PlayerCharacter, Stats, FactionStanding, InventoryItem } from './types';
import { rollDie, rollDice, rollFromNotation } from './rng';
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';
import explorationData from '../data/items/exploration.json';
import armorData from '../data/items/armor.json';
import weaponsData from '../data/items/weapons.json';
import { stampDurability } from './durability';
import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from './worldMap';
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

const RACE_PRIMARY: Record<string, string> = {
  tartarian_giants: 'Mud-fist Wraps', // their bare-hand combat tradition
  true_tartarians: 'Mud-fist Wraps',
  reclaimers: 'Rusted Blade',
  architectural_sentinels: 'Tartarian Spear',
  unknowing_masses: 'Rusted Blade',
  aetherborn: 'Pyric Wand',
};

const FACTION_KNIFE: Record<string, string> = {
  reclaimers_guild: "Reclaimer's Trowel",
  forgotten_order: 'Order Letter-Opener',
  true_tartarians: 'Bone Shiv',
  mud_monarchs: 'Pocket Knife',
  eternal_dynasty: 'Pocket Knife',
};

// Each race ships with TWO items from their rulebook starter table —
// kept tight so the default 10-slot Player's Backpack still has room for
// the shared starter items (Aetheric Torch + Trail Rations + Locket) plus
// the primary weapon + faction knife. Total = 7 slots used. Remaining
// items from the table live in exploration.json and can be acquired from
// vendors / loot pools.
export const RACE_STARTER_EXPLORATION: Record<string, string[]> = {
  tartarian_giant: ['Aetheric Vision Lens', 'Hardened Climbing Strap'],
  mud_dweller: ['Cavern Sound Stones', 'Aether-Breath Mask'],
  reclaimer: ["Reclaimer's Rope", 'Echoing Steps Boots'],
  architectural_sentinel: ['Aetheric Circuit Repair Kit', 'Pulse Scanner'],
  mud_golem: ['Golemstone Stabilizer', 'Mud-Rend Blade'],
  unknowing_mass: ['Lost Echo Compass', "Field Crafter's Kit"],
  aetherborn: ['Aetheric Harmonics Tuner', 'Glyph-Sealed Scroll'],
};

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

function buildStarterInventory(race: Race, faction: Faction): InventoryItem[] {
  const items: InventoryItem[] = [
    { id: 'aetheric_torch', name: 'Aetheric Torch', kind: 'relic', rarity: 'Common', quantity: 1, tags: ['light'], description: 'A hand-held aether-light. Flick it on to reveal hidden hooks in the current room. Burns one charge per use; carry several.' },
    { id: 'rations', name: 'Trail Rations', kind: 'consumable', quantity: 3, tags: ['food'], description: 'Enough to keep you walking another day.' },
    { id: 'aether_locket', name: 'Aetheric Locket', kind: 'relic', rarity: 'Common', quantity: 1, tags: ['detection'], description: 'Hums when held close to a relic.' },
  ];
  const primaryName = RACE_PRIMARY[race.id] ?? 'Rusted Blade';
  items.push(stampDurability({
    id: `starter_primary_${Date.now()}`,
    name: primaryName,
    kind: 'weapon',
    rarity: 'Common',
    quantity: 1,
    tags: ['weapon', 'starter'],
    description: 'Your starter primary — given to you by your race tradition.',
  }));
  const knifeName = FACTION_KNIFE[faction.id] ?? 'Pocket Knife';
  items.push(stampDurability({
    id: `starter_knife_${Date.now()}`,
    name: knifeName,
    kind: 'weapon',
    rarity: 'Common',
    quantity: 1,
    tags: ['weapon', 'starter', 'knife', 'tool'],
    description: 'Your faction starter knife — primarily a dig tool, sharp enough in a pinch.',
  }));
  // Race-themed exploration items from the rulebook starter table.
  const raceStarterNames = RACE_STARTER_EXPLORATION[race.id] ?? [];
  for (let i = 0; i < raceStarterNames.length; i++) {
    const itemName = raceStarterNames[i]!;
    const catalog = EXPLORATION_BY_NAME.get(itemName);
    if (catalog) {
      const kind = explorationToInventoryKind(catalog);
      const item: InventoryItem = {
        id: `starter_explore_${i}_${Date.now()}`,
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
        id: `starter_armor_${i}_${Date.now()}`,
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
        id: `starter_weapon_${i}_${Date.now()}`,
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

export function getRaces(): Race[] { return races; }
export function getFactions(): Faction[] { return factions; }

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
  // "Nd6 x 10"
  const m = /^(\d+)d6\s*x\s*10$/i.exec(formula.trim());
  if (!m) return rollFromNotation(formula);
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

export function startingLocationForFaction(factionId: string): string {
  return FACTION_STARTING_LOCATION[factionId] ?? 'tartarian_outskirts';
}

export function createCharacter(input: CreateCharacterInput): PlayerCharacter {
  const race = races.find((r) => r.id === input.raceId) ?? races[0]!;
  const faction = factions.find((f) => f.id === input.factionId) ?? factions[0]!;
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

  const factionStanding: FactionStanding[] = factions.map((f) => ({
    factionId: f.id,
    standing: f.id === faction.id ? Math.max(10, f.startingStanding + 10) : f.startingStanding,
  }));

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
    // Auto-equip the race primary so the player starts combat-ready.
    equipped: { main: RACE_PRIMARY[race.id] ?? 'Rusted Blade' },
    ac: race.baseAC,
    tc: rollFromTCFormula(race.startingTCFormula),
    corruption: 0,
    inventory: buildStarterInventory(race, faction),
    factionStanding,
    // v2.4.1 (OTA 029) — explicit startingLocationId wins; otherwise
    // fall back to the canonical per-faction start tile.
    currentLocationId: input.startingLocationId ?? startingLocationForFaction(input.factionId),
    activeQuests: [],
    // Procedural map seed — combines name + race + faction + a timestamp
    // so two characters with identical names still get different maps.
    mapSeed: `${input.name}|${race.id}|${faction.id}|${Date.now()}`,
    // Start at the procedural grid center — generateWorldMap places
    // the starting location there. Any other default (the old 4,4)
    // makes the first cardinal step walk from the wrong tile.
    mapX: WORLD_MAP_CENTER_X,
    mapY: WORLD_MAP_CENTER_Y,
    // v2.4.1 (OTA 033) — initialize the Mud Flood Nexus main quest at
    // the 'hook' phase. The Arbiter's first-scene intro mentions the
    // Nexus once and seeds the arc.
    mainQuest: initMainQuest(),
  };
}
