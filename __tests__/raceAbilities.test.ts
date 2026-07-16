import {
  RACE_ABILITIES,
  currentDayOf,
  isAbilityReady,
  availableRaceAbilities,
  ownedRaceAbilities,
} from '../app/engine/raceAbilities';
import type { PlayerCharacter } from '../app/engine/types';

function player(over: Partial<PlayerCharacter>): PlayerCharacter {
  return { raceId: 'aetherborn', hoursElapsed: 0, ...over } as PlayerCharacter;
}

describe('race abilities — registry + cooldown logic', () => {
  it('every ability maps to a real race id', () => {
    const races = new Set(RACE_ABILITIES.map((a) => a.raceId));
    for (const r of races) {
      expect(['tartarian_giant', 'architectural_sentinel', 'mud_golem', 'aetherborn', 'unknowing_mass']).toContain(r);
    }
  });

  it('ownedRaceAbilities returns the player race abilities', () => {
    const owned = ownedRaceAbilities(player({ raceId: 'mud_golem' }));
    const ids = owned.map((a) => a.id);
    // engine_Dev — OwnedAbility is the merged (race + faction + built-in) shape and
    // carries no `raceId` field (a re-skin's data-driven abilities own that), so we
    // assert on the built-in Mud-Golem ability ids instead of a raceId equality.
    // OTA-835 — Elemental Control gained its defensive half (elemental_ward): the
    // Mud Golem now owns Regenerative Core + Elemental Control (Strike) + (Ward).
    expect(ids).toEqual(expect.arrayContaining(['regenerative_core', 'elemental_control', 'elemental_ward']));
  });

  it('day rolls over at 24 in-game hours', () => {
    expect(currentDayOf(player({ hoursElapsed: 0 }))).toBe(1);
    expect(currentDayOf(player({ hoursElapsed: 23 }))).toBe(1);
    expect(currentDayOf(player({ hoursElapsed: 24 }))).toBe(2);
  });

  it('a used ability is on cooldown until the next day', () => {
    const def = RACE_ABILITIES.find((a) => a.id === 'latent_powers')!;
    const p1 = player({ hoursElapsed: 5, abilityCooldowns: { latent_powers: 1 } });
    expect(isAbilityReady(p1, def)).toBe(false); // used today (day 1)
    const p2 = player({ hoursElapsed: 30, abilityCooldowns: { latent_powers: 1 } });
    expect(isAbilityReady(p2, def)).toBe(true); // now day 2 → ready
    const fresh = player({ hoursElapsed: 5 });
    expect(isAbilityReady(fresh, def)).toBe(true); // never used → ready
  });

  it('combat-only abilities are hidden out of combat', () => {
    const golem = player({ raceId: 'mud_golem', hoursElapsed: 0 });
    const inPeace = availableRaceAbilities(golem, false).map((a) => a.id);
    const inFight = availableRaceAbilities(golem, true).map((a) => a.id);
    expect(inPeace).toContain('regenerative_core');
    expect(inPeace).not.toContain('elemental_control'); // combatOnly
    expect(inFight).toContain('elemental_control');
  });
});
