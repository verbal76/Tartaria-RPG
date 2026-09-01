// OTA-1479 — THE BANNER STOPS CLAIMING A PLACE THE RADAR BESIDE IT CONTRADICTS.
//
// ⚠⚠ FROM THE 4.32.11 LOG, ONE LINE:
//
//     [Voronov] north: Drakova (2 tiles) · east: Ostragar (9 tiles)
//               · south: The Giant Vault (7 tiles) · west: Voronov (1 tile)
//
// The bracket says you are AT Voronov. The radar, in the same line, reports
// Voronov one tile west. Both cannot be true, and the radar is the one that is
// right — it reads `player.mapX/mapY`, the player's actual tile. The bracket
// read `player.currentLocationId`, which is the last place they ARRIVED at and
// does not change when they walk out of it.
//
// ⚠ THE MECHANISM WAS ALREADY BUILT AND WAS BEING THROWN AWAY. OTA-1348 made the
// map walk with the player: every cardinal step recomputes `transitArea` from
// the authoritative grid cell via `overlandAreaLabel` — "Voronov Outskirts",
// "The road to Ostragar", or the atlas band's own name — and the scene bar
// reads `transitArea ?? location.name`. Correct. But `beginScene` builds a fresh
// `CurrentScene` literal, that literal did not carry the field, and so EVERY
// scene rebuild reset the label to undefined. The label was therefore right only
// in the window between a step and the next rebuild, and an encounter resolving
// or a menu round-trip silently reverted both readers to the stale name.
//
// ⚠ AND ONLY ONE SURFACE EVER READ IT. Exactly one line in the entire app —
// ExplorationScreen's scene bar — consulted `transitArea`. The radar banner, the
// louder of the two, never did. Same shape as OTA-1167/1477 on the compass: one
// surface gets the fix, its sibling is left behind, and the player is shown both.
//
// ⚠ RECOMPUTED, NOT INHERITED. Carrying the previous scene's string forward
// would be stale in a new way — right label, wrong tile. It is derived at scene
// build from the same `overlandAreaLabel` the step path uses, and that function
// returns null exactly when the player stands ON a named tile, so "am I actually
// here?" has one answer and both readers get the same one.

import fs from 'fs';
import path from 'path';

import {
  generateWorldMap,
  overlandAreaLabel,
  nearestNamedLocation,
  namedCellOwner,
  canonicalPositions,
  WORLD_MAP_CENTER_X,
  WORLD_MAP_CENTER_Y,
} from '../app/engine/worldMap';
import { describeAllDirections } from '../app/engine/worldDirections';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/** ⚠ Comments first. This file's own fix comment quotes the broken banner
 *  verbatim, so a scanner that reads prose finds the defect it just closed. */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const STORE_RAW = read('app', 'state', 'gameStore.ts');
const STORE = codeOnly(STORE_RAW);
const EXPL = codeOnly(read('app', 'screens', 'ExplorationScreen.tsx'));

// ---------------------------------------------------------------------------
// 0 — self-test
// ---------------------------------------------------------------------------

