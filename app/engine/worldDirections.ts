import { type Direction, type WorldMap } from './worldMap';
import { travelPhraseFor, travelPhraseShort } from './travelTime';

// ---------------------------------------------------------------------------
// OTA-1477 — THE COMPASS AND THE BANNER NOW PRICE A DISTANCE THE SAME WAY.
// ---------------------------------------------------------------------------
//
// ⚠ WHAT WAS HERE, AND WHY IT IS GONE. This file used to own a second distance
// scale: `TILES_PER_DAY = 1`, with `distanceInDays()` on top of it, justified by
// a game-feel argument ("the wastes take days to cross; a player asking how far
// to Asgardar expects a journey, not a commute"). The argument was fine. The
// number was a guess, it was made before OTA-1162 gave tiles a real price, and
// nothing ever went back for it — so the compass drifted 9.6× away from the
// travel banner, which OTA-1167 HAD moved onto the real one. From the 4.32.11
// log, 70 seconds apart, about the same two tiles:
//     23:49:04  You set course for Voronov. 2 tiles — about 5 hours of travel, all in.
//     23:50:14  [Voronov] north: Drakova (2 days' travel) · east: Ostragar (9 days' travel)
//
// ⚠ THE FIX IS NOT A BETTER CONSTANT. A corrected `TILES_PER_DAY` would be the
// same defect with a nicer value in it — two derivations of one fact, free to
// drift again the next time the stamina economy moves. There is now exactly one:
// `travelPhraseFor` in travelTime.ts, which every distance-pricing surface in the
// game calls. Do not add a scale here. If the journey ever needs to *feel*
// longer, HOURS_PER_TILE_TRUE is the honest place to say so, and it moves the
// deadline with it — which is the point.

/**
 * Formats a Manhattan-distance tile count into the human phrase the Arbiter
 * uses in answers. Thin pass-through kept so the lookups below read cleanly;
 * the arithmetic lives in travelTime.ts and only there.
 */
function distancePhrase(tiles: number): string {
  return travelPhraseFor(tiles);
}

// ---------------------------------------------------------------------------
// Lookup helpers — answer "where is X" / "nearest town" / etc.
// ---------------------------------------------------------------------------

export interface DirectedLocation {
  locationId: string;
  locationName: string;
  /** Dominant cardinal from the player to the target. */
  direction: Direction;
  /** Manhattan distance in tiles. */
  tiles: number;
  /** Pre-formatted "2 tiles, about 5 hours of travel" phrase — a NOUN PHRASE,
   *  so callers hang it off a sentence with a dash rather than splicing it in
   *  mid-clause. ("Drakova lies north — 2 tiles, about 5 hours of travel.") */
  travelPhrase: string;
}

function dominantDirection(dx: number, dy: number): Direction {
  // Ties favor the east/west axis, which reads more naturally in prose.
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west';
  return dy >= 0 ? 'south' : 'north';
}

function describe(
  map: WorldMap,
  fromX: number,
  fromY: number,
  locationId: string,
): DirectedLocation | null {
  const pos = map.positions[locationId];
  if (!pos) return null;
  const tile = map.tiles[pos.y]?.[pos.x];
  if (!tile?.locationName) return null;
  const dx = pos.x - fromX;
  const dy = pos.y - fromY;
  const tiles = Math.abs(dx) + Math.abs(dy);
  return {
    locationId,
    locationName: tile.locationName,
    direction: dominantDirection(dx, dy),
    tiles,
    travelPhrase: distancePhrase(tiles),
  };
}

/** Look up a specific location by id. */
export function findNamedById(
  map: WorldMap,
  fromX: number,
  fromY: number,
  locationId: string,
): DirectedLocation | null {
  return describe(map, fromX, fromY, locationId);
}

/**
 * Fuzzy name lookup against every named tile on the map. Substring match
 * either direction so "asgardar", "Asgardar", "the capital", "spire" all
 * land on the right tile. Returns null when nothing in the map matches.
 */
export function findNamedByQuery(
  map: WorldMap,
  fromX: number,
  fromY: number,
  query: string,
): DirectedLocation | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  let best: DirectedLocation | null = null;
  for (const [id, pos] of Object.entries(map.positions)) {
    const tile = map.tiles[pos.y]?.[pos.x];
    if (!tile?.locationName) continue;
    const name = tile.locationName.toLowerCase();
    if (id === q || name === q || name.includes(q) || q.includes(name)) {
      const candidate = describe(map, fromX, fromY, id);
      if (!candidate) continue;
      // Prefer the closer match if multiple names share a substring.
      if (!best || candidate.tiles < best.tiles) best = candidate;
    }
  }
  return best;
}

/**
 * Nearest named tile by Manhattan distance. Used to answer "where's the
 * nearest town / vendor / market" — the engine doesn't pin vendors to
 * specific tiles (they spawn in scenes), but every named tile is a
 * candidate scene where a vendor MIGHT appear, so the Arbiter points the
 * player at the nearest one. Optionally excludes the player's current
 * location (so "nearest town" doesn't return the room you're standing in).
 */
