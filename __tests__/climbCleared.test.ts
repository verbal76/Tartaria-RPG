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

    // OTA-086 — fuzzy substring match between the chip noun and
    // the marker noun. The engine's climb handler writes the
    // marker under climbTarget, which can resolve to a SHORT
    // form ('spire') via the parser's resolvedNoun fallback,
    // while the modal calls maxClimbedTier with the FULL chip
    // text ('zharak\'s teeth spire'). Pre-OTA-086 the exact
    // prefix check missed the marker and isClimbCleared
    // returned false — the chip stayed actionable, the player
    // tapped it, the engine refused, repeat-tap loop.
    describe('OTA-086 fuzzy marker-noun match', () => {
      it('chip noun (full) matches marker keyed on short form (substring)', () => {
        // The playtest case verbatim: marker 'climbed:spire:t4',
        // chip 'zharak\'s teeth spire'. Marker noun 'spire' is
        // a substring of the chip noun → match.
        const marks = [
          'climbed:spire:t1',
          'climbed:spire:t2',
          'climbed:spire:t3',
          'climbed:spire:t4',
        ];
        expect(maxClimbedTier("zharak's teeth spire", marks)).toBe(4);
        expect(isClimbCleared("zharak's teeth spire", marks)).toBe(true);
      });

      it('chip noun (short) matches marker keyed on full form (substring reverse)', () => {
        // Inverse: marker uses the full noun, chip is the short
        // form. Less likely in practice but symmetric.
        const marks = ["climbed:zharak's teeth spire:t4"];
        expect(maxClimbedTier('spire', marks)).toBe(4);
        expect(isClimbCleared('spire', marks)).toBe(true);
      });

      it('non-overlapping nouns do NOT match (no false positives)', () => {
        // 'wall' and 'tower' share no substring relation. Marker
        // on one must not falsely satisfy the other.
        expect(maxClimbedTier('wall', ['climbed:tower:t4'])).toBe(0);
        expect(isClimbCleared('wall', ['climbed:tower:t4'])).toBe(false);
      });

      it('multi-colon noun (defensive) still parses', () => {
        // Pathological: noun itself contains a colon. Marker
        // becomes 'climbed:foo:bar:t2' (4 parts). The slice
        // logic should still extract 'foo:bar' as the noun and
        // 't2' as the tier.
        const marks = ['climbed:foo:bar:t2'];
        expect(maxClimbedTier('foo:bar', marks)).toBe(2);
      });

      it('cleared spire (4 tiers) drops climbableCount to 0', () => {
        // Smoke test of the full chain: a fully-cleared spire
        // chip should report cleared so the UI's filter
        // `isClimbable(n) && !isClimbCleared(n, marks)` excludes
        // it from climbableCount.
        const marks = ['climbed:spire:t4'];
        expect(climbHeightFor("zharak's teeth spire")).toBeGreaterThanOrEqual(1);
        expect(isClimbCleared("zharak's teeth spire", marks)).toBe(true);
      });
    });

    // OTA-608 — head-noun-anchored match. The OTA-086 bidirectional
    // `includes` let a generic head word match MID-PHRASE in a DIFFERENT
    // prop, so one climb's progress bled onto another (player: climbs
    // "skip stages", and investigating a different prop wrongly demands
    // "climb down"). The shorter form now only matches as a whole-word
    // SUFFIX (the head noun), so cross-prop contamination is gone while
    // the legit short<->full case still works.
    describe('OTA-608 no cross-prop contamination', () => {
      it('a "spire" marker does NOT advance a different "...spire capacitor"', () => {
        const marks = ['climbed:spire:t4'];
        // contains "spire" mid-phrase but IS a capacitor, not a spire
        expect(maxClimbedTier('grand spire capacitor', marks)).toBe(0);
        expect(maxClimbedTier('broken grand spire capacitor', marks)).toBe(0);
        expect(isClimbCleared('broken grand spire capacitor', marks)).toBe(false);
      });

      it('two distinct full prop names never cross-match', () => {
        const marks = ['climbed:shattered grand spire capacitor:t4'];
        expect(maxClimbedTier('broken grand spire capacitor', marks)).toBe(0);
      });

      it('still matches the legit short<->full head-noun forms (OTA-086 preserved)', () => {
        expect(maxClimbedTier("zharak's teeth spire", ['climbed:spire:t4'])).toBe(4);
        expect(maxClimbedTier('spire', ["climbed:zharak's teeth spire:t4"])).toBe(4);
      });

      it('"tower" marker does not advance "watchtower" (no partial-word match)', () => {
        expect(maxClimbedTier('ancient watchtower', ['climbed:tower:t4'])).toBe(0);
      });
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
