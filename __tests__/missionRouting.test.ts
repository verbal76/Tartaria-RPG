import { missionObjectiveLocationId } from '../app/engine/missionRouting';
import type { FactionQuestDef } from '../app/engine/factionQuests';

const quest = (partial: Partial<FactionQuestDef>): FactionQuestDef => ({
  id: 'x', factionId: 'reclaimers_guild', title: 't', description: 'd', objective: 'o',
  requirement: { rep: 0 }, reward: { tc: 1, rep: 1 },
  ...partial,
} as FactionQuestDef);

describe('missionObjectiveLocationId (Tartaria)', () => {
  it('honors an explicit objectiveLocationId when it is a real location', () => {
    expect(missionObjectiveLocationId(quest({ objectiveLocationId: 'asgardar' }))).toBe('asgardar');
  });

  it('ignores an explicit id that is not a real location', () => {
    expect(missionObjectiveLocationId(quest({ objectiveLocationId: 'nowhere_at_all' }))).toBeNull();
  });

  it('derives a location named in the objective text', () => {
    expect(missionObjectiveLocationId(quest({ objective: 'Defeat the warden at Asgardar.' }))).toBe('asgardar');
  });

  it('returns null for a gather quest that names no location (routes to turn-in)', () => {
    expect(missionObjectiveLocationId(quest({ objective: 'Gather 3 Scrap Metal, then turn it in at the board.' }))).toBeNull();
    expect(missionObjectiveLocationId(null)).toBeNull();
  });
});
