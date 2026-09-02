// OTA-1162 — ONE PRICE FOR A TILE, AND A DEADLINE DERIVED FROM IT.
//
// Owner: "let's make .25 the standard. let's make a mathematical variable 2.5 and
// let's make the time 2.5 times the steps. it's just those three changes. I still
// want time to be seen as time in the game days, hours, things like that."
//
// Three changes, and the scope really is three:
//   1. every path that crosses a tile charges TILE_HOURS (0.25) — typed movement was
//      charging 1h for the identical move the → TARGET button charged 0.25h for;
//   2. HOURS_PER_TILE_TRUE (2.5) exists as a named, derived conversion factor;
//   3. a bounty deadline is that factor × tiles, still expressed in in-game hours.
//
// ⚠ The derivation behind 2.5, because it is the part that will rot: a tile costs
// 0.25h of walking AND 2 stamina; stamina is only repaid by the parser rest, which
// returns min(room, 8) over a fixed 8 hours — exactly 1h per point; so the all-in
// cost is ~2.25h, rounded up to 2.5 for slack. If STAMINA_COSTS.travel or the rest
// return moves, 2.5 is wrong. The dead store-method rest() is NOT the source: it
// rolls d4 over d4+3 hours while printing "d6+2", and nothing calls it.

import { TILE_HOURS, HOURS_PER_TILE_TRUE, travelHoursFor } from '../app/engine/travelTime';
import { bountyDeadlineFor, bountyHoursLeft, bountyExpired, BOUNTY_DEADLINE_HOURS } from '../app/engine/factionBounty';

import * as fs from 'fs';
import * as path from 'path';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const STORE = read('app', 'state', 'gameStore.ts');

describe('OTA-1162 — a tile costs one thing, however you ask for it', () => {
  it('TILE_HOURS is 0.25 — the value the button already charged', () => {
    // ⚠ Chosen because it is what → TARGET already cost, so standardising on it moved
    // nobody's world clock. The other candidate (1h) would have quadrupled the rate at
    // which the whole world sim advances while travelling.
    expect(TILE_HOURS).toBe(0.25);
  });

  it('no tile-crossing path charges a bare 1 any more', () => {
    // The two sites that did: the typed cardinal walk and the `continue` command. Both
    // called stepDirection immediately after, which is what makes them tile moves.
    // ⚠ `.*?` not `[^)]*` — three of these sites pass `get().player!`, whose nested
    // parens a negated-class match silently walks past. That is how the first draft of
    // this test counted 2 of 5 and 4 of 7 and called it a finding.
    expect(STORE).not.toMatch(/advanceTime\(spendTravelStamina\(player\), 1\)\);\s*\n\s*get\(\)\.stepDirection/);
    // ⚠ OTA-1632 — five became four: setTravelCourse no longer takes a first step
    // itself (and so no longer charges one). The tap on the travel row is the step.
    const tiled = STORE.match(/advanceTime\(spend\w+\(.*?\), TILE_HOURS\)/g) ?? [];
    expect(tiled.length).toBe(4);
  });

  it('every stepDirection caller pays through the constant', () => {
    // ⚠ ALL FOUR (five before OTA-1632 removed the set-course auto-step), and the
    // count is the assertion. Crossing a tile is defined by the stepDirection that
    // follows the charge, so any new caller that appears without a TILE_HOURS charge
    // in front of it fails here — which is the whole guarantee.
    const calls = STORE.match(/get\(\)\.stepDirection\(/g) ?? [];
    expect(calls.length).toBe(4);
    let idx = 0;
    for (let n = 0; n < 4; n++) {
      idx = STORE.indexOf('get().stepDirection(', idx);
      expect(idx).toBeGreaterThan(-1);
      expect(STORE.slice(Math.max(0, idx - 400), idx)).toContain('TILE_HOURS');
      idx += 1;
    }
  });

  it('no TILE charge is a bare literal any more — the constant is the only spelling', () => {
    // Two sites (autoroute step, whisper course) already charged the right NUMBER by
    // hand. Same value, so converting them changed nothing a player can feel — but a
    // number spelled in five places is a number nobody owns, which is the OTA.
    //
    // ⚠ SCOPED TO TILE MOVES, and the scoping is the point. ~25 OTHER sites also
    // advance the clock by a bare 0.25 — skill checks, training, combat beats — and
    // they are NOT this number. A quarter hour is simply also what a short action
    // takes. A sweep that caught them all would be asserting something this OTA never
    // claimed; the tile charge is the one followed by a stepDirection.
    expect(STORE).not.toMatch(/, 0\.25\)[^\n]*\);\s*\n\s*get\(\)\.stepDirection/);
  });

  it('⚠ ROOM moves inside a tile are deliberately untouched', () => {
    // Seven other sites charge 1h: leaving a hub gate, stepping between micro-micro
    // rooms, surfacing from the depths. None of them is followed by stepDirection, so
    // none of them crosses a grid tile, so none of them is in scope.
    const roomMoves = STORE.match(/advanceTime\(spendTravelStamina\(.*?\), 1\)/g) ?? [];
    expect(roomMoves.length).toBe(7);
  });
});

