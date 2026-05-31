// OTA-120 Phase 4 — dog stat growth pacing. Mirrors the player per-tier
// costs from app/engine/statTraining.ts (1-5 advances fast ~33 uses,
// 6-10 ~50, 11-14 ~100, 15-18 ~200, 19-22 ~400, 23+ a real grind).
//
// Pure engine test — no React Native mocks needed (no gameStore).

import {
  createDogCompanion,
  trainDogStat,
} from '../app/engine/dogCompanion';

describe('OTA-120 — dog stat growth pacing', () => {
  function build() {
    return createDogCompanion({
      name: 'Marrow',
      breed: 'mutt',
      rawSex: 'boy',
      startingProfile: 'mongrel',
      currentHour: 0,
    });
  }

  it('starts a mongrel at the documented 10/10/10 baseline', () => {
    const dog = build();
    expect(dog.stats.strength).toBe(10);
    expect(dog.stats.dexterity).toBe(10);
    expect(dog.stats.intelligence).toBe(10);
    expect(dog.statProgress.strength).toBe(0);
    expect(dog.statProgress.dexterity).toBe(0);
    expect(dog.statProgress.intelligence).toBe(0);
  });

  it('does NOT train on failed checks', () => {
    let dog = build();
    for (let i = 0; i < 50; i++) {
      const r = trainDogStat(dog, 'strength', false);
      dog = r.dog;
    }
    expect(dog.statProgress.strength).toBe(0);
    expect(dog.stats.strength).toBe(10);
  });

  it('trains tier 6-10 in ~50 successful uses (award 2 per hit; needs 50)', () => {
    let dog = build();
    // Stat starts at 10 (tier 6-10 = award 2 per success → 50 hits = +1).
    const before = dog.stats.strength;
    for (let i = 0; i < 50; i++) {
      const r = trainDogStat(dog, 'strength', true);
      dog = r.dog;
    }
    expect(dog.stats.strength).toBe(before + 1);
    expect(dog.statProgress.strength).toBe(0);
  });

  it('trains tier 11-14 in ~100 successful uses (award 1 per hit; needs 100)', () => {
    let dog = build();
    // Push to STR 11 first.
    for (let i = 0; i < 50; i++) {
      const r = trainDogStat(dog, 'strength', true);
      dog = r.dog;
    }
    expect(dog.stats.strength).toBe(11);
    // 100 more should give exactly +1 (11→12).
    for (let i = 0; i < 100; i++) {
      const r = trainDogStat(dog, 'strength', true);
      dog = r.dog;
    }
    expect(dog.stats.strength).toBe(12);
  });

  it('plateaus at tier 23+ (award 0.1 per hit; 1000 hits = +1)', () => {
    let dog = build();
    // Shortcut: directly set stat to 23 by mutating, then call trainDogStat
    // 200 times. With award 0.1 we expect about 20 progress, NO stat
    // increase yet (need 100 progress for +1).
    dog = { ...dog, stats: { ...dog.stats, strength: 23 } };
    for (let i = 0; i < 200; i++) {
      const r = trainDogStat(dog, 'strength', true);
      dog = r.dog;
    }
    expect(dog.stats.strength).toBe(23);
    // Progress should be 20 (or very close — accumulator math).
    expect(dog.statProgress.strength).toBeGreaterThan(15);
    expect(dog.statProgress.strength).toBeLessThan(25);
  });

  it('200 mixed trainDogStat calls — assert tier costs match player rates roughly', () => {
    let dog = build();
    // Loop 200 times across all three stats; count level-ups.
    let levels = 0;
    for (let i = 0; i < 200; i++) {
      const stat = i % 3 === 0 ? 'strength' : i % 3 === 1 ? 'dexterity' : 'intelligence';
      const r = trainDogStat(dog, stat, true);
      dog = r.dog;
      if (r.leveled) levels += 1;
    }
    // At baseline 10/10/10, 200 distributed across 3 stats = ~66 hits per
    // stat → just past the tier-6-10 single-level mark. Expect ~3 level-
    // ups total (one per stat).
    expect(levels).toBeGreaterThanOrEqual(2);
    expect(levels).toBeLessThanOrEqual(5);
  });
});
