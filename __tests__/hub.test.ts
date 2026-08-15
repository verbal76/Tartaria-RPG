// HANDOFF #15b — hub engine integration tests. Covers the small,
// pure surface of app/engine/hub.ts: location detection, room lookup,
// travel resolution (cardinal / adjacent / fast-travel), and the
// leave-hub command regex.

import {
  HUB,
  findHubRoom,
  hubEntryRoomId,
  isHubLocation,
  isLeaveHubCommand,
  resolveHubTravel,
} from '../app/engine/hub';

describe('hub data', () => {
  it('exposes the Reclaimers Outpost as the hub', () => {
    expect(HUB.hubId).toBe('reclaimers_outpost');
    expect(HUB.hubLocationId).toBe('tartarian_outskirts');
    expect(HUB.rooms.length).toBeGreaterThanOrEqual(10);
  });

  it('entry room is the first room (Gate)', () => {
    expect(hubEntryRoomId()).toBe(HUB.rooms[0]!.id);
    expect(HUB.rooms[0]!.shortName.toLowerCase()).toContain('gate');
  });
});

describe('isHubLocation', () => {
  it('matches the configured hub location id', () => {
    expect(isHubLocation('tartarian_outskirts')).toBe(true);
  });
  it('v2.4.1 (OTA 030) — also matches every faction-start tile', () => {
    // Same interior layout reused across all 9 factions; isHubLocation
    // returns true for any of the 6 unique macro-locations that serve
    // as a faction's starting tile (drakova is the Revivalist hub).
    expect(isHubLocation('drakova')).toBe(true);
    expect(isHubLocation('varakush')).toBe(true);
    expect(isHubLocation('asgardar')).toBe(true);
    expect(isHubLocation('buried_cities')).toBe(true);
    expect(isHubLocation('giant_vault')).toBe(true);
  });
  it('rejects non-hub ids and falsy values', () => {
    expect(isHubLocation('cradle_of_dusk')).toBe(false);
    expect(isHubLocation('voronov')).toBe(false);
    expect(isHubLocation(null)).toBe(false);
    expect(isHubLocation(undefined)).toBe(false);
  });
});

describe('findHubRoom', () => {
  it('returns the room when the id is known', () => {
    const r = findHubRoom(hubEntryRoomId());
    expect(r).not.toBeNull();
    expect(r!.id).toBe(hubEntryRoomId());
  });
  it('returns null for unknown / empty input', () => {
    expect(findHubRoom('does_not_exist')).toBeNull();
    expect(findHubRoom(null)).toBeNull();
  });
});

describe('resolveHubTravel', () => {
  const gate = hubEntryRoomId();

  it('resolves cardinal directions through the exits map', () => {
    const r = resolveHubTravel(gate, 'go north');
    expect(r).not.toBeNull();
    expect(r!.via).toBe('cardinal');
    // Whatever the gate's north neighbour is, it must be a real room.
    expect(findHubRoom(r!.roomId)).not.toBeNull();
  });

  it('resolves adjacent rooms by shortName', () => {
    const gateRoom = findHubRoom(gate)!;
    const exitDir = (['north', 'south', 'east', 'west'] as const).find(
      (d) => gateRoom.exits[d],
    )!;
    const neighbour = findHubRoom(gateRoom.exits[exitDir])!;
    const r = resolveHubTravel(gate, `go to the ${neighbour.shortName.toLowerCase()}`);
    expect(r).not.toBeNull();
    expect(r!.roomId).toBe(neighbour.id);
    // Either cardinal (if the input also contains a cardinal keyword) or
    // adjacent (name-only match) is correct here.
    expect(['cardinal', 'adjacent']).toContain(r!.via);
  });

  // ⚠⚠ OTA-1279 — THIS TEST USED TO ASSERT THE OPPOSITE. A non-adjacent room
  // the player had already visited was teleported to (`via: 'fast_travel'`).
  // The owner's navigation spec deletes that: *"Normal room navigation should
  // move ONE GRAPH EDGE AT A TIME."* The same input is now a refusal carrying
  // directions. Full rule in ota1279UniversalOutpostGraph.
  it('refuses a non-adjacent room and names the door that heads toward it', () => {
    // Pick a room that is NOT a cardinal neighbour of the gate.
    const gateRoom = findHubRoom(gate)!;
    const neighbours = new Set(
      Object.values(gateRoom.exits).filter((id): id is string => !!id),
    );
    const far = HUB.rooms.find((r) => r.id !== gate && !neighbours.has(r.id));
    expect(far).toBeTruthy();
    const r = resolveHubTravel(gate, `head to the ${far!.shortName.toLowerCase()}`);
    expect(r).not.toBeNull();
    expect(r!.roomId).toBe(far!.id);
    expect(r!.via).toBe('not_adjacent');
    // The step it names must itself be one legal move away — a signpost is
    // useless if it points at a room you also cannot reach.
    const step = r && 'firstStep' in r ? r.firstStep : null;
    expect(step).not.toBeNull();
    expect(neighbours.has(step!)).toBe(true);
  });

  it('returns null when no exit / room matches', () => {
    const r = resolveHubTravel(gate, 'go to nowhere flavoured');
    expect(r).toBeNull();
  });

  // ⚠⚠ OTA-1279 — a cardinal this room has no door on is REFUSED here, not
  // passed down to overland travel. Before this it fell through and the player
  // walked out of the outpost by typing a wrong direction.
  it('refuses a cardinal with no door rather than resolving to nothing', () => {
    const room = HUB.rooms.find((r) => !r.exits.north)!;
    const r = resolveHubTravel(room.id, 'go north');
    expect(r).not.toBeNull();
    expect(r!.via).toBe('no_exit_that_way');
    expect(r!.roomId).toBeNull();
  });
});

describe('isLeaveHubCommand', () => {
  it.each([
    'leave outpost',
    'leave the outpost',
    'exit hub',
    'leave camp',
    'leave the gate',
    'head out',
    'go outside',
    'walk into the wild',
  ])('matches "%s"', (input) => {
    expect(isLeaveHubCommand(input)).toBe(true);
  });

  it.each(['look around', 'go armory', 'attack the gate guard', 'rest'])(
    'rejects "%s"',
    (input) => {
      expect(isLeaveHubCommand(input)).toBe(false);
    },
  );
});
