import type { Enemy, WeatherEntry, Hazard, Location, WorldMemory, Rarity } from './types';
import { pick, pickWeighted, chance } from './rng';
import enemiesData from '../data/enemies/enemies.json';
import weatherData from '../data/weather/weather.json';
import hazardsData from '../data/hazards/hazards.json';
import locationsData from '../data/locations/locations.json';

const enemies = enemiesData as Enemy[];
const weather = weatherData as WeatherEntry[];
const hazards = hazardsData as Hazard[];
const locations = locationsData as Location[];

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

export function pickEnemyForLocation(location: Location): Enemy | null {
  if (!chance(40 + location.danger * 8)) return null;
  const dangerCap: Rarity = location.danger >= 4 ? 'Legendary' : location.danger >= 3 ? 'Rare' : location.danger >= 2 ? 'Uncommon' : 'Common';
  const allowed = enemies.filter((e) => rarityRank(e.rarity) <= rarityRank(dangerCap));
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
  return locations.find((l) => l.id === id) ?? locations[0]!;
}
