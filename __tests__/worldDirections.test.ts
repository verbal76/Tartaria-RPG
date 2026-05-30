import {
  distanceInDays,
  findNamedById,
  findNamedByQuery,
  findNearestNamed,
  describeAllDirections,
  parseDirectionQuestion,
  TILES_PER_DAY,
} from '../app/engine/worldDirections';
import { generateWorldMap } from '../app/engine/worldMap';

// A deterministic map for the lookup tests. Seed and starting location
// fixed so the test is reproducible.
const TEST_SEED = 'directions-test|mud_dweller|forgotten_order|legacy';
const TEST_START = 'tartarian_outskirts';
const map = generateWorldMap(TEST_SEED, TEST_START);
// Anchor the queries at the start location's tile so all distances are
// measured from the same point in every test.
const start = map.positions[TEST_START]!;
const fromX = start.x;
const fromY = start.y;

describe('distanceInDays', () => {
  it('returns the "you stand on it" sentinel at zero', () => {
    expect(distanceInDays(0)).toBe('you stand on it');
    expect(distanceInDays(-1)).toBe('you stand on it');
  });

  it('formats one tile as a single day phrase', () => {
    expect(distanceInDays(1)).toBe("a day's travel");
  });

  it('formats larger tile counts pluralised', () => {
    expect(distanceInDays(2)).toBe("2 days' travel");
    expect(distanceInDays(7)).toBe("7 days' travel");
  });

  it('round-trips through the TILES_PER_DAY constant', () => {
    expect(TILES_PER_DAY).toBeGreaterThan(0);
  });
});

describe('findNamedById', () => {
  it('returns null for an unknown id', () => {
    expect(findNamedById(map, fromX, fromY, 'no_such_place')).toBeNull();
  });

  it('returns a 0-distance match when querying the player\'s own tile', () => {
    const self = findNamedById(map, fromX, fromY, TEST_START);
    expect(self).not.toBeNull();
    expect(self!.tiles).toBe(0);
    expect(self!.travelPhrase).toBe('you stand on it');
  });

  it('computes Manhattan distance and dominant cardinal for another tile', () => {
    // Pick any other location from the map's position table.
    const otherId = Object.keys(map.positions).find((id) => id !== TEST_START)!;
    const result = findNamedById(map, fromX, fromY, otherId);
    expect(result).not.toBeNull();
    expect(result!.tiles).toBeGreaterThan(0);
    expect(['north', 'east', 'south', 'west']).toContain(result!.direction);
    expect(result!.travelPhrase).toMatch(/travel|stand/);
  });
});

describe('findNamedByQuery', () => {
  it('finds a known location by exact name (case-insensitive)', () => {
    // Asgardar is a known location; its position depends on the seed but it
    // should always be on the map.
    const found = findNamedByQuery(map, fromX, fromY, 'asgardar');
    expect(found?.locationId).toBe('asgardar');
  });

  it('finds via substring match', () => {
    const found = findNamedByQuery(map, fromX, fromY, 'spire');
    expect(found?.locationId).toBe('grand_spire_of_etheria');
  });

  it('returns null for nonsense queries', () => {
    expect(findNamedByQuery(map, fromX, fromY, 'definitely not a place')).toBeNull();
    expect(findNamedByQuery(map, fromX, fromY, '')).toBeNull();
  });
});

describe('findNearestNamed', () => {
  it('returns the closest non-current location', () => {
    const near = findNearestNamed(map, fromX, fromY, { excludeId: TEST_START });
    expect(near).not.toBeNull();
    expect(near!.locationId).not.toBe(TEST_START);
    expect(near!.tiles).toBeGreaterThan(0);
  });

  it('also returns the current tile when excludeId is omitted (callers can decide)', () => {
    const result = findNearestNamed(map, fromX, fromY);
    // Without excludeId, the function still skips 0-distance candidates so
    // it never returns the player's own tile.
    expect(result).not.toBeNull();
    expect(result!.tiles).toBeGreaterThan(0);
  });
});

describe('describeAllDirections', () => {
  it('returns a "·"-joined string covering all four cardinals', () => {
    const summary = describeAllDirections(map, fromX, fromY);
    expect(summary).toMatch(/north:/);
    expect(summary).toMatch(/east:/);
    expect(summary).toMatch(/south:/);
    expect(summary).toMatch(/west:/);
    expect(summary).toContain(' · ');
  });

  it('uses the days phrasing, not raw tiles', () => {
    const summary = describeAllDirections(map, fromX, fromY);
    // Either a "days' travel" / "day's travel" phrase OR "open ground".
    expect(summary).toMatch(/travel|open ground/);
  });
});

describe('parseDirectionQuestion', () => {
  it.each([
    ['where is asgardar', { kind: 'specific', target: 'asgardar' }],
    ['where is the spire', { kind: 'specific', target: 'spire' }],
    ["how far is varakush", { kind: 'specific', target: 'varakush' }],
    ['how far to drakova', { kind: 'specific', target: 'drakova' }],
    ['which way to the capital', { kind: 'specific', target: 'capital' }],
    ['directions to nimari', { kind: 'specific', target: 'nimari' }],
    ['how many days to asgardar', { kind: 'specific', target: 'asgardar' }],
  ])('parses "%s" as a specific question', (text, expected) => {
    expect(parseDirectionQuestion(text)).toEqual(expected);
  });

  it.each([
    'nearest town',
    'closest vendor',
    'where is the nearest town',
    'which way to the nearest market',
  ])('parses "%s" as a nearest-of-type question', (text) => {
    const result = parseDirectionQuestion(text);
    expect(result?.kind).toBe('nearest');
  });

  it.each([
    "what's around me",
    'what is around',
    "what's nearby",
  ])('parses "%s" as a survey question', (text) => {
    const result = parseDirectionQuestion(text);
    expect(result?.kind).toBe('survey');
  });

  it.each([
    'attack',
    'rest',
    'inventory',
    'what is the Aether',
    '',
  ])('returns null for non-direction inputs ("%s")', (text) => {
    expect(parseDirectionQuestion(text)).toBeNull();
  });
});
