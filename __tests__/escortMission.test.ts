import {
  escortSpecForQuest,
  isEscortQuest,
  spawnEscortees,
  escorteeMaxHp,
  livingEscortees,
} from '../app/engine/escort';
import type { FactionQuestDef } from '../app/engine/factionQuests';

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

describe('escort mission mechanic', () => {
  it('detects escort quests by _escort id suffix', () => {
    expect(isEscortQuest(quest({ id: 'onr_t1_escort' }))).toBe(true);
    expect(isEscortQuest(quest({ id: 'onr_t1_fetch' }))).toBe(false);
    expect(isEscortQuest(null)).toBe(false);
  });

  it('detects escort quests by explicit escort field and honors count', () => {
    const spec = escortSpecForQuest(quest({ id: 'plain', escort: { count: 4 } }));
    expect(spec).not.toBeNull();
    expect(spec!.count).toBe(4);
  });

  it('clamps an absurd authored count into a sane party size', () => {
    expect(escortSpecForQuest(quest({ id: 'p', escort: { count: 99 } }))!.count).toBe(5);
    expect(escortSpecForQuest(quest({ id: 'p', escort: { count: 0 } }))!.count).toBe(1);
  });

  it('spawns a party with distinct names and full HP', () => {
    const party = spawnEscortees(3, 40, 1234);
    expect(party).toHaveLength(3);
    const names = new Set(party.map((e) => e.name));
    expect(names.size).toBe(3); // distinct
    for (const e of party) {
      expect(e.hp).toBe(e.hpMax); // spawns at full
      expect(e.hpMax).toBeGreaterThanOrEqual(8);
      expect(e.id).toContain('1234');
    }
  });

  it('keeps escortees clearly squishier than the player', () => {
    for (let i = 0; i < 50; i++) {
      const hp = escorteeMaxHp(100);
      expect(hp).toBeGreaterThanOrEqual(8);
      expect(hp).toBeLessThanOrEqual(45);
      expect(hp).toBeLessThan(100); // never tankier than the player
    }
  });

  it('flattens only living escortees across active quests for the HUD', () => {
    const active = [
      { id: 'a', escortees: [
        { id: 'a0', name: 'A', hp: 5, hpMax: 10 },
        { id: 'a1', name: 'B', hp: 0, hpMax: 10 }, // down — excluded
      ] },
      { id: 'b' }, // no escortees
      { id: 'c', escortees: [{ id: 'c0', name: 'C', hp: 3, hpMax: 9 }] },
    ];
    const live = livingEscortees(active);
    expect(live.map((e) => e.name).sort()).toEqual(['A', 'C']);
    expect(livingEscortees(undefined)).toEqual([]);
  });
});
