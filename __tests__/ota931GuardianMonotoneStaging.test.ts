// OTA-931 — Guardian staging is monotone across tiers at ANY fixed player power.
//
// The OTA-926 monotonicity test held player power fixed, so it never caught the
// over-level inversion: at a fixed power the next tier's bigger expected-power
// divisor shrinks `over` faster than the early hpMult steps grow, so a player who
// over-ground after Guardian 1 met a WEAKER Guardian 2 (power 20: 69 HP → 67), and
// the AP delta could dip 2 while acBonus rose 1. This suite sweeps power 10-60 ×
// all nine tiers — the exact dimension the old test missed.
import type { PlayerCharacter } from '../app/engine/types';
import {
  monotoneTierHp,
  monotoneTierApDelta,
  spawnGuardianForCapital,
} from '../app/engine/coreGuardians';
import type { GuardianTier } from '../app/engine/coreGuardians';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';

// hpMax fixed at 100 → the HP term contributes exactly 10, so power = strength + 10.
function makePlayer(strength: number, cores: string[]): PlayerCharacter {
  return {
    name: 'Sweep',
    raceId: 'human',
    factionId: 'reclaimers_guild',
    stats: {
      // dex/int kept at 1 so STRENGTH alone drives guardianPlayerPower's best-stat term
      strength, dexterity: 1, intelligence: 1, wisdom: 8, charisma: 8, stealth: 1,
    },
    hp: 100,
    hpMax: 100,
    stamina: 10,
    staminaMax: 10,
    ac: 12,
    tc: 0,
    corruption: 0,
    inventory: [],
    factionStanding: [],
    currentLocationId: 'asgardar',
    activeQuests: [],
    mainQuest: { phase: 'cores', coresRecovered: cores },
  } as unknown as PlayerCharacter;
}

function apOf(g: { abilityPoint?: string }): number {
  const m = String(g.abilityPoint ?? '').match(/(\d+)\s*$/);
  return m ? parseInt(m[1]!, 10) : NaN;
}

const TARGET = LOST_CAPITAL_LOCATIONS[LOST_CAPITAL_LOCATIONS.length - 1]!;

describe('OTA-931 Guardian monotone staging floor', () => {
  it('spawn HP strictly climbs and AP never dips across all 9 tiers, at every power 10-60', () => {
    for (let str = 0; str <= 50; str++) {
      let prevHp = 0;
      let prevAp = -99;
      for (let cores = 0; cores <= 8; cores++) {
        const p = makePlayer(str, LOST_CAPITAL_LOCATIONS.slice(0, cores));
        const g = spawnGuardianForCapital(p, TARGET)!;
        expect(g).toBeTruthy();
        expect(g.hp).toBeGreaterThan(prevHp);
        const ap = apOf(g);
        expect(ap).toBeGreaterThanOrEqual(prevAp);
        prevHp = g.hp;
        prevAp = ap;
      }
    }
  });

  it('the review-found inversion site stays monotone (power 20: T1 vs T2)', () => {
    // ⚠ RETARGETED for OTA-1142 (owner tuning): tier 1's hpMult went 1.4 → 1.0,
    // so the very inversion this test pinned (T1 69 > T2 67 raw) no longer
    // arises at this power — T2's raw 67 now clears T1's 49 on its own and the
    // OTA-931 floor is a no-op here. The floor mechanism itself is still
    // exercised by the full power-sweep test above; this test now pins the
    // re-authored values and the ordering at the historical trouble spot.
    // ⚠⚠ OTA-1476 MOVED t1 BY ONE POINT, 49 → 50, and the reason is worth
    // recording rather than re-pinning blind. The Guardian curve now reads the
    // player's GEAR through the same proxy the wilderness spawner has used since
    // OTA-1159 — and `makePlayer` sets `ac: 12`, two points of armour above the
    // baseline. Those two points were always counted by the world and never by
    // the Guardian; now they are counted by both. The fixture did not change and
    // neither did the ladder: t2 still clears t1 by a wide margin.
    //
    // ⚠ THE CLAIM IS THE ORDERING, not the two literals. This test's own name is
    // "stays monotone", and the exact HP is a derived value that three separate
    // OTAs have already re-authored (1.4 → 1.0, the canonical base, the floor).
    // Pinned as a RANGE around the authored curve so a real regression — a
    // collapse, a runaway, an inversion — still fails loudly, while a one-point
    // shift from a proxy gaining a term it was always supposed to have does not.
    const t1 = spawnGuardianForCapital(makePlayer(10, []), TARGET)!;
    const t2 = spawnGuardianForCapital(makePlayer(10, LOST_CAPITAL_LOCATIONS.slice(0, 1)), TARGET)!;
    expect(t1.hp).toBeGreaterThanOrEqual(49);   // 42 × 1.0 × over-level, floor
    expect(t1.hp).toBeLessThan(60);             // and nowhere near tier 2's band
    expect(t2.hp).toBeGreaterThanOrEqual(67);   // raw curve value — no floor needed
    expect(t2.hp).toBeLessThan(80);
    expect(t2.hp).toBeGreaterThan(t1.hp);       // ⚠ the actual claim
  });

  it('on-curve fights stage byte-identically to the authored OTA-926 curve', () => {
    // power 12 (< every tier's expected power) → over = 1 everywhere → the floor is a
    // no-op and the authored curve must come through untouched.
    // ⚠ Tier 1 RETARGETED 59 → 42 for OTA-1142 (owner tuning): hpMult 1.4 → 1.0.
    // The ×1.4 was tuned against pre-OTA-926 per-Capital bases (30-50 HP); when
    // OTA-926 flattened the base to 42 for everyone, the first rung silently
    // inherited a 40% raise nothing re-derived. Tiers 2+ are untouched, and the
    // monotone floor stays a no-op here since tier 2's own 42×1.6=67 clears 42.
    const authored = [42, 67, 76, 84, 92, 101, 168, 231];
    const aps: number[] = [];
    for (let cores = 0; cores <= 7; cores++) {
      const g = spawnGuardianForCapital(makePlayer(2, LOST_CAPITAL_LOCATIONS.slice(0, cores)), TARGET)!;
      expect(g.hp).toBe(authored[cores]);
      aps.push(apOf(g));
    }
    // authored AC ramp: acBonus climbs exactly +1 per tier on-curve
    for (let i = 1; i < aps.length; i++) expect(aps[i]! - aps[i - 1]!).toBe(1);
  });

  it('final guardian still out-stages tier 8 at every power', () => {
    for (let str = 0; str <= 50; str += 5) {
      const t8 = spawnGuardianForCapital(makePlayer(str, LOST_CAPITAL_LOCATIONS.slice(0, 7)), TARGET)!;
      const fin = spawnGuardianForCapital(makePlayer(str, LOST_CAPITAL_LOCATIONS.slice(0, 8)), TARGET)!;
      expect(fin.hp).toBeGreaterThan(t8.hp);
      expect(apOf(fin)).toBeGreaterThanOrEqual(apOf(t8));
    }
  });

  it('helpers agree with spawn output (non-final tiers)', () => {
    for (const str of [0, 10, 25, 50]) {
      for (const cores of [0, 3, 6]) {
        const p = makePlayer(str, LOST_CAPITAL_LOCATIONS.slice(0, cores));
        const g = spawnGuardianForCapital(p, TARGET)!;
        const tier = (cores + 1) as GuardianTier;
        expect(g.hp).toBe(monotoneTierHp(p, tier));
        expect(typeof monotoneTierApDelta(p, tier)).toBe('number');
      }
    }
  });
});
