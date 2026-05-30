// OTA 046 — Regression for the cleared-climbable affordance.
// Once a player crests a climbable, the CLIMB modal still lists it
// but renders it dimmed with a "✓ TOP" suffix instead of the tier
// count. The cleared-state computation lives in engine/climbHeight
// (maxClimbedTier / isClimbCleared) so both the game-store climb
// handler and the modal-feeding screen read from one place.

import {
  climbHeightFor,
  maxClimbedTier,
  isClimbCleared,
} from '../app/engine/climbHeight';

describe('OTA 046 — climb-cleared marker lookup', () => {
  describe('maxClimbedTier', () => {
    it('returns 0 when no markers exist for the noun', () => {
      expect(maxClimbedTier('tower', [])).toBe(0);
      expect(maxClimbedTier('tower', ['climbed:wall:t1', 'climbed:cliff:t2'])).toBe(0);
    });

    it('returns the highest tier index across multiple markers', () => {
      const marks = ['climbed:tower:t1', 'climbed:tower:t3', 'climbed:tower:t2'];
      expect(maxClimbedTier('tower', marks)).toBe(3);
    });

    it('is case-insensitive on the noun', () => {
      expect(maxClimbedTier('Tower', ['climbed:tower:t2'])).toBe(2);
      expect(maxClimbedTier('CLIFF', ['climbed:cliff:t4'])).toBe(4);
    });

    it('ignores malformed markers (OTA 037 guard preserved)', () => {
      // No 't' prefix on tier segment, missing segment, garbage int.
      const marks = ['climbed:tower:abc', 'climbed:tower', 'climbed:tower:t2'];
      expect(maxClimbedTier('tower', marks)).toBe(2);
    });

    it('handles non-prefixed segment (OTA 033 fix — parseInt("t1") -> NaN)', () => {
      // Marker "climbed:tower:1" (no 't') should also parse to tier 1.
      expect(maxClimbedTier('tower', ['climbed:tower:1'])).toBe(1);
    });
  });

  describe('isClimbCleared', () => {
    it('true only when max-cleared meets the noun total tier count', () => {
      // tower = 4 tiers per CLIMB_HEIGHT.
      expect(climbHeightFor('tower')).toBe(4);
      expect(isClimbCleared('tower', ['climbed:tower:t3'])).toBe(false);
      expect(isClimbCleared('tower', ['climbed:tower:t4'])).toBe(true);
    });

    it('cliff (5 tiers) needs all 5 cleared', () => {
      expect(climbHeightFor('cliff')).toBe(5);
      expect(isClimbCleared('cliff', ['climbed:cliff:t4'])).toBe(false);
      expect(isClimbCleared('cliff', ['climbed:cliff:t5'])).toBe(true);
    });

    it('ledge (1 tier) flips to cleared after a single tap', () => {
      expect(climbHeightFor('ledge')).toBe(1);
      expect(isClimbCleared('ledge', [])).toBe(false);
      expect(isClimbCleared('ledge', ['climbed:ledge:t1'])).toBe(true);
    });

    it('false when no markers exist', () => {
      expect(isClimbCleared('tower', [])).toBe(false);
    });
  });
});
