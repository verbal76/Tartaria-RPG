import { type Direction, type WorldMap } from './worldMap';

// ---------------------------------------------------------------------------
// Narrative distance scale
// ---------------------------------------------------------------------------
//
// The procedural world map is dense at the mechanical layer — 1 cardinal
// step costs 1 in-game hour of stamina time. But the Arbiter narrates
// distances at the *imperial* scale, where Tartaria's wastes take days to
// cross on foot. This is a game-feel item: when the player asks "how far
// to Asgardar?" they expect a number that sounds like a journey, not a
// commute.
//
// TILES_PER_DAY converts grid distance to in-game-days-of-constant-travel
// (no rest). 1 tile = 1 day. Asgardar at danger=4 sits 8–16 tiles from the
// Outskirts, so "8–16 days east" for the lost capital — a journey, not a
// stroll.
export const TILES_PER_DAY = 1;

/**
 * Formats a Manhattan-distance tile count into a human phrase the Arbiter
 * uses in answers. "5 days' travel", "a day's travel", "you stand on it".
 */
export function distanceInDays(tiles: number): string {
  if (tiles <= 0) return 'you stand on it';
  const days = Math.max(1, Math.round(tiles / TILES_PER_DAY));
  return days === 1 ? "a day's travel" : `${days} days' travel`;
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
  /** Pre-formatted "N days' travel" phrase. */
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
    travelPhrase: distanceInDays(tiles),
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
 * Returns "north: Asgardar (3 days' travel) · east: Voronov (1 day's
 * travel) · …", with empty quadrants represented as "open ground".
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
    fragments.push(s ? `${dir}: ${s.locationName} (${s.travelPhrase})` : `${dir}: open ground`);
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
  kind: 'specific' | 'nearest' | 'survey';
  target: string;
} | null {
  const t = text.trim();
  // "what's around" / "what is around" / "what's nearby" → survey
  if (/^\s*(what'?s|what\s+is)\s+(around|nearby|near\s+me|out\s+there)/i.test(t)) {
    return { kind: 'survey', target: '' };
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
