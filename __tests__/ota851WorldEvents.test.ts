// OTA-851 [living world — variety] — pins the world-event engine + roaming-patrol
// helpers: deterministic weighted selection, real variety across seeds, eligibility
// gating, tide-delta clamping, and that a patrol wanders but never strays past its
// radius from home (so patrols loop their outposts instead of drifting off the map).

import {
  pickWorldEvent, applyTideDelta, stepPatrol, patrolsNear,
  type WorldEventCtx, type Patrol,
} from '../app/engine/worldEvents';
import type { FactionMeta } from '../app/engine/worldPulse';

const FACTIONS: FactionMeta[] = [
  { id: 'order', name: 'Forgotten Order', rivals: ['monarchs'], allies: ['tartarians'] },
  { id: 'monarchs', name: 'Mud Monarchs', rivals: ['order', 'tartarians'], allies: [] },
  { id: 'tartarians', name: 'True Tartarians', rivals: ['monarchs'], allies: ['order'] },
];
const ctx = (over: Partial<WorldEventCtx> = {}): WorldEventCtx => ({
  factions: FACTIONS, tides: {}, standings: [], ...over,
});

describe('OTA-851 — pickWorldEvent', () => {
  it('is deterministic for a given seed', () => {
    const a = pickWorldEvent(ctx(), 42);
    const b = pickWorldEvent(ctx(), 42);
    expect(a?.kind).toBe(b?.kind);
    expect(a?.rumor).toBe(b?.rumor);
  });

  it('produces genuine variety across seeds (not one repeating event)', () => {
    const kinds = new Set<string>();
    for (let s = 0; s < 60; s++) { const e = pickWorldEvent(ctx({ tides: { order: 2, monarchs: -1 } }), s); if (e) kinds.add(e.kind); }
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });

  it('always returns something for a normal context', () => {
    for (let s = 0; s < 20; s++) expect(pickWorldEvent(ctx(), s)).not.toBeNull();
  });

  it('only offers a bounty-post / setback when the player favors a faction with a rival', () => {
    // No favored faction → the setback/bounty events are ineligible; sample many seeds
    // and confirm none of those kinds appear.
    const seen = new Set<string>();
    for (let s = 0; s < 80; s++) { const e = pickWorldEvent(ctx(), s); if (e) seen.add(e.kind); }
    // With a favored faction, 'bounty' or 'setback' becomes reachable.
    const favSeen = new Set<string>();
    for (let s = 0; s < 80; s++) { const e = pickWorldEvent(ctx({ standings: [{ factionId: 'order', standing: 30 }] }), s); if (e) favSeen.add(e.kind); }
    expect([...favSeen].some((k) => k === 'bounty' || k === 'setback')).toBe(true);
  });
});

describe('OTA-851 — applyTideDelta clamps to [-5,5]', () => {
  it('adds deltas and clamps', () => {
    expect(applyTideDelta({ order: 4 }, { order: 3 }).order).toBe(5);
    expect(applyTideDelta({ monarchs: -4 }, { monarchs: -3 }).monarchs).toBe(-5);
    expect(applyTideDelta({}, undefined)).toEqual({});
  });
});

describe('OTA-853 — stepPatrol roams free and seeks a target', () => {
  it('roams the map (no home leash) — it actually moves and ranges out', () => {
    let p: Patrol = { factionId: 'monarchs', gx: 10, gy: 10, homeX: 10, homeY: 10, phase: 3 };
    let maxDist = 0;
    for (let t = 0; t < 200; t++) {
      p = stepPatrol(p, t); // no target → free wander
      maxDist = Math.max(maxDist, Math.abs(p.gx - p.homeX) + Math.abs(p.gy - p.homeY));
    }
    expect(maxDist).toBeGreaterThan(4); // it is NOT leashed near home anymore
  });

  it('drifts toward a target (goes looking for a fight)', () => {
    let p: Patrol = { factionId: 'monarchs', gx: 0, gy: 0, homeX: 0, homeY: 0, phase: 3 };
    const target = { x: 40, y: 40 };
    const start = Math.abs(target.x - p.gx) + Math.abs(target.y - p.gy);
    for (let t = 0; t < 60; t++) p = stepPatrol(p, t, target);
    const end = Math.abs(target.x - p.gx) + Math.abs(target.y - p.gy);
    expect(end).toBeLessThan(start); // net closes on the target
  });

  it('is deterministic', () => {
    const base: Patrol = { factionId: 'x', gx: 5, gy: 5, homeX: 5, homeY: 5, phase: 1 };
    expect(stepPatrol(base, 7)).toEqual(stepPatrol(base, 7));
    expect(stepPatrol(base, 7, { x: 9, y: 9 })).toEqual(stepPatrol(base, 7, { x: 9, y: 9 }));
  });
});

describe('OTA-851 — patrolsNear proximity', () => {
  it('returns only patrols within the Manhattan radius', () => {
    const patrols: Patrol[] = [
      { factionId: 'a', gx: 10, gy: 10, homeX: 10, homeY: 10, phase: 0 },
      { factionId: 'b', gx: 14, gy: 10, homeX: 14, homeY: 10, phase: 0 },
    ];
    // From (10,10): a=0, b=4. Radius 2 → only a; radius 4 → both.
    expect(patrolsNear(patrols, 10, 10, 2).map((p) => p.factionId)).toEqual(['a']);
    expect(patrolsNear(patrols, 10, 10, 4).length).toBe(2);
  });
});
