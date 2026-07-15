import type { Enemy, WeatherEntry, Hazard, Location, WorldMemory, Rarity } from './types';
import { pick, pickWeighted, chance } from './rng';
import enemiesData from '../data/enemies/enemies.json';
import weatherData from '../data/weather/weather.json';
import hazardsData from '../data/hazards/hazards.json';
import locationsData from '../data/locations/locations.json';
import lootData from '../data/relics/loot_tables.json';
import type { LadderTriple } from './worldLadder';

const enemies = enemiesData as Enemy[];
const weather = weatherData as WeatherEntry[];
const hazards = hazardsData as Hazard[];
const locations = locationsData as Location[];

/** Lookup an enemy by name. Used by the wasteland-encounter skirmish
 *  spawner to convert a name in the encounter pool into a real Enemy
 *  the combat system can use. Returns a fresh copy so trait state
 *  doesn't bleed between scenes. */
export function findEnemyByName(name: string): Enemy | null {
  const t = name.toLowerCase().trim();
  if (!t) return null;
  const match = enemies.find((e) => e.name.toLowerCase() === t);
  if (!match) return null;
  return JSON.parse(JSON.stringify(match)) as Enemy;
}

interface LootEntry { name: string; rarity: Rarity }
const loot = lootData as LootEntry[];

const rarityWeights: Record<Rarity, number> = {
  Common: 10,
  Uncommon: 5,
  Rare: 2,
  Legendary: 1,
};

export function pickWeather(memory: WorldMemory): WeatherEntry {
  return pickWeighted(weather, (w) => {
    const seen = memory.tagCounts[w.id] ?? 0;
    return Math.max(1, 5 - seen);
  });
}

export function pickHazardForLocation(location: Location, dangerBoost = 0): Hazard | null {
  if (!chance(30 + (location.danger + dangerBoost) * 8)) return null;
  return pick(hazards);
}

// OTA-816 — REGULAR-ENEMY SCALING. Base enemy stats come straight from
// enemies.json, so an over-leveled character farmed low-HP trash (a 15-HP Aetherbat
// stayed 15 HP forever — free XP/loot) while the danger tiers only ever changed WHICH
// rarity could spawn, never the numbers. This lifts a NON-BOSS enemy's HP (and lightly
// its attack/AC) by two axes:
//   • player power  — a strong character stops farming trivial mobs
//   • area danger    — a deep zone bites harder than the frontier
// It is deliberately GENTLER than the Guardian curve: bosses/Guardians are SKIPPED
// (they carry their own scaling), the HP the multiplier can ADD is capped flat so a
// big Legendary doesn't explode, and a fresh arrival in a danger-0 zone is left
// EXACTLY as authored — "low level is still low level". Knobs are all here.

/** How strong is this character. Best offensive stat + a slice of the HP pool — the
 *  same proxy the Guardian scaler uses, kept in sync deliberately. */
export function enemyScalePower(bestCombatStat: number, hpMax: number): number {
  return bestCombatStat + hpMax / 10;
}

function bumpAbilityPointNumber(ap: string | number | undefined, bonus: number): string {
  const s = String(ap ?? 'Strength 3');
  if (bonus <= 0) return s;
  const m = s.match(/^(\w+)\s+(\d+)/);
  if (!m) return s;
  return `${m[1]} ${parseInt(m[2]!, 10) + bonus}`;
}

/** Scale one rolled enemy to the player's power and the tile's danger. Pure; returns
 *  a fresh object (never mutates). Bosses pass through untouched. */
export function scaledEnemyForContext(enemy: Enemy, danger: number, power: number): Enemy {
  if (enemy.boss) return enemy;                                  // Guardians / story bosses tuned elsewhere
  const d = Math.max(0, danger);
  const t = Math.max(0, Math.min(1, (power - 14) / 18));         // 0 at a fresh arrival → 1 at end-game
  if (t <= 0 && d <= 0) return enemy;                            // fresh player on the frontier → as authored
  const areaFactor = 1 + d * 0.12;                              // 1.0 (frontier) .. 1.6 (deep)
  // Floor: the main lever for trash — a per-power/per-danger MINIMUM so a strong
  // player can't one-shot-farm the weakest mob. Maxed player: ~34 (d0) .. ~64 (d5).
  const floor = Math.round((34 + d * 6) * t);
  // Multiplier: a gentle, FLAT-CAPPED bump so already-meaty enemies stay proportionate
  // and never rival a Guardian (a 360-HP Legendary gains only ~addCap, not ×1.7).
  const addCap = 22 + d * 8;
  const added = Math.min(enemy.hp * 0.5 * t * areaFactor, addCap);
  const hp = Math.round(Math.max(enemy.hp + added, floor));
  // Attack/AC: a small bump (abilityPoint drives both, per combatRules) so a scaled
  // enemy can still land on a geared player — modest, +1 (d0) .. +4 (d5) at max power.
  const bonus = Math.round(t * (1 + d * 0.5));
  return { ...enemy, hp, abilityPoint: bumpAbilityPointNumber(enemy.abilityPoint, bonus) };
}

