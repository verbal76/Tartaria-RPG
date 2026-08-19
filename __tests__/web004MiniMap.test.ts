/**
 * WEB-004 — the corner mini-map.
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

describe('WEB-004 — the viewport maths', () => {
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

  it('⚠⚠ WEB-004 — THE MARKER SITS ON THE ROOM, EVEN WHERE THE VIEW CLAMPS', () => {
    // Owner, comparing the two: *"when you look at it on the regular map you're
    // centered on the room; when you look in the mini map you're not centered
    // under the room all the time."* The clamp is correct — a rim room must not
    // drag empty space into frame — but the DOT was pinned to the box centre
    // regardless, so the instant the clamp bit, the map stopped and the dot did
    // not, and the marker pointed at the wrong room.
    //
    // The marker's position is the same arithmetic that placed the art, read
    // back out. `markerOf` below is exactly what the component computes.
    const W = 130, H = 130;
    const RW = 400, RH = 400;
    const markerOf = (frac: { fx: number; fy: number }) => {
      const o = viewportOffset(frac, RW, RH, W, H);
      return { x: o.left + frac.fx * RW, y: o.top + frac.fy * RH };
    };

    // Middle of the art: nothing clamps, so the marker IS the centre — the
    // common case is unchanged.
    expect(markerOf({ fx: 0.5, fy: 0.5 })).toEqual({ x: W / 2, y: H / 2 });

    // Hard against the top-left: the view has stopped at the edge, so the
    // marker must be at the art's own corner, NOT at the box centre.
    expect(markerOf({ fx: 0, fy: 0 })).toEqual({ x: 0, y: 0 });
    expect(markerOf({ fx: 1, fy: 1 })).toEqual({ x: W, y: H });

    // And the invariant that matters: for EVERY room of EVERY skin, the drawn
    // marker lands exactly on that room's fraction of the visible art.
    const ZOOM = 2.5;
    const rw = Math.max(W, H) * ZOOM;
    for (const skin of TILES.filter((t) => t !== 'world')) {
      for (const node of STRUCTURAL_IDS) {
        const frac = outpostRoomMark(skin, node);
        const o = viewportOffset(frac, rw, rw, W, H);
        const x = o.left + frac.fx * rw;
        const y = o.top + frac.fy * rw;
        // on the room…
        expect({ skin, node, x: Math.round(x * 1e6) / 1e6 })
          .toEqual({ skin, node, x: Math.round((o.left + frac.fx * rw) * 1e6) / 1e6 });
        // …and inside the window the player can actually see.
        expect({ skin, node, visible: x >= 0 && x <= W && y >= 0 && y <= H })
          .toEqual({ skin, node, visible: true });
      }
    }
  });

  it('the component positions the marker from geom, never from the box centre', () => {
    const mm = src('app', 'components', 'MiniMap.tsx');
    expect(mm).toContain('markerX: left + view.frac.fx * renderedW,');
    expect(mm).toContain('markerY: top + view.frac.fy * renderedH,');
    expect(mm).toContain('left: geom.markerX - DOT / 2,');
    expect(mm).toContain('top: geom.markerY - DOT / 2,');
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

describe('WEB-004 — the downscaled tiles', () => {
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
      expect({ t, maxEdge: Math.max(png.width, png.height) }).toEqual({ t, maxEdge: 768 });
      const decodedMb = (png.width * png.height * 4) / 1024 / 1024;
      // ⚠ WEB-004 raised the tile 512 → 768 for sharpness (see the generator).
      // The ceiling moves with it, but it is still less than HALF the ~6.0MB the
      // real art would cost, which is the whole point of the tile existing.
      expect(decodedMb).toBeLessThan(2.5);
      expect(decodedMb).toBeLessThan(6.0 / 2);
    }
  });

  it('⚠ the world tile keeps the atlas aspect — squashing it moves every marker', () => {
    const png = pngSize('assets', 'minimap', 'world.png');
    expect(png.width).toBe(768);
    // 1619×971 → 768×460. A square tile would slide the marker vertically by up
    // to 40% of the map, because positions are stored as fractions of the art.
    expect(png.height).toBe(Math.round((971 / 1619) * 768));
    for (const t of TILES.filter((x) => x !== 'world')) {
      const o = pngSize('assets', 'minimap', `${t}.png`);
      expect({ t, square: o.width === o.height }).toEqual({ t, square: true });
    }
  });

  it('the tiles are smaller on disk than the art they came from', () => {
    // ⚠ Disk is the lesser number and this test is the lesser check — a PNG's
    // file size depends on how compressible the picture is, not on what it
    // costs once decoded. The number that actually decides this feature is the
    // DECODED footprint asserted above; this one only catches someone quietly
    // pointing the generator at the full-size art.
    for (const t of TILES.filter((x) => x !== 'world')) {
      const small = statSync(root('assets', 'minimap', `${t}.png`)).size;
      const full = statSync(root('assets', 'outposts', `${t}.png`)).size;
      expect({ t, smaller: small < full / 2 }).toEqual({ t, smaller: true });
    }
  });

  it('the generator is committed, so the tiles can be rebuilt from the art', () => {
    const gen = src('scripts', 'make-minimap-assets.mjs');
    expect(gen).toContain('const MAX_EDGE = 768;');
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

describe("WEB-004 — the owner's two conditions", () => {
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

describe('WEB-004 — the Atlas pinch stays where your fingers are', () => {
  const map = src('app', 'screens', 'MapScreen.tsx');

  /** The solve the handler ships, in isolation:
   *      t₁ = F₁ − K − (s₁/s₀)·(F₀ − K − t₀)
   *  K is the box centre in page coordinates, F the pinch midpoint. */
  const pinch = (
    s0: number, s1: number, t0: number, f0: number, f1: number, k: number,
  ) => f1 - k - (s1 / s0) * (f0 - k - t0);

  it('⚠⚠ the point between the fingers does not move as the scale changes', () => {
    // The property, stated as the player experiences it: put two fingers on the
    // thing you care about, spread them, and that thing is still under them.
    const K = 200, T0 = 0, S0 = 1, F = 260;   // fingers 60px right of centre
    for (const s1 of [1.2, 2, 3.5, 8]) {
      const t1 = pinch(S0, s1, T0, F, F, K);
      // screen position of the content point that was under F, after the zoom
      const u = (F - K - T0) / S0;
      expect(Math.round(K + t1 + s1 * u)).toBe(F);
    }
  });

  it('⚠ and the OLD behaviour provably did not — this is the drift he saw', () => {
    // The previous line raised the scale and left the translate alone, so the
    // layer scaled about the BOX CENTRE and everything else flew away from it,
    // faster the further out it started.
    const K = 200, T0 = 0, S0 = 1, F = 260;
    const u = (F - K - T0) / S0;
    const oldScreenAt = (s1: number) => K + T0 + s1 * u;
    expect(Math.round(oldScreenAt(1))).toBe(F);
    expect(Math.round(oldScreenAt(3))).toBe(380);   // 120px off, and climbing
    expect(Math.round(oldScreenAt(8))).toBe(680);   // clean off the screen
  });

  it('a finger moving during the pinch pans, from the same expression', () => {
    // F₁ moving IS the pan, so the pinch branch never reads gestureState and
    // therefore cannot double-count it.
    const K = 200, T0 = 0, S0 = 2;
    const still = pinch(S0, S0, T0, 260, 260, K);
    const moved = pinch(S0, S0, T0, 260, 300, K);
    expect(moved - still).toBe(40);
  });

  it('the handler computes it that way and stops reading the pan delta', () => {
    const branch = map.slice(map.indexOf('PINCH ANCHORED ON THE FINGERS'),
      map.indexOf('// Single-finger pan.'));
    expect(branch).toContain('const grow = nextScale / startScale.current;');
    expect(branch).toContain('mid.x - kx - grow * (startMidX.current - kx - startTx.current)');
    expect(branch).toContain('mid.y - ky - grow * (startMidY.current - ky - startTy.current)');
    expect(branch).not.toContain('gestureState.dx');
    expect(branch).not.toContain('gestureState.dy');
  });

  it('⚠ every baseline re-capture rebases the pan delta too', () => {
    // The second half of the drift: `gestureState.dx` accumulates from the
    // first touch of the whole gesture. Each place that re-captures startTx was
    // folding the travel-so-far into the baseline and then adding it again out
    // of dx. There are three capture points and all three must rebase.
    expect(map.match(/startDx\.current = gestureState\.dx;/g)?.length).toBe(2);
    expect(map).toContain('startDx.current = 0;');
    expect(map).toContain('(gestureState.dx - startDx.current)');
    expect(map).toContain('(gestureState.dy - startDy.current)');
  });

  it('the box is measured in page space, because touches arrive in page space', () => {
    expect(map).toContain('boxRef.current?.measureInWindow(');
    expect(map).toContain('boxPage.current.x + (imgBox?.width ?? 0) / 2');
  });
});
