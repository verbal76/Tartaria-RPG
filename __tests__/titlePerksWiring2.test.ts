import { buildSkillSteps } from '../app/engine/combatRules';
import type { PlayerCharacter } from '../app/engine/types';

// arb-fix — second title-wiring pass: machineSpeech (Speaker) adds +2 to relic
// investigation. Other perks (golemEdge, ethericSurge, ruinsDefenseBonus,
// pathfinder) are exercised at their own engine sites; this locks the skill one.
function player(titles: string[]): PlayerCharacter {
  return {
    raceId: 'human_drifter',
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    earnedTitles: titles,
  } as PlayerCharacter;
}

function investigateBonus(p: PlayerCharacter, relicTarget: boolean): number {
  const step = buildSkillSteps('investigate', p, { raceCtx: { relicTarget } })[0]!;
  return step.bonus - 10; // strip WIS base
}

describe('Speaker title — machineSpeech relic-investigation bonus', () => {
  it('adds +2 ONLY when investigating a relic/machine target', () => {
    const speaker = player(['speaker_of_forgotten_tongues']);
    expect(investigateBonus(speaker, true)).toBe(2);
    expect(investigateBonus(speaker, false)).toBe(0); // not a relic → no Speaker bonus
  });

  it('does nothing without the title', () => {
    expect(investigateBonus(player([]), true)).toBe(0);
  });
});
