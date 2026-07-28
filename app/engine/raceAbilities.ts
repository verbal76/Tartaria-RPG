// raceAbilities — the activatable, once-per-day race powers. arb-fix: the
// race traits' "Once per day, …" lines were flavor-only; this turns them into
// real abilities the player triggers from the ✦ ABILITY picker. The effects
// live in gameStore.useRaceAbility (they need get/set); this module is the
// registry + availability/cooldown logic.

import type { PlayerCharacter } from './types';

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

export const RACE_ABILITIES: RaceAbilityDef[] = [
  {
    id: 'legacy_of_power',
    raceId: 'tartarian_giant',
    name: 'Legacy of Power',
    description: 'Channel Aether — either fully repairs your most-worn gear, empowers you (+2 STR/3 rounds), or triggers an unexpected surge (a heal, a windfall, or a spike of corruption).',
    cooldown: 'day',
  },
  {
    id: 'defensive_protocols',
    raceId: 'architectural_sentinel',
    name: 'Defensive Protocols',
    description: 'Raise an Aetheric shield — halves all incoming damage for 3 rounds.',
    cooldown: 'day',
  },
  {
    id: 'regenerative_core',
    raceId: 'mud_golem',
    name: 'Regenerative Core',
    description: 'Draw on nearby Aetherstone — recharge 1d10 HP.',
    cooldown: 'day',
  },
  {
    id: 'elemental_control',
    raceId: 'mud_golem',
    name: 'Elemental Control — Strike',
    description: 'Hurl shaped Aetherstone at your foe — 1d6 aetheric damage.',
    cooldown: 'day',
    combatOnly: true,
  },
  {
    id: 'elemental_ward',
    raceId: 'mud_golem',
    name: 'Elemental Control — Ward',
    description: 'Shape Aetherstone into a ward — soaks the next 1d6 incoming damage before it reaches you.',
    cooldown: 'day',
    combatOnly: true,
  },
  {
    id: 'latent_powers',
    raceId: 'aetherborn',
    name: 'Latent Powers',
    description: 'Surge of Aetheric energy — +2 Strength for 3 rounds.',
    cooldown: 'day',
  },
  {
    id: 'noble_heritage',
    raceId: 'aetherborn',
    name: 'Noble Heritage',
    description: 'Aetheric presence — +3 Charisma for 3 rounds (persuasion / intimidation).',
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
export function isAbilityReady(player: PlayerCharacter, def: RaceAbilityDef): boolean {
  const used = player.abilityCooldowns?.[def.id];
  return used === undefined || used < currentDayOf(player);
}

/** Race abilities the player owns. */
export function ownedRaceAbilities(player: PlayerCharacter | null | undefined): RaceAbilityDef[] {
  if (!player) return [];
  return RACE_ABILITIES.filter((d) => d.raceId === player.raceId);
}

/** Race abilities usable RIGHT NOW (owned, off cooldown, combat-gate satisfied). */
export function availableRaceAbilities(
  player: PlayerCharacter | null | undefined,
  inCombat: boolean,
): RaceAbilityDef[] {
  if (!player) return [];
  return ownedRaceAbilities(player).filter(
    (d) => isAbilityReady(player, d) && (!d.combatOnly || inCombat),
  );
}
