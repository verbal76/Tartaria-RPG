// engine_Dev — GUARD: the built-in ARBITER quote pools are ALWAYS merged into the
// narrator's line pool (narrativeGenerator concatenates them, even when an author has
// supplied their own flavor.moodRemarks / flavor.intentRemarks). So they must read
// SETTING-NEUTRAL or they leak into authored games — e.g. Bob spouting "the Giants" /
// "the Aether" / "Tartaria" in a 1943 WWII game. Authors ADD their own lines via the
// flavor override; this baseline must not fight any setting.

import intentQuotes from '../app/data/lore/arbiter-intent-quotes.json';
import moodQuotes from '../app/data/lore/arbiter-mood-quotes.json';

const TARTARIA_TERM = /tartar|aether|\bgiants?\b|sentinels?|mud monarch|forgotten order|reclaimer|runecaster|aetherborn|mud seas|the flood\b/i;

describe('engine_Dev — built-in arbiter quote pools are setting-neutral', () => {
  const pools: Array<[string, Record<string, string[]>]> = [
    ['intent', intentQuotes as Record<string, string[]>],
    ['mood', moodQuotes as Record<string, string[]>],
  ];

  it.each(pools)('%s quotes carry no setting-specific terms', (_label, pool) => {
    const leaks: string[] = [];
    for (const [key, lines] of Object.entries(pool)) {
      for (const line of lines) {
        if (TARTARIA_TERM.test(line)) leaks.push(`${key}: ${line}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it.each(pools)('%s pools are non-empty and well-formed', (_label, pool) => {
    const keys = Object.keys(pool);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(Array.isArray(pool[k])).toBe(true);
      expect(pool[k]!.length).toBeGreaterThan(0);
    }
  });
});
