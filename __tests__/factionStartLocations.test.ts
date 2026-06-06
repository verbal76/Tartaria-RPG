// arb92 — faction starting-location invariants. Every faction must spawn at a
// low-danger (≤2), NON-capital, hub-capable frontier outpost — never inside a
// Lost Capital (a Core site) or a danger-4/5 zone. The Capitals are the
// journey, not the spawn. Guards against a regression to capital/high-danger
// starts (the "huge monster out of the tutorial" problem).
import { FACTION_STARTING_LOCATION } from '../app/engine/character';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';
import { isHubLocation } from '../app/engine/hub';
import { LOCATION_ATLAS_COORDS } from '../app/engine/atlasCoords';
import { LOCATION_TO_MACRO } from '../app/engine/worldLadder';
import locationsData from '../app/data/locations/locations.json';

const locations = locationsData as { id: string; danger: number }[];
const dangerOf = (id: string) => locations.find((l) => l.id === id)?.danger ?? 99;

describe('faction starting locations', () => {
  const entries = Object.entries(FACTION_STARTING_LOCATION);

  it('covers a reasonable number of factions', () => {
    expect(entries.length).toBeGreaterThanOrEqual(9);
  });

  it('gives every faction its OWN distinct outpost (no sharing)', () => {
    const starts = entries.map(([, loc]) => loc);
    expect(new Set(starts).size).toBe(starts.length);
  });

  for (const [faction, locId] of Object.entries(FACTION_STARTING_LOCATION)) {
    describe(`${faction} → ${locId}`, () => {
      it('resolves to a real location', () => {
        expect(locations.some((l) => l.id === locId)).toBe(true);
      });
      it('is NOT a Lost Capital (Core site)', () => {
        expect(LOST_CAPITAL_LOCATIONS).not.toContain(locId);
      });
      it('is low danger (≤ 2) so a fresh character lands safely', () => {
        expect(dangerOf(locId)).toBeLessThanOrEqual(2);
      });
      it('is hub-capable (renders the tutorial outpost interior)', () => {
        expect(isHubLocation(locId)).toBe(true);
      });
      it('has atlas coords + a macro-region mapping', () => {
        expect(LOCATION_ATLAS_COORDS[locId]).toBeDefined();
        expect(LOCATION_TO_MACRO[locId]).toBeDefined();
      });
    });
  }
});
