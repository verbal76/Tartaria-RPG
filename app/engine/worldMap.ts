// Procedural world-map layout — places every Location on a sparse grid
// with cardinal-direction neighbours, seeded by the player's character so
// each save gets its own map. The Outskirts (or the player's starting
// location) sits at the origin; everything else fans out by danger tier.
//
// The map is HUGE relative to the location count — locations are spread
// across a 9×9 grid with vacant tiles between them, so "go north" usually
// just gives you open ground (a wander scene) and only occasionally lands
// on another named location.

import locationsData from '../data/locations/locations.json';
import type { Location } from './types';
import { LOCATION_ATLAS_COORDS } from './atlasCoords';

export type Direction = 'north' | 'east' | 'south' | 'west';

const ALL_LOCATIONS = locationsData as Location[];

// A pure deterministic PRNG. xmur3 hash → mulberry32. Identical seed always
// produces the same map for a character.
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(characterSeed: string): () => number {
  const hash = xmur3(characterSeed);
  return mulberry32(hash());
}

export interface MapTile {
  x: number;
  y: number;
  locationId: string | null;
  locationName: string | null;
  /** What you can see if you look in this direction. Empty for empty tiles. */
  hint: string;
}

// Wide grid: 41×41 = 1681 tiles for ~21 named locations means most
// movement is open ground (wandering). Sized so the lore-canonical
// danger bands (D5 = 20-28 days' travel from start) fit without
// clamping at the grid edge. Most tiles are empty — wasteland
// encounters and roadside traders fill the wandering ground.
//
// Doubled from the original 21×21 in the v2.4.1 map-marker overhaul
// (OTA 2026-05-23-019). Reason: the world should feel like 2-3
// states across, not 2-3 city blocks. Players need enough wander
// tiles between cities to land encounters, collectibles, and
// travelling NPCs.
const GRID_W = 41;
const GRID_H = 41;
const CENTER_X = 20;
const CENTER_Y = 20;
/** Exported so travelTo can reset the player to the new map's center
 *  after a location change — without this, mapX/mapY carry the old
 *  crossing position into a freshly regenerated map and the next
 *  cardinal step lands on whatever tile happens to be at that
 *  offset (manifested in the QA sim as "south" bouncing between two
 *  neighbors). */
export const WORLD_MAP_CENTER_X = CENTER_X;
export const WORLD_MAP_CENTER_Y = CENTER_Y;

export interface WorldMap {
  /** GRID_H × GRID_W matrix. tiles[y][x] */
  tiles: MapTile[][];
  /** locationId → {x, y}. */
  positions: Record<string, { x: number; y: number }>;
}

