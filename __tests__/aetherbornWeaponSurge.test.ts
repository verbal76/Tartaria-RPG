import { buildCombatSteps } from '../app/engine/combatRules';
import type { PlayerCharacter, Enemy } from '../app/engine/types';

// arb-fix — Aetherborn "Destiny Unfolding": an equipped Aetheric weapon adds
// an extra 1d6 to every hit. Built into buildCombatSteps' damage step.
function makePlayer(raceId: string, weaponDamageType: 'aetheric' | 'slashing'): PlayerCharacter {
  return {
    raceId,
    stats: { strength: 12, dexterity: 12, intelligence: 12, wisdom: 12, charisma: 12 },
    ac: 12,
    equipped: { main: 'Test Blade' },
    inventory: [
      {
        name: 'Test Blade',
        kind: 'weapon',
        uniqueStats: {
          kind: 'weapon',
          damageDice: '1d8',
          damageType: weaponDamageType,
          scalesWith: 'strength',
          rarity: 'Uncommon',
          durability: { current: 50, max: 50 },
        },
      },
    ],
  } as unknown as PlayerCharacter;
}

const enemy: Enemy = { name: 'mud wretch', hp: 10, ac: 10 } as unknown as Enemy;

function damageStep(p: PlayerCharacter) {
  return buildCombatSteps('attack the mud wretch', p, enemy).find((s) => s.id === 'damage')!;
}

describe('Aetherborn Aetheric-weapon surge (+1d6)', () => {
  it('adds a labeled +1d6 when an Aetherborn wields an Aetheric weapon', () => {
    const step = damageStep(makePlayer('aetherborn', 'aetheric'));
    expect(step.bonus).toBeGreaterThanOrEqual(1); // 1d6 → at least 1
    expect(step.bonus).toBeLessThanOrEqual(6);
    expect(step.bonusLabel).toContain('Aetheric surge');
  });

  it('does NOT fire for a non-Aetheric weapon', () => {
    const step = damageStep(makePlayer('aetherborn', 'slashing'));
    expect(step.bonus).toBe(0);
    expect(step.bonusLabel).not.toContain('Aetheric surge');
  });

  it('does NOT fire for a non-Aetherborn wielding an Aetheric weapon', () => {
    const step = damageStep(makePlayer('tartarian_giant', 'aetheric'));
    expect(step.bonus).toBe(0);
    expect(step.bonusLabel).not.toContain('Aetheric surge');
  });
});
