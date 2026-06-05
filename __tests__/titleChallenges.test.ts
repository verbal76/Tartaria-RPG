// Speaker / Warden content-review Tier-C trials (arb50). Covers the pure check
// math (nat-1/nat-20 rules, DC threshold) and the config that the store handler
// keys off: requirement kind (skill-gated Glyph-Key recovered free vs
// materials-gated Scrap Metal brought in) and the scout/attempt verb routing.

import {
  TITLE_CHALLENGES,
  challengeForLocation,
  rollCheck,
} from '../app/engine/titleChallenges';

describe('rollCheck (d20 + stat vs DC)', () => {
  const rngOf = (r: number) => () => (r - 1) / 20; // forces roll === r

  it('passes when total meets DC', () => {
    const res = rollCheck(6, 15, rngOf(10)); // 10 + 6 = 16 >= 15
    expect(res.roll).toBe(10);
    expect(res.total).toBe(16);
    expect(res.success).toBe(true);
  });

  it('fails when total is under DC', () => {
    const res = rollCheck(2, 16, rngOf(10)); // 12 < 16
    expect(res.success).toBe(false);
  });

  it('natural 20 always succeeds, natural 1 always fails', () => {
    expect(rollCheck(0, 99, rngOf(20)).success).toBe(true);
    expect(rollCheck(50, 5, rngOf(1)).success).toBe(false);
  });
});

describe('TITLE_CHALLENGES config', () => {
  it('Speaker is skill-gated: Glyph-Key recovered on scout, not consumed', () => {
    const s = TITLE_CHALLENGES.tongue_of_the_red_tower!;
    expect(s.locationId).toBe('red_tower_of_nimari');
    expect(s.counter).toBe('languageLearned');
    expect(s.requirement.itemName).toBe('Red Tower Glyph-Key');
    expect(s.requirement.recoverOnScout).toBe(true);
    expect(s.requirement.consumeOnAttempt).toBe(false);
    expect(s.check.stat).toBe('intelligence');
  });

  it('Warden is materials-gated: 3x Scrap Metal brought + consumed', () => {
    const w = TITLE_CHALLENGES.warden_of_the_cathedral!;
    expect(w.locationId).toBe('sinking_cathedral');
    expect(w.counter).toBe('relicsPreserved');
    expect(w.requirement.itemName).toBe('Scrap Metal');
    expect(w.requirement.quantity).toBe(3);
    expect(w.requirement.recoverOnScout).toBe(false);
    expect(w.requirement.consumeOnAttempt).toBe(true);
  });

  it('challengeForLocation maps tiles to their challenge (and nothing elsewhere)', () => {
    expect(challengeForLocation('red_tower_of_nimari')?.id).toBe('tongue_of_the_red_tower');
    expect(challengeForLocation('sinking_cathedral')?.id).toBe('warden_of_the_cathedral');
    expect(challengeForLocation('tartarian_outskirts')).toBeNull();
  });

  it('scout vs attempt verbs route as designed', () => {
    const s = TITLE_CHALLENGES.tongue_of_the_red_tower!;
    expect(s.scoutVerb.test('examine the runes')).toBe(true);
    expect(s.attemptVerb.test('decipher the runes')).toBe(true);
    // scouting must not match the committing verb
    expect(s.attemptVerb.test('examine the runes')).toBe(false);

    const w = TITLE_CHALLENGES.warden_of_the_cathedral!;
    expect(w.scoutVerb.test('inspect the cathedral')).toBe(true);
    expect(w.attemptVerb.test('stabilize the cathedral')).toBe(true);
    expect(w.attemptVerb.test('inspect the cathedral')).toBe(false);
  });
});
