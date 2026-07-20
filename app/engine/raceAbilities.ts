// raceAbilities — the activatable, once-per-day race powers. arb-fix: the
// race traits' "Once per day, …" lines were flavor-only; this turns them into
// real abilities the player triggers from the ✦ ABILITY picker. The effects
// live in gameStore.useRaceAbility (they need get/set); this module is the
// registry + availability/cooldown logic.

import type { PlayerCharacter, Race, Faction, ActivatableAbility } from './types';
import { resolveTable, getEnergyName, getEnergyMaterial, getEnergyAdjective } from './contentPack';
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';

export interface RaceAbilityDef {
  id: string;
  raceId: string;
  name: string;
  /** Honest, present-tense description of the REAL effect (what the engine does). */
  description: string;
  /** Daily cooldown for v1 (resets when the in-game day advances). */
  cooldown: 'day';
  /** Needs a live enemy (e.g. the elemental strike). */
  combatOnly?: boolean;
}

/** The unified shape the ability picker + executor consume: a built-in race ability
 *  (no `effect` — runs the legacy hard-coded path) OR a data-driven race/faction
 *  ability (carries an `effect` the executor dispatches on). */
export type OwnedAbility = {
  id: string;
  name: string;
  description: string;
  cooldown?: 'day';
  combatOnly?: boolean;
  effect?: ActivatableAbility['effect'];
  source: 'race' | 'faction';
};

export const RACE_ABILITIES: RaceAbilityDef[] = [
  {
    id: 'legacy_of_power',
    raceId: 'tartarian_giant',
    name: 'Legacy of Power',
    description: `Channel ${getEnergyName()} — either fully repairs your most-worn gear, empowers you (+2 STR/3 rounds), or triggers an unexpected surge (a heal, a windfall, or a spike of corruption).`,
    cooldown: 'day',
  },
  {
    id: 'defensive_protocols',
    raceId: 'architectural_sentinel',
    name: 'Defensive Protocols',
    description: `Raise an ${getEnergyAdjective()} shield — halves all incoming damage for 3 rounds.`,
    cooldown: 'day',
  },
  {
    id: 'regenerative_core',
    raceId: 'mud_golem',
    name: 'Regenerative Core',
    description: `Draw on nearby ${getEnergyMaterial()} — recharge 1d10 HP.`,
    cooldown: 'day',
  },
  {
    id: 'elemental_control',
    raceId: 'mud_golem',
    name: 'Elemental Control — Strike',
    description: `Hurl shaped ${getEnergyMaterial()} at your foe — 1d6 aetheric damage.`,
    cooldown: 'day',
    combatOnly: true,
  },
  {
    id: 'elemental_ward',
    raceId: 'mud_golem',
    name: 'Elemental Control — Ward',
    description: `Shape ${getEnergyMaterial()} into a ward — soaks the next 1d6 incoming damage before it reaches you.`,
    cooldown: 'day',
    combatOnly: true,
  },
  {
    id: 'latent_powers',
    raceId: 'aetherborn',
    name: 'Latent Powers',
    description: `Surge of ${getEnergyAdjective()} energy — +2 Strength for 3 rounds.`,
    cooldown: 'day',
  },
  {
    id: 'noble_heritage',
    raceId: 'aetherborn',
    name: 'Noble Heritage',
    description: `${getEnergyAdjective()} presence — +3 Charisma for 3 rounds (persuasion / intimidation).`,
    cooldown: 'day',
  },
  {
    id: 'beginners_luck',
    raceId: 'unknowing_mass',
    name: "Beginner's Luck",
    description: 'Bank your luck — the next difficulty roll you FAIL today (survival, combat, or relic) is rolled again, keeping the better result.',
    cooldown: 'day',
  },
];

export function currentDayOf(player: PlayerCharacter): number {
  return Math.floor((player.hoursElapsed ?? 0) / 24) + 1;
}

/** A daily ability is ready when it hasn't been used yet TODAY. */
export function isAbilityReady(player: PlayerCharacter, def: { id: string }): boolean {
  const used = player.abilityCooldowns?.[def.id];
  return used === undefined || used < currentDayOf(player);
}

const RACES = racesData as Race[];
const FACTIONS = factionsData as Faction[];

/** Abilities the player owns: the author's data-driven abilities on their resolved
 *  RACE row + FACTION row, PLUS the built-in race abilities (for the built-in
 *  Tartaria races). De-duped by id (data-driven wins). A re-skin's custom races /
 *  factions carry their own `abilities` and drive everything. */
export function ownedRaceAbilities(player: PlayerCharacter | null | undefined): OwnedAbility[] {
  if (!player) return [];
  const out: OwnedAbility[] = [];
  const seen = new Set<string>();
  const push = (a: OwnedAbility) => { if (!seen.has(a.id)) { seen.add(a.id); out.push(a); } };
  const race = (resolveTable('races', RACES) as Race[]).find((r) => r.id === player.raceId);
  for (const a of race?.abilities ?? []) push({ id: a.id, name: a.name, description: a.description, cooldown: a.cooldown ?? 'day', combatOnly: a.combatOnly, effect: a.effect, source: 'race' });
  const faction = (resolveTable('factions', FACTIONS) as Faction[]).find((f) => f.id === player.factionId);
  for (const a of faction?.abilities ?? []) push({ id: a.id, name: a.name, description: a.description, cooldown: a.cooldown ?? 'day', combatOnly: a.combatOnly, effect: a.effect, source: 'faction' });
  // Built-in race abilities (legacy, no `effect` → run the hard-coded path).
  for (const d of RACE_ABILITIES.filter((d) => d.raceId === player.raceId)) {
    push({ id: d.id, name: d.name, description: d.description, cooldown: d.cooldown, combatOnly: d.combatOnly, source: 'race' });
  }
  return out;
}

/** Abilities usable RIGHT NOW (owned, off cooldown, combat-gate satisfied). */
export function availableRaceAbilities(
  player: PlayerCharacter | null | undefined,
  inCombat: boolean,
): OwnedAbility[] {
  if (!player) return [];
  return ownedRaceAbilities(player).filter(
    (d) => isAbilityReady(player, d) && (!d.combatOnly || inCombat),
  );
}
