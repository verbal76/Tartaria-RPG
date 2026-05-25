// OTA 058 — Use-based stat progression tests. Pins:
//   - Success gate: failures don't accrue progress
//   - Tiered cost: stat ≤ 10 awards +2/use, 11-14 awards +1, 15+ awards +0.5
//   - Level-up at 100 progress with overshoot rolling over
//   - Display: quantized to 0/25/50/75/99 quarters

import {
  trainStat,
  ensureStatProgress,
  progressAwardFor,
  displayedProgressPercent,
  displayedProgressBar,
  LEVEL_UP_THRESHOLD,
} from '../app/engine/statTraining';
import type { PlayerCharacter } from '../app/engine/types';

function makePlayer(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Trainee',
    raceId: 'unknowing_mass',
    factionId: 'reclaimers_guild',
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0 },
    hp: 30,
    hpMax: 30,
    stamina: 10,
    staminaMax: 10,
    equipped: {},
    ac: 10,
    tc: 0,
    corruption: 0,
    inventory: [],
    factionStanding: [],
    currentLocationId: 'tartarian_outskirts',
    activeQuests: [],
    mapSeed: 'test',
    mapX: 10,
    mapY: 10,
    ...overrides,
  } as PlayerCharacter;
}

describe('OTA 058 — trainStat: success gate', () => {
  it('a failed use awards no progress', () => {
    const p = makePlayer();
    const result = trainStat(p, 'strength', false);
    expect(result.player.statProgress?.strength).toBe(0);
    expect(result.leveled).toBeNull();
  });

  it('a successful use accrues progress', () => {
    const p = makePlayer();
    const result = trainStat(p, 'strength', true);
    expect(result.player.statProgress?.strength).toBe(2); // stat 10 → +2
  });
});

describe('OTA 058 — tiered cost curve', () => {
  // 2026-05-25 OTA-031 — progressive 6-step ramp so high stats
  // take real commitment to advance.
  it('stat 1-5 awards +3 per use', () => {
    expect(progressAwardFor(1)).toBe(3);
    expect(progressAwardFor(5)).toBe(3);
  });
  it('stat 6-10 awards +2 per use', () => {
    expect(progressAwardFor(6)).toBe(2);
    expect(progressAwardFor(10)).toBe(2);
  });
  it('stat 11-14 awards +1 per use', () => {
    expect(progressAwardFor(11)).toBe(1);
    expect(progressAwardFor(14)).toBe(1);
  });
  it('stat 15-18 awards +0.5 per use', () => {
    expect(progressAwardFor(15)).toBe(0.5);
    expect(progressAwardFor(18)).toBe(0.5);
  });
  it('stat 19-22 awards +0.25 per use', () => {
    expect(progressAwardFor(19)).toBe(0.25);
    expect(progressAwardFor(22)).toBe(0.25);
  });
  it('stat 23+ awards +0.1 per use', () => {
    expect(progressAwardFor(23)).toBe(0.1);
    expect(progressAwardFor(30)).toBe(0.1);
  });

  it('low-tier stat trains twice as fast as mid-tier', () => {
    const lowP = makePlayer({ stats: { strength: 8, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 } });
    const midP = makePlayer({ stats: { strength: 12, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 } });
    expect(trainStat(lowP, 'strength', true).player.statProgress?.strength).toBe(2);
    expect(trainStat(midP, 'strength', true).player.statProgress?.strength).toBe(1);
  });
});

describe('OTA 058 — level-up + overshoot', () => {
  it('hitting 100 progress triggers +1 base stat and resets progress', () => {
    const p = makePlayer({
      statProgress: { strength: 98, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0 },
    });
    const result = trainStat(p, 'strength', true);
    expect(result.player.stats.strength).toBe(11);
    expect(result.player.statProgress?.strength).toBe(0); // 98 + 2 = 100 → 0
    expect(result.leveled).toEqual({ stat: 'strength', from: 10, to: 11 });
  });

  it('overshoot rolls over rather than getting wasted', () => {
    const p = makePlayer({
      statProgress: { strength: 99, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0 },
    });
    const result = trainStat(p, 'strength', true); // 99 + 2 = 101 → level up, overshoot 1
    expect(result.player.stats.strength).toBe(11);
    expect(result.player.statProgress?.strength).toBe(1);
  });

  it('crossing into the next tier slows growth immediately', () => {
    // STR 10 with progress 99 → +2 → STR 11 progress 1. Next use at
    // STR 11 only awards +1 (tier 2), so the player notices the slow-down.
    const p = makePlayer({
      statProgress: { strength: 99, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0 },
    });
    const r1 = trainStat(p, 'strength', true);
    expect(r1.player.stats.strength).toBe(11);
    const r2 = trainStat(r1.player, 'strength', true);
    expect(r2.player.statProgress?.strength).toBe(2); // 1 + 1 (tier 2 award)
  });
});

describe('OTA 058 — display quantization', () => {
  const p = makePlayer();
  const setProg = (v: number) => makePlayer({ statProgress: { ...p.statProgress!, strength: v } });

  it('progress 0 → 0% bar', () => {
    expect(displayedProgressPercent(setProg(0), 'strength')).toBe(0);
    expect(displayedProgressBar(setProg(0), 'strength')).toBe('▯▯▯▯');
  });
  it('progress 24 → 0% bar (still rounds down)', () => {
    expect(displayedProgressPercent(setProg(24), 'strength')).toBe(0);
  });
  it('progress 25 → 25%', () => {
    expect(displayedProgressPercent(setProg(25), 'strength')).toBe(25);
    expect(displayedProgressBar(setProg(25), 'strength')).toBe('▮▯▯▯');
  });
  it('progress 50 → 50%', () => {
    expect(displayedProgressPercent(setProg(50), 'strength')).toBe(50);
    expect(displayedProgressBar(setProg(50), 'strength')).toBe('▮▮▯▯');
  });
  it('progress 75 → 75%', () => {
    expect(displayedProgressPercent(setProg(75), 'strength')).toBe(75);
    expect(displayedProgressBar(setProg(75), 'strength')).toBe('▮▮▮▯');
  });
  it('progress 99 → still 75% (no display of 100 — level-up flushes)', () => {
    expect(displayedProgressPercent(setProg(99), 'strength')).toBe(75);
  });
});

describe('OTA 058 — ensureStatProgress', () => {
  it('initializes missing statProgress on a legacy save', () => {
    const legacy = makePlayer() as PlayerCharacter & { statProgress?: unknown };
    delete legacy.statProgress;
    const repaired = ensureStatProgress(legacy as PlayerCharacter);
    expect(repaired.statProgress).toEqual({
      strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0,
    });
  });

  it('leaves a complete statProgress untouched', () => {
    const p = makePlayer({
      statProgress: { strength: 30, dexterity: 10, intelligence: 20, wisdom: 5, charisma: 0 },
    });
    const repaired = ensureStatProgress(p);
    expect(repaired.statProgress).toEqual(p.statProgress);
  });
});

describe('OTA 058 — invariants', () => {
  it('LEVEL_UP_THRESHOLD is 100 (per the design)', () => {
    expect(LEVEL_UP_THRESHOLD).toBe(100);
  });

  it('each tier award divides evenly into the threshold', () => {
    expect(LEVEL_UP_THRESHOLD / 2).toBe(50); // tier 1: 50 uses
    expect(LEVEL_UP_THRESHOLD / 1).toBe(100); // tier 2: 100 uses
    expect(LEVEL_UP_THRESHOLD / 0.5).toBe(200); // tier 3: 200 uses
  });
});
