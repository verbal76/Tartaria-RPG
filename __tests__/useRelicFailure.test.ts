import { USE_RELIC_FAILURE_LINES } from '../app/engine/narrativeGenerator';

describe('USE_RELIC_FAILURE_LINES', () => {
  it('has at least three variants so the line does not feel repetitive', () => {
    expect(USE_RELIC_FAILURE_LINES.length).toBeGreaterThanOrEqual(3);
  });

  // HANDOFF §5 #5: the old failure line ("The relic stutters. The connection
  // does not hold.") read as the relic outright rejecting the player, like
  // the device was broken. The fix is to frame every failure as the player's
  // fumble — they tried, it didn't take. None of these words may appear:
  const REJECTION_WORDS = [
    /\bfail(s|ed|ure)?\b/i,
    /\bbroken\b/i,
    /\brefuse(s|d)?\b/i,
    /\brejects?\b/i,
    /\bdoes\s+not\s+work\b/i,
    /\bdoesn'?t\s+work\b/i,
    /\bdead\b/i,
  ];

  it.each(REJECTION_WORDS.map((r) => [r.source]))(
    'no line contains rejection-framing language (%s)',
    (source) => {
      const re = new RegExp(source, 'i');
      for (const line of USE_RELIC_FAILURE_LINES) {
        expect(line).not.toMatch(re);
      }
    },
  );

  it('every line names the player as the actor (you / your)', () => {
    for (const line of USE_RELIC_FAILURE_LINES) {
      expect(line).toMatch(/\byou(r)?\b/i);
    }
  });

  it('every line ends with sentence-terminating punctuation', () => {
    for (const line of USE_RELIC_FAILURE_LINES) {
      expect(line).toMatch(/[.!?]"?$/);
    }
  });
});
