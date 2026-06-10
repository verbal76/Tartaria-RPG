// OTA-432 — hook noun matching is word-boundary, not loose substring. The old
// `t.includes(n) || n.includes(t)` let a tiny fragment match a much longer noun,
// firing the wrong hook (e.g. an indoor "investigate the candle" snagging an
// outdoor "ridgeline" hook). These are pure unit tests on the matcher.

import { matchHookNoun, matchAnyHookNoun } from '../app/engine/hooks';
import type { Hook } from '../app/engine/types';

function hook(nouns: string[], resolved = false): Hook {
  return { nouns, resolved } as unknown as Hook;
}

describe('OTA-432 — word-boundary hook noun matching', () => {
  it('matches a whole-word target', () => {
    const h = hook(['smoke', 'plume']);
    expect(matchHookNoun('sneak up to the smoke', [h])).toBe(h);
  });

  it('matches a helpful word prefix (>=4 chars): stone -> stonework', () => {
    const h = hook(['stonework']);
    expect(matchHookNoun('examine the stone', [h])).toBe(h);
  });

  it('does NOT match a tiny/unrelated fragment against a longer noun', () => {
    const h = hook(['ridgeline']);
    // indoor target must not snag the outdoor ridgeline hook
    expect(matchHookNoun('investigate the candle', [h])).toBeNull();
    // a 2-char token can't route either
    expect(matchHookNoun('go', [h])).toBeNull();
  });

  it('matches multi-word nouns as a phrase', () => {
    const h = hook(['hand rope']);
    expect(matchHookNoun('grab the hand rope', [h])).toBe(h);
  });

  it('matchAnyHookNoun matches resolved hooks; matchHookNoun skips them', () => {
    const h = hook(['vault'], true);
    expect(matchHookNoun('open the vault', [h])).toBeNull();
    expect(matchAnyHookNoun('open the vault', [h])).toBe(h);
  });
});
