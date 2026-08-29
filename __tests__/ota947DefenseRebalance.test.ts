// OTA-924 — defense de-runaway: AC tail-trim, enemy hit floor, mitigation floor.
import { trimStandingAc } from '../app/engine/equipment';

describe('OTA-924 — AC tail-trim (trimStandingAc)', () => {
  // ⚠ OTA-1539 moved the knee 22 -> 16 and the rate 0.4 -> 0.5: the old knee sat
  // above the whole early and mid game (a player reaches raw 23 on a set of
  // Uncommon armour), so those stages ran on the untrimmed linear part of the
  // curve. 16 is exactly the raw AC of the best Common set, leaving the opening
  // bit-for-bit unchanged. OTA-924's CONTRACT is untouched and still pinned
  // below: at-or-below the knee is identity, past it bends, and it is monotone.
  it('leaves AC at or below the knee untouched', () => {
    expect(trimStandingAc(10)).toBe(10);
    expect(trimStandingAc(16)).toBe(16);
  });
  it('bends the tail past the knee (0.5/point)', () => {
    expect(trimStandingAc(22)).toBe(19); // 16 + 6*0.5
    expect(trimStandingAc(27)).toBe(22); // 16 + 11*0.5 = 21.5 -> 22
    expect(trimStandingAc(32)).toBe(24); // 16 + 16*0.5
    expect(trimStandingAc(38)).toBe(27); // 16 + 22*0.5
  });
  it('is monotonic — more raw AC never means less effective AC', () => {
    let prev = -1;
    for (let a = 0; a <= 45; a++) { const e = trimStandingAc(a); expect(e).toBeGreaterThanOrEqual(prev); prev = e; }
  });
});

describe('OTA-924 — hit floor math (needed-roll cap)', () => {
  // mirrors the combat rule: enemy hits if atkRoll >= clamp(effectiveAc - atkBonus, 2, CAP)
  const CAP = 13;
  const neededNat = (ac: number, atk: number) => Math.max(2, Math.min(CAP, ac - atk));
  const hitPct = (ac: number, atk: number) => (21 - neededNat(ac, atk)) / 20;
  it('caps the needed roll so a maxed AC is never immune (>= ~40%)', () => {
    expect(hitPct(28, 8)).toBeCloseTo(0.40, 2);  // would-be need 20 -> capped 13
    expect(hitPct(37, 7)).toBeCloseTo(0.40, 2);  // would-be need 30 -> capped 13
  });
  it('is the identical AC math below the cap', () => {
    expect(neededNat(15, 4)).toBe(11); // 15-4=11, under cap -> unchanged
  });
});

describe('OTA-924 — mitigation floor math', () => {
  const FLOOR = 0.30;
  const applyFloor = (raw: number, mitigated: number) => Math.max(mitigated, Math.round(raw * FLOOR));
  it('lifts an over-mitigated hit to >= 30% of raw', () => {
    expect(applyFloor(13, 1)).toBe(4);  // ~13 raw crushed to 1 -> floored to 4
    expect(applyFloor(20, 2)).toBe(6);
  });
  it('never lowers a hit that already beat the floor', () => {
    expect(applyFloor(13, 9)).toBe(9);
  });
});
