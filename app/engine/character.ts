import type { Race, Faction, PlayerCharacter, Stats, FactionStanding, InventoryItem } from './types';
import { rollDie, rollDice, rollFromNotation } from './rng';
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';
import explorationData from '../data/items/exploration.json';
import { stampDurability } from './durability';

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

/**
 * Maps the catalog's loose `kind: 'exploration'` to a PlayerCharacter
 * InventoryItem kind. Weapons stay weapons; Aetheric-flavored items
 * become 'relic' (so they sort with the player's other Aetheric relics
 * in the InventoryScreen); everything else is 'misc'.
 */
function explorationToInventoryKind(item: CatalogExplorationItem): InventoryItem['kind'] {
  if (item.tags.includes('weapon')) return 'weapon';
  if (item.tags.includes('relic')) return 'relic';
  return 'misc';
}

function buildStarterInventory(race: Race, faction: Faction): InventoryItem[] {
  const items: InventoryItem[] = [
    { id: 'aetheric_torch', name: 'Aetheric Torch', kind: 'relic', rarity: 'Common', quantity: 1, tags: ['light'], description: 'Reliable light. Faintly attracts Aether-drawn creatures.' },
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
    if (!catalog) continue; // safety — skip silently if the catalog is missing
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
  };
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

export function createCharacter(input: CreateCharacterInput): PlayerCharacter {
  const race = races.find((r) => r.id === input.raceId) ?? races[0]!;
  const faction = factions.find((f) => f.id === input.factionId) ?? factions[0]!;
  const stats = rollStats();
  const hpMax = rollStartingHP(race);
  // Stamina scales lightly off STR (1d10 stat → +0..+5 bonus over base 8).
  const staminaMax = 8 + Math.floor(stats.strength / 2);

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
    currentLocationId: input.startingLocationId ?? 'tartarian_outskirts',
    activeQuests: [],
    // Procedural map seed — combines name + race + faction + a timestamp
    // so two characters with identical names still get different maps.
    mapSeed: `${input.name}|${race.id}|${faction.id}|${Date.now()}`,
    mapX: 4,
    mapY: 4,
  };
}