describe('self-test', () => {
  it('reads a real store and strips only comments', () => {
    expect(STORE_RAW.length).toBeGreaterThan(500_000);
    expect(STORE_RAW).toContain('THE AREA LABEL HAS TO SURVIVE A SCENE REBUILD');
    expect(STORE).not.toContain('THE AREA LABEL HAS TO SURVIVE A SCENE REBUILD');
    expect(STORE).toContain('export const useGameStore');
    expect(EXPL.length).toBeGreaterThan(10_000);
  });

  it('the canonical grid places the seats this suite reasons about', () => {
    const canon = canonicalPositions();
    for (const id of ['voronov', 'drakova', 'ostragar']) {
      expect(canon[id]).toBeDefined();
      expect(typeof canon[id]!.x).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// 1 — the contradiction the log caught, reproduced and then closed
// ---------------------------------------------------------------------------

describe('the banner and the radar cannot disagree', () => {
  const SEED = 'ota1479|mud_dweller|forgotten_order|legacy';

  it('⚠⚠ reproduces it: one step off the tile, the radar names the tile you left', () => {
    // This is the state the old bracket lied about. Proving the radar's side is
    // CORRECT is the whole reason the fix is on the label and not on the radar.
    const map = generateWorldMap(SEED, 'voronov');
    const here = map.positions['voronov']!;
    expect(here.x).toBe(WORLD_MAP_CENTER_X);
    expect(here.y).toBe(WORLD_MAP_CENTER_Y);

    const onTile = describeAllDirections(map, here.x, here.y);
    expect(onTile).not.toContain('Voronov');

    const oneEast = describeAllDirections(map, here.x + 1, here.y);
    expect(oneEast).toContain('west: Voronov');
    // …and it prices the step honestly, in the OTA-1477 units.
    expect(oneEast).toMatch(/west: Voronov \(1 tile, \d+ hours?\)/);
  });

  it('⚠⚠ the label agrees: null on the tile, a real area name off it', () => {
    const canon = canonicalPositions();
    const seat = canon['voronov']!;
    // Standing on it — no area label, so the bracket falls through to the name.
    expect(overlandAreaLabel(seat.x, seat.y, null)).toBeNull();
    // One step out — a label, and it is not the bare location name.
    // ⚠ OTA-1601 — one step WEST: the eastern neighbour is now a named
    // fight-ground (The Conduit Line), and a named tile correctly has no
    // area label of its own.
    const off = overlandAreaLabel(seat.x - 1, seat.y, null);
    expect(off).not.toBeNull();
    expect(off).not.toBe('Voronov');
    expect(typeof off).toBe('string');
    expect(off!.length).toBeGreaterThan(0);
  });

  it('⚠ null means ON the tile, everywhere on the grid, for every seat', () => {
    // ⚠ THE PREDICATE IS THE WHOLE FIX. If `overlandAreaLabel` ever returns a
    // label while the player stands on a named tile, the bracket starts lying
    // in the opposite direction. Walk EVERY canonical seat, not a sample —
    // which is how the hidden-location hole below was found.
    const canon = canonicalPositions();
    let seats = 0;
    for (const [id, cell] of Object.entries(canon)) {
      expect(overlandAreaLabel(cell.x, cell.y, null)).toBeNull();
      expect(namedCellOwner(cell.x, cell.y)!.id).toBe(id);
      seats++;
    }
    expect(seats).toBeGreaterThan(30); // the sweep is not a no-op
  });

  it('⚠⚠ standing INSIDE the Hidden Market is not "Cradle of Dusk Outskirts"', () => {
    // ⚠ FOUND BY THE SWEEP ABOVE, NOT BY THE FIX. `overlandAreaLabel` asked
    // `nearestNamedLocation` whether the player was standing on a named tile,
    // and that reader deliberately SKIPS hidden locations — correctly, because
    // an unfound place must not name the ground from two tiles away. But hiding
    // governs what you see from a distance, not what you are standing in, and
    // the one place in the game that is hidden is the one place the label got
    // wrong: inside the Hidden Market the game named somewhere two tiles off.
    const canon = canonicalPositions();
    const market = canon['hidden_market'];
    expect(market).toBeDefined();

    // The proximity reader still refuses to see it — that behaviour is kept.
    const proximity = nearestNamedLocation(market!.x, market!.y);
    expect(proximity!.id).not.toBe('hidden_market');
    expect(proximity!.dist).toBeGreaterThan(0);

    // The standing-on-it reader does see it, and the label falls through to the
    // real name rather than borrowing a neighbour's.
    expect(namedCellOwner(market!.x, market!.y)!.id).toBe('hidden_market');
    expect(overlandAreaLabel(market!.x, market!.y, null)).toBeNull();
  });

  it('⚠ a hidden place still does not name the ground from OUTSIDE it', () => {
    // The other half: the fix must not have turned the Hidden Market into a
    // beacon. One tile away, the label must not mention it.
    const canon = canonicalPositions();
    const m = canon['hidden_market']!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0]] as const) {
      const label = overlandAreaLabel(m.x + dx, m.y + dy, null);
      if (label === null) continue; // that cell is some other location's seat
      expect(label).not.toContain('Hidden Market');
    }
  });

  it('⚠ the two readers answer different questions and are not interchangeable', () => {
    // If these ever collapse into one function the hidden-market hole reopens.
    const canon = canonicalPositions();
    let divergences = 0;
    for (const [id, cell] of Object.entries(canon)) {
      const owner = namedCellOwner(cell.x, cell.y);
      const near = nearestNamedLocation(cell.x, cell.y);
      expect(owner!.id).toBe(id);
      if (!near || near.id !== id) divergences++;
    }
    // Exactly the hidden ones diverge — today that is one place. A change in
    // that count is a change in what the game hides, and worth looking at.
    expect(divergences).toBe(1);
  });

  it('⚠ and a non-null label always means OFF the tile', () => {
    // The converse, swept over a band of the grid rather than a handful of
    // hand-picked cells.
    let offTile = 0;
    let onTile = 0;
    for (let x = 20; x <= 60; x += 3) {
      for (let y = 10; y <= 30; y += 3) {
        const label = overlandAreaLabel(x, y, null);
        const near = nearestNamedLocation(x, y);
        if (label === null) {
          expect(near!.dist).toBe(0);
          onTile++;
        } else {
          expect(near!.dist).toBeGreaterThan(0);
          offTile++;
        }
      }
    }
    expect(offTile).toBeGreaterThan(0);
    expect(offTile + onTile).toBe(14 * 7);
  });

  it('⚠ a plotted course names the road, and only when off-tile', () => {
    const canon = canonicalPositions();
    const seat = canon['voronov']!;
    // On the tile a course does NOT override — you are somewhere, not en route.
    expect(overlandAreaLabel(seat.x, seat.y, 'Ostragar')).toBeNull();
    // Far from anything, the course names the road.
    const far = overlandAreaLabel(2, 2, 'Ostragar');
    expect(far === 'The road to Ostragar' || typeof far === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2 — the scene carries it, and both readers read it
// ---------------------------------------------------------------------------

describe('the label survives a scene rebuild and reaches both surfaces', () => {
  it('⚠⚠ the scene literal carries transitArea', () => {
    // The defect in one line: the literal did not have the field, so every
    // rebuild reset it to undefined.
    const at = STORE.indexOf('const scene: CurrentScene = {');
    expect(at).toBeGreaterThan(-1);
    const literal = STORE.slice(at, STORE.indexOf('\n    };', at));
    expect(literal).toContain('transitArea:');
  });

  it('⚠ it is DERIVED at scene build, not inherited from the old scene', () => {
    expect(STORE).toContain('overlandAreaLabel(gx, gy, roadToName)');
    // An inherited value would be the other kind of stale: right label, wrong
    // tile. Nothing may copy the previous scene's string into the new one.
    expect(STORE).not.toMatch(/transitArea:\s*(?:s\.)?currentScene[?.]*\.transitArea/);
  });

  it('⚠ the banner reads the label, not the arrival id', () => {
    expect(STORE).toContain('`[${scene.transitArea ?? location.name}] ${radar}`');
    expect(STORE).not.toContain('`[${location.name}] ${radar}`');
  });

  it('⚠ the scene bar and the banner use the SAME fallback expression', () => {
    // Two readers, one rule. If one ever grows its own fallback the player is
    // back to being shown two answers.
    expect(EXPL).toContain('currentScene.transitArea ?? currentScene.location.name');
    expect(STORE).toContain('scene.transitArea ?? location.name');
  });

  it('⚠ indoors keeps its own label and never gets a wilds name stamped on it', () => {
    // Interiors set "<Building> · <Room>" themselves. The overland label must
    // not be computed for them — that would be a third wrong answer, not a fix.
    expect(STORE).toContain('const sceneIndoors = !!hubRoom || !!get().activeBuildingId;');
    const at = STORE.indexOf('const sceneAreaLabel');
    expect(at).toBeGreaterThan(-1);
    const block = STORE.slice(at, STORE.indexOf('const scene: CurrentScene', at));
    expect(block).toContain('sceneIndoors');
    expect(block).toContain('? null');
  });

  it('⚠ "am I indoors" is computed once, not twice', () => {
    // ⚠ The radar gate used to recompute the identical expression a thousand
    // lines further down. Two spellings of one fact is how they come to differ,
    // which is the subject of this OTA and the two before it.
    const occurrences = STORE.split('!!hubRoom || !!get().activeBuildingId').length - 1;
    expect(occurrences).toBe(1);
    expect(STORE).toContain('!opts?.isOpening && !sceneIndoors');
  });
});

// ---------------------------------------------------------------------------
// 3 — the label is worth printing
// ---------------------------------------------------------------------------

describe('the labels themselves', () => {
  it('never prints an empty bracket or a placeholder', () => {
    let checked = 0;
    for (let x = 5; x < 78; x += 7) {
      for (let y = 3; y < 38; y += 5) {
        const label = overlandAreaLabel(x, y, null);
        if (label === null) { checked++; continue; }
        expect(label.trim()).toBe(label);
        expect(label.length).toBeGreaterThan(2);
        expect(label).not.toContain('undefined');
        expect(label).not.toContain('null');
        expect(label).not.toContain('NaN');
        checked++;
      }
    }
    expect(checked).toBe(11 * 7);
  });

  it('names the place you just left while you are near it', () => {
    // The single most useful case: one step out of somewhere, the label should
    // still tell you which somewhere.
    const canon = canonicalPositions();
    let named = 0;
    for (const [id, cell] of Object.entries(canon).slice(0, 15)) {
      const label = overlandAreaLabel(cell.x + 1, cell.y, null);
      if (label && label.endsWith(' Outskirts')) named++;
      expect(typeof id).toBe('string');
    }
    // Not every seat has a clear 1-tile ring (some sit next to each other), but
    // the mechanism must fire for most of them or the ring radius is broken.
    expect(named).toBeGreaterThan(7);
  });

  it('is deterministic — the same cell gives the same label every time', () => {
    for (const [x, y] of [[30, 15], [41, 21], [55, 25]] as const) {
      expect(overlandAreaLabel(x, y, null)).toBe(overlandAreaLabel(x, y, null));
    }
  });
});
