// OTA-1211 — TYPED TURN-IN SURVIVES THE PARSER'S STOP-WORD STRIPPING.
//
// ⚠⚠ MEASURED, not theorised (2026-08-09). A live probe typed
// `send word Fragment of the Red Tower` while holding exactly that mystery. The parser
// resolved it perfectly — `intent=turn_in conf=1.00 target=fragment red tower` — and the
// turn-in was refused with "You have no active contracts."
//
// All four contract finders were the same six lines: exact, then substring either way.
// The parser strips "of the"; the finders required it. Neither string contains the other,
// so the match failed.
//
// ⚠ IT PREDATES OTA-1211 AND IS NOT ABOUT THE COURIER. It breaks the typed turn-in of any
// contract whose title carries a dropped word. It stayed invisible because "send word" was
// refused before it ever reached a finder, and because the Contracts screen's COMPLETE
// button passes an ID rather than a typed title.

import { titleTokensMatch, findByTitle } from '../app/engine/titleMatch';
import { fuzzyFindMystery, MYSTERIES } from '../app/engine/mysteries';
import { fuzzyFindHunt, HUNTS } from '../app/engine/hunts';
import { fuzzyFindStoryline, STORYLINES } from '../app/engine/factionStorylines';
import { fuzzyFindFactionQuest, FACTION_QUESTS } from '../app/engine/factionQuests';

describe('⚠⚠ OTA-1211 — the exact failure that was measured', () => {
  test('the parser’s output now finds the mystery it named', () => {
    const m = MYSTERIES.find((x) => x.id === 'mystery_red_tower')!;
    expect(m.title).toBe('Fragment of the Red Tower');
    // what the parser actually handed the finder
    expect(fuzzyFindMystery('fragment red tower', [m])).toBe(m);
  });

  test('and the full title still works, exactly as before', () => {
    const m = MYSTERIES.find((x) => x.id === 'mystery_red_tower')!;
    expect(fuzzyFindMystery('Fragment of the Red Tower', [m])).toBe(m);
  });
});

describe('OTA-1211 — token matching', () => {
  test('order does not matter — a player who reorders means the same contract', () => {
    expect(titleTokensMatch('red tower fragment', 'Fragment of the Red Tower')).toBe(true);
  });

  test('punctuation and case do not matter', () => {
    expect(titleTokensMatch("ZHARAK'S TEETH", "The Siren of Zharak's Teeth")).toBe(true);
  });

  test('⚠ a word the title does not have is NOT a match', () => {
    expect(titleTokensMatch('fragment blue tower', 'Fragment of the Red Tower')).toBe(false);
  });

  test('⚠⚠ an empty target matches NOTHING', () => {
    // "no words matches everything" would make a bare `turn in` close the first contract
    // on the slate — a silent wrong-target action with a real payout attached.
    expect(titleTokensMatch('', 'Fragment of the Red Tower')).toBe(false);
    expect(titleTokensMatch('  the of a  ', 'Fragment of the Red Tower')).toBe(false);
  });
});

describe('⚠⚠ OTA-1211 — the new tier is STRICTLY ADDITIVE', () => {
  test('exact match still wins over everything', () => {
    const pool = [{ title: 'Red Tower' }, { title: 'Red Tower Ascent' }];
    expect(findByTitle('Red Tower', pool)).toBe(pool[0]);
  });

  test('substring still resolves before tokens are considered', () => {
    const pool = [{ title: 'The Long Silence' }];
    expect(findByTitle('long silence', pool)).toBe(pool[0]);
  });

  test('⚠⚠ AMBIGUITY AT THE TOKEN TIER IS A REFUSAL, NOT A GUESS', () => {
    // Two contracts fit the words, and neither is a substring of the query. Returning the
    // first would close the wrong one and pay out the wrong reward.
    const pool = [{ title: 'Fragment of the Red Tower' }, { title: 'Cache of the Red Fragment' }];
    expect(findByTitle('red fragment tower cache', pool)).toBeNull();
  });

  test('⚠⚠ THE SUBSTRING TIER NO LONGER GUESSES — closed by OTA-1216 (P12)', () => {
    // ⚠ This assertion used to document a DEFECT rather than a guarantee: `pool.find()`
    // returned the first substring match even when several fit, so a query contained by two
    // titles silently closed one of them with a real payout attached. It was deliberately
    // left alone here, because OTA-1211's whole safety argument for dropping a shared
    // resolver into four widely-used finders was that it could only ever WIDEN what
    // matched. It was filed as P12 and fixed on its own.
    //
    // The test is kept rather than deleted, and flipped: the same input that once picked
    // arbitrarily now refuses. A defect test becoming a guarantee test is the record that
    // the thing was actually fixed and not merely reworded.
    const pool = [{ title: 'Red Tower Fragment Cache' }, { title: 'Red Tower Fragment Vault' }];
    expect(findByTitle('red tower fragment', pool)).toBeNull();
  });

  test('an empty pool is safe', () => {
    expect(findByTitle('anything', [])).toBeNull();
  });

  test('an empty query is safe', () => {
    expect(findByTitle('', [{ title: 'Something' }])).toBeNull();
  });
});

describe('⚠ OTA-1211 — all four finders got it, not just the one that failed', () => {
  test('every catalog title resolves from its own full title', () => {
    // A cheap whole-catalog sanity sweep: the change must not have broken the ordinary case
    // anywhere. Each finder is asked for every title in its own catalog.
    for (const m of MYSTERIES) expect(fuzzyFindMystery(m.title, MYSTERIES)).toBeTruthy();
    for (const h of HUNTS) expect(fuzzyFindHunt(h.title, HUNTS)).toBeTruthy();
    for (const s of STORYLINES) expect(fuzzyFindStoryline(s.title, STORYLINES)).toBeTruthy();
    for (const q of FACTION_QUESTS) expect(fuzzyFindFactionQuest(q.title, FACTION_QUESTS)).toBeTruthy();
  });

  test('⚠ and a title that belongs to no catalog still resolves to nothing', () => {
    expect(fuzzyFindMystery('a contract that does not exist', MYSTERIES)).toBeNull();
    expect(fuzzyFindHunt('a contract that does not exist', HUNTS)).toBeNull();
    expect(fuzzyFindStoryline('a contract that does not exist', STORYLINES)).toBeNull();
    expect(fuzzyFindFactionQuest('a contract that does not exist', FACTION_QUESTS)).toBeNull();
  });
});
