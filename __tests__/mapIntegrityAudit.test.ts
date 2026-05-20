// Map integrity audit — exercises the procedural world-map generator and
// cardinal-travel helpers to catch reachability holes, infinite-loop
// clusters, survey/walk mismatches, boundary clamp bugs, and seed
// non-determinism.
//
// Note: the task brief calls the grid 9×9 / 8 tiles of reach, but the
// actual generator uses a 21×21 grid (see MAP_DIM). We assert against the
// real dimensions and tag failures with absolute coords.

import {
  generateWorldMap,
  stepInDirection,
  surveyAll,
  senseDirection,
  MAP_DIM,
  type Direction,
  type WorldMap,
} from '../app/engine/worldMap';
import { findNearestNamed } from '../app/engine/worldDirections';
import locationsData from '../app/data/locations/locations.json';
import type { Location } from '../app/engine/types';

const LOCATIONS = locationsData as Location[];
const SEED = 'audit-seed';
const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];
const W = MAP_DIM.width;
const H = MAP_DIM.height;
const CX = MAP_DIM.centerX;
const CY = MAP_DIM.centerY;
const REACH = Math.max(W, H); // enough to walk corner-to-corner

function bfsReachable(map: WorldMap, sx: number, sy: number): Set<string> {
  const seen = new Set<string>([`${sx},${sy}`]);
  const queue: Array<[number, number]> = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const d of DIRECTIONS) {
      const step = stepInDirection(map, x, y, d);
      const key = `${step.x},${step.y}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push([step.x, step.y]);
      }
    }
  }
  return seen;
}

describe('mapIntegrityAudit', () => {
  test('1. Every named location is reachable via BFS from center', () => {
    const failures: Array<{ start: string; missing: string[] }> = [];
    for (const loc of LOCATIONS) {
      const map = generateWorldMap(SEED, loc.id);
      const visited = bfsReachable(map, CX, CY);
      const surfaced = new Set<string>();
      for (const key of visited) {
        const [xs, ys] = key.split(',');
        const x = Number(xs);
        const y = Number(ys);
        const tile = map.tiles[y]?.[x];
        if (tile?.locationId) surfaced.add(tile.locationId);
      }
      const placed = Object.keys(map.positions);
      const missing = placed.filter((id) => !surfaced.has(id));
      if (missing.length) failures.push({ start: loc.id, missing });
    }
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.log('Reachability failures:', JSON.stringify(failures, null, 2));
    }
    expect(failures).toEqual([]);
  });

  test('1b. surveyAll reports every named neighbor within reach when walked', () => {
    // For each starting location, BFS finds every placed named tile.
    // (Range-limited surveyAll from a single tile cannot see the whole
    // grid; walking can. This documents the gap explicitly.)
    for (const loc of LOCATIONS) {
      const map = generateWorldMap(SEED, loc.id);
      const visited = bfsReachable(map, CX, CY);
      const placedTiles = Object.entries(map.positions).map(
        ([id, p]) => ({ id, key: `${p.x},${p.y}` }),
      );
      for (const { id, key } of placedTiles) {
        expect({ start: loc.id, id, visited: visited.has(key) }).toEqual({
          start: loc.id,
          id,
          visited: true,
        });
      }
    }
  });

  test('2. No isolated tiles — BFS reaches every tile on the grid', () => {
    const failures: Array<{ start: string; missingTiles: string[]; visited: number }> = [];
    for (const loc of LOCATIONS) {
      const map = generateWorldMap(SEED, loc.id);
      const visited = bfsReachable(map, CX, CY);
      const missingTiles: string[] = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!visited.has(`${x},${y}`)) missingTiles.push(`${x},${y}`);
        }
      }
      if (missingTiles.length) {
        failures.push({ start: loc.id, missingTiles, visited: visited.size });
      }
      expect(visited.size).toBe(W * H);
    }
    expect(failures).toEqual([]);
  });

  test('3. No infinite-loop clusters — 100 steps in one direction advance or hit an edge', () => {
    const failures: Array<{
      start: string;
      from: [number, number];
      dir: Direction;
      reason: string;
    }> = [];
    const samples: Array<[number, number]> = [
      [CX, CY],
      [0, 0],
      [W - 1, H - 1],
      [5, 5],
      [15, 12],
      [3, 17],
    ];
    for (const loc of LOCATIONS) {
      const map = generateWorldMap(SEED, loc.id);
      for (const [sx, sy] of samples) {
        for (const dir of DIRECTIONS) {
          let x = sx;
          let y = sy;
          let advanced = false;
          let hitEdge = false;
          let returnedToStart = false;
          for (let i = 0; i < 100; i++) {
            const step = stepInDirection(map, x, y, dir);
            if (step.x !== x || step.y !== y) advanced = true;
            // Edge of grid in the direction of travel
            const atEdge =
              (dir === 'north' && step.y === 0) ||
              (dir === 'south' && step.y === H - 1) ||
              (dir === 'west' && step.x === 0) ||
              (dir === 'east' && step.x === W - 1);
            if (atEdge && step.x === x && step.y === y) {
              hitEdge = true;
              break;
            }
            x = step.x;
            y = step.y;
            if (i > 0 && x === sx && y === sy) {
              returnedToStart = true;
              break;
            }
          }
          if (returnedToStart) {
            failures.push({
              start: loc.id,
              from: [sx, sy],
              dir,
              reason: 'returned to start without edge',
            });
          }
          if (!advanced && !hitEdge) {
            failures.push({
              start: loc.id,
              from: [sx, sy],
              dir,
              reason: 'never advanced and never hit edge',
            });
          }
        }
      }
    }
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.log('Loop-cycle failures:', JSON.stringify(failures.slice(0, 20), null, 2));
    }
    expect(failures).toEqual([]);
  });

  test('4. surveyAll claims match walk outcomes', () => {
    const failures: Array<{
      start: string;
      from: [number, number];
      dir: Direction;
      claimed: string;
      arrived: string | null;
    }> = [];
    const rng = (() => {
      let s = 0xC0FFEE;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();
    for (const loc of LOCATIONS) {
      const map = generateWorldMap(SEED, loc.id);
      // Pick 10 random tiles
      const samples: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) {
        samples.push([Math.floor(rng() * W), Math.floor(rng() * H)]);
      }
      for (const [sx, sy] of samples) {
        const survey = surveyAll(map, sx, sy, REACH);
        for (const dir of DIRECTIONS) {
          const claim = survey[dir];
          if (!claim) continue;
          // Walk step-by-step in that direction, up to REACH steps,
          // checking each tile for a name. The first named tile we
          // land on must match the survey claim.
          let x = sx;
          let y = sy;
          let arrived: string | null = null;
          for (let i = 0; i < REACH; i++) {
            const step = stepInDirection(map, x, y, dir);
            if (step.x === x && step.y === y) break; // clamped at edge
            x = step.x;
            y = step.y;
            if (step.landedOn) {
              arrived = step.landedOn.locationName;
              break;
            }
          }
          if (arrived !== claim.name) {
            failures.push({
              start: loc.id,
              from: [sx, sy],
              dir,
              claimed: claim.name,
              arrived,
            });
          }
        }
      }
    }
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.log('survey/walk mismatches:', JSON.stringify(failures.slice(0, 20), null, 2));
    }
    expect(failures).toEqual([]);
  });

  test('5. stepInDirection clamps at grid edges (no negative / out-of-bounds coords)', () => {
    const map = generateWorldMap(SEED, 'tartarian_outskirts');
    // North wall
    for (let x = 0; x < W; x++) {
      const s = stepInDirection(map, x, 0, 'north');
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(W);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(H);
      expect(s.y).toBe(0);
    }
    // South wall
    for (let x = 0; x < W; x++) {
      const s = stepInDirection(map, x, H - 1, 'south');
      expect(s.y).toBe(H - 1);
    }
    // West wall
    for (let y = 0; y < H; y++) {
      const s = stepInDirection(map, 0, y, 'west');
      expect(s.x).toBe(0);
    }
    // East wall
    for (let y = 0; y < H; y++) {
      const s = stepInDirection(map, W - 1, y, 'east');
      expect(s.x).toBe(W - 1);
    }
    // Corners — both perpendicular walls
    const nw = stepInDirection(map, 0, 0, 'north');
    expect([nw.x, nw.y]).toEqual([0, 0]);
    const se = stepInDirection(map, W - 1, H - 1, 'south');
    expect([se.x, se.y]).toEqual([W - 1, H - 1]);
  });

  test('6. Seed determinism — byte-identical output for same seed × locationId', () => {
    const failures: string[] = [];
    for (const loc of LOCATIONS) {
      const a = generateWorldMap(SEED, loc.id);
      const b = generateWorldMap(SEED, loc.id);
      const ja = JSON.stringify(a);
      const jb = JSON.stringify(b);
      if (ja !== jb) failures.push(loc.id);
      expect(a.positions).toEqual(b.positions);
      // Tile-by-tile deep equality
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          expect(a.tiles[y]![x]).toEqual(b.tiles[y]![x]);
        }
      }
    }
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.log('Non-deterministic seeds:', failures);
    }
    expect(failures).toEqual([]);
  });

  test('7. findNearestNamed is consistent across repeat calls', () => {
    const failures: Array<{
      start: string;
      from: [number, number];
      first: string | null;
      second: string | null;
    }> = [];
    const rng = (() => {
      let s = 0xBADCAFE;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();
    const samples: Array<{ locationId: string; x: number; y: number }> = [];
    for (let i = 0; i < 30; i++) {
      const loc = LOCATIONS[Math.floor(rng() * LOCATIONS.length)]!;
      samples.push({
        locationId: loc.id,
        x: Math.floor(rng() * W),
        y: Math.floor(rng() * H),
      });
    }
    for (const sample of samples) {
      const map = generateWorldMap(SEED, sample.locationId);
      const a = findNearestNamed(map, sample.x, sample.y);
      const b = findNearestNamed(map, sample.x, sample.y);
      const aId = a?.locationId ?? null;
      const bId = b?.locationId ?? null;
      if (aId !== bId) {
        failures.push({
          start: sample.locationId,
          from: [sample.x, sample.y],
          first: aId,
          second: bId,
        });
      }
      expect(aId).toBe(bId);
    }
    expect(failures).toEqual([]);
  });

  test('senseDirection respects range clamp and never returns out-of-range hits', () => {
    const map = generateWorldMap(SEED, 'tartarian_outskirts');
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        for (const dir of DIRECTIONS) {
          const hit = senseDirection(map, x, y, dir, 8);
          if (hit) {
            expect(hit.distance).toBeGreaterThanOrEqual(1);
            expect(hit.distance).toBeLessThanOrEqual(8);
          }
        }
      }
    }
  });
});
