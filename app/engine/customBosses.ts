// customBosses — engine_Dev IMPORTABLE BOSSES.
//
// A boss is a special, named enemy tied to a faction and a place: it carries full
// combat stats, a loot table, a QUEST ITEM it drops (e.g. dog tags), and spawn
// rules (where it appears + the condition that lets it appear). Main-quest "kill"
// steps reference a boss so the objective and the encounter line up. Authored as
// JSON or built field-by-field in the dev console BOSSES box.

import { getCustomBosses } from './contentPack';

/** Spawn condition vocabulary the builder offers (checkbox/dropdown). */
export const BOSS_SPAWN_CONDITIONS = [
  { id: 'main_quest', label: 'During the main quest (its step is active)' },
  { id: 'always', label: 'Always (whenever you visit the spawn area)' },
  { id: 'once', label: 'Once only (does not respawn)' },
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
  /** Locations-table id where the boss appears. */
  spawnLocationId?: string;
  /** One of BOSS_SPAWN_CONDITIONS ids. Default 'main_quest'. */
  spawnCondition?: string;
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

/** The boss configured to spawn at a given location (first match). */
export function bossAtLocation(locationId: string | null | undefined): CustomBoss | null {
  if (!locationId) return null;
  return liveBosses().find((b) => b.spawnLocationId === locationId) ?? null;
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
