import type { Race, Faction, PlayerCharacter, Stats, FactionStanding } from './types';
import { rollDie, rollDice, rollFromNotation } from './rng';
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';

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
    equipped: {},
    ac: race.baseAC,
    tc: rollFromTCFormula(race.startingTCFormula),
    corruption: 0,
    inventory: [
      { id: 'aetheric_torch', name: 'Aetheric Torch', kind: 'relic', rarity: 'Common', quantity: 1, tags: ['light'], description: 'Reliable light. Faintly attracts Aether-drawn creatures.' },
      { id: 'rations', name: 'Trail Rations', kind: 'consumable', quantity: 3, tags: ['food'], description: 'Enough to keep you walking another day.' },
      { id: 'aether_locket', name: 'Aetheric Locket', kind: 'relic', rarity: 'Common', quantity: 1, tags: ['detection'], description: 'Hums when held close to a relic.' },
    ],
    factionStanding,
    currentLocationId: input.startingLocationId ?? 'tartarian_outskirts',
    activeQuests: [],
  };
}
