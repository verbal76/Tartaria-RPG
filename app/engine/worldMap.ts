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
import { LOCATION_ATLAS_COORDS, OUTPOST_ATLAS_COORD } from './atlasCoords';
import { HIDDEN_LOCATIONS } from './hiddenLocations';

export type Direction = 'north' | 'east' | 'south' | 'west';

const ALL_LOCATIONS = locationsData as Location[];

// OTA-500 — dynamically-canonized locations the store keeps in sync via
// setCanonExtraLocations. Merged into BOTH the visual map and the canonical grid
// so a place named by a whisper/contract/mission is plotted, routable, and gets an
// exact grid cell. Module state (not threaded through every call site); the store
// re-pushes the persisted list on load + whenever a new place is canonized.
let _extraLocations: Location[] = [];
// OTA-502 — explicit canonical cells for canon locations born at a known spot
// (e.g. a whisper target tile). canonicalCellFor honors these before deriving.
let _explicitCells: Record<string, { x: number; y: number }> = {};
export function setCanonExtraLocations(
  locs: ReadonlyArray<{ id: string; name: string; type?: string; danger?: number; gx?: number; gy?: number }>,
): void {
  const known = new Set(ALL_LOCATIONS.map((l) => l.id));
  const next: Location[] = [];
  const cells: Record<string, { x: number; y: number }> = {};
  for (const l of locs) {
    if (!l.id || known.has(l.id)) continue;
    next.push({
      id: l.id, name: l.name, type: l.type ?? 'site', danger: l.danger ?? 2,
      description: '', tags: ['canon', 'mentioned'], discoverable: true,
    } as unknown as Location);
    if (typeof l.gx === 'number' && typeof l.gy === 'number') {
      cells[l.id] = { x: clampX(l.gx), y: clampY(l.gy) };
    }
  }
  _extraLocations = next;
  _explicitCells = cells;
  _canonCache = null; // the canonical positions table must include the new ids
  _canonCellIndex = null; // arb47 — and the cell→id reverse index derived from it
}
/** All locations the world knows about = static (locations.json) + dynamically
 *  canonized. Used by the visual map, the canonical grid, and the travel list. */
export function allKnownLocations(): Location[] {
  return _extraLocations.length === 0 ? ALL_LOCATIONS : [...ALL_LOCATIONS, ..._extraLocations];
}

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
// arb29 — CANONICAL world. The grid is 82 wide × 41 tall (2:1, matching the
// landscape atlas art) so the continent reads as states-across, not blocks.
// Every named location sits at a FIXED, atlas-derived position — identical
// for every character — instead of a per-save seeded scatter. The map is
// still re-centered on the player's current location (it sits at CENTER), so
// `mapX/mapY` semantics + travelTo are unchanged; only the OTHER locations'
// placement is now canon.
const GRID_W = 82;
const GRID_H = 41;
const CENTER_X = 41;
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
// Atlas → grid spread. Fractions are canvas-agnostic (the artwork has been replaced
// twice since these were tuned); SPREAD_X/SPREAD_Y
// keep that aspect (40/22 ≈ 1.82) so a step east on the grid matches east on
// the atlas, and size the longest canonical journey to ~35-38 tiles on the
// 82-wide grid — a real haul without running off the edge from any center.
const SPREAD_X = 40;
const SPREAD_Y = 22;

const clampX = (v: number): number => Math.max(0, Math.min(GRID_W - 1, v));
const clampY = (v: number): number => Math.max(0, Math.min(GRID_H - 1, v));

// Find the nearest free, distinct tile to (baseX, baseY) by deterministic
// outward ring search. Keeps canonical positions intact when free; only
// nudges when two locations would land on the exact same tile.
function findFreeTile(taken: Set<string>, baseX: number, baseY: number): { x: number; y: number } {
  const bx = clampX(baseX);
  const by = clampY(baseY);
  if (!taken.has(`${bx},${by}`)) return { x: bx, y: by };
  for (let r = 1; r < Math.max(GRID_W, GRID_H); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring only
        const x = clampX(bx + dx);
        const y = clampY(by + dy);
        if (!taken.has(`${x},${y}`)) return { x, y };
      }
    }
  }
  return { x: bx, y: by };
}

