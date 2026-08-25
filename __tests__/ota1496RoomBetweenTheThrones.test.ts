// OTA-1496 — ROOM BETWEEN THE THRONES.
//
// ⚠⚠⚠ THE OWNER, 2026-08-25: *"I would like to see at least 20 spaces between
// the capitals. there are cardinal directions that give approximate locations
// in the lore but nothing is nailed down we just made it so that the capitals
// were roughly arranged correctly and filled onto one of the city looking
// pieces on the map, can we spread them out and make sure we don't break any
// code doing it?"* And mid-work: *"one of the spires is tied to one of the
// capitals as it's in the outskirts … it moves too."*
//
// ⚠⚠ WHY THE NUMBER IS 14 AND NOT 20 — measured, not negotiated. Every pin must
// stay inside the drawable atlas band (fx 0.05–0.95 / fy 0.05–0.97, the
// atlasCoords guard), which at SPREAD 40/22 is a 37×21-tile box. Nine points
// pairwise ≥20 walking tiles PROVABLY do not fit in that box (z3 UNSAT — at 20
// the box seats only 7 capitals); ≥16 fits only as a ring that exiles Nimari
// from the centre seat, and ≥15 not even then. 14 is the maximum the map gives
// while Nimari holds the middle and every capital keeps its compass identity.
// The owner's worst pair — Drakova↔Voronov at 2 tiles, the OTA-1471 outlier —
// is now 14 apart, and it is STILL the closest pair on the map.
//
// ⚠ WHAT DID NOT MOVE: Nimari (the centre seat) and its Red Tower — so every
// exact-id trigger and fixture keyed to (41,20)/(42,22) is untouched. The three
// satellite towers moved WITH their capitals, keeping their exact grid offsets.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  canonicalCellOf,
  canonicalDistance,
} from '../app/engine/worldMap';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';
import { LOCATION_ATLAS_COORDS } from '../app/engine/atlasCoords';
import { LABEL_ANCHOR_NUDGE } from '../app/engine/atlasLabels';

const MOVED = [
  'asgardar', 'samarran', 'drakova', 'voronov', 'karok_sa',
  'yuldra_tul', 'ostragar', 'iskan_veil', 'grand_spire_of_asgardar',
  'thametans_tower',
] as const;

describe('OTA-1496 — the spacing ratchet', () => {
  it('⚠⚠⚠ EVERY pair of Lost Capitals is at least 14 walking tiles apart', () => {
    // canonicalDistance is the game's OWN travel metric (Manhattan on the canon
    // grid) — the same tiles the travel counter charges the player for. This is
    // a RATCHET: future pin moves may spread them further, never closer.
    expect(LOST_CAPITAL_LOCATIONS.length).toBe(9);
    for (let i = 0; i < LOST_CAPITAL_LOCATIONS.length; i++) {
      for (let j = i + 1; j < LOST_CAPITAL_LOCATIONS.length; j++) {
        const a = LOST_CAPITAL_LOCATIONS[i]!;
        const b = LOST_CAPITAL_LOCATIONS[j]!;
        expect({ pair: `${a}↔${b}`, ok: canonicalDistance(a, b) >= 14 })
          .toEqual({ pair: `${a}↔${b}`, ok: true });
      }
    }
  });

  it('⚠⚠ the old outlier is the proof: Drakova↔Voronov went 2 → 14', () => {
    expect(canonicalDistance('drakova', 'voronov')).toBe(14);
  });

  it('⚠⚠ …and 14 really is the map\'s ceiling here, so the ratchet cannot creep', () => {
    // If someone later "improves" a pin and the minimum drops, the first test
    // fails. If the whole band were ever widened (bigger SPREAD, new art), this
    // documents what the target was: the owner asked for 20; the drawable box
    // maxes out at 16 even with the arrangement abandoned; 14 keeps Nimari
    // centred. A future map with more room should revisit 20.
    const min = Math.min(
      ...LOST_CAPITAL_LOCATIONS.flatMap((a, i) =>
        LOST_CAPITAL_LOCATIONS.slice(i + 1).map((b) => canonicalDistance(a, b))),
    );
    expect(min).toBe(14);
  });
});