export function findNearestNamed(
  map: WorldMap,
  fromX: number,
  fromY: number,
  options: { excludeId?: string } = {},
): DirectedLocation | null {
  let best: DirectedLocation | null = null;
  for (const id of Object.keys(map.positions)) {
    if (options.excludeId && id === options.excludeId) continue;
    const candidate = describe(map, fromX, fromY, id);
    if (!candidate) continue;
    if (candidate.tiles === 0) continue;
    if (!best || candidate.tiles < best.tiles) best = candidate;
  }
  return best;
}

/**
 * Concatenated four-cardinal survey for "what's around me" answers.
 * Returns "north: Asgardar (12 tiles, 1 day, 6 hours) · east: Voronov
 * (2 tiles, 5 hours) · …", with empty quadrants represented as "open ground".
 *
 * ⚠ SHORT form, not the sentence form. Four fragments in one log entry, and
 * the long phrase repeated four times ran the line past 200 characters — a
 * paragraph where the player wanted a glance. Same numbers, both out of
 * `travelWindowFor`; see travelTime.ts.
 */
export function describeAllDirections(
  map: WorldMap,
  fromX: number,
  fromY: number,
): string {
  // Scan outward in each cardinal and pick the closest named tile in that
  // quadrant. Diagonal-leaning tiles are claimed by the dominant axis
  // (matches dominantDirection above) so each cardinal answer is unique.
  const best: Record<Direction, DirectedLocation | null> = {
    north: null,
    east: null,
    south: null,
    west: null,
  };
  for (const id of Object.keys(map.positions)) {
    const candidate = describe(map, fromX, fromY, id);
    if (!candidate || candidate.tiles === 0) continue;
    const cur = best[candidate.direction];
    if (!cur || candidate.tiles < cur.tiles) best[candidate.direction] = candidate;
  }
  const fragments: string[] = [];
  for (const dir of ['north', 'east', 'south', 'west'] as Direction[]) {
    const s = best[dir];
    fragments.push(s ? `${dir}: ${s.locationName} (${travelPhraseShort(s.tiles)})` : `${dir}: open ground`);
  }
  return fragments.join(' · ');
}

// ---------------------------------------------------------------------------
// Question recognition — does the player's input look like a direction Q?
// ---------------------------------------------------------------------------

/**
 * True when the player typed something like "where is the spire", "how far
 * to Asgardar", "directions to Voronov", "which way to the nearest town".
 * Captures the target phrase so the handler can route it to the appropriate
 * lookup (specific id / fuzzy name / nearest-of-type / all-directions).
 */
export function parseDirectionQuestion(text: string): {
  kind: 'specific' | 'nearest' | 'survey' | 'directional';
  target: string;
} | null {
  const t = text.trim();
  // "what's around" / "what is around" / "what's nearby" → survey
  if (/^\s*(what'?s|what\s+is)\s+(around|nearby|near\s+me|out\s+there)/i.test(t)) {
    return { kind: 'survey', target: '' };
  }
  // Directional nearest — "what city is north of me" / "what's to the
  // east" / "what city am I close to in the north" / "closest city
  // west". Captures the cardinal direction so the handler can answer
  // with the closest named tile in THAT direction, not the global
  // nearest. Playtest hit this when the player typed "what city am I
  // close to in the north" and fell into the generic "I don't have a
  // clean answer for that yet" fallback.
  const directional =
    /\b(north|south|east|west)(?:\s+of\s+(?:me|here))?\b/i.exec(t);
  const directionAsked =
    /\b(what|which)\b.*\b(city|town|settlement|location|hub|outpost|place|trader|vendor)\b/i.test(t) ||
    /^\s*(what'?s|what\s+is)\s+(?:to\s+)?(?:the\s+)?(north|south|east|west)/i.test(t) ||
    /\b(close|closest|near|nearest)\b.*\b(north|south|east|west)/i.test(t);
  if (directional && directionAsked) {
    return { kind: 'directional', target: directional[1]!.toLowerCase() };
  }
  // "nearest town" / "closest vendor" / "where is a vendor" → nearest
  if (/\b(nearest|closest)\s+(town|city|settlement|safe|trader|vendor|market|hub|outpost)\b/i.test(t)) {
    return { kind: 'nearest', target: '' };
  }
  // "where is X" / "where's X" / "how far is X" / "how far to X" /
  // "which way to X" / "directions to X" / "how many days to X" — specific
  // location lookup by name.
  const specific =
    /^\s*(?:where\s+is|where'?s|how\s+far\s+(?:is|to)|how\s+do\s+i\s+get\s+to|which\s+way\s+(?:is|to)|directions?\s+to|how\s+many\s+days\s+to|days\s+to)\s+(.+)$/i.exec(
      t,
    );
  if (specific && specific[1]) {
    return {
      kind: 'specific',
      target: specific[1]
        .toLowerCase()
        .replace(/[?.!]+$/g, '')
        .replace(/\bthe\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    };
  }
  return null;
}
