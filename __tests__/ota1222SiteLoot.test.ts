// OTA-1222 — PUNCHLIST P15: a place's own authored loot can now turn up when you search it.
//
// Owner's call, verbatim: *"it goes from the tuned pool and has a small percentage to pull
// from the alternate loot table as a replacement item for something already on the list."*
//
// ⚠⚠ REPLACEMENT, NOT ADDITION — and that is the whole safety argument. The tuned pool
// still decides IF you find something and how often; this only decides WHAT, occasionally.
// No extra objects enter the economy and no drop rate moves.
import { rollAreaSearch, SITE_LOOT_SUBSTITUTION_RATE } from '../app/engine/areaSearch';
import { ladderLootPool, pickLootFromLadder, LADDER_LOOT_EXCLUDED } from '../app/engine/encounter';
import { findMicroMicroAnywhere } from '../app/engine/worldLadder';
import type { Rarity } from '../app/engine/types';

const SITE: { name: string; rarity: Rarity }[] = [
  { name: 'Etheric Rope', rarity: 'Common' },
  { name: 'Dust Compass', rarity: 'Common' },
  { name: 'Aetherstorm Shard', rarity: 'Legendary' },
];

/** Roll until N material finds land, and report where they came from. */
function sample(n: number, siteLoot?: { name: string; rarity: Rarity }[]) {
  const names: string[] = [];
  for (let i = 0; i < n * 200 && names.length < n; i++) {
    const out = rollAreaSearch('rubble', { siteLoot, biomeTags: [] });
    if (out.kind === 'material') names.push(out.itemName);
  }
  return names;
}

describe('OTA-1222 / P15 — the substitution', () => {
  test('⚠ the rate is small and lives in ONE place', () => {
    expect(SITE_LOOT_SUBSTITUTION_RATE).toBeGreaterThan(0);
    expect(SITE_LOOT_SUBSTITUTION_RATE).toBeLessThanOrEqual(0.2);
  });

  test('⚠⚠ with NO site loot, behaviour is exactly what it was', () => {
    const names = sample(400);
    expect(names.length).toBe(400);
    // Nothing from the ladder can appear when nothing was passed.
    for (const n of names) expect(SITE.map((s) => s.name)).not.toContain(n);
  });

  test('⚠⚠ THE TUNED POOL STILL DOMINATES — roughly nine finds in ten', () => {
    const names = sample(3000, SITE);
    const siteNames = new Set(SITE.map((s) => s.name));
    const swapped = names.filter((n) => siteNames.has(n)).length;
    const frac = swapped / names.length;
    // ⚠ Generous bounds on purpose: this is a probabilistic assertion and a flaky test that
    // fails one run in fifty teaches everyone to ignore it. It has to catch a rate that is
    // WRONG (0, or half), not police the third decimal.
    expect(frac).toBeGreaterThan(SITE_LOOT_SUBSTITUTION_RATE / 3);
    expect(frac).toBeLessThan(SITE_LOOT_SUBSTITUTION_RATE * 2.5);
  });

  test('⚠⚠ the crafting staples still come through — the reason it is not a replacement', () => {
    // The 27 ladder pools carry ONE of the eleven materials crafting and golems need.
    // If the substitution ever became the main path, these would starve.
    const names = sample(3000, SITE);
    const staples = ['Small Rock', 'Stick', 'Aether Mud', 'Aether Residue', 'Mud Fragment'];
    const seen = staples.filter((s) => names.includes(s));
    expect(seen.length).toBe(staples.length);
  });

  test('⚠ a substituted find keeps the pool row\'s own rarity — no free upgrades', () => {
    const names = sample(4000, SITE);
    // Legendary is 1/17 of the site weight INSIDE a 10% window, so it should be rare but
    // reachable. The claim under test is only that rarity is carried, not invented.
    const legendary = names.filter((n) => n === 'Aetherstorm Shard').length;
    const common = names.filter((n) => n === 'Etheric Rope' || n === 'Dust Compass').length;
    expect(common).toBeGreaterThan(legendary);
  });
});

describe('OTA-1222 / P15 — the pool resolver', () => {
  test('⚠⚠ unique QUEST REWARDS are excluded — a storyline payout is not search loot', () => {
    expect(LADDER_LOOT_EXCLUDED.has('Mud Monarch Seal')).toBe(true);
    expect(LADDER_LOOT_EXCLUDED.has("Mask of Tartaria's Last King")).toBe(true);
    // And the exclusion is enforced at the resolver, so BOTH callers get it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WORLD_LADDER } = require('../app/engine/worldLadder') as typeof import('../app/engine/worldLadder');
    let checked = 0;
    for (const macro of WORLD_LADDER.macroLocations) {
      for (const micro of macro.microLocations ?? []) {
        for (const mm of micro.microMicroLocations ?? []) {
          const triple = findMicroMicroAnywhere(mm.id);
          if (!triple) continue;
          checked++;
          for (const row of ladderLootPool(triple)) {
            expect(LADDER_LOOT_EXCLUDED.has(row.name)).toBe(false);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  test('⚠ every pool still resolves to real rows after the exclusion', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WORLD_LADDER } = require('../app/engine/worldLadder') as typeof import('../app/engine/worldLadder');
    let withLoot = 0;
    for (const macro of WORLD_LADDER.macroLocations) {
      for (const micro of macro.microLocations ?? []) {
        for (const mm of micro.microMicroLocations ?? []) {
          if (!mm.lootTable || mm.lootTable.length === 0) continue;
          const triple = findMicroMicroAnywhere(mm.id);
          const pool = ladderLootPool(triple);
          // A pool that resolves to nothing would silently disable the feature there.
          expect(pool.length).toBeGreaterThan(0);
          expect(pickLootFromLadder(triple)).toBeTruthy();
          withLoot++;
        }
      }
    }
    expect(withLoot).toBe(27);
  });

  test('⚠ no ladder triple, no substitution — an unmapped scene is untouched', () => {
    expect(ladderLootPool(null)).toEqual([]);
    expect(pickLootFromLadder(null)).toBeNull();
  });
});
