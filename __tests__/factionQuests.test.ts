import {
  FACTION_QUESTS,
  availableFactionQuests,
  fuzzyFindFactionQuest,
  findFactionQuestById,
} from '../app/engine/factionQuests';

describe('faction quests', () => {
  it('exposes the data file as a non-empty list', () => {
    expect(FACTION_QUESTS.length).toBeGreaterThan(0);
    for (const q of FACTION_QUESTS) {
      expect(q.id).toBeTruthy();
      expect(q.factionId).toBeTruthy();
      expect(q.title).toBeTruthy();
      expect(q.requirement.rep).toBeGreaterThanOrEqual(0);
      expect(q.reward.tc).toBeGreaterThan(0);
    }
  });

  it('filters out quests the player has already accepted or completed', () => {
    const factionId = FACTION_QUESTS[0]!.factionId;
    const all = FACTION_QUESTS.filter((q) => q.factionId === factionId);
    expect(all.length).toBeGreaterThan(0);
    const oneTaken = all[0]!.id;
    const remaining = availableFactionQuests(factionId, 999, [oneTaken], []);
    expect(remaining.find((q) => q.id === oneTaken)).toBeUndefined();
  });

  it('respects rep requirements', () => {
    const repHard = FACTION_QUESTS.find((q) => q.requirement.rep > 0);
    if (!repHard) return; // data may not include one — skip
    const factionId = repHard.factionId;
    const lockedAt = availableFactionQuests(factionId, repHard.requirement.rep - 1, [], []);
    const unlocked = availableFactionQuests(factionId, repHard.requirement.rep, [], []);
    expect(lockedAt.find((q) => q.id === repHard.id)).toBeUndefined();
    expect(unlocked.find((q) => q.id === repHard.id)).toBeDefined();
  });

  it('fuzzy-matches a quest by partial title', () => {
    const q = FACTION_QUESTS[0]!;
    const found = fuzzyFindFactionQuest(q.title.split(' ')[0]!, FACTION_QUESTS);
    expect(found).not.toBeNull();
  });

  it('findFactionQuestById round-trips', () => {
    const q = FACTION_QUESTS[0]!;
    expect(findFactionQuestById(q.id)?.id).toBe(q.id);
    expect(findFactionQuestById('does_not_exist')).toBeNull();
  });
});
