// OTA-790 — climbing slowly grows the stamina POOL. A very minute amount of
// progress accrues PER cleared tier (a slow burn); only when it crosses the
// threshold does staminaMax tick up by 1, rolling the overshoot over. The store
// handler calls growStaminaFromClimb(staminaMax, staminaProgress) per cleared
// tier; this locks the rate + the carry-over.

import {
  growStaminaFromClimb,
  CLIMB_STAMINA_AWARD,
  CLIMB_STAMINA_THRESHOLD,
} from '../app/engine/statTraining';

const TIERS_PER_POINT = CLIMB_STAMINA_THRESHOLD / CLIMB_STAMINA_AWARD;

describe('OTA-790 — climb → stamina-pool slow burn', () => {
  it('a SINGLE tier is a very minute uptick — no immediate staminaMax gain', () => {
    const r = growStaminaFromClimb(12, 0);
    expect(r.grew).toBe(false);
    expect(r.staminaMax).toBe(12);
    expect(r.staminaProgress).toBe(CLIMB_STAMINA_AWARD);
    // A slow burn: it must take many tiers, not a handful.
    expect(TIERS_PER_POINT).toBeGreaterThanOrEqual(20);
  });

  it('grows +1 staminaMax exactly once per threshold of accrued tiers', () => {
    let staminaMax = 12;
    let staminaProgress = 0;
    let grewCount = 0;
    for (let tier = 1; tier <= TIERS_PER_POINT * 2; tier++) {
      const r = growStaminaFromClimb(staminaMax, staminaProgress);
      staminaMax = r.staminaMax;
      staminaProgress = r.staminaProgress;
      if (r.grew) grewCount += 1;
    }
    expect(grewCount).toBe(2);
    expect(staminaMax).toBe(14);
  });

  it('rolls the overshoot over so nothing is lost across the boundary', () => {
    // One tier short of the threshold, then one more crosses it.
    const justBefore = CLIMB_STAMINA_THRESHOLD - 1; // e.g. 99
    const r = growStaminaFromClimb(12, justBefore);
    expect(r.grew).toBe(true);
    expect(r.staminaMax).toBe(13);
    // carried = (99 + award) - 100
    expect(r.staminaProgress).toBe(justBefore + CLIMB_STAMINA_AWARD - CLIMB_STAMINA_THRESHOLD);
  });

  it('treats a missing/legacy staminaProgress as 0', () => {
    const r = growStaminaFromClimb(12, undefined as unknown as number);
    expect(r.staminaProgress).toBe(CLIMB_STAMINA_AWARD);
  });
});
