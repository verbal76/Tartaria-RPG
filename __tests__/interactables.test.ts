import locationsData from '../app/data/locations/locations.json';
import staticHubData from '../app/data/world/static_hub.json';

type Loc = {
  id: string;
  name: string;
  description: string;
  interactables?: string[];
};
type HubRoom = {
  id: string;
  name: string;
  description: string;
  interactables?: string[];
};

const locations = locationsData as Loc[];
const hubRooms = (staticHubData as { rooms: HubRoom[] }).rooms;

// These lock in the Phase 2 contract: every hand-authored macro
// location AND every hub room declares the nouns the player can
// search / approach. Without this, the ambient-noun heuristic
// extractor takes over and starts surfacing abstractions like
// "states", "various", "repair" again.

describe('authored interactables — locations', () => {
  it('every location declares an interactables array', () => {
    const missing = locations.filter((l) => !l.interactables || l.interactables.length === 0);
    if (missing.length > 0) {
      throw new Error(
        'Locations missing interactables: ' +
        missing.map((l) => l.id).join(', '),
      );
    }
  });

  it('every interactable is lowercase + non-empty + no leading/trailing whitespace', () => {
    for (const loc of locations) {
      for (const noun of loc.interactables ?? []) {
        expect(noun).toBeTruthy();
        expect(noun).toBe(noun.trim());
        expect(noun).toBe(noun.toLowerCase());
      }
    }
  });

  it('interactables are unique within each location', () => {
    for (const loc of locations) {
      const set = new Set(loc.interactables);
      expect(set.size).toBe(loc.interactables?.length ?? 0);
    }
  });

  // No abstract / verb-y tokens — these are exactly the categories
  // the noun-extractor blocklist exists to catch. If they show up in
  // an authored list it's an author mistake.
  const BANNED_AS_INTERACTABLE = new Set([
    'states', 'state', 'repair', 'time', 'edge', 'back', 'front',
    'space', 'kind', 'various', 'thing', 'things', 'something',
    'work', 'voice', 'wind', 'sound', 'rings', 'opens', 'closes',
  ]);
  it('no abstract / verb-y tokens slip into the authored list', () => {
    for (const loc of locations) {
      for (const noun of loc.interactables ?? []) {
        expect(BANNED_AS_INTERACTABLE.has(noun)).toBe(false);
      }
    }
  });
});

describe('authored interactables — hub rooms', () => {
  it('every hub room declares an interactables array', () => {
    const missing = hubRooms.filter((r) => !r.interactables || r.interactables.length === 0);
    if (missing.length > 0) {
      throw new Error(
        'Hub rooms missing interactables: ' +
        missing.map((r) => r.id).join(', '),
      );
    }
  });

  it('every interactable is lowercase + non-empty', () => {
    for (const room of hubRooms) {
      for (const noun of room.interactables ?? []) {
        expect(noun).toBeTruthy();
        expect(noun).toBe(noun.trim());
        expect(noun).toBe(noun.toLowerCase());
      }
    }
  });

  it('interactables are unique within each hub room', () => {
    for (const room of hubRooms) {
      const set = new Set(room.interactables);
      expect(set.size).toBe(room.interactables?.length ?? 0);
    }
  });
});

describe('coverage — every location + hub room has at least 4 interactables', () => {
  // Sanity: a room with one interactable produces a one-chip modal,
  // which is no better than no chips. Four is the practical floor
  // for "the search modal feels alive."
  it('locations meet the floor', () => {
    for (const loc of locations) {
      expect(loc.interactables?.length ?? 0).toBeGreaterThanOrEqual(4);
    }
  });
  it('hub rooms meet the floor', () => {
    for (const room of hubRooms) {
      expect(room.interactables?.length ?? 0).toBeGreaterThanOrEqual(4);
    }
  });
});
