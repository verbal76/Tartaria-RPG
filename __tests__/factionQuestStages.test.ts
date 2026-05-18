// Faction quest stages: catalog has authored narrative beats; advance
// happens on combat kills / travel completions; turn-in is gated on
// stage >= stages.length. Legacy single-stage quests (no `stages`
// field) remain turn-in-able immediately, preserving pre-refactor
// behaviour.

import {
  FACTION_QUESTS,
  findFactionQuestById,
} from '../app/engine/factionQuests';

describe('faction-quests.json schema', () => {
  it('every quest has a stages array with at least 2 beats', () => {
    for (const q of FACTION_QUESTS) {
      expect(Array.isArray(q.stages)).toBe(true);
      expect(q.stages!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every stage has non-empty narration', () => {
    for (const q of FACTION_QUESTS) {
      for (const s of q.stages ?? []) {
        expect(typeof s.narration).toBe('string');
        expect(s.narration.length).toBeGreaterThan(20);
      }
    }
  });

  it('factionId references a real faction id format', () => {
    for (const q of FACTION_QUESTS) {
      expect(q.factionId).toMatch(/^[a-z_]+$/);
    }
  });
});

describe('findFactionQuestById', () => {
  it('returns the def for a known id', () => {
    const q = findFactionQuestById('fq_order_relic');
    expect(q?.title).toBe('Salvage the buried lens');
    expect(q?.stages?.length).toBeGreaterThanOrEqual(2);
  });
  it('returns null for unknown id', () => {
    expect(findFactionQuestById('fq_does_not_exist')).toBeNull();
  });
});

// Simulate the stage-gate that gameStore.turnInFactionQuest uses.
function canTurnIn(stages: { narration: string }[] | undefined, recordedStage: number): boolean {
  if (!stages || stages.length === 0) return true;
  return recordedStage >= stages.length;
}

describe('stage gate', () => {
  it('blocks turn-in below final stage', () => {
    const q = findFactionQuestById('fq_order_relic')!;
    expect(canTurnIn(q.stages, 0)).toBe(false);
    expect(canTurnIn(q.stages, 1)).toBe(false);
    expect(canTurnIn(q.stages, q.stages!.length - 1)).toBe(false);
  });

  it('allows turn-in at or past the final stage', () => {
    const q = findFactionQuestById('fq_order_relic')!;
    expect(canTurnIn(q.stages, q.stages!.length)).toBe(true);
    expect(canTurnIn(q.stages, q.stages!.length + 1)).toBe(true);
  });

  it('legacy (no stages) is always turn-in-able', () => {
    expect(canTurnIn(undefined, 0)).toBe(true);
    expect(canTurnIn([], 0)).toBe(true);
  });
});
