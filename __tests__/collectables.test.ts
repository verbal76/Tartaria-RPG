import {
  CHARACTER_STORIES,
  ALL_FRAGMENTS,
  findFragmentById,
  findStoryByFragmentId,
  computeAllProgress,
  pickFragmentForBiome,
} from '../app/engine/collectables';

describe('collectables catalog', () => {
  it('exposes 10 stories with non-empty fragment lists', () => {
    expect(CHARACTER_STORIES.length).toBe(10);
    for (const s of CHARACTER_STORIES) {
      expect(s.fragments.length).toBeGreaterThan(0);
    }
  });

  it('every fragment id is globally unique', () => {
    const ids = ALL_FRAGMENTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every fragment has at least one biomeTag', () => {
    for (const f of ALL_FRAGMENTS) {
      expect(f.biomeTags.length).toBeGreaterThan(0);
    }
  });

  it('findFragmentById round-trips', () => {
    const sample = ALL_FRAGMENTS[0]!;
    expect(findFragmentById(sample.id)?.title).toBe(sample.title);
  });

  it('findStoryByFragmentId returns the owning story', () => {
    const sample = ALL_FRAGMENTS[0]!;
    const story = findStoryByFragmentId(sample.id);
    expect(story).toBeDefined();
    expect(story!.fragments.some((f) => f.id === sample.id)).toBe(true);
  });

  it('computeAllProgress reports 0/total when nothing collected', () => {
    const p = computeAllProgress([]);
    expect(p.length).toBe(10);
    for (const entry of p) {
      expect(entry.found.length).toBe(0);
      expect(entry.fraction).toBe(0);
      expect(entry.complete).toBe(false);
    }
  });

  it('computeAllProgress flags complete when every fragment owned', () => {
    const allIds = ALL_FRAGMENTS.map((f) => f.id);
    const p = computeAllProgress(allIds);
    expect(p.every((e) => e.complete)).toBe(true);
  });
});

describe('pickFragmentForBiome', () => {
  it('returns null when the chance gate misses', () => {
    const result = pickFragmentForBiome([], ['mud', 'ruin'], {
      chance: 0.5,
      rng: () => 0.99,
    });
    expect(result).toBeNull();
  });

  it('returns null when no fragment matches the biome', () => {
    const result = pickFragmentForBiome([], ['fungal'], {
      chance: 1.0,
      rng: () => 0.0,
    });
    // No fragment has 'fungal' in its biomeTags (none of the stories
    // call out fungal locations).
    expect(result).toBeNull();
  });

  it('returns null when every eligible fragment is already owned', () => {
    const owned = ALL_FRAGMENTS.filter((f) => f.biomeTags.includes('mud')).map((f) => f.id);
    const result = pickFragmentForBiome(owned, ['mud'], {
      chance: 1.0,
      rng: () => 0.0,
    });
    expect(result).toBeNull();
  });

  it('picks an un-owned fragment matching the biome when chance hits', () => {
    const result = pickFragmentForBiome([], ['ruin', 'etheric_anomaly'], {
      chance: 1.0,
      rng: () => 0.0, // first eligible
    });
    expect(result).not.toBeNull();
    const frag = findFragmentById(result!);
    expect(frag).toBeDefined();
    expect(frag!.biomeTags.some((t) => t === 'ruin' || t === 'etheric_anomaly')).toBe(true);
  });

  it('respects the chance gate: chance=0 never substitutes', () => {
    for (let i = 0; i < 50; i++) {
      const r = pickFragmentForBiome([], ['mud', 'ruin'], {
        chance: 0,
        rng: Math.random,
      });
      expect(r).toBeNull();
    }
  });
});
