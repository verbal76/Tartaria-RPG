import { knocksOutHumanoid, knockoutThreshold, isSubduable } from '../app/engine/knockout';

// OTA-361 — knockout threshold. The cumulative damage of ONE attack
// (weapon + coating + every bonus, already summed by the caller) must
// be STRICTLY more than half a HUMANOID's max HP, and the blow must be
// non-lethal (they survive it). "One hit point more than half."

describe('knockoutThreshold — strictly more than half', () => {
  it('25 HP → 13 (the player\'s own example)', () => {
    expect(knockoutThreshold(25)).toBe(13);
  });
  it('24 HP → 13 (more than half of 24 is >12, i.e. 13 — not 12)', () => {
    expect(knockoutThreshold(24)).toBe(13);
  });
  it('1 HP → 1', () => {
    expect(knockoutThreshold(1)).toBe(1);
  });
});

describe('isSubduable — humanoids only', () => {
  it('Human is subduable; beasts / automata / undead are not', () => {
    expect(isSubduable('Human')).toBe(true);
    expect(isSubduable('human')).toBe(true);
    expect(isSubduable('Mud Creature')).toBe(false);
    expect(isSubduable('Automation')).toBe(false);
    expect(isSubduable('Etheric Undead')).toBe(false);
    expect(isSubduable(undefined)).toBe(false);
  });
});

describe('knocksOutHumanoid', () => {
  const base = { enemyType: 'Human', maxHp: 25 };

  it('exactly half does NOT knock out (must be strictly more)', () => {
    // 24-HP foe, blow of 12 = exactly half → no KO.
    expect(knocksOutHumanoid({ enemyType: 'Human', maxHp: 24, blowDamage: 12, resultingHp: 12 })).toBe(false);
    // 13 = one more than half → KO.
    expect(knocksOutHumanoid({ enemyType: 'Human', maxHp: 24, blowDamage: 13, resultingHp: 11 })).toBe(true);
  });

  it('the 13-on-25 example knocks out', () => {
    expect(knocksOutHumanoid({ ...base, blowDamage: 13, resultingHp: 12 })).toBe(true);
  });

  it('12 on a 25-HP foe does NOT (12 < 12.5)', () => {
    expect(knocksOutHumanoid({ ...base, blowDamage: 12, resultingHp: 13 })).toBe(false);
  });

  it('cumulative damage counts: weapon 10 + coating 4 = 14 > 12.5 → KO', () => {
    // The caller sums the blow; the helper just sees the total.
    const weapon = 10, coating = 4, bonus = 0;
    const blow = weapon + coating + bonus;
    expect(knocksOutHumanoid({ ...base, blowDamage: blow, resultingHp: 25 - blow })).toBe(true);
  });

  it('a LETHAL blow kills instead of knocking out (resultingHp <= 0)', () => {
    expect(knocksOutHumanoid({ ...base, blowDamage: 30, resultingHp: 0 })).toBe(false);
    expect(knocksOutHumanoid({ ...base, blowDamage: 26, resultingHp: -1 })).toBe(false);
  });

  it('non-humanoids are never knocked out, even by a huge non-lethal blow', () => {
    expect(knocksOutHumanoid({ enemyType: 'Mud Creature', maxHp: 25, blowDamage: 20, resultingHp: 5 })).toBe(false);
  });

  it('an already-knocked-out enemy does not re-trigger', () => {
    expect(knocksOutHumanoid({ ...base, blowDamage: 20, resultingHp: 5, alreadyKnockedOut: true })).toBe(false);
  });
});
