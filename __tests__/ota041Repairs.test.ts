// OTA 041 — Regression tests for pre-ship audit fixes that don't need
// the full gameStore harness:
//   B2 — 13 orphan recipes now resolve to real catalog entries with
//        proper kind / rarity / tags (not the misc/Common fallback).
//   B5 — Sentinel barehand hit-gate enforcement helper.

import recipes from '../app/data/items/recipes.json';
import { lookupCraftedItem } from '../app/engine/crafting';
import { barehandDamageFor, barehandGateBlocks } from '../app/engine/raceMechanics';

describe('OTA 041 — B2: every recipe result resolves to a real catalog item', () => {
  // The audit found 13 recipes whose `result` name had no matching
  // catalog entry — crafting silently fell back to a stat-less misc
  // item. After the fix, every recipe should resolve to a kind/tags
  // pair that came from a real catalog file (not the fallback).
  it('no recipe falls back to {kind: misc, rarity: Common, tags: []}', () => {
    const fallbackCount = recipes.recipes.filter((r) => {
      const looked = lookupCraftedItem(r.result);
      // Fallback signature: kind === 'misc' AND rarity === 'Common' AND tags is empty.
      return looked.kind === 'misc' && looked.rarity === 'Common' && looked.tags.length === 0;
    });
    if (fallbackCount.length > 0) {
      const names = fallbackCount.map((r) => r.result).join(', ');
      throw new Error(`Recipes still falling back to misc/Common/[]: ${names}`);
    }
    expect(fallbackCount.length).toBe(0);
  });

  // Spot-check a few previously-orphaned items to confirm they now
  // carry the intended stat shape.
  it('Mudstone Bulwark is chest armor with AC bonus', () => {
    const item = lookupCraftedItem('Mudstone Bulwark');
    expect(item.tags).toEqual(expect.arrayContaining(['armor', 'chest']));
  });
  it('Wyrm-Fang Blade is a melee weapon', () => {
    const item = lookupCraftedItem('Wyrm-Fang Blade');
    expect(item.kind).toBe('weapon');
    expect(item.tags).toEqual(expect.arrayContaining(['weapon']));
  });
  it('Aether-Shard Ring is a ring slot item', () => {
    const item = lookupCraftedItem('Aether-Shard Ring');
    expect(item.tags).toEqual(expect.arrayContaining(['ring']));
  });
});

describe('OTA 041 — B5: Sentinel barehand hit-gate enforcement', () => {
  const sentinelSpec = barehandDamageFor('architectural_sentinel');

  it('parser produces a hitGate=even spec for the Sentinel', () => {
    expect(sentinelSpec.hitGate).toBe('even');
    expect(sentinelSpec.sides).toBe(10);
  });

  it('odd natural rolls block the hit (1, 3, 5, 7, 9 all whiff)', () => {
    for (const n of [1, 3, 5, 7, 9]) {
      expect(barehandGateBlocks(sentinelSpec, n)).toBe(true);
    }
  });

  it('even natural rolls land the hit (2, 4, 6, 8, 10 all connect)', () => {
    for (const n of [2, 4, 6, 8, 10]) {
      expect(barehandGateBlocks(sentinelSpec, n)).toBe(false);
    }
  });

  it('no-gate races never block (Tartarian Giant)', () => {
    const giantSpec = barehandDamageFor('tartarian_giant');
    expect(giantSpec.hitGate).toBeUndefined();
    expect(barehandGateBlocks(giantSpec, 1)).toBe(false);
    expect(barehandGateBlocks(giantSpec, 5)).toBe(false);
  });

  it('handles missing/NaN natural roll gracefully', () => {
    expect(barehandGateBlocks(sentinelSpec, NaN)).toBe(false);
    expect(barehandGateBlocks(sentinelSpec, Infinity)).toBe(false);
  });
});