describe('OTA-1496 — what held still while everything spread', () => {
  it('⚠⚠⚠ NIMARI KEPT THE CENTRE SEAT — and the Red Tower did not move an inch', () => {
    // The centre capital and its tower anchor exact-id triggers and hand-laid
    // fixtures; the whole point of settling for 14 was to keep these.
    expect(canonicalCellOf('nimari')).toEqual({ x: 41, y: 20 });
    expect(canonicalCellOf('red_tower_of_nimari')).toEqual({ x: 42, y: 22 });
    expect(LOCATION_ATLAS_COORDS['nimari']).toEqual({ fx: 0.50, fy: 0.50 });
  });

  it('⚠⚠⚠ THE SPIRE RODE WITH ASGARDAR — still exactly two tiles south', () => {
    // Owner: "one of the spires is tied to one of the capitals as it's in the
    // outskirts … it moves too." The tower keeps the outskirts relation the
    // 2026-08-17 ruling established, wherever the capital stands.
    const asg = canonicalCellOf('asgardar');
    const spire = canonicalCellOf('grand_spire_of_asgardar');
    expect(spire).toEqual({ x: asg.x, y: asg.y + 2 });
  });

  it('⚠⚠ the other two towers kept their capitals too', () => {
    const sam = canonicalCellOf('samarran');
    const tham = canonicalCellOf('thametans_tower');
    expect(tham).toEqual({ x: sam.x + 2, y: sam.y + 2 });
    const nim = canonicalCellOf('nimari');
    const red = canonicalCellOf('red_tower_of_nimari');
    expect(red).toEqual({ x: nim.x + 1, y: nim.y + 2 });
  });

  it('⚠⚠ the compass arrangement survived — the lore\'s rough directions still read', () => {
    // "roughly arranged correctly" was the other half of the request. Every
    // clearly-ordered relation of the old map still holds on the new one.
    const c = Object.fromEntries(
      [...LOST_CAPITAL_LOCATIONS].map((id) => [id, canonicalCellOf(id)]),
    );
    expect(c['iskan_veil']!.x).toBeLessThan(c['samarran']!.x);      // far NW
    expect(c['iskan_veil']!.y).toBeLessThan(c['asgardar']!.y);
    expect(c['asgardar']!.x).toBeLessThan(c['samarran']!.x);        // west chain
    expect(c['samarran']!.x).toBeLessThan(c['nimari']!.x);
    expect(c['nimari']!.x).toBeLessThan(c['drakova']!.x);           // east of centre
    expect(c['nimari']!.x).toBeLessThan(c['voronov']!.x);
    expect(c['drakova']!.y).toBeLessThan(c['voronov']!.y);          // Voronov south of Drakova
    expect(c['yuldra_tul']!.y).toBeLessThan(c['drakova']!.y);       // NE mountains
    expect(c['yuldra_tul']!.y).toBeLessThan(c['ostragar']!.y);
    expect(c['ostragar']!.x).toBeGreaterThanOrEqual(c['drakova']!.x); // far east
    expect(c['karok_sa']!.y).toBeGreaterThan(c['nimari']!.y);       // south seat
  });

  it('⚠ no capital took the Black Reach\'s row — the 6:00 ruling stands', () => {
    // Owner, 2026-08-17: "The black reach is the most southern point on the
    // map." Spreading south stopped one row short of it, satellites included.
    const reachY = canonicalCellOf('black_reach').y;
    for (const id of [...LOST_CAPITAL_LOCATIONS,
      'grand_spire_of_asgardar', 'thametans_tower', 'red_tower_of_nimari']) {
      expect({ id, north: canonicalCellOf(id).y < reachY }).toEqual({ id, north: true });
    }
  });
});

describe('OTA-1496 — the pins stayed honest', () => {
  it('⚠⚠ every capital pin is inside the drawable atlas band', () => {
    for (const id of LOST_CAPITAL_LOCATIONS) {
      const f = LOCATION_ATLAS_COORDS[id]!;
      expect({ id, drawable: f.fx > 0.05 && f.fx < 0.95 && f.fy > 0.05 && f.fy < 0.97 })
        .toEqual({ id, drawable: true });
    }
  });

  it('⚠⚠ no two placed locations share a grid cell — nobody was nudged off a collision', () => {
    // canonicalPositions() silently resolves collisions in id order; a capital
    // that got nudged would make canonicalCellFor and canonicalCellOf disagree
    // about where it is. The spread was chosen so the resolver has nothing to do.
    const seen = new Map<string, string>();
    for (const id of Object.keys(LOCATION_ATLAS_COORDS)) {
      const cell = canonicalCellOf(id);
      const key = `${cell.x},${cell.y}`;
      expect({ id, clashesWith: seen.get(key) ?? null }).toEqual({ id, clashesWith: null });
      seen.set(key, id);
    }
  });

  it('⚠⚠ the moved pins carry NO stale label nudge — their calibration died with the old art', () => {
    // Each LABEL_ANCHOR_NUDGE entry was measured against the silhouette a pin
    // stood on BEFORE the spread; keeping one would shove the label toward a
    // building that is no longer there. The moved pins were hand-centred on
    // their new art instead. Nimari and the Red Tower did not move; theirs stay.
    for (const id of MOVED) {
      expect({ id, nudge: LABEL_ANCHOR_NUDGE[id] ?? null }).toEqual({ id, nudge: null });
    }
    expect(LABEL_ANCHOR_NUDGE['nimari']).toBeDefined();
    expect(LABEL_ANCHOR_NUDGE['red_tower_of_nimari']).toBeDefined();
  });

  it('⚠ the atlas file itself records the spread — the why travels with the numbers', () => {
    const src = readFileSync(
      join(__dirname, '..', 'app', 'engine', 'atlasCoords.ts'), 'utf8');
    expect(src).toContain('OTA-1496');
    expect(src).toMatch(/spread/i);
  });
});
