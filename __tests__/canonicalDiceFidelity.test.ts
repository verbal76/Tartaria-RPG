// P5 proof — dice fidelity.
//
// Proves test-utils/canonical/dice.ts's rollStepLikeProductionUI() reproduces
// app/components/DiceRoller.tsx's exact algorithm (handleRoll(), lines
// 99-107; the adv/dis keep-max/keep-min at lines 80-86) — NOT the base
// Walker's fiat "every die lands on 18, advantage/disadvantage ignored"
// (test-utils/playerWalker.ts's drainRolls(), Phase 2B finding W4).
//
// Run focused: npx jest __tests__/canonicalDiceFidelity.test.ts

import { rollStepLikeProductionUI } from '../test-utils/canonical/dice';
import { rollDie } from '../app/engine/rng';

describe('P5 proof — dice fidelity', () => {
  it('normal mode rolls exactly `count` dice of `sides` and returns them all, via the real rollDie', () => {
    const { rawValues, submitValues } = rollStepLikeProductionUI({ count: 3, sides: 6 });
    expect(rawValues).toHaveLength(3);
    expect(submitValues).toEqual(rawValues);
    for (const v of rawValues) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('does NOT hardcode every die to 18 (the base Walker\'s fiat, forbidden here) — d6 values stay in [1,6]', () => {
    for (let i = 0; i < 30; i++) {
      const { rawValues } = rollStepLikeProductionUI({ count: 1, sides: 6 });
      expect(rawValues[0]).not.toBe(18);
      expect(rawValues[0]).toBeGreaterThanOrEqual(1);
      expect(rawValues[0]).toBeLessThanOrEqual(6);
    }
  });

  it('advantage rolls exactly 2 dice regardless of `count` and keeps the MAX as the single submitted value', () => {
    const { rawValues, submitValues } = rollStepLikeProductionUI({ count: 4, sides: 20, rollMode: 'advantage' });
    expect(rawValues).toHaveLength(2);
    expect(submitValues).toEqual([Math.max(...rawValues)]);
  });

  it('disadvantage rolls exactly 2 dice regardless of `count` and keeps the MIN as the single submitted value', () => {
    const { rawValues, submitValues } = rollStepLikeProductionUI({ count: 4, sides: 20, rollMode: 'disadvantage' });
    expect(rawValues).toHaveLength(2);
    expect(submitValues).toEqual([Math.min(...rawValues)]);
  });

  it('is a real draw from whatever Math.random is installed (deterministic replay under a fixed seed)', () => {
    (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();
    const first = rollStepLikeProductionUI({ count: 5, sides: 20 }).rawValues;
    (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();
    const second = rollStepLikeProductionUI({ count: 5, sides: 20 }).rawValues;
    expect(second).toEqual(first);
  });

  it('rollStepLikeProductionUI(1 die) draws exactly one Math.random-backed value — matches a direct rollDie call under the same seed position', () => {
    (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();
    const direct = rollDie(12);
    (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();
    const viaHelper = rollStepLikeProductionUI({ count: 1, sides: 12 }).rawValues[0];
    expect(viaHelper).toBe(direct);
  });
});
