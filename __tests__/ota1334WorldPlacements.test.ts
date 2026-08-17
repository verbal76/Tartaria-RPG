// ⚠⚠ OTA-1334 — THE BLACK REACH, AND THE TWO SPIRES FINALLY STANDING APART.
//
// Owner, across three messages:
//   *"a. I agree, move it to it's own location. move asgardars tower to the outskirts as
//   discussed. let's move the etheria spire 2 tiles west of the the black reach"*
//   *"The black reach is the most southern point on the map. it's at the 6:00 position
//   directly under the mud flood Nexus"*
//   *"it's another access point to the deep below"*
//
// Three placements, and every one of them is a claim about GROUND rather than about prose,
// so every one of them is checkable. That is the whole reason this suite exists: the last
// time the two Grand Spires were discussed it took the owner asking *"are you saying we
// merged two Tower climbs by accident?"* to establish they were still separate, because
// nothing in the repo asserted it. Now something does.
//
// ⚠⚠ THE ONE THAT WOULD HAVE SHIPPED BROKEN: `greatClimbs.asgardar_spire.locationId`. The
// spire became its own tile, but the climb stayed anchored on the CITY. Nothing would have
// thrown — the ★ CLIMB chip would simply have drawn itself in the middle of Asgardar, two
// tiles from any tower, and the tower's own tile would have offered nothing to climb.
import { LOCATION_ATLAS_COORDS } from '../app/engine/atlasCoords';
import { LOCATION_TO_MACRO } from '../app/engine/worldLadder';
import { GREAT_CLIMBS, greatClimbForLocation } from '../app/engine/greatClimbs';
import locationsData from '../app/data/locations/locations.json';

type Loc = { id: string; name: string; description: string; parent?: string; danger: number };
const LOCS = locationsData as unknown as Loc[];
const byId = (id: string): Loc => LOCS.find((l) => l.id === id)!;

// The exact arithmetic `canonicalCellFor` uses (worldMap.ts): CENTER 41/20, SPREAD 40/22,
// referenced off the atlas midpoint. Reproduced rather than imported so this suite pins the
// PLACEMENT, and does not silently follow along if that mapping is ever changed.
const cell = (id: string): { x: number; y: number } => {
  const c = LOCATION_ATLAS_COORDS[id]!;
  return {
    x: Math.max(0, Math.min(81, 41 + Math.round((c.fx - 0.5) * 40))),
    y: Math.max(0, Math.min(40, 20 + Math.round((c.fy - 0.5) * 22))),
  };
};

describe('OTA-1334 — the Black Reach and the separated spires', () => {
  it('⚠ all three places exist as real, routable locations', () => {
    for (const id of ['black_reach', 'grand_spire_of_asgardar', 'grand_spire_of_etheria']) {
      expect(byId(id)).toBeTruthy();
      expect(LOCATION_ATLAS_COORDS[id]).toBeTruthy();
      expect(LOCATION_TO_MACRO[id]).toBeTruthy();
    }
    // 36 before this pass, 38 after — which is also exactly the landmark count the map
    // spec hands the artist. Those two numbers agreeing is not a coincidence and should
    // not be allowed to drift apart quietly.
    expect(LOCS.length).toBe(38);
  });

  it('⚠⚠ the Black Reach is the southernmost point, directly under the Mud Flood Nexus', () => {
    const reach = cell('black_reach');
    const nexus = cell('mud_flood_nexus');
    // "6:00 position directly under" — same column, one row further south.
    expect(reach.x).toBe(nexus.x);
    expect(reach.y).toBe(nexus.y + 1);
    // "the most southern point on the map" — nothing the atlas places sits below it.
    const southernmost = Math.max(...Object.keys(LOCATION_ATLAS_COORDS).map((id) => cell(id).y));
    expect(reach.y).toBe(southernmost);
  });

  it('⚠ the Etheria spire sits exactly two tiles west of the Reach, on its row', () => {
    const spire = cell('grand_spire_of_etheria');
    const reach = cell('black_reach');
    expect(reach.x - spire.x).toBe(2);
    expect(spire.y).toBe(reach.y);
  });

  it('⚠ the Asgardar spire stands on the outskirts — its own tile, near but not in the city', () => {
    const spire = cell('grand_spire_of_asgardar');
    const city = cell('asgardar');
    expect(spire).not.toEqual(city);
    const gap = Math.abs(spire.x - city.x) + Math.abs(spire.y - city.y);
    // Owner: "one to two tiles away from asgardar, so it's technically on the outskirts".
    expect(gap).toBeGreaterThanOrEqual(1);
    expect(gap).toBeLessThanOrEqual(2);
  });

  it('⚠⚠ the two Grand Spires are nowhere near each other any more', () => {
    const a = cell('grand_spire_of_asgardar');
    const e = cell('grand_spire_of_etheria');
    expect(a).not.toEqual(e);
    // They used to be two rows apart in the same column, which is a large part of why they
    // kept being discussed as one place. Now they are opposite corners of the world.
    expect(Math.abs(a.x - e.x) + Math.abs(a.y - e.y)).toBeGreaterThan(20);
    expect(LOCATION_TO_MACRO.grand_spire_of_asgardar).toBe('lost_capitals');
    expect(LOCATION_TO_MACRO.grand_spire_of_etheria).toBe('aetherstone_deep');
    expect(LOCATION_TO_MACRO.black_reach).toBe('aetherstone_deep');
  });

  it('⚠⚠ the climb followed the tower — and the city is no longer climbable', () => {
    const climb = GREAT_CLIMBS.find((c) => c.id === 'asgardar_spire')!;
    expect(climb.locationId).toBe('grand_spire_of_asgardar');
    expect(greatClimbForLocation('grand_spire_of_asgardar')?.id).toBe('asgardar_spire');
    // The half-done version of this move: tile created, anchor left behind.
    expect(greatClimbForLocation('asgardar')).toBeNull();
    // And the other spire is untouched by all of it.
    expect(greatClimbForLocation('grand_spire_of_etheria')?.id).toBe('grand_spire');
    expect(GREAT_CLIMBS.length).toBe(5);
  });

  it('⚠ the Etheria spire no longer describes itself as standing in Asgardar', () => {
    // Its shipped description opened "A monumental tower in Asgardar…", which goes false
    // the moment the tower moves. A stale description is not cosmetic here — it is the
    // text the player reads on arrival, and it would name the wrong end of the world.
    const desc = byId('grand_spire_of_etheria').description;
    expect(desc).not.toMatch(/tower in Asgardar/i);
    expect(desc).toMatch(/black reach/i);
    expect(byId('grand_spire_of_etheria').parent).toBe('black_reach');
    expect(byId('grand_spire_of_asgardar').parent).toBe('asgardar');
  });

  it('⚠ no two atlas locations were stacked onto one tile by this pass', () => {
    // canonicalPositions() would quietly nudge a collision to a free neighbour, so a
    // duplicate here never crashes — it just silently moves a landmark off its art.
    const seen = new Map<string, string>();
    for (const id of Object.keys(LOCATION_ATLAS_COORDS)) {
      const c = cell(id);
      const key = `${c.x},${c.y}`;
      expect(seen.has(key) ? `${seen.get(key)} + ${id}` : null).toBeNull();
      seen.set(key, id);
    }
  });
});
