// OTA-932 — the Power gauge's AC term is the TRIMMED standing AC (the number the
// player sees on the StatsPanel and fights with since OTA-947), not the raw stack.
// Audit finding: powerRating predated the trim and kept quoting raw AC, inflating a
// tank's Power exactly in the regime the rebalance bent down, and skewing the
// favored/even/danger badge (±15% bands) with it.
import { playerPowerScore } from '../app/engine/powerRating';
import { trimStandingAc } from '../app/engine/equipment';
import type { PlayerCharacter } from '../app/engine/types';

const mkPlayer = (ac: number): PlayerCharacter =>
  ({
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 10 },
    ac,
    hpMax: 30,
    inventory: [],
    equipped: {},
  } as unknown as PlayerCharacter);

describe('OTA-932 — Power AC term equals the trimmed (shown/fought) AC', () => {
  // ⚠ OTA-1539 moved the knee 22 -> 16, so the "below the knee" probe moves with
  // it. The SUBJECT is unchanged: the Power gauge must read the same trimmed AC
  // the player is defended at, whatever the curve is.
  it('below the knee nothing changes: +6 raw AC is +6 Power', () => {
    expect(playerPowerScore(mkPlayer(16)) - playerPowerScore(mkPlayer(10))).toBe(6);
  });

  it('above the knee the gauge tracks trimStandingAc exactly (raw 37 scores as 27)', () => {
    expect(trimStandingAc(37)).toBe(27);
    const base = playerPowerScore(mkPlayer(10));
    expect(playerPowerScore(mkPlayer(37)) - base).toBe(trimStandingAc(37) - 10);
  });

  it('Power never decreases as AC climbs through the knee (trim is monotone)', () => {
    let prev = -1;
    for (let ac = 10; ac <= 45; ac++) {
      const p = playerPowerScore(mkPlayer(ac));
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(playerPowerScore(mkPlayer(45))).toBeGreaterThan(playerPowerScore(mkPlayer(30)));
  });
});
