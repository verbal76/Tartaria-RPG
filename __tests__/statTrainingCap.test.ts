// OTA-800 — hard training ceiling (MAX_TRAINED_STAT = 30) on the player and the
// dog/golem twins. Before this a stat trained forever (0.1/use at the top tier),
// so a patient grind could push a stat into the hundreds and break scaling.

import { trainStat, MAX_TRAINED_STAT } from '../app/engine/statTraining';
import { trainDogStat } from '../app/engine/dogCompanion';
import { trainGolemStat } from '../app/engine/golems';
import type { PlayerCharacter } from '../app/engine/types';

function playerWith(stat: number): PlayerCharacter {
  return {
    stats: { strength: stat, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
    statProgress: { strength: 99, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0, stealth: 0 },
  } as unknown as PlayerCharacter;
}

describe('OTA-800 — player stat cap', () => {
  it('a stat AT the ceiling does not train (no level, no progress churn)', () => {
    const p = playerWith(MAX_TRAINED_STAT);
    const res = trainStat(p, 'strength', true);
    expect(res.leveled).toBeNull();
    expect(res.player.stats.strength).toBe(MAX_TRAINED_STAT);
  });

  it('a stat one BELOW the ceiling can level to it exactly, then stops', () => {
    // 29 trains at 0.1/use (top tier); park progress just under 100 so one use
    // crosses to 30.
    const p = playerWith(MAX_TRAINED_STAT - 1);
    (p.statProgress as Record<string, number>).strength = 99.95;
    const res = trainStat(p, 'strength', true);
    expect(res.player.stats.strength).toBe(MAX_TRAINED_STAT);
    // Leftover progress is flushed at the ceiling — nothing stranded.
    expect(res.player.statProgress?.strength).toBe(0);
    // And a further use no longer trains.
    expect(trainStat(res.player, 'strength', true).leveled).toBeNull();
  });

  it('never overshoots the ceiling even with a huge progress bank', () => {
    const p = playerWith(MAX_TRAINED_STAT - 1);
    // Force an absurd banked progress that could otherwise multi-level.
    (p.statProgress as Record<string, number>).strength = 100000;
    const res = trainStat(p, 'strength', true);
    expect(res.player.stats.strength).toBe(MAX_TRAINED_STAT);
  });
});

describe('OTA-800 — companion stat caps mirror the player', () => {
  it('dog stops training at the ceiling', () => {
    const dog = {
      stats: { strength: 30, dexterity: 5, intelligence: 5 },
      statProgress: { strength: 99, dexterity: 0, intelligence: 0 },
    } as never;
    const res = trainDogStat(dog, 'strength', true);
    expect(res.leveled).toBeNull();
    expect(res.dog.stats.strength).toBe(30);
  });

  it('golem stops training at the ceiling (and stops bumping HP)', () => {
    const golem = {
      hp: 40,
      hpMax: 40,
      stats: { power: 30, resilience: 5 },
      statProgress: { power: 99, resilience: 0 },
    } as never;
    const res = trainGolemStat(golem, 'power', true);
    expect(res.leveled).toBeNull();
    expect(res.golem.stats?.power).toBe(30);
    expect(res.golem.hpMax).toBe(40); // no HP bump at the ceiling
  });
});
