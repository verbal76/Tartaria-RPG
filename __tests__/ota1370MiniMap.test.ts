/**
 * OTA-1370 — the corner mini-map.
 *
 * Owner: *"while we are in one of the outposts, how hard would it be to replace
 * the tartarian emblem in the top right corner with a map view that is like the
 * centered on player map view on the map screen and during regular gameplay do
 * the same thing with the world map?"* — and then, on the shape of it: *"do we
 * just have to use the square as a viewport to a map rendered underneath?"*
 * Yes. And: *"i still want the world and lore buttons there, and I still want
 * the enemy portrait visible there when in combat."*
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { worldMarkerFraction, viewportOffset } from '../app/engine/mapFraction';
import { outpostRoomMark } from '../app/engine/outpostRoomMarks';
import { STRUCTURAL_IDS } from '../app/engine/outpostGraph';

const root = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(root(...p), 'utf8');

/** PNG dimensions straight off the IHDR — width and height are big-endian
 *  uint32s at bytes 16 and 20 of every PNG ever written. Read by hand rather
 *  than through `pngjs`, which ships no type declarations: a check that needs
 *  two integers should not put an `any` into the test tree. */
function pngSize(...p: string[]): { width: number; height: number } {
  const b = readFileSync(root(...p));
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const TILES = ['world', 'reclaimers_guild', 'mud_monarchs', 'forgotten_order',
  'true_tartarians', 'eternal_dynasty', 'conspiracy_architects',
  'servants_of_giants', 'stone_builders', 'tartarian_revivalists'];

describe('OTA-1370 — the viewport maths', () => {
  it('puts the player dead centre when there is room on every side', () => {
    // 1000×1000 of art in a 100×100 window, player at the middle: the art
    // slides -450 on both axes so its centre lands on the window's centre.
    const o = viewportOffset({ fx: 0.5, fy: 0.5 }, 1000, 1000, 100, 100);
    expect(o).toEqual({ left: -450, top: -450 });
  });

  it('⚠ clamps at the edges instead of dragging empty space into frame', () => {
    // A room in the top-left corner of the art. Centring it honestly would put
    // the art at +50/+50 and show a gutter of nothing on two sides. The map
    // stops sliding and the MARKER walks off-centre instead — which is what
    // every mini-map does and what reads as correct.
    expect(viewportOffset({ fx: 0, fy: 0 }, 1000, 1000, 100, 100))
      .toEqual({ left: 0, top: 0 });
    expect(viewportOffset({ fx: 1, fy: 1 }, 1000, 1000, 100, 100))
      .toEqual({ left: -900, top: -900 });
  });

  it('centres art that is smaller than its window rather than clamping it', () => {
    expect(viewportOffset({ fx: 0.5, fy: 0.5 }, 40, 40, 100, 100))
      .toEqual({ left: 30, top: 30 });
  });

  it('never leaves a gutter for any room of any skin at the shipped zoom', () => {
    // The real check: walk every structural room of every skin through the same
    // geometry the component computes and assert the window is always fully
    // covered. A single uncovered pixel is a black wedge in the corner.
    const W = 130, H = 130, ZOOM = 2.5;
    const renderedW = Math.max(W, H) * ZOOM;
    for (const skin of TILES.filter((t) => t !== 'world')) {
      for (const node of STRUCTURAL_IDS) {
        const frac = outpostRoomMark(skin, node);
        const { left, top } = viewportOffset(frac, renderedW, renderedW, W, H);
        expect({ skin, node, leftOk: left <= 0, rightOk: left + renderedW >= W })
          .toEqual({ skin, node, leftOk: true, rightOk: true });
        expect({ skin, node, topOk: top <= 0, botOk: top + renderedW >= H })
          .toEqual({ skin, node, topOk: true, botOk: true });
      }
    }
  });

  it('a world cell resolves to a fraction inside the art', () => {
    const f = worldMarkerFraction(0, 0);
    expect(f.fx).toBeGreaterThanOrEqual(0);
    expect(f.fx).toBeLessThanOrEqual(1);
    expect(f.fy).toBeGreaterThanOrEqual(0);
    expect(f.fy).toBeLessThanOrEqual(1);
  });

  it('⚠⚠ the Atlas and the mini-map share ONE marker-fraction implementation', () => {
    // The whole reason mapFraction.ts exists. If MapScreen ever grows its own
    // copy back, the corner and the Atlas can disagree about where you are —
    // and the corner's only job is to be trusted at a glance.
    const map = src('app', 'screens', 'MapScreen.tsx');
    expect(map).toContain("import { worldMarkerFraction } from '../engine/mapFraction';");
    expect(map).toContain('const markerFraction = worldMarkerFraction;');
    expect(map).not.toMatch(/function markerFraction\s*\(/);
    expect(src('app', 'components', 'MiniMap.tsx'))
      .toContain("from '../engine/mapFraction'");
  });
});

describe('OTA-1370 — the downscaled tiles', () => {
  it('every tile the component can ask for exists', () => {
    for (const t of TILES) {
      expect({ tile: t, there: existsSync(root('assets', 'minimap', `${t}.png`)) })
        .toEqual({ tile: t, there: true });
    }
  });

  it('⚠⚠ the tiles are SMALL — this is the memory decision, not a detail', () => {
    // The corner lives on the screen the player never leaves, so whatever it
    // holds is resident all session, on a device whose signature freeze was an
    // OOM kill. Clipping saves nothing (the whole decoded bitmap is resident
    // however little of it shows), so the saving has to come from the source.
    for (const t of TILES) {
      const png = pngSize('assets', 'minimap', `${t}.png`);
      expect({ t, maxEdge: Math.max(png.width, png.height) }).toEqual({ t, maxEdge: 512 });
      const decodedMb = (png.width * png.height * 4) / 1024 / 1024;
      expect(decodedMb).toBeLessThan(1.1);
    }
  });

  it('⚠ the world tile keeps the atlas aspect — squashing it moves every marker', () => {
    const png = pngSize('assets', 'minimap', 'world.png');
    expect(png.width).toBe(512);
    // 1619×971 → 512×307. A square tile would slide the marker vertically by up
    // to 40% of the map, because positions are stored as fractions of the art.
    expect(png.height).toBe(Math.round((971 / 1619) * 512));
    for (const t of TILES.filter((x) => x !== 'world')) {
      const o = pngSize('assets', 'minimap', `${t}.png`);
      expect({ t, square: o.width === o.height }).toEqual({ t, square: true });
    }
  });

  it('the tiles are a fraction of the art they came from', () => {
    for (const t of TILES.filter((x) => x !== 'world')) {
      const small = statSync(root('assets', 'minimap', `${t}.png`)).size;
      const full = statSync(root('assets', 'outposts', `${t}.png`)).size;
      expect(small).toBeLessThan(full / 3);
    }
  });

  it('the generator is committed, so the tiles can be rebuilt from the art', () => {
    const gen = src('scripts', 'make-minimap-assets.mjs');
    expect(gen).toContain('const MAX_EDGE = 512;');
    for (const t of TILES.filter((x) => x !== 'world')) {
      expect(gen).toContain(`assets/outposts/${t}.png`);
    }
    expect(gen).toContain('assets/world-atlas.png');
  });

  it('⚠ the component draws the TILES, never the full-size art', () => {
    const mm = src('app', 'components', 'MiniMap.tsx');
    expect(mm).toContain("require('../../assets/minimap/world.png')");
    // ⚠ It must never REQUIRE the full art. (The prose above the imports names
    // those paths on purpose, to say what it is deliberately not loading, so
    // the check is on the require and not on the mention.)
    expect(mm).not.toMatch(/require\([^)]*assets\/outposts\//);
    expect(mm).not.toMatch(/require\([^)]*world-atlas/);
    // …and not the 2MB marker image either — the dot is drawn.
    expect(mm).not.toMatch(/require\([^)]*player-marker/);
    expect(mm).toContain('markerDot');
  });
});

describe("OTA-1370 — the owner's two conditions", () => {
  const exp = src('app', 'screens', 'ExplorationScreen.tsx');

  it('⚑ WORLD and ◈ LORE still bracket the tile', () => {
    const i = exp.indexOf('<MiniMap');
    expect(i).toBeGreaterThan(0);
    const before = exp.slice(0, i);
    const after = exp.slice(i);
    expect(before).toContain("setScreen('world')");
    expect(after).toContain("setScreen('lore')");
  });

  it('⚠⚠ combat still shows the enemy portrait — the map is not mounted then', () => {
    // The right column has always been a ternary: EnemyPanel when an enemy is
    // staged, the crest cluster when not. The mini-map went into the SECOND
    // branch, so "the portrait is still there in a fight" is structural rather
    // than something this component has to remember to do.
    const panel = exp.indexOf('<EnemyPanel');
    const mini = exp.indexOf('<MiniMap');
    expect(panel).toBeGreaterThan(0);
    expect(panel).toBeLessThan(mini);
    const between = exp.slice(panel, mini);
    expect(between).toContain(') : (');
  });

  it('the crest art is kept as the fallback, not deleted', () => {
    expect(exp).toContain("import { CrestPlaceholder } from '../components/CrestPlaceholder';");
    expect(existsSync(root('app', 'components', 'CrestPlaceholder.tsx'))).toBe(true);
  });

  it('the tile is a viewport: it clips, and the art is positioned inside it', () => {
    const mm = src('app', 'components', 'MiniMap.tsx');
    expect(mm).toContain("overflow: 'hidden'");
    expect(mm).toContain("position: 'absolute'");
    expect(mm).toContain('viewportOffset(');
    // Stretch, not contain — the art is deliberately bigger than the window.
    expect(mm).toContain('resizeMode="stretch"');
  });

  it('tapping it opens the Atlas', () => {
    expect(exp).toContain("<MiniMap onPress={() => setScreen('map')} />");
  });
});
