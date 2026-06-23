// OTA-790 — climbing slowly grows the stamina POOL. Every CLIMB_STAMINA_STEP
// cleared tiers crosses a milestone that bumps staminaMax (+ current stamina) by 1.
// The store handler increments milestones.climbTiersCleared per cleared tier and
// calls climbGrowsStamina(newCount); this locks the cadence.

import { climbGrowsStamina, CLIMB_STAMINA_STEP } from '../app/engine/statTraining';

describe('OTA-790 — climb → stamina-pool growth cadence', () => {
  it('a slight uptick: grows once every CLIMB_STAMINA_STEP tiers', () => {
    expect(CLIMB_STAMINA_STEP).toBeGreaterThan(1); // not every single tier
    const grows: number[] = [];
    for (let tier = 1; tier <= CLIMB_STAMINA_STEP * 3; tier++) {
      if (climbGrowsStamina(tier)) grows.push(tier);
    }
    // Exactly one growth at each multiple of the step across 3 cycles.
    expect(grows).toEqual([CLIMB_STAMINA_STEP, CLIMB_STAMINA_STEP * 2, CLIMB_STAMINA_STEP * 3]);
  });

  it('never grows at tier 0 or between milestones', () => {
    expect(climbGrowsStamina(0)).toBe(false);
    expect(climbGrowsStamina(1)).toBe(false);
    expect(climbGrowsStamina(CLIMB_STAMINA_STEP - 1)).toBe(false);
    expect(climbGrowsStamina(CLIMB_STAMINA_STEP)).toBe(true);
    expect(climbGrowsStamina(CLIMB_STAMINA_STEP + 1)).toBe(false);
  });

  it('models the running tier counter: N tiers → floor(N/step) stamina points', () => {
    let staminaMax = 12;
    for (let tier = 1; tier <= 12; tier++) {
      if (climbGrowsStamina(tier)) staminaMax += 1;
    }
    expect(staminaMax).toBe(12 + Math.floor(12 / CLIMB_STAMINA_STEP));
  });
});