// Generate a deterministic world map for a character. Starting location
// goes at the center; other locations scatter outward, with rarer/danger
// locations weighted to the edges.
export function generateWorldMap(characterSeed: string, startingLocationId: string): WorldMap {
  const rng = makeRng(characterSeed);
  const tiles: MapTile[][] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: MapTile[] = [];
    for (let x = 0; x < GRID_W; x++) {
      row.push({ x, y, locationId: null, locationName: null, hint: '' });
    }
    tiles.push(row);
  }

  const positions: Record<string, { x: number; y: number }> = {};

  // Center the start.
  const startLoc = ALL_LOCATIONS.find((l) => l.id === startingLocationId) ?? ALL_LOCATIONS[0]!;
  tiles[CENTER_Y]![CENTER_X] = {
    x: CENTER_X,
    y: CENTER_Y,
    locationId: startLoc.id,
    locationName: startLoc.name,
    hint: startLoc.name,
  };
  positions[startLoc.id] = { x: CENTER_X, y: CENTER_Y };

  // Sort by danger DESCENDING — place the high-danger (far-edge)
  // locations first while the outer rings of the grid are still
  // uncontested. Otherwise D1 locations claim the near-center band
  // and the D5 locations all crowd the same far arcs, fall back to
  // jitter, and drift off canonical bearing. Reverse order keeps
  // the most position-sensitive placements on-canon.
  const others = ALL_LOCATIONS.filter((l) => l.id !== startLoc.id);
  others.sort((a, b) => b.danger - a.danger);

  // Place each location at a random tile within a danger-weighted radius,
  // along the CANONICAL BEARING from the starting location's atlas
  // position to this location's atlas position. This means "east in the
  // engine" matches "east on the canonical atlas" — walking east toward
  // Asgardar actually walks you toward where Asgardar is drawn on the
  // map, not toward whatever random procedural tile got picked.
  //
  // Radius is still randomized within the danger band so different
  // characters get different journey lengths (canonical lore says
  // "a fortnight at most" not "exactly 13 days"). Direction is fixed.
  //
  // Bands sized for the 41×41 grid (max usable radius ~28 from center):
  //   D1: 4-12   (Outpost catchment, ~a week+)
  //   D2: 8-18   (Borderlands proper)
  //   D3: 12-22  (outer formations)
  //   D4: 16-26  (regional capitals)
  //   D5: 20-28  (deep relic sites — at the corners)
  const startAtlas = LOCATION_ATLAS_COORDS[startLoc.id] ?? null;
  // Atlas is 1408 × 768. To compute a direction-preserving bearing in
  // procedural-tile space, we aspect-correct the X component so equal
  // visual atlas distances translate to equal procedural-tile distances.
  const ATLAS_ASPECT = 1408 / 768;

  const taken = new Set<string>([`${CENTER_X},${CENTER_Y}`]);
  for (const loc of others) {
    const minRadius = Math.max(4, loc.danger * 4);
    const maxRadius = Math.min(28, loc.danger * 5 + 8);
    // Canonical bearing: vector from start anchor to this location's
    // anchor in aspect-corrected atlas space. If either lacks an atlas
    // coord (defensive), fall back to a deterministic per-location
    // pseudo-random angle so placement is still stable across saves.
    const locAtlas = LOCATION_ATLAS_COORDS[loc.id] ?? null;
    let bearing: number;
    if (startAtlas && locAtlas) {
      const dxAtlas = (locAtlas.fx - startAtlas.fx) * ATLAS_ASPECT;
      const dyAtlas = locAtlas.fy - startAtlas.fy;
      bearing = Math.atan2(dyAtlas, dxAtlas);
    } else {
      bearing = rng() * Math.PI * 2;
    }
    let placed = false;
    for (let attempt = 0; attempt < 30 && !placed; attempt++) {
      // First 15 attempts: fixed bearing, jittered radius — keeps
      // placement perfectly on-canon when there's room.
      // Next 15 attempts: jitter bearing by up to ±25° so a
      // collision-heavy quadrant can fan out without crossing the
      // X/Y axis for locations with near-axial canonical bearings.
      // ±25° (50° arc) is enough for collision avoidance without
      // flipping a "barely south" location into "north."
      const bearingJitter = attempt < 15
        ? 0
        : (rng() - 0.5) * (Math.PI * 5 / 18); // ±25°
      const effectiveBearing = bearing + bearingJitter;
      const r = minRadius + rng() * (maxRadius - minRadius);
      const x = CENTER_X + Math.round(Math.cos(effectiveBearing) * r);
      const y = CENTER_Y + Math.round(Math.sin(effectiveBearing) * r);
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
      const key = `${x},${y}`;
      if (taken.has(key)) continue;
      // Don't sit adjacent to another location — keep the map "huge".
      // Don't sit within 2 tiles of another named location — keeps the
      // world feeling huge and walks meaningful.
      let tooClose = false;
      for (const k of taken) {
        const [tx, ty] = k.split(',').map(Number) as [number, number];
        if (Math.abs(tx - x) + Math.abs(ty - y) <= 2) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      tiles[y]![x] = { x, y, locationId: loc.id, locationName: loc.name, hint: loc.name };
      positions[loc.id] = { x, y };
      taken.add(key);
      placed = true;
    }
    // Bearing-aware fallback. If 30 jittered attempts all collided,
    // walk every grid tile and pick the closest free one to the
    // ideal bearing*radius point — keeps the placement in the
    // canonical quadrant rather than starting from (0,0).
    if (!placed) {
      const midRadius = (minRadius + maxRadius) / 2;
      const idealX = CENTER_X + Math.cos(bearing) * midRadius;
      const idealY = CENTER_Y + Math.sin(bearing) * midRadius;
      let bestX = -1;
      let bestY = -1;
      let bestD = Infinity;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const key = `${x},${y}`;
          if (taken.has(key)) continue;
          if (Math.abs(x - CENTER_X) + Math.abs(y - CENTER_Y) < 2) continue;
          // Reject tiles adjacent to existing placements (keep the
          // world huge — same rule the main loop uses).
          let tooClose = false;
          for (const k of taken) {
            const [tx, ty] = k.split(',').map(Number) as [number, number];
            if (Math.abs(tx - x) + Math.abs(ty - y) <= 2) {
              tooClose = true;
              break;
            }
          }
          if (tooClose) continue;
          const d = Math.hypot(x - idealX, y - idealY);
          if (d < bestD) {
            bestD = d;
            bestX = x;
            bestY = y;
          }
        }
      }
      if (bestX >= 0) {
        tiles[bestY]![bestX] = { x: bestX, y: bestY, locationId: loc.id, locationName: loc.name, hint: loc.name };
        positions[loc.id] = { x: bestX, y: bestY };
        taken.add(`${bestX},${bestY}`);
        placed = true;
      }
    }
  }

  return { tiles, positions };
}

