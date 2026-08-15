// OTA-976 — STE trains from a cold start. (a) A stat in the 0-2 band earns
// DOUBLE progress per success (+6), so the first stealth points arrive in ~17
// successful uses instead of ~34. (b) Near-miss learning, the LOWER road by
// owner call: only while the stat is <= 5, only a failure within 3 of the DC,
// and only +1 progress — once the needle moves, successes alone carry it.
import {
  progressAwardFor, trainStat, trainStatNearMiss,
  NEAR_MISS_MARGIN, NEAR_MISS_AWARD, NEAR_MISS_MAX_STAT, LEVEL_UP_THRESHOLD,
} from '../app/engine/statTraining';
import type { PlayerCharacter } from '../app/engine/types';

const P = (stealth: number, progress = 0): PlayerCharacter => ({
  stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth },
  statProgress: { strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0, stealth: progress },
} as unknown as PlayerCharacter);

describe('OTA-976 — stealth cold start + near-miss lower road', () => {
  it('(a) the 0-2 band earns double; the rest of the curve is untouched', () => {
    expect(progressAwardFor(0)).toBe(6);
    expect(progressAwardFor(2)).toBe(6);
    expect(progressAwardFor(3)).toBe(3);
    expect(progressAwardFor(5)).toBe(3);
    expect(progressAwardFor(8)).toBe(2);
    expect(progressAwardFor(12)).toBe(1);
    const tr = trainStat(P(0), 'stealth', true);
    expect(tr.player.statProgress?.stealth).toBe(6);
  });

  it('(b) a close miss pays +1 — only in the cold-start band, only within the margin', () => {
    expect(NEAR_MISS_AWARD).toBe(1);
    // missed DC 12 with a 10 → within 3 → +1
    expect(trainStatNearMiss(P(0), 'stealth', 10, 12).player.statProgress?.stealth).toBe(1);
    // missed by exactly the margin → still pays
    expect(trainStatNearMiss(P(0), 'stealth', 9, 9 + NEAR_MISS_MARGIN).player.statProgress?.stealth).toBe(1);
    // blown badly → nothing
    expect(trainStatNearMiss(P(0), 'stealth', 5, 12).player.statProgress?.stealth).toBe(0);
    // actually passed → nothing (success path handles it)
    expect(trainStatNearMiss(P(0), 'stealth', 14, 12).player.statProgress?.stealth).toBe(0);
    // needle has moved past the band → the lower road closes
    expect(trainStatNearMiss(P(NEAR_MISS_MAX_STAT + 1), 'stealth', 10, 12).player.statProgress?.stealth).toBe(0);
  });

  it('(b) near-miss progress can cash the level like any other progress', () => {
    const r = trainStatNearMiss(P(1, LEVEL_UP_THRESHOLD - 1), 'stealth', 10, 12);
    expect(r.leveled?.to).toBe(2);
    expect(r.player.stats.stealth).toBe(2);
  });
});
