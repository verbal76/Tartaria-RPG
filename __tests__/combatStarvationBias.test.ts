// OTA-218 — verifies the combat-starvation bias in
// pickWastelandEncounter. Player log showed many travel steps + tons
// of investigates with only 1-3 combats firing across an entire
// session. The new stepsSinceCombat counter multiplies skirmish +
// mini_dungeon weights so a long peaceful stretch pulls combat back
// into the rotation.

import { pickWastelandEncounter } from '../app/engine/wastelandEncounters';
import type { Location } from '../app/engine/types';

const location: Location = {
  id: 'test',
  name: 'Mud Seas',
  // Tags that match a wide range of archetypes so the picker has both
  // combat (skirmish/mini_dungeon) and non-combat (treasure/npc)
  // candidates in the eligible pool.
  tags: ['mud', 'outskirts', 'open', 'borderlands', 'surface', 'buried'],
  description: 'X',
  exits: {},
};

function tally(trials: number, stepsSinceCombat: number) {
  // Deterministic-ish RNG sequence so the test isn't flaky.
  let seed = 42 + stepsSinceCombat * 1009;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const counts = { treasure: 0, skirmish: 0, mini_dungeon: 0, npc: 0, fusion_bench: 0 };
  for (let i = 0; i < trials; i++) {
    const enc = pickWastelandEncounter(location, {
      stepsSinceLastEncounter: 99,
      threshold: 1,
      rollChance: 1,
      rng,
      stepsSinceCombat,
    });
    if (enc) counts[enc.type]++;
  }
  return counts;
}

describe('OTA-218 — combat-starvation bias in pickWastelandEncounter', () => {
  it('at stepsSinceCombat=0, combat share is the baseline', () => {
    const c = tally(2000, 0);
    const combatShare = (c.skirmish + c.mini_dungeon) / 2000;
    // No bias — combat is ~30-50% of pool based on author weights.
    expect(combatShare).toBeGreaterThan(0.20);
    expect(combatShare).toBeLessThan(0.75);
  });

  it('at stepsSinceCombat=5+, combat share increases significantly', () => {
    const baseline = tally(2000, 0);
    const starved = tally(2000, 5);
    const baselineCombat = (baseline.skirmish + baseline.mini_dungeon) / 2000;
    const starvedCombat = (starved.skirmish + starved.mini_dungeon) / 2000;
    expect(starvedCombat).toBeGreaterThan(baselineCombat);
    // Starved should be at least 10pp higher than baseline.
    expect(starvedCombat - baselineCombat).toBeGreaterThanOrEqual(0.10);
  });

  it('at stepsSinceCombat=3, combat share is between baseline and starved', () => {
    const baseline = tally(2000, 0);
    const mid = tally(2000, 3);
    const starved = tally(2000, 5);
    const b = (baseline.skirmish + baseline.mini_dungeon) / 2000;
    const m = (mid.skirmish + mid.mini_dungeon) / 2000;
    const s = (starved.skirmish + starved.mini_dungeon) / 2000;
    // mid should sit roughly between b and s.
    expect(m).toBeGreaterThan(b - 0.05);
    expect(m).toBeLessThan(s + 0.05);
  });

  it('treasure share decreases when combat is starved (it has to come from somewhere)', () => {
    const baseline = tally(2000, 0);
    const starved = tally(2000, 5);
    const baselineTreasure = baseline.treasure / 2000;
    const starvedTreasure = starved.treasure / 2000;
    // Treasure share should be smaller under starvation.
    expect(starvedTreasure).toBeLessThanOrEqual(baselineTreasure);
  });
});
