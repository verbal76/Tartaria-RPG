import {
  WORLD_LADDER,
  MACRO_LOCATIONS,
  LOCATION_TO_MACRO,
  findMacro,
  findMicro,
  findMicroMicro,
  findMicroMicroAnywhere,
  pickRandomMicroMicroIn,
  macroForLocation,
} from '../app/engine/worldLadder';
import enemiesData from '../app/data/enemies/enemies.json';
import lootData from '../app/data/relics/loot_tables.json';
import locationsData from '../app/data/locations/locations.json';
import type { Location } from '../app/engine/types';

// ---------------------------------------------------------------------------
// Structural sanity — verifies the JSON file is shaped correctly.
// ---------------------------------------------------------------------------

describe('worldLadder.json — structure', () => {
  it('has a numeric version and at least one macro', () => {
    expect(typeof WORLD_LADDER.version).toBe('number');
    expect(MACRO_LOCATIONS.length).toBeGreaterThan(0);
  });

  it('includes the three TDD-explicit macros', () => {
    const ids = MACRO_LOCATIONS.map((m) => m.id);
    expect(ids).toContain('silt_wastes');
    expect(ids).toContain('aetherstone_deep');
    expect(ids).toContain('borderlands');
  });

  it('includes lore-inferred macros per TDD §2.4', () => {
    const ids = MACRO_LOCATIONS.map((m) => m.id);
    expect(ids).toContain('lost_capitals');
    expect(ids).toContain('subterranean_empire');
  });

  it('every macro has at least one micro and every micro has at least one micro-micro', () => {
    for (const macro of MACRO_LOCATIONS) {
      expect(macro.microLocations.length).toBeGreaterThan(0);
      for (const micro of macro.microLocations) {
        expect(micro.microMicroLocations.length).toBeGreaterThan(0);
      }
    }
  });

  it('every micro-micro has all required fields populated', () => {
    for (const macro of MACRO_LOCATIONS) {
      for (const micro of macro.microLocations) {
        for (const mm of micro.microMicroLocations) {
          expect(mm.id).toBeTruthy();
          expect(mm.name).toBeTruthy();
          expect(mm.environmental_description.length).toBeGreaterThan(10);
          expect(Array.isArray(mm.exits)).toBe(true);
          expect(Array.isArray(mm.possibleEncounters)).toBe(true);
          expect(Array.isArray(mm.lootTable)).toBe(true);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-reference integrity — encounter and loot IDs match the real catalogs.
// ---------------------------------------------------------------------------

describe('worldLadder.json — cross-references', () => {
  const enemyNames = new Set((enemiesData as { name: string }[]).map((e) => e.name));
  const lootNames = new Set((lootData as { name: string }[]).map((l) => l.name));

  it('every possibleEncounters entry resolves to a real enemy', () => {
    const missing: string[] = [];
    for (const macro of MACRO_LOCATIONS) {
      for (const micro of macro.microLocations) {
        for (const mm of micro.microMicroLocations) {
          for (const enemyName of mm.possibleEncounters) {
            if (!enemyNames.has(enemyName)) {
              missing.push(`${mm.id} → ${enemyName}`);
            }
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every lootTable entry resolves to a real loot item', () => {
    const missing: string[] = [];
    for (const macro of MACRO_LOCATIONS) {
      for (const micro of macro.microLocations) {
        for (const mm of micro.microMicroLocations) {
          for (const lootName of mm.lootTable) {
            if (!lootNames.has(lootName)) {
              missing.push(`${mm.id} → ${lootName}`);
            }
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('all ids are unique across the ladder', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const macro of MACRO_LOCATIONS) {
      if (seen.has(macro.id)) dupes.push(macro.id);
      seen.add(macro.id);
      for (const micro of macro.microLocations) {
        if (seen.has(micro.id)) dupes.push(micro.id);
        seen.add(micro.id);
        for (const mm of micro.microMicroLocations) {
          if (seen.has(mm.id)) dupes.push(mm.id);
          seen.add(mm.id);
        }
      }
    }
    expect(dupes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

describe('worldLadder lookups', () => {
  it('findMacro returns the named macro', () => {
    expect(findMacro('silt_wastes')?.name).toBe('The Silt Wastes');
    expect(findMacro('does_not_exist')).toBeNull();
  });

  it('findMicro descends one level', () => {
    expect(findMicro('silt_wastes', 'sunken_metropolis')?.name).toBe('The Sunken Metropolis');
    expect(findMicro('silt_wastes', 'no_such_micro')).toBeNull();
    expect(findMicro('no_such_macro', 'sunken_metropolis')).toBeNull();
  });

  it('findMicroMicro descends two levels', () => {
    const mm = findMicroMicro('silt_wastes', 'sunken_metropolis', 'buried_skyscraper_upper');
    expect(mm?.name).toContain('Buried Skyscraper');
    expect(findMicroMicro('silt_wastes', 'sunken_metropolis', 'nope')).toBeNull();
  });

  it('findMicroMicroAnywhere works without parent IDs', () => {
    const triple = findMicroMicroAnywhere('grand_hall');
    expect(triple?.macro.id).toBe('aetherstone_deep');
    expect(triple?.micro.id).toBe('giantkin_mausoleum');
    expect(triple?.microMicro.name).toBe('The Grand Hall');
    expect(findMicroMicroAnywhere('does_not_exist')).toBeNull();
  });

  it('pickRandomMicroMicroIn returns a node from the requested macro', () => {
    // Deterministic RNG → first candidate
    const triple = pickRandomMicroMicroIn('borderlands', () => 0);
    expect(triple?.macro.id).toBe('borderlands');
    expect(triple?.microMicro).toBeTruthy();
    expect(pickRandomMicroMicroIn('not_a_macro')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LOCATION_TO_MACRO — the bridge between locations.json and worldLadder.json
// ---------------------------------------------------------------------------

describe('LOCATION_TO_MACRO mapping', () => {
  const locations = locationsData as Location[];
  const locationIds = new Set(locations.map((l) => l.id));
  const macroIds = new Set(MACRO_LOCATIONS.map((m) => m.id));

  it('every mapped location id exists in locations.json', () => {
    const orphans: string[] = [];
    for (const locId of Object.keys(LOCATION_TO_MACRO)) {
      if (!locationIds.has(locId)) orphans.push(locId);
    }
    expect(orphans).toEqual([]);
  });

  it('every mapped target is a real macro in the ladder', () => {
    const orphans: Array<[string, string]> = [];
    for (const [locId, macroId] of Object.entries(LOCATION_TO_MACRO)) {
      if (!macroIds.has(macroId)) orphans.push([locId, macroId]);
    }
    expect(orphans).toEqual([]);
  });

  it('macroForLocation resolves mapped locations and rejects unmapped ones', () => {
    expect(macroForLocation('asgardar')?.id).toBe('lost_capitals');
    expect(macroForLocation('great_tartary_plains')?.id).toBe('silt_wastes');
    expect(macroForLocation('this_is_not_a_real_location')).toBeNull();
  });
});
