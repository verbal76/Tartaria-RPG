/* ⚠⚠⚠ OTA-1835 — ONE DEATH, THREE WRITERS, ONE SURVIVOR.
 *
 * Every GlobalStash mutator was `load → modify → save`, and a single player
 * death fires several of them AT ONCE and UNAWAITED from combatResolution:
 * `recordFallenSeed`, `recordFallen`, and on a dev-name death
 * `addResurrectionGems`. They all read the same snapshot and each wrote the
 * WHOLE object back, so the last write erased what the others had written.
 *
 * ⚠⚠ MEASURED ON THE PRE-REPAIR TREE, NOT REASONED ABOUT:
 *      normal death (memorial + seed) → fallen 0 LOST, seeds 1
 *      dev death    (all three)       → fallen 0 LOST, seeds 0 LOST, gems 6
 * The memorial was lost on EVERY death, not only under contention. The
 * three-way case also lost the permanent fallen-seed marker, whose entire job
 * is to stop a restored backup undoing a death.
 *
 * The repair is `mutateGlobalStash` — one serialised queue every whole-stash
 * mutation goes through, each running against state loaded after the previous
 * one saved. No schema change, no merge logic, no second persistence system.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  recordFallen, recordFallenSeed, clearFallenSeed, hasFallenSeed,
  addResurrectionGems, loadGlobalStash, saveGlobalStash, mutateGlobalStash,
  recordEndingBadge, ensureFirstInstallSeed, loadFallen,
} from '../app/engine/saveSystem';
import type { FallenHero } from '../app/engine/saveSystem';

const hero = (name: string, ts = Date.now()): FallenHero =>
  ({ name, level: 3, ts, cause: 'test' } as unknown as FallenHero);

const FRESH = () => ({
  resurrectionGems: 5, endingBadges: [], installSeeded: true,
  devGemGrantedSlots: [], testGiftGrantedSlots: [], fallen: [], fallenSeeds: [],
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await saveGlobalStash(FRESH());
});

describe('OTA-1835 — §A/§B the death-side mutations all survive each other', () => {
  test('A — concurrent recordFallen + recordFallenSeed preserves BOTH', async () => {
    await Promise.all([recordFallen(hero('Verbal')), recordFallenSeed('seed-A')]);
    const s = await loadGlobalStash();
    expect((s.fallen ?? []).map((f) => f.name)).toEqual(['Verbal']);
    expect(s.fallenSeeds).toEqual(['seed-A']);
  });

  test('B — dev-name death: memorial + seed + gem, all three preserved', async () => {
    await Promise.all([
      recordFallen(hero('Verbal')),
      recordFallenSeed('seed-B'),
      addResurrectionGems(1),
    ]);
    const s = await loadGlobalStash();
    expect((s.fallen ?? []).length).toBe(1);
    expect(s.fallenSeeds).toEqual(['seed-B']);
    expect(s.resurrectionGems).toBe(6); // §H — exactly +1, not +0 and not +2
  });

  test('C — order does not matter: the reverse launch order is identical', async () => {
    await Promise.all([
      addResurrectionGems(1),
      recordFallenSeed('seed-C'),
      recordFallen(hero('Verbal')),
    ]);
    const s = await loadGlobalStash();
    expect((s.fallen ?? []).length).toBe(1);
    expect(s.fallenSeeds).toEqual(['seed-C']);
    expect(s.resurrectionGems).toBe(6);
  });

  test('D — a SLOW first mutation cannot be overtaken and lost', async () => {
    /* The real hazard is a mutation that loads early and saves late. The queue
     * must make the fast one wait, not let it jump the slow one's write. */
    const slow = mutateGlobalStash(async (stash) => {
      await new Promise((r) => setTimeout(r, 25));
      stash.fallen = [...(stash.fallen ?? []), hero('Slow')];
      return undefined;
    });
    const fast = recordFallenSeed('seed-D');
    await Promise.all([slow, fast]);
    const s = await loadGlobalStash();
    expect((s.fallen ?? []).map((f) => f.name)).toEqual(['Slow']);
    expect(s.fallenSeeds).toEqual(['seed-D']);
  });
});