export function generateWorldMap(characterSeed: string, startingLocationId: string): WorldMap {
  void characterSeed; // positions are canon now; seed kept for signature compat
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
  const startLoc = allKnownLocations().find((l) => l.id === startingLocationId) ?? ALL_LOCATIONS[0]!;
  tiles[CENTER_Y]![CENTER_X] = {
    x: CENTER_X,
    y: CENTER_Y,
    locationId: startLoc.id,
    locationName: startLoc.name,
    hint: startLoc.name,
  };
  positions[startLoc.id] = { x: CENTER_X, y: CENTER_Y };

  // CANONICAL placement: every other location goes at a FIXED offset from the
  // start, taken straight from the world atlas (LOCATION_ATLAS_COORDS). The
  // offset is the atlas-fraction delta scaled by SPREAD (aspect-preserved),
  // so the geometry is identical for every character — Drakova is always the
  // same bearing + distance from Asgardar. No seed, no per-save scatter.
  // Deterministic id-sorted order makes the rare same-tile nudge stable.
  const others = allKnownLocations().filter((l) => l.id !== startLoc.id);
  // OTA-498 — hidden locations (the Hidden Market) are placed LAST so they only
  // ever fill a leftover free tile and never displace an existing location's
  // canonical tile via findFreeTile — keeping every other location's grid
  // position (and travel distances) identical to before this location existed.
  others.sort((a, b) => {
    const ah = HIDDEN_LOCATIONS[a.id] ? 1 : 0;
    const bh = HIDDEN_LOCATIONS[b.id] ? 1 : 0;
    if (ah !== bh) return ah - bh;
    return a.id.localeCompare(b.id);
  });
  const startAtlas = LOCATION_ATLAS_COORDS[startLoc.id] ?? OUTPOST_ATLAS_COORD;
  const taken = new Set<string>([`${CENTER_X},${CENTER_Y}`]);
  for (const loc of others) {
    // OTA-498 — a hidden location (the Hidden Market) is kept OUT of
    // LOCATION_ATLAS_COORDS so it doesn't perturb the IDW player-dot anchors, but
    // it still carries an atlas fraction on its hidden-location record. Use it for
    // canonical grid placement so the market sits where it's drawn (near the
    // frontier camps), not flung to the id-hash fallback ring.
    const hid = HIDDEN_LOCATIONS[loc.id];
    const locAtlas = LOCATION_ATLAS_COORDS[loc.id] ?? (hid ? { fx: hid.fx, fy: hid.fy } : undefined);
    let baseX: number;
    let baseY: number;
    if (locAtlas) {
      baseX = CENTER_X + Math.round((locAtlas.fx - startAtlas.fx) * SPREAD_X);
      baseY = CENTER_Y + Math.round((locAtlas.fy - startAtlas.fy) * SPREAD_Y);
    } else {
      // Defensive: a location with no atlas coord still needs a stable spot.
      // Deterministic angle from an id hash so it's the same every load.
      const a = (xmur3(loc.id)() % 360) * Math.PI / 180;
      baseX = CENTER_X + Math.round(Math.cos(a) * 22);
      baseY = CENTER_Y + Math.round(Math.sin(a) * 12);
    }
    const place = findFreeTile(taken, baseX, baseY);
    tiles[place.y]![place.x] = { x: place.x, y: place.y, locationId: loc.id, locationName: loc.name, hint: loc.name };
    positions[loc.id] = { x: place.x, y: place.y };
    taken.add(`${place.x},${place.y}`);
  }

  return { tiles, positions };
}

