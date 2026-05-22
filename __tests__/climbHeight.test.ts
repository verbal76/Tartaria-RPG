import { climbHeightFor, climbTierLabel, rollClimbTopLoot, CLIMB_TOP_LOOT } from '../app/engine/climbHeight';

describe('climb height table', () => {
  it('assigns variable tiers by noun keyword', () => {
    expect(climbHeightFor('ledge')).toBe(1);
    expect(climbHeightFor('stone wall')).toBe(2);
    expect(climbHeightFor('tall tower')).toBe(4);
    expect(climbHeightFor('cliff face')).toBe(5);
  });

  it('falls back to mid (2) for unfamiliar climbables', () => {
    expect(climbHeightFor('weird mud-stack')).toBe(2);
  });

  it('labels the top tier "top" and intermediate tiers progressively', () => {
    expect(climbTierLabel(4, 4)).toBe('top');
    expect(climbTierLabel(1, 4)).toBe('first hold');
    expect(climbTierLabel(3, 4)).toBe('last stretch');
    expect(climbTierLabel(2, 4)).toMatch(/tier 2\/4/);
  });

  it('rollClimbTopLoot returns null on low rolls, an item on high rolls', () => {
    const real = Math.random;
    // Impl: `if (Math.random() < 0.5) return null;` — so >=0.5 grants.
    Math.random = () => 0.6;
    try {
      const drop = rollClimbTopLoot();
      expect(drop).not.toBeNull();
      expect(CLIMB_TOP_LOOT.some((x) => x.name === drop!.name)).toBe(true);
    } finally {
      Math.random = real;
    }
    Math.random = () => 0.1;
    try {
      expect(rollClimbTopLoot()).toBeNull();
    } finally {
      Math.random = real;
    }
  });
});