describe('OTA-1162 — 2.5 is a conversion factor, and it is derived', () => {
  it('the constant is 2.5 and travelHoursFor multiplies by it', () => {
    expect(HOURS_PER_TILE_TRUE).toBe(2.5);
    expect(travelHoursFor(10)).toBe(25);
    expect(travelHoursFor(23)).toBe(57.5);
  });

  it('it is meaningfully larger than the clock charge, which is the whole point', () => {
    // The gap IS the finding: what the clock visibly charges for a tile (0.25h) is a
    // tenth of what crossing one actually costs once the stamina is rested back.
    expect(HOURS_PER_TILE_TRUE / TILE_HOURS).toBe(10);
    // ⚠ 2.25 is the MEASURED all-in cost — 0.25h walking + 2 stamina at the rest's
    // flat 1h/point. 2.5 must stay at or above it or the deadline stops covering the
    // journey it exists to pay for. If STAMINA_COSTS.travel or the rest return moves,
    // this is the assertion that should break first.
    expect(HOURS_PER_TILE_TRUE).toBeGreaterThanOrEqual(2.25);
  });

  it('never returns negative hours for a nonsense distance', () => {
    expect(travelHoursFor(-5)).toBe(0);
    expect(travelHoursFor(0)).toBe(0);
  });
});

describe('OTA-1162 — the deadline is the journey', () => {
  it('is the 24h job budget PLUS 2.5 × tiles', () => {
    expect(bountyDeadlineFor(23)).toBe(24 + 57.5); // 81.5
    expect(bountyDeadlineFor(10)).toBe(24 + 25);
    // the old shape budgeted a bare 1h of travel per tile
    expect(bountyDeadlineFor(23)).not.toBe(24 + 23);
  });

  it('rounds the tile count before converting, so half-tiles cannot leak in', () => {
    expect(bountyDeadlineFor(23.4)).toBe(24 + 57.5);
    expect(bountyDeadlineFor(23.6)).toBe(24 + 60);
  });

  it('gives a long contract materially more room than it used to', () => {
    // The regression this OTA exists to fix: 23 tiles used to be 47h, of which
    // arriving consumed ~39h.
    expect(bountyDeadlineFor(23)).toBeGreaterThan(24 + 23);
    expect(bountyDeadlineFor(50)).toBeGreaterThan(24 + 50);
  });

  it('⚠ AND NEVER TAKES ROOM AWAY FROM A SHORT ONE', () => {
    // ⚠ THIS IS THE ASSERTION THAT CAUGHT THE FIRST DRAFT. It replaced the whole
    // formula with a pure per-tile multiplier, which fixed the 23-tile contract by
    // breaking every short one — 6 tiles fell from 30h to 15h for up to 9 kills, and
    // 0 tiles gave 0 hours. The JOB does not shrink with the walk. The base is the
    // floor, and it must hold at every distance.
    expect(bountyDeadlineFor(0)).toBe(24);
    expect(bountyDeadlineFor(2)).toBe(29);
    for (const tiles of [0, 1, 2, 5, 6, 23, 50]) {
      expect(bountyDeadlineFor(tiles)).toBeGreaterThanOrEqual(BOUNTY_DEADLINE_HOURS);
      expect(bountyDeadlineFor(tiles)).toBeGreaterThanOrEqual(24 + tiles); // never worse than before
    }
  });

  it('the 24h base is the job budget AND the legacy fallback', () => {
    // A contract migrated from before deadlines existed has no stored deadlineHours.
    expect(BOUNTY_DEADLINE_HOURS).toBe(24);
    const legacy = { acceptedAtHour: 10 } as never;
    expect(bountyHoursLeft(legacy, 20)).toBe(24 - 10);
    // ...and one with no accept stamp at all never expires.
    expect(bountyHoursLeft({} as never, 9999)).toBe(Infinity);
    expect(bountyExpired({} as never, 9999)).toBe(false);
  });

  it('time is still time — the deadline is hours, not steps', () => {
    // Owner: "I still want time to be seen as time in the game days, hours."
    // The contract clock stays denominated in in-game hours; only the SIZING changed.
    const h = bountyDeadlineFor(23);
    expect(typeof h).toBe('number');
    expect(h / 24).toBeCloseTo(3.4, 1); // ~3.4 days, and it reads as days
  });
});
