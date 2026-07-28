// OTA-216 — verifies the two new investigate outcome kinds.
//   - directional_find: stamps pendingDirectionalFind on the player;
//     traveling that direction force-spawns the promised archetype.
//   - cool_story: standalone narrative beat, no payload.
//
// Distribution: when investigate fires a hook outcome (60% baseline
// of all investigate rolls), the hook share splits 50 / 30 / 20
// between hook / directional_find / cool_story.

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
import { pickWastelandEncounter } from '../app/engine/wastelandEncounters';
import type { Location } from '../app/engine/types';

describe('OTA-216 — investigate outcome kinds split', () => {
  function tally(trials: number, intent: 'investigate' | 'search') {
    const counts = { nothing: 0, material: 0, tc: 0, hook: 0, directional_find: 0, cool_story: 0 };
    for (let i = 0; i < trials; i++) {
      const o = rollAreaSearch('rubble', intent === 'investigate' ? { intent: 'investigate' } : undefined);
      counts[o.kind]++;
    }
    return counts;
  }

  // Design math (rollAreaSearch, intent:'investigate', no bonus/loot):
  //   nothing 0.10 · find +0.07 · tc +0.08  ⇒  hook FAMILY = 0.75 of total.
  // The family then splits 50/30/20:
  //   plain hook       0.75 × 0.50 = 0.375 of total
  //   directional_find 0.75 × 0.30 = 0.225 of total
  //   cool_story       0.75 × 0.20 = 0.150 of total
  // (The old "60% hook share / ~30% hook" figures predate arb61, which cut
  // investigate's item drop to ~7% and raised the hook family to 0.75.)
  // Bands are ±~5σ at n=2000 (σ≈0.01): wide enough to never flake a BLOCKING
  // gate, tight enough that a real regression in the split still trips them.
  it('investigate produces directional_find outcomes (~22.5% of total)', () => {
    const c = tally(2000, 'investigate');
    const rate = c.directional_find / 2000;
    expect(rate).toBeGreaterThanOrEqual(0.16);
    expect(rate).toBeLessThanOrEqual(0.29);
  });

  it('investigate produces cool_story outcomes (~15% of total)', () => {
    const c = tally(2000, 'investigate');
    const rate = c.cool_story / 2000;
    expect(rate).toBeGreaterThanOrEqual(0.09);
    expect(rate).toBeLessThanOrEqual(0.21);
  });

  it('investigate still produces scene-hook outcomes (~37.5% of total)', () => {
    const c = tally(2000, 'investigate');
    const rate = c.hook / 2000;
    expect(rate).toBeGreaterThanOrEqual(0.32);
    expect(rate).toBeLessThanOrEqual(0.43);
  });

  it('default search does NOT produce directional_find or cool_story', () => {
    const c = tally(2000, 'search');
    expect(c.directional_find).toBe(0);
    expect(c.cool_story).toBe(0);
  });

  it('directional_find shape: carries direction, archetype, hint noun, line', () => {
    for (let i = 0; i < 200; i++) {
      const o = rollAreaSearch('rubble', { intent: 'investigate' });
      if (o.kind === 'directional_find') {
        expect(['N', 'E', 'S', 'W']).toContain(o.direction);
        expect(typeof o.archetype).toBe('string');
        expect(o.archetype.length).toBeGreaterThan(0);
        expect(typeof o.hintNoun).toBe('string');
        expect(o.hintNoun.length).toBeGreaterThan(0);
        expect(o.line.length).toBeGreaterThan(20);
        return;
      }
    }
    fail('Never rolled a directional_find in 200 trials');
  });

  it('cool_story shape: just a line', () => {
    for (let i = 0; i < 200; i++) {
      const o = rollAreaSearch('rubble', { intent: 'investigate' });
      if (o.kind === 'cool_story') {
        expect(typeof o.line).toBe('string');
        expect(o.line.length).toBeGreaterThan(20);
        return;
      }
    }
    fail('Never rolled a cool_story in 200 trials');
  });
});

describe('OTA-216 — pickWastelandEncounter forceArchetype', () => {
  const location: Location = {
    id: 'test',
    name: 'Test Tile',
    tags: ['mud', 'outskirts'],
    description: 'X',
    exits: {},
  };

  it('returns the named archetype when forceArchetype is set, even with thresholds unmet', () => {
    const enc = pickWastelandEncounter(location, {
      stepsSinceLastEncounter: 0,
      threshold: 99,
      rollChance: 0,
      forceArchetype: 'abandoned_caravan',
    });
    expect(enc).not.toBeNull();
    expect(enc?.archetypeId).toBe('abandoned_caravan');
  });

  it('falls through to the normal pick when forceArchetype id is unknown', () => {
    const enc = pickWastelandEncounter(location, {
      stepsSinceLastEncounter: 99,
      threshold: 1,
      rollChance: 1,
      forceArchetype: 'this_archetype_does_not_exist',
    });
    // Should NOT crash; falls through to normal weighted pick.
    expect(enc).not.toBeNull();
    expect(enc?.archetypeId).not.toBe('this_archetype_does_not_exist');
  });

  it('honors the forced archetype regardless of biome tags', () => {
    // Force a fusion_crucible into a location whose tags don't include
    // aether / tech — the force bypasses the matchers check.
    const enc = pickWastelandEncounter(location, {
      stepsSinceLastEncounter: 0,
      threshold: 99,
      rollChance: 0,
      forceArchetype: 'fusion_crucible',
    });
    expect(enc?.archetypeId).toBe('fusion_crucible');
    expect(enc?.type).toBe('fusion_bench');
  });
});
