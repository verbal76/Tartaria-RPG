import locationsData from '../app/data/locations/locations.json';
import enemiesData from '../app/data/enemies/enemies.json';
import { matchAmbientNoun } from '../app/engine/ambientNouns';
import type { Location, Enemy } from '../app/engine/types';

// Phase 4 §2.2 — Aliases. Locations and enemies carry an optional
// `aliases?: string[]` field so the parser noun resolver matches what the
// player actually types ("workroom" / "spider" / "the sentinel") not just
// the canonical name. This suite locks in the data shape, ensures
// representative coverage, and confirms matchAmbientNoun handles aliases
// the same way it handles ambient nouns.

const locations = locationsData as Location[];
const enemies = enemiesData as Enemy[];

describe('Location aliases — data shape', () => {
  it('every location either has aliases or explicitly opts out (undefined)', () => {
    for (const loc of locations) {
      if (loc.aliases !== undefined) {
        expect(Array.isArray(loc.aliases)).toBe(true);
        for (const a of loc.aliases) {
          expect(typeof a).toBe('string');
          expect(a.length).toBeGreaterThan(0);
          // Lowercase convention — the matcher already lowercases input
          // but storing lowercased keeps data consistent.
          expect(a).toBe(a.toLowerCase());
        }
      }
    }
  });

  it('high-traffic locations have aliases populated (initial seed)', () => {
    // These are the locations a player visits most often early-game; if
    // any of them lose their aliases this test catches the regression.
    const requireAliases = [
      'tartarian_outskirts',
      'asgardar',
      'grand_spire_of_etheria',
      'samarran',
      'voronov',
      'varakush',
      'mud_seas',
    ];
    for (const id of requireAliases) {
      const loc = locations.find((l) => l.id === id);
      expect(loc).toBeDefined();
      expect(loc!.aliases?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('aliases contain no duplicates within a single entry', () => {
    for (const loc of locations) {
      if (!loc.aliases) continue;
      const unique = new Set(loc.aliases);
      expect(unique.size).toBe(loc.aliases.length);
    }
  });
});

describe('Enemy aliases — data shape', () => {
  it('every alias is a non-empty lowercase string when present', () => {
    for (const e of enemies) {
      if (e.aliases !== undefined) {
        for (const a of e.aliases) {
          expect(typeof a).toBe('string');
          expect(a.length).toBeGreaterThan(0);
          expect(a).toBe(a.toLowerCase());
        }
      }
    }
  });

  it('common low-tier enemies a new player will type at have aliases', () => {
    const common = [
      'Mud Boar',
      'Gutter Rat',
      'Bog Hound',
      'Aetherbat',
      'Scrap Drone',
      'Aetheric Spider',
    ];
    for (const name of common) {
      const e = enemies.find((x) => x.name === name);
      expect(e).toBeDefined();
      expect(e!.aliases?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('boss-tier enemies players will reference shorthand have aliases', () => {
    const bosses = ['Architectural Sentinel', 'Aetheric Guardian', 'Aetherkin', 'Black Cloak Agent'];
    for (const name of bosses) {
      const e = enemies.find((x) => x.name === name);
      expect(e).toBeDefined();
      expect(e!.aliases?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('matchAmbientNoun resolves aliases when they are in the pool', () => {
  it('finds an alias term when the pool includes it', () => {
    const pool = ['Mud Boar', 'boar', 'pig', 'hog'];
    expect(matchAmbientNoun('the boar', pool)).toBe('boar');
    expect(matchAmbientNoun('pig', pool)).toBe('pig');
  });

  it('still resolves the canonical name when player uses it', () => {
    const pool = ['Architectural Sentinel', 'sentinel', 'guardian', 'statue'];
    const r = matchAmbientNoun('architectural sentinel', pool);
    expect(r?.toLowerCase()).toBe('architectural sentinel');
  });

  it('matches the longest entry first so "Mud Spider" wins over "spider"', () => {
    // Sorted-longest-first behavior in matchAmbientNoun ensures the more
    // specific entity match wins when the player types the long form.
    const pool = ['Mud Spider', 'spider', 'crawler'];
    const r = matchAmbientNoun('mud spider', pool);
    expect(r?.toLowerCase()).toBe('mud spider');
  });

  it('returns null when neither canonical nor alias is in the pool', () => {
    const pool = ['Mud Boar', 'boar', 'pig'];
    expect(matchAmbientNoun('dragon', pool)).toBeNull();
  });
});
