import { buildSkillSteps } from '../app/engine/combatRules';
import type { PlayerCharacter } from '../app/engine/types';

// arb-fix — context-matched race conditional skill bonuses. These only fire
// when the scene context matches the trait (relic/ancient target, ruins, etc.),
// NOT as flat always-on stat buffs.
function player(raceId: string): PlayerCharacter {
  return {
    raceId,
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  } as PlayerCharacter;
}

function investigateBonus(raceId: string, relicTarget: boolean): { bonus: number; label: string } {
  const step = buildSkillSteps('investigate', player(raceId), { raceCtx: { relicTarget } })[0]!;
  // strip the WIS base (wisdom 10) to isolate the perk delta
  return { bonus: step.bonus - 10, label: step.bonusLabel };
}

describe('race conditional skill bonuses — relic investigate', () => {
  it('Mud Dweller Relic Savvy gives +2 ONLY on a relic/tech target', () => {
    expect(investigateBonus('mud_dweller', true).bonus).toBe(2);
    expect(investigateBonus('mud_dweller', true).label).toContain('Relic Savvy');
    expect(investigateBonus('mud_dweller', false).bonus).toBe(0); // no relic → no bonus
  });

  it("Unknowing Masses Curious Mind gives +2 ONLY on a relic/secret target", () => {
    expect(investigateBonus('unknowing_mass', true).bonus).toBe(2);
    expect(investigateBonus('unknowing_mass', true).label).toContain('Curious Mind');
    expect(investigateBonus('unknowing_mass', false).bonus).toBe(0);
  });

  it('the earlier-wired races still fire (regression guard)', () => {
    expect(investigateBonus('tartarian_giant', true).bonus).toBe(1); // Ancient Insight
    expect(investigateBonus('aetherborn', true).bonus).toBe(2);      // Aetheric Awakening
    expect(investigateBonus('reclaimer', true).bonus).toBe(1);       // Ruins Specialist
  });
});
