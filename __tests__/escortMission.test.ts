import {
  escortSpecForQuest,
  isEscortQuest,
  spawnEscortPool,
  escorteeMaxHp,
  livingEscortPools,
} from '../app/engine/escort';
import type { FactionQuestDef } from '../app/engine/factionQuests';
import type { EscortPool } from '../app/engine/types';

function quest(partial: Partial<FactionQuestDef>): FactionQuestDef {
  return {
    id: 'x',
    factionId: 'f',
    title: 't',
    description: 'd',
    objective: 'o',
    requirement: { rep: 0 },
    reward: { tc: 1, rep: 1 },
    ...partial,
  };
}

describe('escort mission mechanic (shared pool)', () => {
  it('detects escort quests by _escort id suffix', () => {
    expect(isEscortQuest(quest({ id: 'onr_t1_escort' }))).toBe(true);
    expect(isEscortQuest(quest({ id: 'onr_t1_fetch' }))).toBe(false);
    expect(isEscortQuest(null)).toBe(false);
  });

  it('detects escort quests by explicit escort field and honors count + label', () => {
    const spec = escortSpecForQuest(quest({ id: 'plain', escort: { count: 4, label: 'Scientists' } }));
    expect(spec).not.toBeNull();
    expect(spec!.count).toBe(4);
    expect(spec!.label).toBe('Scientists');
  });

  it('defaults the label when none is authored', () => {
    expect(escortSpecForQuest(quest({ id: 'p_escort' }))!.label).toBe('Escort party');
  });

  it('clamps an absurd authored count into a sane party size', () => {
    expect(escortSpecForQuest(quest({ id: 'p', escort: { count: 99 } }))!.count).toBe(5);
    expect(escortSpecForQuest(quest({ id: 'p', escort: { count: 0 } }))!.count).toBe(1);
  });

  it('spawns a single shared pool at full HP = sum of the party', () => {
    const pool = spawnEscortPool(3, 40, 'Scientists');
    expect(pool.label).toBe('Scientists');
    expect(pool.count).toBe(3); // drives verb agreement
    expect(pool.hp).toBe(pool.hpMax); // spawns at full
    // 3 members, each 8-45 → pool max in [24, 135].
    expect(pool.hpMax).toBeGreaterThanOrEqual(3 * 8);
    expect(pool.hpMax).toBeLessThanOrEqual(3 * 45);
  });

  it('keeps the per-member contribution clearly squishier than the player', () => {
    for (let i = 0; i < 50; i++) {
      const hp = escorteeMaxHp(100);
      expect(hp).toBeGreaterThanOrEqual(8);
      expect(hp).toBeLessThanOrEqual(45);
      expect(hp).toBeLessThan(100); // a single member never tankier than the player
    }
  });

  it('returns only ACTIVE, living escort pools for the HUD', () => {
    const a: EscortPool = { label: 'Scientists', hp: 5, hpMax: 10 };
    const dead: EscortPool = { label: 'Dead', hp: 0, hpMax: 10 }; // pool down — excluded
    const parked: EscortPool = { label: 'Parked', hp: 8, hpMax: 10 };
    const c: EscortPool = { label: 'Couriers', hp: 3, hpMax: 9 };
    const active = [
      { escort: a },
      { escort: dead },
      { escort: parked, tracked: false }, // deactivated — excluded
      {}, // no escort
      { escort: c },
    ];
    const live = livingEscortPools(active);
    expect(live.map((p) => p.label).sort()).toEqual(['Couriers', 'Scientists']);
    expect(livingEscortPools(undefined)).toEqual([]);
  });
});
