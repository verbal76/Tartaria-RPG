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
  it('every quest is a staged quest (>=2 beats), a fetch quest, or an escort', () => {
    for (const q of FACTION_QUESTS) {
      // OTA-962 — ESCORT contracts are the third kind: no stages, no fetch — the
      // journey IS the objective (deliver the party alive to turn in).
      if (q.escort || /_escort$/.test(q.id)) {
        expect((q.escort?.label ?? '').length).toBeGreaterThan(0);
        expect(q.escort?.count ?? 2).toBeGreaterThanOrEqual(1);
        expect(q.escort?.count ?? 2).toBeLessThanOrEqual(5);
        continue;
      }
      // OTA-450 — the generic per-faction STARTER quests carry no stages; the
      // `fetch` requirement IS their objective (gather N, bring them back).
      if (q.fetch) {
        expect(q.fetch.itemName).toBeTruthy();
        expect(q.fetch.quantity).toBeGreaterThan(0);
        continue;
      }
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

describe('faction quest stage advanceOn gating (batch D)', () => {
  // QA finding: 4-stage pilgrimage auto-completed on 3 generic
  // kills because every stage advanced on any trigger.
  it('every shipped stage declares an advanceOn trigger', () => {
    // OTA-1594 widened the vocabulary with 'steal': "Pinch from the Monarchs"
    // shipped with 'any' on both stages and completed, on device, without a
    // single theft. The pin keeps its job — every stage declares — while
    // admitting the new trigger.
    for (const q of FACTION_QUESTS) {
      for (const s of q.stages ?? []) {
        expect(['kill', 'travel', 'steal', 'any']).toContain(s.advanceOn);
      }
    }
  });

  it('pilgrimage (travel-themed) advances only on travel', () => {
    const q = findFactionQuestById('fq_tartarians_pilgrimage');
    expect(q?.stages?.every((s) => s.advanceOn === 'travel')).toBe(true);
  });

  it('silence-a-rediscoverer (combat-themed) advances only on kill', () => {
    const q = findFactionQuestById('fq_monarchs_silence');
    expect(q?.stages?.every((s) => s.advanceOn === 'kill')).toBe(true);
  });

  it('field-a-scholar advances only on travel', () => {
    const q = findFactionQuestById('fq_order_field');
    expect(q?.stages?.every((s) => s.advanceOn === 'travel')).toBe(true);
  });

  it('cut-down-a-rare-beast advances only on kill', () => {
    const q = findFactionQuestById('fq_tartarians_giant');
    expect(q?.stages?.every((s) => s.advanceOn === 'kill')).toBe(true);
  });
});
