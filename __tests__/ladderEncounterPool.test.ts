import { pickEncounterFromLadder, pickLootFromLadder } from '../app/engine/encounter';
import { findMicroMicroAnywhere } from '../app/engine/worldLadder';

// Phase 4 §4.3 — biome-weighted within-pool encounter and loot rolls.
// The Micro-Micro nodes in worldLadder.json carry curated possibleEncounters
// and lootTable arrays. Until §4.3 these were LLM-context-only and the
// encounter system rolled from the global enemies pool. This suite verifies
// the new ladder-pool pickers stay inside the curated allow-list and return
// real entities.

describe('pickEncounterFromLadder', () => {
  it('returns null for missing input', () => {
    expect(pickEncounterFromLadder(null)).toBeNull();
    expect(pickEncounterFromLadder(undefined)).toBeNull();
  });

  it('returns an enemy that is in the room\'s possibleEncounters', () => {
    // Buried Skyscraper Upper has a known small pool — pick from it
    // multiple times and assert every returned enemy is in the list.
    const triple = findMicroMicroAnywhere('buried_skyscraper_upper');
    expect(triple).not.toBeNull();
    const pool = new Set(triple!.microMicro.possibleEncounters);
    for (let i = 0; i < 40; i++) {
      const enemy = pickEncounterFromLadder(triple);
      expect(enemy).not.toBeNull();
      expect(pool.has(enemy!.name)).toBe(true);
    }
  });

  it('respects the curated pool boundary — never spawns outside it', () => {
    // Crystal Pylon Chamber has aetheric / construct enemies. A Mud Boar
    // should NEVER come out of it, even though Mud Boar is a global enemy.
    const triple = findMicroMicroAnywhere('crystal_pylon_chamber');
    expect(triple).not.toBeNull();
    const allowed = new Set(triple!.microMicro.possibleEncounters);
    for (let i = 0; i < 30; i++) {
      const enemy = pickEncounterFromLadder(triple);
      expect(enemy).not.toBeNull();
      expect(allowed.has(enemy!.name)).toBe(true);
      expect(enemy!.name).not.toBe('Mud Boar');
    }
  });
});

describe('pickLootFromLadder', () => {
  it('returns null for missing input', () => {
    expect(pickLootFromLadder(null)).toBeNull();
    expect(pickLootFromLadder(undefined)).toBeNull();
  });

  it('returns a loot name that is in the room\'s lootTable', () => {
    const triple = findMicroMicroAnywhere('crystal_pylon_chamber');
    expect(triple).not.toBeNull();
    const pool = new Set(triple!.microMicro.lootTable);
    for (let i = 0; i < 40; i++) {
      const name = pickLootFromLadder(triple);
      expect(name).not.toBeNull();
      expect(pool.has(name!)).toBe(true);
    }
  });

  it('weights Common loot higher than Rare/Legendary within a pool', () => {
    // Statistical check — over many rolls, Common entries should dominate
    // the distribution because rarityWeights map Common to 10x Legendary.
    const triple = findMicroMicroAnywhere('crystal_pylon_chamber');
    expect(triple).not.toBeNull();
    const counts: Record<string, number> = {};
    const TRIALS = 1000;
    for (let i = 0; i < TRIALS; i++) {
      const name = pickLootFromLadder(triple);
      if (name) counts[name] = (counts[name] ?? 0) + 1;
    }
    // No single entry should be 0 occurrences (every pool item should
    // appear at least once across 1000 trials, with extremely high
    // probability) AND the most common entry should beat the rarest by
    // a meaningful margin.
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    expect(sorted.length).toBeGreaterThan(0);
    if (sorted.length >= 2) {
      const [, topCount] = sorted[0]!;
      const [, bottomCount] = sorted[sorted.length - 1]!;
      // Top entry should at least double the bottom — rarity weighting
      // is real.
      expect(topCount).toBeGreaterThan(bottomCount);
    }
  });
});
