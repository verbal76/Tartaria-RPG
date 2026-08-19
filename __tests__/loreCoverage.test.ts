// ⚠⚠ LORE COVERAGE — every location the game can route a player to has a voice.
//
// Owner, ordering the map audit: *"make sure all necessary text, lore, mission writing and
// any other text is updated."* Measured at the time: FIFTEEN of 38 locations had neither a
// glossary entry nor a single ambient flavour line — the four newer Lost Capitals, both
// tier-C tiles, all eight faction frontier camps, and the Hidden Market. A player could
// stand in Yuldra-Tul, open the codex, and find the frost-bitten capital of the Giants
// simply not there.
//
// This suite is the ratchet: a location added without lore fails the build, the same way a
// hunt stage without ground does. The content itself lives in glossary.json and
// location-flavors.json; this only refuses silence.
import locationsData from '../app/data/locations/locations.json';
import glossary from '../app/data/lore/glossary.json';
import flavors from '../app/data/lore/location-flavors.json';

const LOCS = locationsData as unknown as Array<{ id: string; name: string }>;

describe('lore coverage — no mute locations', () => {
  it('⚠⚠ every location has a glossary entry in important_places', () => {
    const ids = new Set(
      (glossary as { important_places: Array<{ id: string }> }).important_places.map((e) => e.id),
    );
    const missing = LOCS.filter((l) => !ids.has(l.id)).map((l) => l.id);
    expect(missing).toEqual([]);
  });

  it('⚠⚠ every location has ambient flavour lines, and enough to not repeat immediately', () => {
    const f = flavors as Record<string, string[]>;
    const missing = LOCS.filter((l) => !f[l.id]).map((l) => l.id);
    expect(missing).toEqual([]);
    for (const l of LOCS) {
      expect(f[l.id]!.length).toBeGreaterThanOrEqual(5);
      for (const line of f[l.id]!) expect(line.trim().length).toBeGreaterThan(10);
    }
  });

  it('⚠ glossary terms match the location names they describe', () => {
    // A glossary entry whose term drifts from the location's display name would read as a
    // different place. Aliases are fine in prose; the TERM is the location's name.
    const byId = new Map(LOCS.map((l) => [l.id, l.name]));
    for (const e of (glossary as { important_places: Array<{ id: string; term: string }> }).important_places) {
      const name = byId.get(e.id);
      if (!name) continue; // entries for non-location concepts are allowed
      expect(e.term.replace(/^The /, '')).toBe(name.replace(/^The /, ''));
    }
  });
});