// ─── OTA-499 — ABSOLUTE canonical grid (the install-canon MATH layer) ──────────
// generateWorldMap above re-centers the grid on the player every call (the VISUAL
// / wander map). THIS layer gives every location ONE fixed grid cell for the
// install, independent of where the player stands — so travel distance is exact
// grid-to-grid and never wobbles as the player moves ("locations are grid + math;
// visual overlays are thematic"). Reference is a fixed atlas point (the centre),
// not the player; the SPREAD matches the visual map so travel TIMES are unchanged.
const CANON_REF_FX = 0.5;
const CANON_REF_FY = 0.5;
let _canonCache: Record<string, { x: number; y: number }> | null = null;

function atlasFractionFor(id: string): { fx: number; fy: number } | null {
  const a = LOCATION_ATLAS_COORDS[id];
  if (a) return a;
  const h = HIDDEN_LOCATIONS[id];
  if (h) return { fx: h.fx, fy: h.fy };
  return null;
}

/** Deterministic absolute grid cell for a location id, from its atlas fraction
 *  (or a stable id-hash for ids the atlas doesn't place). Pure — no player. */
export function canonicalCellFor(id: string): { x: number; y: number } {
  // OTA-502 — a place born at a known spot (whisper target) carries its exact cell.
  const explicit = _explicitCells[id];
  if (explicit) return explicit;
  const frac = atlasFractionFor(id);
  if (frac) {
    return {
      x: clampX(CENTER_X + Math.round((frac.fx - CANON_REF_FX) * SPREAD_X)),
      y: clampY(CENTER_Y + Math.round((frac.fy - CANON_REF_FY) * SPREAD_Y)),
    };
  }
  // Unknown/atlas-less id → stable hash angle (matches generateWorldMap's fallback).
  const a = (xmur3(id)() % 360) * Math.PI / 180;
  return {
    x: clampX(CENTER_X + Math.round(Math.cos(a) * 22)),
    y: clampY(CENTER_Y + Math.round(Math.sin(a) * 12)),
  };
}

/** OTA-505 — inverse of the canonicalCellFor placement: a grid cell → its atlas
 *  fraction (0..1), for positioning an overlay (a "?"/"X" event marker) at a cell.
 *  Clamped to the image so a far cell still lands on the map. */
export function cellToAtlasFraction(x: number, y: number): { fx: number; fy: number } {
  const fx = CANON_REF_FX + (x - CENTER_X) / SPREAD_X;
  const fy = CANON_REF_FY + (y - CENTER_Y) / SPREAD_Y;
  return { fx: Math.max(0, Math.min(1, fx)), fy: Math.max(0, Math.min(1, fy)) };
}

// ⚠ OTA-1343 — THE WILDS HAVE NAMES. Owner, walking free of Iskan-Veil with the
// bar still claiming the city: *"do locations have a radius other than the tile —
// maybe a 2 tile radius around it that's still considered that area? but outside
// of any area's ring of influence wouldn't I be on the road, or in the wilds or
// on the outskirts or badlands or some lore specific unnamed area?"* Yes — now
// exactly that, in tiers:
//   d = 0        → null (you are AT the place; the scene bar shows its real name)
//   d ≤ 2        → "<Name> Outskirts" — the ring of influence he described
//   in transit   → "The road to <target>" — a plotted course names the road
//   otherwise    → a lore region name from the atlas geography itself, by band:
//                  the safe frontier strip up top, the drowned capital reaches
//                  across the middle, the southern badlands arc, the Deep at the
//                  bottom — with the eastern mud given its own name where the
//                  painting drowns everything in silt.
export const OUTSKIRTS_RADIUS = 2;

const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** Nearest STATIC named location to a cell, by chebyshev distance on the canon
 *  grid (hidden locations excluded — an unfound place must not name the ground). */