/** Batch form — scales each enemy in a rolled encounter. */
export function scaleEncounterForContext(enemies: readonly Enemy[], danger: number, power: number): Enemy[] {
  return enemies.map((e) => scaledEnemyForContext(e, danger, power));
}

export function pickEnemyForLocation(location: Location): Enemy | null {
  // OTA-187 — base scene-arrival enemy chance bumped from 40 to 50
  // (10pp) per playtester: "the game is a little shy on combat."
  // At danger 0 outskirts this lifts from 40% → 50% per scene
  // arrival; danger 3 capitals from 64% → 74%; danger 5 deep zones
  // already capped at 80% before, now 90%.
  if (!chance(50 + location.danger * 8)) return null;
  const dangerCap: Rarity = location.danger >= 4 ? 'Legendary' : location.danger >= 3 ? 'Rare' : location.danger >= 2 ? 'Uncommon' : 'Common';
  const allowed = enemies.filter((e) => rarityRank(e.rarity) <= rarityRank(dangerCap));
  if (allowed.length === 0) return null;
  return pickWeighted(allowed, (e) => rarityWeights[e.rarity]);
}

export function pickEnemyForLocationGuaranteed(location: Location, playerHpMax?: number): Enemy | null {
  const dangerCap: Rarity = location.danger >= 4 ? 'Legendary' : location.danger >= 3 ? 'Rare' : location.danger >= 2 ? 'Uncommon' : 'Common';
  // OTA-243 — player-tier cap. Playtest report: Day 16 player with
  // 48 HP got a Mud Giant (Legendary, 360 HP, 4d6 damage) rest-
  // ambush in Asgardar (danger 5). The legendary roll was correct
  // for the location but disastrous for the player. Cap the picker
  // by player.hpMax so a starter never eats a legendary on a rest:
  //   hpMax < 60   → Common only
  //   hpMax < 100  → Common + Uncommon
  //   hpMax < 140  → + Rare
  //   hpMax ≥ 140  → all rarities (location-cap rules)
  // When playerHpMax is undefined the caller didn't opt in — keep
  // the legacy location-only behavior for back-compat.
  let effectiveCap: Rarity = dangerCap;
  if (typeof playerHpMax === 'number') {
    const playerCap: Rarity = playerHpMax < 60 ? 'Common'
      : playerHpMax < 100 ? 'Uncommon'
      : playerHpMax < 140 ? 'Rare'
      : 'Legendary';
    effectiveCap = rarityRank(playerCap) < rarityRank(dangerCap) ? playerCap : dangerCap;
  }
  const allowed = enemies.filter((e) => rarityRank(e.rarity) <= rarityRank(effectiveCap));
  if (allowed.length === 0) return null;
  return pickWeighted(allowed, (e) => rarityWeights[e.rarity]);
}

// Group encounter templates. Each entry produces a list of enemies — the
// engine spawns copies of the named enemy with a per-instance HP roll so a
// pack of three Bog Hounds aren't identical. Filtered by danger so a
// fresh character isn't ambushed by a Sentinel cohort at danger 1.
interface GroupTemplate {
  enemyName: string;
  count: number;
  /** Minimum location.danger required to roll this group. */
  minDanger: number;
  /** Relative weight when multiple groups match. */
  weight: number;
}

const GROUP_TEMPLATES: GroupTemplate[] = [
  { enemyName: 'Bog Hound', count: 3, minDanger: 1, weight: 5 }, // pack
  { enemyName: 'Mud Wasp', count: 4, minDanger: 1, weight: 4 },  // swarm
  { enemyName: 'Mud Spider', count: 2, minDanger: 1, weight: 5 },
  { enemyName: 'Mudling', count: 3, minDanger: 1, weight: 4 },
  { enemyName: 'Gutter Rat', count: 4, minDanger: 1, weight: 3 },
  { enemyName: 'Reclaimer Ambusher', count: 3, minDanger: 2, weight: 4 }, // ambush
  { enemyName: 'Mud Golem', count: 2, minDanger: 3, weight: 2 }, // cluster
  { enemyName: 'Mud Strider', count: 2, minDanger: 2, weight: 3 },
  { enemyName: 'Aetheric Ooze', count: 3, minDanger: 2, weight: 3 },
  { enemyName: 'Black Cloak Agent', count: 2, minDanger: 3, weight: 2 },
];

