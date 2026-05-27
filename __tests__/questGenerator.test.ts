import { generateQuest, describeQuest } from '../app/engine/questGenerator';
import { emptyMemory } from '../app/engine/worldMemory';

describe('generateQuest', () => {
  it('produces a coherent quest with all four pieces', () => {
    const quest = generateQuest(emptyMemory());
    expect(quest.objective.verb).toBeTruthy();
    expect(quest.objective.target).toBeTruthy();
    expect(quest.location.name).toBeTruthy();
    expect(quest.complication.text).toBeTruthy();
    expect(quest.reward.label).toBeTruthy();
    expect(quest.state).toBe('open');
  });

  it('respects preferred location id when given', () => {
    const quest = generateQuest(emptyMemory(), 'asgardar');
    expect(quest.location.id).toBe('asgardar');
  });

  it('describes itself in one sentence', () => {
    const quest = generateQuest(emptyMemory());
    const desc = describeQuest(quest);
    expect(desc).toContain(quest.objective.verb);
    expect(desc).toContain(quest.location.name);
  });
});
