// engine_Dev — the rubble-puppy window opens at "one boss left" (<= 1 remaining
// kill step) for an uploaded custom main quest, not at full completion. Pure
// coverage of bossStepsRemaining over a representative quest.

import { bossStepsRemaining } from '../app/engine/customMainQuestEngine';
import { setCustomMainQuestOverride, clearAllOverrides } from '../app/engine/contentPack';
import type { PlayerCharacter } from '../app/engine/types';

const QUEST = {
  title: 'The Philadelphia Experiment',
  steps: [
    { id: 's1', action: 'reach', target: 'the docks', locationId: 'pier4' },
    { id: 's2', action: 'kill', target: 'first boss', bossId: 'boss_a', locationId: 'pier4' },
    { id: 's3', action: 'collect', target: 'a relic', locationId: 'lab' },
    { id: 's4', action: 'kill', target: 'second boss', bossId: 'boss_b', locationId: 'lab' },
    { id: 's5', action: 'kill', target: 'final boss', bossId: 'boss_c', locationId: 'bunker' },
    { id: 's6', action: 'return_to', target: 'home', locationId: 'home' },
  ],
};

function playerAtStep(step: number): PlayerCharacter {
  return { factionId: 'someFaction', customQuestStep: step } as unknown as PlayerCharacter;
}

describe('bossStepsRemaining — one-boss-left window', () => {
  beforeEach(() => setCustomMainQuestOverride(QUEST));
  afterEach(() => clearAllOverrides());

  it('counts remaining kill steps from the effective step', () => {
    expect(bossStepsRemaining(playerAtStep(0))).toBe(3); // all three bosses ahead
    expect(bossStepsRemaining(playerAtStep(2))).toBe(2); // on/at 2nd boss step → boss_b, boss_c
    expect(bossStepsRemaining(playerAtStep(4))).toBe(1); // only the final boss left
    expect(bossStepsRemaining(playerAtStep(5))).toBe(0); // final boss killed, only return_to left
    expect(bossStepsRemaining(playerAtStep(6))).toBe(0); // complete
  });

  it('the window (<= 1) opens at the final boss, stays open after', () => {
    const open = (n: number) => (bossStepsRemaining(playerAtStep(n)) ?? 99) <= 1;
    expect(open(0)).toBe(false); // 3 bosses left
    expect(open(2)).toBe(false); // 2 bosses left
    expect(open(4)).toBe(true);  // 1 boss left → OPEN
    expect(open(5)).toBe(true);  // 0 left → still open
  });

  it('faction-gated kill steps do not count', () => {
    setCustomMainQuestOverride({
      title: 'x',
      steps: [
        { id: 'k1', action: 'kill', bossId: 'a', skipForFactions: ['someFaction'] }, // gated OUT
        { id: 'k2', action: 'kill', bossId: 'b' },
      ],
    });
    expect(bossStepsRemaining(playerAtStep(0))).toBe(1); // only the ungated boss counts
  });

  it('returns null when no custom main quest is loaded', () => {
    clearAllOverrides();
    expect(bossStepsRemaining(playerAtStep(0))).toBeNull();
  });
});