// Roll a group encounter for this location. ~22% chance overall, gated by
// the location's danger. Returns null when no group spawns — the caller
// should fall back to pickEnemyForLocation for a single-enemy roll.
export function pickGroupForLocation(location: Location): Enemy[] | null {
  if (!chance(22)) return null;
  const eligible = GROUP_TEMPLATES.filter((g) => g.minDanger <= location.danger);
  if (eligible.length === 0) return null;
  const tpl = pickWeighted(eligible, (g) => g.weight);
  const proto = enemies.find((e) => e.name === tpl.enemyName);
  if (!proto) return null;
  // Spawn `count` copies, each with a small HP wobble so they feel
  // individual rather than cloned. ±20% HP variance.
  const out: Enemy[] = [];
  for (let i = 0; i < tpl.count; i++) {
    const variance = 0.8 + Math.random() * 0.4;
    out.push({ ...proto, hp: Math.max(1, Math.round(proto.hp * variance)) });
  }
  return out;
}

// Unified encounter resolver: rolls a group first (rare), else falls back
// to a single enemy (common), else null (peaceful scene).
export function rollEncounter(location: Location): Enemy[] {
  const group = pickGroupForLocation(location);
  if (group && group.length > 0) return group;
  const single = pickEnemyForLocation(location);
  return single ? [single] : [];
}

function rarityRank(r: Rarity): number {
  return r === 'Common' ? 0 : r === 'Uncommon' ? 1 : r === 'Rare' ? 2 : 3;
}

export function getLocationById(id: string): Location {
  const stat = locations.find((l) => l.id === id);
  if (stat) return stat;
  // OTA-502 — resolve install-canonized locations (whisper/contract/mission
  // mentions) too, so they get their real name + a minimal scene instead of
  // silently falling back to locations[0].
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { allKnownLocations } = require('./worldMap') as typeof import('./worldMap');
  return allKnownLocations().find((l) => l.id === id) ?? locations[0]!;
}

// ---------------------------------------------------------------------------
// World-ladder pool pickers — Phase 4 §4.3
// ---------------------------------------------------------------------------
//
// The Micro-Micro nodes in worldLadder.json carry `possibleEncounters` and
// `lootTable` arrays curated per room (Buried Skyscraper Upper has Aetherbat,
// Aetheric Raven, Reclaimer Ambusher, Black Cloak Agent — not Mud Lich).
// Until this commit the engine ignored both arrays for actual gameplay and
// only fed them to the LLM as context. These pickers wire them through so
// the scene the player walks into matches its hand-authored biome curation.
//
// Rarity weighting is preserved inside the curated pool — Common enemies
// still spawn more often than Legendary ones, but everything that DOES
// spawn comes from the room's allowed list. Same for loot.

const enemiesByName = new Map<string, Enemy>();
for (const e of enemies) enemiesByName.set(e.name, e);
const lootByName = new Map<string, LootEntry>();
for (const l of loot) lootByName.set(l.name, l);

/**
 * Picks one enemy from the Micro-Micro's `possibleEncounters` pool,
 * weighted by rarity (Common 10 / Uncommon 5 / Rare 2 / Legendary 1).
 * Returns null when the pool is empty or every name fails to resolve to
 * a real enemy in enemies.json — caller should fall back to
 * `pickEnemyForLocation` in that case.
 */
export function pickEncounterFromLadder(triple: LadderTriple | null | undefined): Enemy | null {
  if (!triple) return null;
  const pool = triple.microMicro.possibleEncounters
    .map((name) => enemiesByName.get(name))
    .filter((e): e is Enemy => !!e);
  if (pool.length === 0) return null;
  return pickWeighted(pool, (e) => rarityWeights[e.rarity]);
}

/**
 * Picks one loot item NAME from the Micro-Micro's `lootTable` pool,
 * weighted by rarity. Returns null when the pool is empty or all names
 * fail to resolve. The caller (area-search, dig, etc.) builds the actual
 * InventoryItem from the name via lookupCraftedItem.
 */
export function pickLootFromLadder(triple: LadderTriple | null | undefined): string | null {
  if (!triple) return null;
  const pool = triple.microMicro.lootTable
    .map((name) => lootByName.get(name))
    .filter((l): l is LootEntry => !!l);
  if (pool.length === 0) return null;
  return pickWeighted(pool, (l) => rarityWeights[l.rarity]).name;
}
