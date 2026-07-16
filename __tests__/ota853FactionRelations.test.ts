// OTA-853 [emergent grudges] — pins the faction-vs-faction standing engine: lore
// seeding, symmetric clamped adjustment, the meet decision (hostiles fight, friends
// pass, neutrals can spark a grudge FROM ZERO through friction), and the board helpers.

import {
  seedRelations, getRelation, adjustRelation, meetOutcome, grudgeDelta,
  relationLabel, topGrudges, HOSTILE_AT, FRIENDLY_AT, REL_MIN, REL_MAX,
} from '../app/engine/factionRelations';
import type { FactionMeta } from '../app/engine/worldPulse';

const FACTIONS: FactionMeta[] = [
  { id: 'order', name: 'Forgotten Order', rivals: ['monarchs', 'ghost'], allies: ['tartarians'] },
  { id: 'monarchs', name: 'Mud Monarchs', rivals: ['order'], allies: [] },
  { id: 'tartarians', name: 'True Tartarians', rivals: [], allies: ['order'] },
];

describe('OTA-853 — seedRelations from lore', () => {
  const m = seedRelations(FACTIONS);
  it('rivals start hostile, allies start friendly, pseudo-ids ignored', () => {
    expect(getRelation(m, 'order', 'monarchs')).toBeLessThan(0);
    expect(getRelation(m, 'order', 'tartarians')).toBeGreaterThan(0);
    expect(getRelation(m, 'order', 'ghost')).toBe(0); // pseudo-id never seeded
    expect(getRelation(m, 'monarchs', 'tartarians')).toBe(0); // no lore link
  });
  it('is symmetric', () => {
    expect(getRelation(m, 'order', 'monarchs')).toBe(getRelation(m, 'monarchs', 'order'));
  });
});

describe('OTA-853 — adjustRelation', () => {
  it('nudges both directions and clamps to [-100,100]', () => {
    let m = adjustRelation({}, 'a', 'b', -50);
    expect(getRelation(m, 'a', 'b')).toBe(-50);
    expect(getRelation(m, 'b', 'a')).toBe(-50);
    m = adjustRelation(m, 'a', 'b', -1000);
    expect(getRelation(m, 'a', 'b')).toBe(REL_MIN);
    m = adjustRelation(m, 'a', 'b', 100000);
    expect(getRelation(m, 'a', 'b')).toBe(REL_MAX);
  });
  it('never self-relates', () => {
    expect(getRelation(adjustRelation({}, 'a', 'a', -50), 'a', 'a')).toBe(0);
  });
});

describe('OTA-853 — meetOutcome', () => {
  it('hostiles always fight, friends never do', () => {
    for (let s = 0; s < 20; s++) {
      expect(meetOutcome(HOSTILE_AT - 10, s).fight).toBe(true);
      expect(meetOutcome(FRIENDLY_AT + 10, s).fight).toBe(false);
    }
  });
  it('neutrals can spark a FRICTION fight from zero (grudge from nothing)', () => {
    let anyFriction = false;
    for (let s = 0; s < 100; s++) {
      const o = meetOutcome(0, s);
      if (o.fight) { expect(o.friction).toBe(true); anyFriction = true; }
    }
    expect(anyFriction).toBe(true); // zero-standing factions DO sometimes come to blows
  });
  it('friction near-hostile is likelier than near-friendly', () => {
    const count = (rel: number) => { let n = 0; for (let s = 0; s < 200; s++) if (meetOutcome(rel, s).fight) n++; return n; };
    expect(count(HOSTILE_AT + 2)).toBeGreaterThan(count(FRIENDLY_AT - 2));
  });
});

describe('OTA-853 — labels + board', () => {
  it('grudgeDelta cuts deeper for a fresh friction clash', () => {
    expect(grudgeDelta(true)).toBeLessThan(grudgeDelta(false));
  });
  it('relationLabel flags hostility', () => {
    expect(relationLabel(-70).hostile).toBe(true);
    expect(relationLabel(50).hostile).toBe(false);
  });
  it('topGrudges lists the sharpest feuds first', () => {
    let m = adjustRelation({}, 'order', 'monarchs', -80);
    m = adjustRelation(m, 'order', 'tartarians', -30);
    const top = topGrudges(m, FACTIONS, 6);
    expect(top[0]!.relation).toBeLessThanOrEqual(top[1]?.relation ?? 0);
    expect(top[0]!.a === 'order' || top[0]!.b === 'order').toBe(true);
  });
});