// Step one tile in a cardinal direction. Returns the new x/y (clamped to
// the grid) and whether the player crossed into a named location.
export function stepInDirection(
  map: WorldMap,
  fromX: number,
  fromY: number,
  dir: Direction,
): { x: number; y: number; landedOn: { locationId: string; locationName: string } | null } {
  let x = fromX;
  let y = fromY;
  switch (dir) {
    case 'north': y -= 1; break;
    case 'south': y += 1; break;
    case 'east':  x += 1; break;
    case 'west':  x -= 1; break;
  }
  x = Math.max(0, Math.min(GRID_W - 1, x));
  y = Math.max(0, Math.min(GRID_H - 1, y));
  const tile = map.tiles[y]?.[x];
  const landedOn = tile?.locationId
    ? { locationId: tile.locationId, locationName: tile.locationName ?? tile.locationId }
    : null;
  return { x, y, landedOn };
}

// Sense nearby locations in a given direction. Walks the grid up to
// `range` tiles and returns the first named location encountered, along
// with how far it is. Used to give the player direction-aware "what's
// near" hints when they wander.
export function senseDirection(
  map: WorldMap,
  fromX: number,
  fromY: number,
  dir: Direction,
  range = 8,
): { name: string; distance: number } | null {
  let dx = 0;
  let dy = 0;
  switch (dir) {
    case 'north': dy = -1; break;
    case 'south': dy = 1; break;
    case 'east':  dx = 1; break;
    case 'west':  dx = -1; break;
  }
  for (let i = 1; i <= range; i++) {
    const x = fromX + dx * i;
    const y = fromY + dy * i;
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return null;
    const tile = map.tiles[y]?.[x];
    if (tile?.locationName) return { name: tile.locationName, distance: i };
  }
  return null;
}

// Survey: return what's in each cardinal direction within range. Used by
// the compass UI / "look around" with a compass equipped.
export function surveyAll(
  map: WorldMap,
  fromX: number,
  fromY: number,
  range = 8,
): Record<Direction, { name: string; distance: number } | null> {
  return {
    north: senseDirection(map, fromX, fromY, 'north', range),
    east:  senseDirection(map, fromX, fromY, 'east', range),
    south: senseDirection(map, fromX, fromY, 'south', range),
    west:  senseDirection(map, fromX, fromY, 'west', range),
  };
}

export const MAP_DIM = { width: GRID_W, height: GRID_H, centerX: CENTER_X, centerY: CENTER_Y };