export function nearestNamedLocation(x: number, y: number): { id: string; name: string; dist: number } | null {
  let best: { id: string; name: string; dist: number } | null = null;
  for (const loc of ALL_LOCATIONS) {
    if (HIDDEN_LOCATIONS[loc.id]) continue;
    const c = canonicalCellFor(loc.id);
    const d = chebyshev(x, y, c.x, c.y);
    if (!best || d < best.dist) best = { id: loc.id, name: loc.name, dist: d };
  }
  return best;
}

/** The lore name for open ground at a cell, from the atlas band it sits in. */
export function wildsNameFor(x: number, y: number): string {
  const { fx, fy } = cellToAtlasFraction(x, y);
  if (fy >= 0.8) return 'The Deep Wastes';
  if (fy >= 0.62) return 'The Southern Badlands';
  if (fy >= 0.25) return fx >= 0.62 ? 'The Eastern Mud' : 'The Drowned Reaches';
  return 'The Frontier Silt';
}

/** The tiered overland area label — see the OTA-1343 note above. Returns null
 *  when the cell IS a named location's own tile (caller shows the real name). */
export function overlandAreaLabel(
  x: number,
  y: number,
  roadToName?: string | null,
): string | null {
  const near = nearestNamedLocation(x, y);
  if (near && near.dist === 0) return null;
  if (near && near.dist <= OUTSKIRTS_RADIUS) return `${near.name} Outskirts`;
  if (roadToName) return `The road to ${roadToName}`;
  return wildsNameFor(x, y);
}

/** The install-canon position table for every static location, collision-resolved
 *  once in a fixed (id-sorted, hidden-last) order so it's identical every load. */
export function canonicalPositions(): Record<string, { x: number; y: number }> {
  if (_canonCache) return _canonCache;
  const positions: Record<string, { x: number; y: number }> = {};
  const taken = new Set<string>();
  const ordered = [...allKnownLocations()].sort((a, b) => {
    const ah = HIDDEN_LOCATIONS[a.id] ? 1 : 0;
    const bh = HIDDEN_LOCATIONS[b.id] ? 1 : 0;
    if (ah !== bh) return ah - bh;
    return a.id.localeCompare(b.id);
  });
  for (const loc of ordered) {
    const base = canonicalCellFor(loc.id);
    const place = findFreeTile(taken, base.x, base.y);
    positions[loc.id] = place;
    taken.add(`${place.x},${place.y}`);
  }
  _canonCache = positions;
  return positions;
}

/** Exact grid-to-grid Manhattan distance between two locations on the canonical
 *  grid. Stable for the install — the same two locations are always the same
 *  distance apart, no matter where the player currently stands. */