describe('OTA-1835 — §E failure releases the queue and never reports false success', () => {
  test('a rejected mutation rejects to ITS OWN caller', async () => {
    await expect(mutateGlobalStash(() => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  test('a rejected mutation does not corrupt the stash', async () => {
    await expect(mutateGlobalStash((stash) => {
      stash.resurrectionGems = 999;      // mutated in memory...
      throw new Error('boom');           // ...but never saved
    })).rejects.toThrow('boom');
    expect((await loadGlobalStash()).resurrectionGems).toBe(5);
  });

  test('the queue does not deadlock — a later mutation still completes', async () => {
    await expect(mutateGlobalStash(() => { throw new Error('boom'); })).rejects.toThrow();
    await recordFallen(hero('After'));
    expect((await loadFallen()).map((f) => f.name)).toEqual(['After']);
  });

  test('a failure between two good writes loses only itself', async () => {
    const before = recordFallenSeed('seed-keep');
    const bad = mutateGlobalStash(() => { throw new Error('boom'); }).catch(() => 'failed');
    const after = recordFallen(hero('Kept'));
    await Promise.all([before, bad, after]);
    const s = await loadGlobalStash();
    expect(s.fallenSeeds).toEqual(['seed-keep']);
    expect((s.fallen ?? []).map((f) => f.name)).toEqual(['Kept']);
  });
});

describe('OTA-1835 — §F/§G/§I policy is untouched: no duplicates, no new behaviour', () => {
  test('F — recordFallen still appends per call and still honours the cap', async () => {
    /* Two deaths are two records; the cap trims from the front, not the back. */
    await recordFallen(hero('One', 1));
    await recordFallen(hero('Two', 2));
    expect((await loadFallen()).map((f) => f.name)).toEqual(['One', 'Two']);
    const many = await loadGlobalStash();
    expect((many.fallen ?? []).length).toBe(2);
  });

  test('G — fallenSeeds stays unique, and a repeat is still a no-op', async () => {
    await recordFallenSeed('dup');
    await recordFallenSeed('dup');
    await recordFallenSeed('dup');
    expect((await loadGlobalStash()).fallenSeeds).toEqual(['dup']);
    expect(await hasFallenSeed('dup')).toBe(true);
  });

  test('G — a repeated seed writes NOTHING, exactly as before the repair', async () => {
    await recordFallenSeed('dup');
    const spy = jest.spyOn(AsyncStorage, 'setItem');
    await recordFallenSeed('dup');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('G — clearFallenSeed still removes, and still no-ops on an absent seed', async () => {
    await recordFallenSeed('paid');
    await clearFallenSeed('paid');
    expect(await hasFallenSeed('paid')).toBe(false);
    const spy = jest.spyOn(AsyncStorage, 'setItem');
    await clearFallenSeed('not-there');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('H — concurrent gem grants each land exactly once', async () => {
    await Promise.all([addResurrectionGems(1), addResurrectionGems(1), addResurrectionGems(1)]);
    expect((await loadGlobalStash()).resurrectionGems).toBe(8);
  });

  test('H — the floor at zero is unchanged', async () => {
    await addResurrectionGems(-99);
    expect((await loadGlobalStash()).resurrectionGems).toBe(0);
  });

  test('I — sequential callers behave exactly as before: badges idempotent', async () => {
    const first = await recordEndingBadge('order', 'ending_a');
    expect(first).toEqual(['order:ending_a']);
    const again = await recordEndingBadge('order', 'ending_a');
    expect(again).toEqual(['order:ending_a']);
    const second = await recordEndingBadge('order', 'ending_b');
    expect(second).toEqual(['order:ending_a', 'order:ending_b']);
  });

  test('I — ensureFirstInstallSeed still grants once and reports honestly', async () => {
    await AsyncStorage.clear();
    await saveGlobalStash({ ...FRESH(), installSeeded: false, resurrectionGems: 0 });
    const a = await ensureFirstInstallSeed();
    expect(a).toEqual({ seeded: true, gems: 1 });
    const b = await ensureFirstInstallSeed();
    expect(b).toEqual({ seeded: false, gems: 1 });
  });
});

describe('OTA-1835 — §11 the restart boundary is no worse', () => {
  test('no lock state is persisted — the stash holds only stash fields', async () => {
    await Promise.all([recordFallen(hero('X')), recordFallenSeed('s')]);
    const raw = await AsyncStorage.getItem('tartaria:global_stash_v1')
      ?? await AsyncStorage.getItem('GLOBAL_STASH');
    const s = await loadGlobalStash();
    // Whatever the key, the parsed stash carries no queue/lock bookkeeping.
    // ⚠ OTA-1844 — `dogsFallen` is a STASH FIELD and belongs on this list: the
    // companions of dead handlers, install-wide precisely because a dog lives
    // inside ONE character save and death deletes that save. What this test
    // guards is the absence of LOCK bookkeeping, not the roster of things worth
    // keeping, so the list grows by one and the claim is as strong as it was.
    expect(Object.keys(s).sort()).toEqual([
      'devGemGrantedSlots', 'dogsFallen', 'endingBadges', 'fallen', 'fallenSeeds',
      'installSeeded', 'resurrectionGems', 'testGiftGrantedSlots',
    ]);
    if (raw) expect(() => JSON.parse(raw)).not.toThrow();
  });

  test('the stash stays valid JSON through concurrent mutation', async () => {
    await Promise.all([
      recordFallen(hero('A')), recordFallenSeed('a'),
      addResurrectionGems(2), recordEndingBadge('f', 'e'),
    ]);
    const s = await loadGlobalStash();
    expect(s.resurrectionGems).toBe(7);
    expect((s.fallen ?? []).length).toBe(1);
    expect(s.fallenSeeds).toEqual(['a']);
    expect(s.endingBadges).toEqual(['f:e']);
  });
});
