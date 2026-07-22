// OTA-924 — defense de-runaway: AC tail-trim, enemy hit floor, mitigation floor.
import { trimStandingAc } from '../app/engine/equipment';

describe('OTA-924 — AC tail-trim (trimStandingAc)', () => {
  it('leaves AC at or below the knee untouched', () => {
    expect(trimStandingAc(10)).toBe(10);
    expect(trimStandingAc(22)).toBe(22);
  });
  it('bends the tail past the knee (0.4/point)', () => {
    expect(trimStandingAc(27)).toBe(24); // 22 + 5*0.4
    expect(trimStandingAc(32)).toBe(26); // 22 + 10*0.4
    expect(trimStandingAc(37)).toBe(28); // 22 + 15*0.4 = 28
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
