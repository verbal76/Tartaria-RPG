// customBosses — engine_Dev IMPORTABLE BOSSES.
//
// A boss is a special, named enemy tied to a faction and a place: it carries full
// combat stats, a loot table, a QUEST ITEM it drops (e.g. dog tags), and spawn
// rules (where it appears + the condition that lets it appear). Main-quest "kill"
// steps reference a boss so the objective and the encounter line up. Authored as
// JSON or built field-by-field in the dev console BOSSES box.

import { getCustomBosses } from './contentPack';

/** The three spawn modes the boss builder offers (pick one). */
export const BOSS_SPAWN_CONDITIONS = [
  { id: 'main_quest', label: 'Main-quest boss (tied to a quest step)' },
  { id: 'location', label: 'Fixed location (always spawns there)' },
  { id: 'random', label: 'Random spawn chance' },
] as const;

export interface CustomBoss {
  /** Stable id (main-quest kill steps reference this). */
  id: string;
  name: string;
  /** Faction affiliation — a Factions-table id. */
  factionId?: string;
  // ── combat stats (mirror the enemies table) ───────────────────────────
  hp: number;
  /** Attack bonus (to-hit). */
  attack: number;
  /** Damage dice, e.g. "2d8+4". */
  damage: string;
  ac?: number;
  /** Boss "tier" / ability budget; higher = nastier specials. */
  abilityPoint?: number;
  rarity?: string;
  traits?: string[];
  // ── loot ──────────────────────────────────────────────────────────────
  /** Ordinary drops on defeat (item names). */
  drops?: string[];
  /** The KEY item this boss must drop for the main quest (e.g. "ONR Dog Tags"). */
  questItem?: string;
  // ── spawn ───────────────────────────────────────────────────────────────
  /** Locations-table id where the boss appears (main_quest + location modes). */
  spawnLocationId?: string;
  /** One of BOSS_SPAWN_CONDITIONS ids: main_quest | location | random. */
  spawnCondition?: string;
  /** Per-encounter spawn chance 0–100, for spawnCondition === 'random'. */
  spawnChance?: number;
}

function isValidBoss(b: unknown): b is CustomBoss {
  if (!b || typeof b !== 'object') return false;
  const c = b as Record<string, unknown>;
  return typeof c.id === 'string' && c.id.length > 0
    && typeof c.name === 'string' && c.name.length > 0
    && typeof c.hp === 'number';
}

/** The live uploaded bosses, valid entries only. */
export function liveBosses(): CustomBoss[] {
  const raw = getCustomBosses();
  return Array.isArray(raw) ? raw.filter(isValidBoss) : [];
}

export function bossById(id: string | null | undefined): CustomBoss | null {
  if (!id) return null;
  return liveBosses().find((b) => b.id === id) ?? null;
}

/** Only the bosses flagged as MAIN-QUEST bosses — the pool a quest kill step may
 *  reference (vs fixed-location / random-spawn bosses). */
export function mainQuestBosses(): CustomBoss[] {
  return liveBosses().filter((b) => (b.spawnCondition ?? 'main_quest') === 'main_quest');
}

/** The boss configured to spawn at a given location (first match). */
export function bossAtLocation(locationId: string | null | undefined): CustomBoss | null {
  if (!locationId) return null;
  return liveBosses().find((b) => b.spawnLocationId === locationId) ?? null;
}

/** A FIXED-LOCATION boss to drop in at this tile (spawnCondition 'location') —
 *  not quest-gated, appears whenever the player is here. */
export function fixedLocationBossEnemyAt(locationId: string | null | undefined): Record<string, unknown> | null {
  if (!locationId) return null;
  const b = liveBosses().find((x) => x.spawnCondition === 'location' && x.spawnLocationId === locationId);
  return b ? bossToEnemy(b) : null;
}

/** Roll a RANDOM-spawn boss (spawnCondition 'random') against its spawnChance %. */
export function rollRandomBoss(rng: () => number = Math.random): Record<string, unknown> | null {
  for (const b of liveBosses()) {
    if (b.spawnCondition === 'random' && (b.spawnChance ?? 0) > 0 && rng() * 100 < (b.spawnChance ?? 0)) {
      return bossToEnemy(b);
    }
  }
  return null;
}

/** Map a boss to the engine's Enemy shape so it can actually fight. The combat
 *  engine spawns from the enemies table; this lets a boss drop in with its stats,
 *  traits, and loot (quest item appended so the kill yields the objective drop). */
export function bossToEnemy(b: CustomBoss): Record<string, unknown> {
  const loot = [...(b.drops ?? [])];
  if (b.questItem && b.questItem.trim() && !loot.includes(b.questItem.trim())) loot.push(b.questItem.trim());
  return {
    name: b.name,
    type: 'boss',
    abilityPoint: b.abilityPoint ?? 6,
    attack: b.attack ?? 5,
    damage: b.damage ?? '2d8+2',
    hp: b.hp,
    ac: b.ac,
    rarity: b.rarity ?? 'Legendary',
    loot,
    traits: b.traits ?? [],
    aliases: [],
    factionId: b.factionId,
    isBoss: true,
  };
}
