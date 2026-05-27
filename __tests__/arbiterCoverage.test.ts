// Regression: every race in races.json and every faction in
// factions.json should have an entry in ARBITER_RACE_REMARKS /
// ARBITER_FACTION_REMARKS. The pools are exported via the module's
// pickArbiterRaceRemark / pickArbiterFactionRemark helpers, but we
// can also verify by importing the JSON sources directly and
// confirming each id is callable.
//
// Background: audit found the maps had only 6/7 races and 5/9 factions
// covered. Picking an aetherborn / conspiracy_architects / etc.
// character left the Arbiter silent on race / faction callback paths.

import races from '../app/data/races/races.json';
import factions from '../app/data/factions/factions.json';
import {
  pickArbiterRaceRemark,
  pickArbiterFactionRemark,
} from '../app/engine/narrativeGenerator';

describe('Arbiter remark coverage', () => {
  it('has a race-remark pool for every race in the catalog', () => {
    const raceIds = (races as Array<{ id: string }>).map((r) => r.id);
    for (const id of raceIds) {
      const line = pickArbiterRaceRemark(id);
      expect(line).toBeTruthy();
      expect(typeof line).toBe('string');
      expect(line!.length).toBeGreaterThan(20);
    }
  });

  it('has a faction-remark pool for every faction in the catalog', () => {
    const factionIds = (factions as Array<{ id: string }>).map((f) => f.id);
    for (const id of factionIds) {
      const line = pickArbiterFactionRemark(id);
      expect(line).toBeTruthy();
      expect(typeof line).toBe('string');
      expect(line!.length).toBeGreaterThan(20);
    }
  });
});
