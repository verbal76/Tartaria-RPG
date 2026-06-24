import { titlePerkModifiers } from '../app/engine/titles';
import type { PlayerCharacter } from '../app/engine/types';

// OTA-350 — a few thematically-fitting titles now grant a Stealth bonus, which
// flows into the stealth check via combatRules' titleSkillBonus (p.stealthBonus).

function withTitles(ids: string[]): PlayerCharacter {
  return { earnedTitles: ids } as unknown as PlayerCharacter;
}

describe('stealth-granting titles', () => {
  it('Shadow Diver grants +1 Stealth', () => {
    expect(titlePerkModifiers(withTitles(['shadow_diver'])).stealthBonus).toBe(1);
  });

  it('Wayfarer of the Lost Paths grants +1 Stealth (and keeps pathfinder)', () => {
    const p = titlePerkModifiers(withTitles(['wayfarer_of_the_lost_paths']));
    expect(p.stealthBonus).toBe(1);
    expect(p.pathfinder).toBe(true);
  });

  it('Etherbound Survivor grants +1 Stealth (and keeps its hazard save)', () => {
    const p = titlePerkModifiers(withTitles(['stormbound_survivor']));
    expect(p.stealthBonus).toBe(1);
    expect(p.envHazardSaveBonus).toBe(2);
  });

  it('the three stack to +3 Stealth when all earned', () => {
    const p = titlePerkModifiers(withTitles(['shadow_diver', 'wayfarer_of_the_lost_paths', 'stormbound_survivor']));
    expect(p.stealthBonus).toBe(3);
  });

  it('a non-stealth title grants no Stealth', () => {
    expect(titlePerkModifiers(withTitles(['relic_trader'])).stealthBonus).toBe(0);
  });
});
