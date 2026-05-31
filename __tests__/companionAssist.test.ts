import { buildSkillSteps } from '../app/engine/combatRules';
import type { PlayerCharacter } from '../app/engine/types';

function makePlayer(over: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Test',
    raceId: 'mud_dweller',
    factionId: 'reclaimers_guild',
    stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5 },
    hp: 20,
    hpMax: 20,
    stamina: 8,
    staminaMax: 8,
    ac: 12,
    tc: 10,
    corruption: 0,
    inventory: [],
    factionStanding: [],
    currentLocationId: 'asgardar',
    activeQuests: [],
    ...over,
  } as PlayerCharacter;
}

// HANDOFF #13 followup — companion grants +2 on skill checks.

describe('buildSkillSteps — companionAssist bonus', () => {
  it('adds +2 to the skill check bonus when companion present', () => {
    const player = makePlayer();
    const baseline = buildSkillSteps('investigate', player)[0]!;
    const assisted = buildSkillSteps('investigate', player, { companionAssist: true })[0]!;
    expect(assisted.bonus).toBe(baseline.bonus + 2);
    expect(assisted.bonusLabel).toContain('companion assist');
  });

  it('no change when companionAssist false / undefined', () => {
    const player = makePlayer();
    const a = buildSkillSteps('investigate', player)[0]!;
    const b = buildSkillSteps('investigate', player, { companionAssist: false })[0]!;
    expect(b.bonus).toBe(a.bonus);
    expect(b.bonusLabel).not.toContain('companion');
  });

  it('stacks with weather modifiers', () => {
    const player = makePlayer();
    const both = buildSkillSteps('investigate', player, {
      weatherMod: { intelligence: 1 },
      companionAssist: true,
    })[0]!;
    // base INT 5 + weather +1 + companion +2 = +8 vs DC
    expect(both.bonus).toBe(8);
  });
});
