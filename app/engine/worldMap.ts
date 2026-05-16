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

// Big grid: 21×21 = 441 tiles for ~21 named locations means most movement
// is open ground (wandering). The map's job is structural — give the
// engine a coordinate space so it knows what direction the Cradle of
// Dusk is from the Outskirts. Nothing here is shown to the player as a
// visual.
const GRID_W = 21;
const GRID_H = 21;
const CENTER_X = 10;
const CENTER_Y = 10;

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

  // Sort the rest by danger (low first goes near, high goes to edges).
  const others = ALL_LOCATIONS.filter((l) => l.id !== startLoc.id);
  others.sort((a, b) => a.danger - b.danger);

  // Place each location at a random tile within a danger-weighted radius.
  // We reject collisions and tiles too close to existing placements so the
  // map stays sparse — most tiles are open wandering ground, locations
  // are 3-5 tiles apart on average.
  const taken = new Set<string>([`${CENTER_X},${CENTER_Y}`]);
  for (const loc of others) {
    const minRadius = Math.max(2, loc.danger * 2);
    const maxRadius = Math.min(Math.max(GRID_W, GRID_H) - 1, loc.danger * 3 + 4);
    let placed = false;
    for (let attempt = 0; attempt < 30 && !placed; attempt++) {
      const angle = rng() * Math.PI * 2;
      const r = minRadius + rng() * (maxRadius - minRadius);
      const x = CENTER_X + Math.round(Math.cos(angle) * r);
      const y = CENTER_Y + Math.round(Math.sin(angle) * r);
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
    // If we failed to place after 30 attempts, drop it in any free tile
    // outside the center area.
    if (!placed) {
      for (let y = 0; y < GRID_H && !placed; y++) {
        for (let x = 0; x < GRID_W && !placed; x++) {
          const key = `${x},${y}`;
          if (taken.has(key)) continue;
          if (Math.abs(x - CENTER_X) + Math.abs(y - CENTER_Y) < 2) continue;
          tiles[y]![x] = { x, y, locationId: loc.id, locationName: loc.name, hint: loc.name };
          positions[loc.id] = { x, y };
          taken.add(key);
          placed = true;
        }
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
