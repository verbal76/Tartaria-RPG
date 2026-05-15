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

function rarityRank(r: Rarity): number {
  return r === 'Common' ? 0 : r === 'Uncommon' ? 1 : r === 'Rare' ? 2 : 3;
}

export function getLocationById(id: string): Location {
  return locations.find((l) => l.id === id) ?? locations[0]!;
}
