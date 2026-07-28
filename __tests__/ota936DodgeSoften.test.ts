// OTA-936 — dodge de-trap. The pure, unit-testable piece is the new 'evasive' status
// (successful-dodge group defense): +3 AC, stacking with the rest of the AC-status math.
import { statusAcAdjustment } from '../app/engine/statusEffects';
import type { StatusEffect } from '../app/engine/types';

const fx = (kind: StatusEffect['kind'], rounds = 1): StatusEffect => ({ kind, remainingRounds: rounds, label: kind });

describe('OTA-936 — evasive (successful-dodge group defense)', () => {
  it('evasive adds +3 AC while active', () => {
    expect(statusAcAdjustment([fx('evasive')])).toBe(3);
  });
  it('an expired evasive contributes nothing', () => {
    expect(statusAcAdjustment([fx('evasive', 0)])).toBe(0);
  });
  it('stacks with other AC statuses (evasive +3, armor_severed -2 => +1)', () => {
    expect(statusAcAdjustment([fx('evasive'), fx('armor_severed')])).toBe(1);
  });
  it('no evasive => no bonus', () => {
    expect(statusAcAdjustment([fx('tired')])).toBe(0);
  });
});