export function canonicalDistance(fromId: string | null | undefined, toId: string | null | undefined): number {
  if (!fromId || !toId) return 0;
  const p = canonicalPositions();
  const a = p[fromId] ?? canonicalCellFor(fromId);
  const b = p[toId] ?? canonicalCellFor(toId);
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** EXACT canonical distance from the PLAYER's live position to a target. The
 *  player's canonical cell = their current location's canonical cell + their
 *  in-transit offset (mapX/mapY are measured against CENTER on the re-centered
 *  visual map, and that offset translates 1:1 to the canonical grid since both
 *  share bearing + SPREAD). So mid-journey the distance is the real grid distance,
 *  not a blind countdown — exact at every tile, no clamp, no extra state. */
export function canonicalDistanceFromPlayer(
  currentLocationId: string | null | undefined,
  mapX: number,
  mapY: number,
  targetId: string | null | undefined,
): number {
  if (!currentLocationId || !targetId) return 0;
  const p = canonicalPositions();
  const cur = p[currentLocationId] ?? canonicalCellFor(currentLocationId);
  const tgt = p[targetId] ?? canonicalCellFor(targetId);
  const px = clampX(cur.x + (mapX - CENTER_X));
  const py = clampY(cur.y + (mapY - CENTER_Y));
  return Math.abs(px - tgt.x) + Math.abs(py - tgt.y);
}

// ─── arb47 — ABSOLUTE-GRID player position (the warp fix) ───────────────────────
// The player carries a persistent absolute canonical cell (player.gridX/gridY).
// Distance + movement are measured DIRECTLY against the install-fixed canon grid
// — never reconstructed from "current location + re-centered offset" (which
// jumped the anchor whenever the player crossed a named tile). These helpers are
// the canon-grid-native primitives the store uses for stepping and routing, so a
// place is always the same distance from a given cell and 5 south + 5 north
// returns to the exact same cell.

/** The location's TRUE placed cell on the install-fixed canon grid: the
 *  collision-resolved `canonicalPositions()` entry (what the visual map and the
 *  cell→id reverse index agree on), falling back to the raw atlas cell only for
 *  ids the table doesn't carry. This — not raw `canonicalCellFor` — is the cell
 *  the player snaps to on arrival and routes toward, so "where Drakova is" is one
 *  number everything agrees on (matters when a location was nudged off a
 *  collision). */
export function canonicalCellOf(id: string): { x: number; y: number } {
  return canonicalPositions()[id] ?? canonicalCellFor(id);
}

/** Exact grid-to-grid Manhattan distance from an ABSOLUTE player cell to a target
 *  location's fixed canon cell. The player's cell is authoritative — no offset
 *  reconstruction, so the estimate never warps as the player crosses locations. */
export function canonicalDistanceFromGrid(
  gridX: number,
  gridY: number,
  targetId: string | null | undefined,
): number {
  if (!targetId) return 0;
  const p = canonicalPositions();
  const tgt = p[targetId] ?? canonicalCellFor(targetId);
  return Math.abs(gridX - tgt.x) + Math.abs(gridY - tgt.y);
}

// Reverse index of the canon position table: "cellKey" → locationId. Built once
// (the canon table is install-fixed) so stepping onto a cell can resolve the
// named location sitting there in O(1).
let _canonCellIndex: Record<string, { locationId: string; locationName: string }> | null = null;
function canonCellIndex(): Record<string, { locationId: string; locationName: string }> {
  if (_canonCellIndex) return _canonCellIndex;
  const idx: Record<string, { locationId: string; locationName: string }> = {};
  const positions = canonicalPositions();
  const byId = new Map(allKnownLocations().map((l) => [l.id, l] as const));
  for (const [id, pos] of Object.entries(positions)) {
    const loc = byId.get(id);
    idx[`${pos.x},${pos.y}`] = { locationId: id, locationName: loc?.name ?? id };
  }
  _canonCellIndex = idx;
  return idx;
}

/** The named location whose fixed canon cell IS (x, y), or null. Used by cardinal
 *  stepping: walking onto a location's canon cell is an arrival. */
export function canonicalLocationAtCell(
  x: number,
  y: number,
): { locationId: string; locationName: string } | null {
  return canonCellIndex()[`${x},${y}`] ?? null;
}

/** Clamp an absolute grid cell to the board. Exposed so the store can keep the
 *  player on the grid (movement is grid-bounded; there is no warp past an edge). */
export function clampGridCell(x: number, y: number): { x: number; y: number } {
  return { x: clampX(x), y: clampY(y) };
}

/** The re-centered VISUAL coordinate (mapX/mapY) for an absolute player cell,
 *  given the location the visual map is currently centered on. Lets the store
 *  keep the thematic re-centered map + surveys in sync with the authoritative
 *  absolute position without that visual frame ever driving real movement. */
export function gridToVisual(
  gridX: number,
  gridY: number,
  centeredLocationId: string | null | undefined,
): { mapX: number; mapY: number } {
  const cur = centeredLocationId
    ? (canonicalPositions()[centeredLocationId] ?? canonicalCellFor(centeredLocationId))
    : { x: CENTER_X, y: CENTER_Y };
  return {
    mapX: clampX(CENTER_X + (gridX - cur.x)),
    mapY: clampY(CENTER_Y + (gridY - cur.y)),
  };
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
