// HANDOFF #14b — verify buildCombatSteps assigns rollMode on the
// attack step when the player has aiming / surprised statuses, and
// leaves it undefined for the neutral case. The dice-roller UI
// consumes rollMode to render the 2-die keep-best / keep-worst flow.

import { buildCombatSteps } from '../app/engine/combatRules';
import type { PlayerCharacter, Enemy, StatusEffect } from '../app/engine/types';

function makePlayer(effects: StatusEffect[] = []): PlayerCharacter {
  return {
    name: 'Test',
    raceId: 'human_drifter',
    factionId: null,
    classId: null,
    hp: 20,
    maxHp: 20,
    stamina: 10,
    maxStamina: 10,
    ac: 10,
    tc: 0,
    level: 1,
    xp: 0,
    stats: { strength: 10, dexterity: 12, intelligence: 10, wisdom: 10, charisma: 10, constitution: 10 },
    inventory: [],
    equipped: {},
    activeQuests: [],
    completedQuests: [],
    factionStanding: {},
    statusEffects: effects,
    currentLocationId: 'tartarian_outskirts',
    activeFactionQuestIds: [],
    completedFactionQuestIds: [],
    activeHunts: [],
    completedHuntIds: [],
    activeMysteries: [],
    completedMysteryIds: [],
    activeStorylines: [],
    completedStorylineIds: [],
    mapX: 4,
    mapY: 4,
  } as unknown as PlayerCharacter;
}

const goblin: Enemy = {
  name: 'Mud Goblin',
  type: 'mud',
  abilityPoint: 'str',
  attack: '2',
  damage: '1d4',
  hp: 10,
  rarity: 'Common',
  loot: [],
};

function findAttackStep(player: PlayerCharacter) {
  const steps = buildCombatSteps('attack the goblin', player, goblin);
  const step = steps.find((s) => s.id === 'attack');
  if (!step) throw new Error('attack step missing');
  return step;
}

describe('buildCombatSteps — attack-side rollMode', () => {
  it('omits rollMode when no relevant status is active', () => {
    const step = findAttackStep(makePlayer());
    expect(step.rollMode).toBeUndefined();
  });

  it('sets advantage when the player is aiming', () => {
    const step = findAttackStep(makePlayer([{ kind: 'aiming', remainingRounds: 1, label: 'aiming' }]));
    expect(step.rollMode).toBe('advantage');
    expect(step.rollModeLabel).toBe('aiming');
  });

  it('sets disadvantage when the player is surprised', () => {
    const step = findAttackStep(makePlayer([{ kind: 'surprised', remainingRounds: 1, label: 'surprised' }]));
    expect(step.rollMode).toBe('disadvantage');
    expect(step.rollModeLabel).toBe('surprised');
  });

  it('cancels out when aiming and surprised both fire', () => {
    const step = findAttackStep(
      makePlayer([
        { kind: 'aiming', remainingRounds: 1, label: 'aiming' },
        { kind: 'surprised', remainingRounds: 1, label: 'surprised' },
      ]),
    );
    expect(step.rollMode).toBeUndefined();
  });

  it('ignores expired aiming (remainingRounds 0)', () => {
    const step = findAttackStep(makePlayer([{ kind: 'aiming', remainingRounds: 0, label: 'aiming' }]));
    expect(step.rollMode).toBeUndefined();
  });
});
