// OTA-609 — near-duplicate Arbiter-line suppression. Regression for a player
// report: a travel musing ("you the player have traveled far and wide") said
// 5-6 times. The exact-match dedup couldn't catch the model rephrasing the same
// thought; this pure helper does.

import { isRepetitiveArbiterLine } from '../app/engine/arbiterDedup';

describe('OTA-609 — isRepetitiveArbiterLine', () => {
  it('flags a reworded repeat sharing a content phrase ("far wide")', () => {
    const recent = ['You have traveled far and wide.'];
    expect(isRepetitiveArbiterLine('Far and wide you have come, traveler.', recent)).toBe(true);
    // verbatim repeat is obviously caught too
    expect(isRepetitiveArbiterLine('You have traveled far and wide.', recent)).toBe(true);
  });

  it('does NOT flag an unrelated line', () => {
    const recent = ['You have traveled far and wide.'];
    expect(isRepetitiveArbiterLine('The mud spirit rises from the silt, eyes open.', recent)).toBe(false);
    // "far" and "wide" present but NOT adjacent, and low overall overlap
    expect(isRepetitiveArbiterLine('The tower stands far above the wide plain.', recent)).toBe(false);
  });

  it('catches heavy whole-set overlap even without an identical adjacent pair', () => {
    const recent = ['The Aetherstone hums beneath the ruined skyscraper, patient and cold.'];
    // same content words, different order/connectors
    expect(
      isRepetitiveArbiterLine('Beneath the ruined skyscraper the cold Aetherstone hums, patient.', recent),
    ).toBe(true);
  });

  it('never flags very short lines (< 3 content words)', () => {
    expect(isRepetitiveArbiterLine('Your move.', ['Your move.'])).toBe(false);
    expect(isRepetitiveArbiterLine('Decide quickly.', ['Decide quickly. It already has.'])).toBe(false);
  });

  it('returns false against an empty history', () => {
    expect(isRepetitiveArbiterLine('You have traveled far and wide.', [])).toBe(false);
  });

  it('scans the whole recent window, not just the last line', () => {
    const recent = [
      'You have traveled far and wide.',
      'The fog whispers your name in old Tartarian.',
      'Rocky settles at your boot, breathing slow.',
    ];
    expect(isRepetitiveArbiterLine('Far and wide the road has carried you.', recent)).toBe(true);
  });
});
