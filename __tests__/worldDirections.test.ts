import {
  findNamedById,
  findNamedByQuery,
  findNearestNamed,
  describeAllDirections,
  parseDirectionQuestion,
} from '../app/engine/worldDirections';
import { generateWorldMap } from '../app/engine/worldMap';
import {
  travelPhraseFor,
  travelPhraseShort,
  travelHoursFor,
  formatWindow,
  HOURS_PER_TILE_TRUE,
} from '../app/engine/travelTime';
import * as worldDirections from '../app/engine/worldDirections';

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

// ---------------------------------------------------------------------------
// OTA-1477 — the compass no longer owns a distance scale.
// ---------------------------------------------------------------------------
//
// ⚠ WHAT THIS BLOCK REPLACED. It used to assert `distanceInDays(1) === "a day's
// travel"` and `distanceInDays(2) === "2 days' travel"`, plus
// `expect(TILES_PER_DAY).toBeGreaterThan(0)`. All four passed for the entire
// life of the defect, because they checked that the module agreed with ITSELF.
// Nothing here ever asked whether the compass agreed with the travel banner,
// which is the only question that mattered, and the answer was 9.6× no.
//
// So the assertions below are all cross-module: the phrase the compass prints
// for N tiles must be the phrase built from `travelHoursFor(N)`, the number the
// banner and the bounty deadline are both built from. There is nothing left to
// pin locally, because there is nothing local left.
describe('OTA-1477 — the compass is priced off travelTime and nothing else', () => {
  it('has no distance scale of its own left to drift', () => {
    // The named class is copied-constant drift; the fix was deletion, not a
    // better value. If either of these comes back, the compass has re-grown a
    // second opinion about what a tile costs.
    expect((worldDirections as Record<string, unknown>).TILES_PER_DAY).toBeUndefined();
    expect((worldDirections as Record<string, unknown>).distanceInDays).toBeUndefined();
  });

  it('prices every distance the map can hold exactly as travelHoursFor does', () => {
    // Whole reachable range on an 82×41 grid: Manhattan distance tops out at
    // 81 + 40 = 121 tiles. Walk all of it, not a sample.
    let checked = 0;
    for (let tiles = 1; tiles <= 121; tiles++) {
      expect(travelPhraseFor(tiles)).toBe(
        `${tiles} tile${tiles === 1 ? '' : 's'}, about ${formatWindow(travelHoursFor(tiles))} of travel`,
      );
      checked++;
    }
    expect(checked).toBe(121); // an empty loop is a failure, not a pass
  });

  it('answers the two lines from the 4.32.11 log with the banner\'s own numbers', () => {
    // 23:49:04  You set course for Voronov. 2 tiles — about 5 hours of travel, all in.
    // 23:50:14  [Voronov] north: Drakova (2 days' travel) · east: Ostragar (9 days' travel)
    // Voronov(52,21) → Drakova(52,19) is 2 tiles; → Ostragar(58,18) is 9.
    expect(travelPhraseFor(2)).toBe('2 tiles, about 5 hours of travel');
    expect(travelPhraseFor(9)).toBe('9 tiles, about 23 hours of travel');
    // And the old answers are gone from both.
    expect(travelPhraseFor(2)).not.toContain('day');
    expect(travelPhraseFor(9)).not.toContain('day');
  });

  it('keeps the standing-on-it sentinel, which callers still branch on', () => {
    expect(travelPhraseFor(0)).toBe('you stand on it');
    expect(travelPhraseFor(-1)).toBe('you stand on it');
    expect(travelPhraseFor(-999)).toBe('you stand on it');
    expect(travelPhraseFor(0.4)).toBe('you stand on it'); // rounds to 0
  });

  it('singularises exactly one tile and pluralises everything else', () => {
    expect(travelPhraseFor(1)).toContain('1 tile,');
    expect(travelPhraseFor(1)).not.toContain('1 tiles');
    for (const t of [2, 3, 10, 24, 121]) {
      expect(travelPhraseFor(t)).toContain(`${t} tiles,`);
    }
  });

  it('rolls over into days at the same boundary the deadline does', () => {
    // 24 h is the rollover. HOURS_PER_TILE_TRUE = 2.5, so 9 tiles = 22.5 h
    // (rounds to 23, still hours) and 10 tiles = 25 h (1 day, 1 hour).
    expect(HOURS_PER_TILE_TRUE).toBe(2.5);
    expect(travelPhraseFor(9)).toContain('23 hours');
    expect(travelPhraseFor(9)).not.toContain('day');
    expect(travelPhraseFor(10)).toContain('1 day, 1 hour');
    // The boundary is formatWindow's, not a second one invented here.
    expect(formatWindow(travelHoursFor(10))).toBe('1 day, 1 hour');
  });

  it('never decreases as the distance grows — monotone in hours', () => {
    let prev = -1;
    for (let tiles = 0; tiles <= 121; tiles++) {
      const h = travelHoursFor(tiles);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
    expect(prev).toBe(121 * HOURS_PER_TILE_TRUE);
  });

  it('is the phrase the lookups actually hand back, not a parallel one', () => {
    // The instrument must not be measuring a function nobody calls. Prove the
    // DirectedLocation records carry this exact string.
    const otherId = Object.keys(map.positions).find((id) => id !== TEST_START)!;
    const result = findNamedById(map, fromX, fromY, otherId)!;
    expect(result.travelPhrase).toBe(travelPhraseFor(result.tiles));
    const near = findNearestNamed(map, fromX, fromY, { excludeId: TEST_START })!;
    expect(near.travelPhrase).toBe(travelPhraseFor(near.tiles));
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

  it('finds via substring match — and picks the NEAREST of the matches', () => {
    // ⚠ OTA-1334 — there are two Grand Spires now (Asgardar's, out on the capital's
    // outskirts, and Etheria's, down on the floor of the Black Reach), so a bare "spire" is
    // genuinely ambiguous. This assertion used to name `grand_spire_of_etheria`, which was
    // only ever true because it was the single spire anywhere near the start tile — it
    // pinned an ACCIDENT of the catalogue, not a rule, and adding a second spire broke it.
    //
    // `findNamedByQuery` states its own tie-break in a comment: "prefer the closer match if
    // multiple names share a substring". That is the rule, so that is what gets asserted —
    // computed from the map rather than hard-coded, so it survives any number of spires
    // being added, moved or renamed later.
    const found = findNamedByQuery(map, fromX, fromY, 'spire');
    expect(found).not.toBeNull();
    expect(found!.locationId).toMatch(/spire/);

    const spires = Object.keys(map.positions).filter((id) => id.includes('spire'));
    expect(spires.length).toBeGreaterThan(1);
    const dist = (id: string): number => {
      const p = map.positions[id]!;
      return Math.abs(p.x - fromX) + Math.abs(p.y - fromY);
    };
    expect(dist(found!.locationId)).toBe(Math.min(...spires.map(dist)));
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

  it('prices each named cardinal with the shared travel phrase', () => {
    // ⚠ OTA-1477 — this test used to accept /travel|open ground/, which the
    // broken "2 days' travel" satisfied just as happily as the fix does. It
    // now recomputes the expected fragment from the map itself.
    const summary = describeAllDirections(map, fromX, fromY);
    let named = 0;
    for (const dir of ['north', 'east', 'south', 'west'] as const) {
      const frag = summary.split(' · ').find((f) => f.startsWith(`${dir}: `))!;
      expect(frag).toBeDefined();
      if (frag === `${dir}: open ground`) continue;
      named++;
      const m = /^\w+: (.+) \((.+)\)$/.exec(frag)!;
      expect(m).not.toBeNull();
      // Find the tile this fragment is describing and re-derive its phrase.
      const hit = findNamedByQuery(map, fromX, fromY, m[1]!)!;
      expect(hit).not.toBeNull();
      // SHORT form — four fragments in one line. Same numbers as the long
      // form, which is asserted directly in ota1477OneWayToPriceADistance.
      expect(m[2]).toBe(travelPhraseShort(hit.tiles));
      expect(travelPhraseFor(hit.tiles)).toContain(m[2]!.split(', ')[1]!);
    }
    // The start tile is not on an empty rim; at least one cardinal is named,
    // so the loop above cannot have been a silent no-op.
    expect(named).toBeGreaterThan(0);
  });

  it('says nothing in days anywhere in the radar line', () => {
    // The exact shape the 4.32.11 log caught: "north: Drakova (2 days' travel)".
    const summary = describeAllDirections(map, fromX, fromY);
    expect(summary).not.toMatch(/days?' travel/);
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
