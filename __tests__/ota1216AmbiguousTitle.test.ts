// OTA-1216 — PUNCHLIST P12 CLOSED. An ambiguous contract name refuses instead of guessing.
//
// ⚠⚠ THE DEFECT. All four contract finders resolve a typed title in tiers: exact, then
// substring, then (since OTA-1211) token match. The substring tier used `pool.find()`,
// which returns the FIRST match even when several fit. Hold "Red Tower Fragment Cache" and
// "Red Tower Fragment Vault", type `turn in red tower fragment`, and the game closed
// whichever sat earlier in the catalog — silently, with a real payout, and no way for the
// player to know a choice had been made on their behalf.
//
// ⚠ WHY IT WAS NOT FIXED IN OTA-1211, where it was found. That change dropped a shared
// resolver into four widely-used finders and its entire safety argument was that it could
// only ever WIDEN what matched, never change an answer the old code already gave. Fixing
// this inside it would have broken that promise mid-change. It was filed as P12 with a test
// documenting the guess, and that test is now flipped to assert the refusal.

import { findByTitle } from '../app/engine/titleMatch';
import { fuzzyFindMystery, MYSTERIES } from '../app/engine/mysteries';
import { fuzzyFindHunt, HUNTS } from '../app/engine/hunts';
import { fuzzyFindStoryline, STORYLINES } from '../app/engine/factionStorylines';
import { fuzzyFindFactionQuest, FACTION_QUESTS } from '../app/engine/factionQuests';

describe('⚠⚠ OTA-1216 — ambiguity refuses at EVERY tier now', () => {
  test('two substring matches resolve to nothing', () => {
    const pool = [{ title: 'Red Tower Fragment Cache' }, { title: 'Red Tower Fragment Vault' }];
    expect(findByTitle('red tower fragment', pool)).toBeNull();
  });

  test('⚠ and it does NOT fall through to tokens to reach the same ambiguity by a longer road', () => {
    // A query that fits several titles as a substring fits the same several as tokens. If
    // the substring tier refused and the token tier then guessed, the defect would simply
    // have moved down one line.
    const pool = [{ title: 'Iron Watch Cache' }, { title: 'Iron Watch Vault' }];
    expect(findByTitle('iron watch', pool)).toBeNull();
  });

  test('three or more is still a refusal', () => {
    const pool = [{ title: 'Ash Run North' }, { title: 'Ash Run South' }, { title: 'Ash Run Deep' }];
    expect(findByTitle('ash run', pool)).toBeNull();
  });
});

describe('⚠⚠ OTA-1216 — and it did not become useless', () => {
  test('a substring that fits exactly ONE still resolves', () => {
    const pool = [{ title: 'Red Tower Fragment Cache' }, { title: 'The Long Silence' }];
    expect(findByTitle('long silence', pool)).toBe(pool[1]);
  });

  test('⚠⚠ EXACT still wins outright, even when it is also a substring of another', () => {
    // The one tier allowed to decide among several: a player who typed the whole title has
    // said precisely which contract they mean.
    const pool = [{ title: 'Red Tower' }, { title: 'Red Tower Fragment Cache' }];
    expect(findByTitle('Red Tower', pool)).toBe(pool[0]);
  });

  test('the token tier still rescues the parser’s stop-word stripping', () => {
    // The OTA-1211 case that started all of this: the parser hands over
    // "fragment red tower" for "Fragment of the Red Tower".
    const m = MYSTERIES.find((x) => x.id === 'mystery_red_tower')!;
    expect(fuzzyFindMystery('fragment red tower', [m])).toBe(m);
  });

  test('an empty pool or query is still safe', () => {
    expect(findByTitle('anything', [])).toBeNull();
    expect(findByTitle('', [{ title: 'Something' }])).toBeNull();
  });
});

describe('⚠ OTA-1216 — the real catalogs did not lose anything', () => {
  test('every title still resolves from its own full name, in all four finders', () => {
    // ⚠ THE REGRESSION THAT MATTERS. Refusing ambiguity could in principle strand a
    // contract whose full title is a substring of another's. This sweeps every catalog
    // and proves none of them lost a single entry.
    for (const m of MYSTERIES) expect(fuzzyFindMystery(m.title, MYSTERIES)).toBeTruthy();
    for (const h of HUNTS) expect(fuzzyFindHunt(h.title, HUNTS)).toBeTruthy();
    for (const s of STORYLINES) expect(fuzzyFindStoryline(s.title, STORYLINES)).toBeTruthy();
    for (const q of FACTION_QUESTS) expect(fuzzyFindFactionQuest(q.title, FACTION_QUESTS)).toBeTruthy();
  });

  test('a name belonging to nothing still resolves to nothing', () => {
    expect(fuzzyFindMystery('no such contract', MYSTERIES)).toBeNull();
    expect(fuzzyFindHunt('no such contract', HUNTS)).toBeNull();
  });
});
