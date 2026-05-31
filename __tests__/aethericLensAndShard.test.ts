// OTA-198 — verifies the Aetheric Vision Lens search + encounter
// bias and the Shaped Aetheric Shard's 2d20 throw damage.
//
// Lens behavior:
//   - rollAreaSearch accepts a hookBonus that shifts the
//     distribution toward hook outcomes (proven by counting
//     hooks across many rolls with vs. without the bonus).
//   - pickWastelandEncounter takes aethericVision flag; when
//     true, fusion_bench archetypes get a 2× weight multiplier.
//
// Shard behavior:
//   - rollThrowDamage returns a value in [2, 40] for a Shaped
//     Aetheric Shard (2d20) instead of the default weight-based
//     1-9 range.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve(); }),
    },
  };
});

import { rollAreaSearch } from '../app/engine/areaSearch';
import { rollThrowDamage } from '../app/engine/itemWeight';
import { pickWastelandEncounter } from '../app/engine/wastelandEncounters';
import { aethericVisionActive } from '../app/engine/itemEffect';
import { findExplorationItemByName } from '../app/engine/crafting';
import type { InventoryItem, Location } from '../app/engine/types';

describe('OTA-198 — rollAreaSearch hookBonus', () => {
  it('with bonus=0 fires ~15% hooks on average', () => {
    let hooks = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      if (rollAreaSearch('rubble').kind === 'hook') hooks++;
    }
    const rate = hooks / trials;
    // baseline ~15% — accept 0.10..0.20 to keep the test robust.
    expect(rate).toBeGreaterThanOrEqual(0.10);
    expect(rate).toBeLessThanOrEqual(0.20);
  });

  it('with hookBonus=0.15 raises the hook rate roughly +15pp', () => {
    let hooks = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      if (rollAreaSearch('rubble', { hookBonus: 0.15 }).kind === 'hook') hooks++;
    }
    const rate = hooks / trials;
    // ~30% — accept 0.25..0.40.
    expect(rate).toBeGreaterThanOrEqual(0.25);
    expect(rate).toBeLessThanOrEqual(0.40);
  });

  it('hookBonus clamps to 0.4 so the lens can never make every search a hook', () => {
    let hooks = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      // Pass a wildly large bonus — engine should clamp.
      if (rollAreaSearch('rubble', { hookBonus: 99 }).kind === 'hook') hooks++;
    }
    const rate = hooks / trials;
    // Cap is 0.4, so hook rate caps around 15% + 40% = ~55%.
    expect(rate).toBeLessThanOrEqual(0.65);
  });
});

describe('OTA-198 — Shaped Aetheric Shard throw damage', () => {
  const shard: InventoryItem = {
    id: 's1',
    name: 'Shaped Aetheric Shard',
    kind: 'misc',
    quantity: 1,
    tags: ['throwable', 'aether', 'shaped'],
    rarity: 'Rare',
    description: 'X',
  };

  it('rolls 2d20 — every roll lands in [2, 40]', () => {
    const samples = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const d = rollThrowDamage(shard);
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(40);
      samples.add(d);
    }
    // 2d20 produces 39 distinct integers (2..40). Across 500 rolls
    // we should see at least 15 different values — proves we're
    // actually rolling 2d20, not a fixed value.
    expect(samples.size).toBeGreaterThanOrEqual(15);
  });

  it('case-insensitive name match — "shaped aetheric shard" also rolls 2d20', () => {
    const lower = { ...shard, name: 'shaped aetheric shard' };
    const max = Math.max(...Array.from({ length: 200 }, () => rollThrowDamage(lower)));
    expect(max).toBeGreaterThanOrEqual(20);
  });

  it('OTA-200 — plain "Aetheric Shard" (looted crystal) also rolls 2d20 on throw', () => {
    const plain: InventoryItem = {
      id: 'p1',
      name: 'Aetheric Shard',
      kind: 'misc',
      quantity: 1,
      tags: ['aether', 'crystal'],
      rarity: 'Common',
      description: 'A shard of Aetheric crystal.',
    };
    const samples = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const d = rollThrowDamage(plain);
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(40);
      samples.add(d);
    }
    expect(samples.size).toBeGreaterThanOrEqual(10);
  });

  it('a regular rock still rolls the small-weight die (not 2d20)', () => {
    const rock: InventoryItem = {
      id: 'r1',
      name: 'Small Rock',
      kind: 'misc',
      quantity: 1,
      tags: ['stone'],
      rarity: 'Common',
      description: 'X',
    };
    for (let i = 0; i < 200; i++) {
      const d = rollThrowDamage(rock);
      expect(d).toBeLessThanOrEqual(10);
    }
  });
});

describe('OTA-198 — Aetheric Vision Lens activation', () => {
  it('aethericVisionActive returns true when the lens is in inventory', () => {
    const active = aethericVisionActive(['Aetheric Vision Lens'], [findExplorationItemByName]);
    expect(active).toBe(true);
  });

  it('returns false when no lens is carried', () => {
    const active = aethericVisionActive(['Trail Rations', 'Scrap Metal'], [findExplorationItemByName]);
    expect(active).toBe(false);
  });
});

describe('OTA-198 — fusion_bench encounter bias with aethericVision flag', () => {
  // Build a location whose tags overlap every archetype's matchers,
  // so the picker has a wide eligible set including fusion_crucible.
  const location: Location = {
    id: 'test_outskirts',
    name: 'Test Outskirts',
    tags: ['mud', 'outskirts', 'open', 'borderlands', 'surface', 'buried', 'ruin', 'etheric_anomaly', 'aether', 'tech'],
    description: '',
    exits: {},
  };

  function countFusion(trials: number, aethericVision: boolean): number {
    let hits = 0;
    let seed = 0;
    const rng = () => {
      // Deterministic sequence biased toward firing encounters.
      seed = (seed * 9301 + 49297) % 233280;
      const norm = seed / 233280;
      // Force the threshold/roll gates open — return small numbers
      // for the gate checks and a varied number for the weighted pick.
      // 4 rng() calls per pickWastelandEncounter: gate, hit, weighted, enemy/loot picker.
      return norm;
    };
    for (let i = 0; i < trials; i++) {
      const enc = pickWastelandEncounter(location, {
        stepsSinceLastEncounter: 99,
        threshold: 1,
        rollChance: 1.0,
        rng,
        aethericVision,
      });
      if (enc?.type === 'fusion_bench') hits++;
    }
    return hits;
  }

  it('aethericVision=true produces strictly more fusion_bench picks than aethericVision=false', () => {
    const without = countFusion(800, false);
    const withLens = countFusion(800, true);
    // Bias is 2× so withLens should be visibly higher; allow some
    // slack on the deterministic RNG.
    expect(withLens).toBeGreaterThan(without);
  });
});
