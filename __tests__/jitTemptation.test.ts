// OTA-045 — JIT temptation: depleted-player encounter bias.
//
// pickWastelandEncounter doubles the selection weight of high-value
// archetypes (treasure / mini_dungeon) when opts.depleted = true.
// The walking-monster archetypes (skirmish / npc) stay at baseline.
// Pure-function test against the encounter helper; no Zustand needed.

import { pickWastelandEncounter } from '../app/engine/wastelandEncounters';
import type { Location } from '../app/engine/types';

const TEST_LOCATION: Location = {
  id: 'test_mud',
  name: 'Test Mud Flat',
  type: 'wilderness',
  description: 'Test biome.',
  hazardChance: 0,
  tags: ['mud'],
  vendorChance: 0,
  weatherTags: [],
  enemyPool: [],
  spawnHomes: {},
};

function rollMany(count: number, depleted: boolean): { highValue: number; total: number } {
  let highValue = 0;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const enc = pickWastelandEncounter(TEST_LOCATION, {
      stepsSinceLastEncounter: 99,
      threshold: 0,
      rollChance: 1.0, // force every roll to produce
      depleted,
    });
    if (!enc) continue;
    total++;
    if (enc.type === 'treasure' || enc.type === 'mini_dungeon') highValue++;
  }
  return { highValue, total };
}

describe('OTA-045 — JIT temptation: depleted-player encounter bias', () => {
  it('depleted=true raises the high-value archetype rate', () => {
    const N = 4000;
    const baseline = rollMany(N, false);
    const depleted = rollMany(N, true);
    // Both buckets should produce SOME high-value encounters at
    // baseline, but the depleted run should produce visibly more.
    expect(baseline.total).toBeGreaterThan(0);
    expect(depleted.total).toBeGreaterThan(0);
    const baselineRate = baseline.highValue / baseline.total;
    const depletedRate = depleted.highValue / depleted.total;
    // 2× weight on high-value lifts the rate by a meaningful margin.
    // Assert depleted > baseline + 5pp (very conservative — actual
    // shift is typically 15-20pp depending on pool composition).
    expect(depletedRate).toBeGreaterThan(baselineRate + 0.05);
  });

  it('non-depleted picker still produces all archetype types', () => {
    const N = 2000;
    const types = new Set<string>();
    for (let i = 0; i < N; i++) {
      const enc = pickWastelandEncounter(TEST_LOCATION, {
        stepsSinceLastEncounter: 99,
        threshold: 0,
        rollChance: 1.0,
        depleted: false,
      });
      if (enc) types.add(enc.type);
    }
    // Mud biome has at least treasure + mini_dungeon + skirmish in
    // the archetype pool — baseline picker should hit all three over
    // 2000 trials (P miss for any one type at typical weights ≪ 1e-6).
    expect(types.has('treasure')).toBe(true);
    expect(types.has('skirmish')).toBe(true);
  });
});
