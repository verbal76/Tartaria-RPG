import { aggregateEquippedStatBonuses, armorHpBonus } from '../app/engine/equipment';
import type { PlayerCharacter } from '../app/engine/types';

// arb-fix — every base-stat bonus on a multi-stat armor piece now applies,
// not just the primary `statBonus`. The `hp` and non-attribute flavor stats
// (constitution / acrobatics / stealth / investigation / aetheria, which have
// no PlayerCharacter field) are NOT folded into the 5 base stats here.
function playerWith(headPiece: string): PlayerCharacter {
  return { equipped: { head: headPiece } } as unknown as PlayerCharacter;
}

describe('multi-stat armor applies ALL base stats', () => {
  it("Aether-Seeker's Cap grants BOTH INT+2 and CHA+1", () => {
    const b = aggregateEquippedStatBonuses(playerWith("Aether-Seeker's Cap"));
    expect(b.intelligence).toBe(2);
    expect(b.charisma).toBe(1);
  });

  it("Golem-Wielder's Helm grants INT+2 (base) but NOT constitution/hp (non-base)", () => {
    const b = aggregateEquippedStatBonuses(playerWith("Golem-Wielder's Helm"));
    expect(b.intelligence).toBe(2);
    // constitution + hp are not PlayerCharacter base stats → not in the result.
    expect((b as Record<string, number>).constitution).toBeUndefined();
    expect((b as Record<string, number>).hp).toBeUndefined();
    // hp is applied separately, to hpMax.
    expect(armorHpBonus("Golem-Wielder's Helm")).toBe(10);
  });

  it('empty equip yields no bonuses', () => {
    expect(aggregateEquippedStatBonuses({ equipped: {} } as unknown as PlayerCharacter)).toEqual({});
  });
});
