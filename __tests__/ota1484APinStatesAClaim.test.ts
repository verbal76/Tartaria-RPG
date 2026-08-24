// OTA-1484 — A PIN STATES A CLAIM, OR IT ANSWERS TO A GATE.
//
// ⚠⚠ NINE PINS BROKE IN ONE WEEK on rewordings, none on defects: ota1301,
// ota1104, ota1466, ota1187, ota1159 ×2, ota931, ota1404, ota1298 — and
// OTA-1481's own first draft quoted a clamp that was rewritten ONE HOUR later.
// Every one was found by a fix, not by a gate: `check:slicepins` counts
// fixed-window slices and is blind to the shape that was actually biting.
//
// THE GATE (`check:quotedpins`, #16) HAS TWO RULES WITH DIFFERENT TEETH:
//
//   1 ⚠⚠ BAN, going forward: a pin whose ≥3-word literal exists ONLY inside a
//     COMMENT of the source file it reads. A comment is documentation — such a
//     pin fails when the prose is reworded and passes when the behaviour the
//     prose describes is deleted. Both failure directions are wrong.
//     Exemptions, both principled:
//       • the SELF-TEST PAIR — `expect(RAW).toContain(x)` beside
//         `expect(CODE).not.toContain(x)` proves a comment-stripper works;
//         the gate's own first run flagged two of its author's (1476, 1479).
//       • the GRANDFATHERED 32 — pins in tests that DECLARE documentation-
//         keeping as their subject ("the record is the point", ota1410). They
//         are named individually, by (file, literal) — never by line number,
//         which drifts — so each removal shows in a diff and the list only
//         shrinks. One that breaks on a reword gets CONVERTED, not re-quoted.
//
//   2 ⚠ RATCHET: prose-shaped literals pinned against source files may not
//     exceed the measured baseline. The FIRST measurement read 400 and was
//     wrong by 287 — it counted code-shaped literals ('lastSeen !==
//     OTA_BUILD_ID') as prose, and pinning CODE is what the gate wants MORE
//     of. Code-punctuated literals are exempt; 113 true sentences remain, no
//     headroom: a new prose pin displaces an old one.
//
//   ⚠ AND THE GATE'S FIRST TWO LIVE CATCHES WERE ITS AUTHOR'S OWN PINS, both
//   younger than a day: ota1482's SUPERSEDED-line quote (converted to a
//   pattern) and the 401st prose pin that turned out to be code mis-shaped.
//   An instrument that embarrasses its builder first is usually pointed the
//   right way.
//
// ⚠ WHAT THE GATE SAYS IT CANNOT SEE (the OTA-1455 lesson): pins through
// unresolvable variables, template-string literals, helper indirection. It
// prints its resolution counts so a coverage collapse is visible, and refuses
// to pass on a zero scan.
//
// ALSO IN THIS OTA: `test-utils/placePlayer.ts` — the fixture-invariant helper
// from OTA-1480's finding that 44 fixtures set `currentLocationId` with no
// gridX in sight (a state the game cannot produce; two suites went red on it).
// New fixtures spread `placedAt(locationId)` instead of hand-writing
// coordinates.

import { execFileSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { placedAt } from '../test-utils/placePlayer';
import { canonicalCellOf, gridToVisual, WORLD_MAP_CENTER_X } from '../app/engine/worldMap';

const ROOT = join(__dirname, '..');
const GATE = join(ROOT, 'scripts', 'check-quoted-pins.mjs');

const runGate = (): { code: number; out: string } => {
  try {
    const out = execFileSync('node', [GATE], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

describe('check:quotedpins — the gate itself', () => {
  it('⚠⚠ passes on the current tree, and says what it covered', () => {
    const { code, out } = runGate();
    expect(code).toBe(0);
    // Coverage is REPORTED, not implied — a scan that says nothing about its
    // own reach is the OTA-1455 bogus-count defect waiting to happen.
    expect(out).toMatch(/\d+ test files/);
    expect(out).toMatch(/\d+ read app\/ source/);
    expect(out).toMatch(/\d+\/\d+ prose pins/);
    expect(out).toContain('0 comment-only');
  });

  it('⚠ the ratchet has NO headroom — the baseline equals the measured count', () => {
    const { out } = runGate();
    const m = /(\d+)\/(\d+) prose pins/.exec(out)!;
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBe(Number(m[2]));
  });

  it('⚠⚠ the grandfather list is (file, literal) — never line numbers', () => {
    // A line-keyed allowlist rots on drift and becomes a lie (the OTA-1404
    // countdown lesson applied to a gate). Assert the SHAPE of the entries.
    const src = readFileSync(GATE, 'utf8');
    const allowBlock = src.slice(src.indexOf('const COMMENT_PIN_ALLOW'), src.indexOf('];', src.indexOf('const COMMENT_PIN_ALLOW')));
    expect(allowBlock).toContain("file: '");
    expect(allowBlock).toContain("lit: '");
    expect(allowBlock).not.toMatch(/line:\s*\d+/);
    // The grandfathered population is bounded and known.
    expect((allowBlock.match(/file: '/g) ?? []).length).toBe(32);
  });

  it('⚠ the gate self-tests before it reports — broken matcher, no OK', () => {
    const src = readFileSync(GATE, 'utf8');
    expect(src).toContain('SELF-TEST FAILED');
    // Both primitives are proven against known answers: variable resolution
    // and comment-only detection.
    expect(src).toContain('variable resolution broken');
    expect(src).toContain('comment detection broken');
  });
});

describe('placedAt — fixtures can no longer invent impossible coordinates', () => {
  it('⚠⚠ produces the exact state creation/travelTo/stepDirection would', () => {
    for (const id of ['voronov', 'drakova', 'asgardar', 'hidden_market']) {
      const p = placedAt(id);
      const cell = canonicalCellOf(id);
      expect(p.gridX).toBe(cell.x);
      expect(p.gridY).toBe(cell.y);
      const vis = gridToVisual(p.gridX, p.gridY, id);
      expect(p.mapX).toBe(vis.mapX);
      expect(p.mapY).toBe(vis.mapY);
      expect(p.currentLocationId).toBe(id);
    }
  });

  it('⚠ an offset moves BOTH coordinate systems together', () => {
    // The whole point: the OTA-1480 fixtures went red because they moved one
    // frame and not the other. placedAt cannot express that state.
    const p = placedAt('voronov', { dx: 3 });
    const cell = canonicalCellOf('voronov');
    expect(p.gridX).toBe(cell.x + 3);
    expect(p.mapX).toBe(WORLD_MAP_CENTER_X + 3);
    const vis = gridToVisual(p.gridX, p.gridY, 'voronov');
    expect(p.mapX).toBe(vis.mapX); // the invariant, by construction
  });

  it('returns only position fields — quest state stays the caller\'s business', () => {
    const keys = Object.keys(placedAt('voronov')).sort();
    expect(keys).toEqual(['currentLocationId', 'gridX', 'gridY', 'mapX', 'mapY']);
  });

  it('⚠⚠ THE RATCHET — bare currentLocationId fixtures may only shrink', () => {
    // The OTA-1484 fixture wave spread placedAt over every LIVE player-state
    // fixture (setState players, engine-call builders). What remains bare is
    // reviewed and stays bare ON PURPOSE, each for one of these reasons:
    //   • on-disk save payloads (saveSnapshot, atomicSaveWrites, emergencyReclaim,
    //     ota1178, ota1311) and legacy-backfill inputs (ota1018, ota1022) — a
    //     cell-less player IS the state under test; the loader must derive.
    //   • minimal argument objects for pure predicates (ota1164's course states,
    //     indoorHooksTravel, arbiterKnowledge, parleyInterceptGuard, ota1029's
    //     chip keys) — not player state; coords would be dead weight.
    //   • hand-written coordinates that ARE the subject (hubRoomKeyCollision's
    //     same-tile collisions, travelSceneBarChaos's deliberately cleared frame).
    //   • pass-throughs of the live location (metaNavStress, setCourseRepro) and
    //     helper CALL SITES whose helper now derives via placedAt (mainQuest,
    //     coreGuardians) — consistent already, invisible to this scan.
    // A NEW bare site fails this count: spread placedAt, or — if it truly falls
    // in one of the classes above — say which one at the site and re-baseline.
    const testsDir = __dirname;
    const needle = 'currentLocationId' + ':'; // split so this test does not count itself
    let bare = 0;
    for (const f of readdirSync(testsDir).sort()) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const lines = readFileSync(join(testsDir, f), 'utf8').split('\n');
      lines.forEach((l, idx) => {
        if (!l.includes(needle)) return;
        const windowText = lines.slice(Math.max(0, idx - 6), idx + 3).join('\n');
        if (windowText.includes('placedAt') || windowText.includes('gridX')) return;
        bare += 1;
      });
    }
    expect(bare).toBeGreaterThan(30); // the scan still finds its subjects
    expect(bare).toBeLessThanOrEqual(50); // the baseline — shrink-only
  });
});
