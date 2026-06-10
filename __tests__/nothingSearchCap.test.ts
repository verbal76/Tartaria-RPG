// OTA-437 — [audit #17] bound the "nothing" forage re-roll. A null area-search
// doesn't consume the noun (so an unlucky roll isn't punishing), but after
// NOTHING_SEARCH_CAP nulls the noun is consumed so foraging is a gamble again
// rather than a guaranteed-payout retry loop. These are pure unit tests on the
// worldMemory helper.

import { emptyMemory, recordNothingSearch, NOTHING_SEARCH_CAP } from '../app/engine/worldMemory';

const KEY = 'room|0|0';

describe('OTA-437 — recordNothingSearch bounds the null-search grace', () => {
  it('does NOT consume the noun before the cap (grace retries)', () => {
    let mem = emptyMemory();
    // First null (count 1 of cap 2) — not yet exhausted, noun stays searchable.
    const r1 = recordNothingSearch(mem, KEY, 'Rubble');
    expect(r1.exhausted).toBe(false);
    expect(r1.memory.visitedRooms?.[KEY]?.searchedAmbientNouns ?? []).not.toContain('rubble');
    mem = r1.memory;
  });

  it('consumes the noun once the cap is reached', () => {
    let mem = emptyMemory();
    let last = { memory: mem, exhausted: false };
    for (let i = 0; i < NOTHING_SEARCH_CAP; i++) {
      last = recordNothingSearch(mem, KEY, 'Rubble');
      mem = last.memory;
    }
    expect(last.exhausted).toBe(true);
    expect(mem.visitedRooms?.[KEY]?.searchedAmbientNouns).toContain('rubble');
    // The count is tracked per noun.
    expect(mem.visitedRooms?.[KEY]?.searchNothingCounts?.['rubble']).toBe(NOTHING_SEARCH_CAP);
  });

  it('tracks separate counts per noun and is case-insensitive', () => {
    let mem = emptyMemory();
    mem = recordNothingSearch(mem, KEY, 'Crate').memory;
    const r = recordNothingSearch(mem, KEY, 'crate'); // same noun, different case
    expect(r.exhausted).toBe(true); // 2nd null on 'crate' hits cap 2
    // A different noun is unaffected.
    expect(mem.visitedRooms?.[KEY]?.searchNothingCounts?.['barrel']).toBeUndefined();
  });

  it('does not mutate the input memory', () => {
    const mem = emptyMemory();
    const out = recordNothingSearch(mem, KEY, 'Rubble');
    expect(mem.visitedRooms?.[KEY]).toBeUndefined();
    expect(out.memory).not.toBe(mem);
  });
});
