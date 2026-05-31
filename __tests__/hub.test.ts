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
  const visited = new Set<string>();

  it('resolves cardinal directions through the exits map', () => {
    const r = resolveHubTravel(gate, 'go north', visited);
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
    const r = resolveHubTravel(gate, `go to the ${neighbour.shortName.toLowerCase()}`, visited);
    expect(r).not.toBeNull();
    expect(r!.roomId).toBe(neighbour.id);
    // Either cardinal (if the input also contains a cardinal keyword) or
    // adjacent (name-only match) is correct here.
    expect(['cardinal', 'adjacent']).toContain(r!.via);
  });

  it('fast-travels to a previously visited non-adjacent room', () => {
    // Pick a room that is NOT a cardinal neighbour of the gate.
    const gateRoom = findHubRoom(gate)!;
    const neighbours = new Set(
      Object.values(gateRoom.exits).filter((id): id is string => !!id),
    );
    const far = HUB.rooms.find((r) => r.id !== gate && !neighbours.has(r.id));
    expect(far).toBeTruthy();
    const seen = new Set([far!.id]);
    const r = resolveHubTravel(gate, `head to the ${far!.shortName.toLowerCase()}`, seen);
    expect(r).not.toBeNull();
    expect(r!.roomId).toBe(far!.id);
    expect(r!.via).toBe('fast_travel');
  });

  it('returns null when no exit / room matches', () => {
    const r = resolveHubTravel(gate, 'go to nowhere flavoured', visited);
    expect(r).toBeNull();
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
