// OTA-853 [emergent grudges] — pins the faction-vs-faction standing engine: lore
// seeding, symmetric clamped adjustment, the meet decision (hostiles fight, friends
// pass, neutrals can spark a grudge FROM ZERO through friction), and the board helpers.

import {
  seedRelations, getRelation, adjustRelation, meetOutcome, grudgeDelta,
  relationLabel, topGrudges, topAlliances, warmSharedEnemy,
  HOSTILE_AT, FRIENDLY_AT, REL_MIN, REL_MAX,
} from '../app/engine/factionRelations';
import type { FactionMeta } from '../app/engine/worldPulse';

const FACTIONS: FactionMeta[] = [
  { id: 'order', name: 'Forgotten Order', rivals: ['monarchs', 'ghost'], allies: ['tartarians'] },
  { id: 'monarchs', name: 'Mud Monarchs', rivals: ['order'], allies: [] },
  { id: 'tartarians', name: 'True Tartarians', rivals: [], allies: ['order'] },
];

// OTA-867 — real faction ids so the LORE_RELATIONS table applies.
const REAL: FactionMeta[] = [
  'mud_monarchs', 'conspiracy_architects', 'forgotten_order', 'stone_builders',
  'eternal_dynasty', 'true_tartarians', 'servants_of_giants', 'tartarian_revivalists',
  'reclaimers_guild',
].map((id) => ({ id, name: id }));

describe('OTA-853/867 — seedRelations from the lore table', () => {
  const m = seedRelations(REAL);
  it('seeds real alliances AND grudges (not just grudges)', () => {
    expect(getRelation(m, 'mud_monarchs', 'conspiracy_architects')).toBeGreaterThanOrEqual(FRIENDLY_AT); // funded allies
    expect(getRelation(m, 'forgotten_order', 'stone_builders')).toBeGreaterThanOrEqual(FRIENDLY_AT);     // scholars
    expect(getRelation(m, 'mud_monarchs', 'forgotten_order')).toBeLessThanOrEqual(HOSTILE_AT);            // suppressor vs reclaimer
  });
  it('the Eternal Dynasty is friendless — no positive relation with anyone', () => {
    for (const f of REAL) {
      if (f.id === 'eternal_dynasty') continue;
      expect(getRelation(m, 'eternal_dynasty', f.id)).toBeLessThanOrEqual(0);
    }
  });
  it('is symmetric, and a pair with no lore link is 0', () => {
    expect(getRelation(m, 'mud_monarchs', 'forgotten_order')).toBe(getRelation(m, 'forgotten_order', 'mud_monarchs'));
    expect(getRelation(m, 'servants_of_giants', 'reclaimers_guild')).toBe(0);
  });
});

describe('OTA-867 — enemy of my enemy warms co-belligerents', () => {
  it('a faction that also hates the loser warms toward the winner — but not one already at war', () => {
    // A and B both hate C (at war). A and B start neutral with each other.
    let m: Record<string, Record<string, number>> = {};
    m = adjustRelation(m, 'a', 'c', -40); // A at war with C
    m = adjustRelation(m, 'b', 'c', -40); // B at war with C
    const facs: FactionMeta[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }];
    const before = getRelation(m, 'a', 'b');
    m = warmSharedEnemy(m, 'a', 'c', facs); // A beat C
    expect(getRelation(m, 'a', 'b')).toBeGreaterThan(before); // B warmed to A (shared enemy C)
    expect(getRelation(m, 'a', 'd')).toBe(0);                 // D doesn't hate C → no warming
  });
  it('a faction already at war with the winner does NOT back into friendship', () => {
    let m: Record<string, Record<string, number>> = {};
    m = adjustRelation(m, 'b', 'c', -40); // B hates C
    m = adjustRelation(m, 'a', 'b', -40); // ...but A and B are already at war
    const facs: FactionMeta[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
    m = warmSharedEnemy(m, 'a', 'c', facs);
    expect(getRelation(m, 'a', 'b')).toBe(-40); // unchanged — enemies stay enemies
  });
});

describe('OTA-867 — topAlliances', () => {
  it('surfaces the most-friendly pairs (>= FRIENDLY_AT), most-allied first', () => {
    const m = seedRelations(REAL);
    const allies = topAlliances(m, REAL, 6);
    expect(allies.length).toBeGreaterThan(0);
    expect(allies.every((p) => p.relation >= FRIENDLY_AT)).toBe(true);
    expect(allies[0]!.relation).toBeGreaterThanOrEqual(allies[allies.length - 1]!.relation);
    // The strongest seeded bond leads.
    const lead = allies[0]!;
    expect([lead.a, lead.b].sort()).toEqual(['conspiracy_architects', 'mud_monarchs']);
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
