// #6 — stealth scales with day/night (playtest: "does stealth scale up at night,
// down in the day?"). The modifier is +1 at night (evening + night, 18:00–06:00)
// and −1 during the day (morning + afternoon, 06:00–18:00). It's applied to the
// pickpocket / sleight-of-hand check AND — as of this OTA — the in-combat stealth
// opener + reset, so every stealth roll moves the same way with the clock.

import { stealthTimeBonus, encounterRateMultiplier } from '../app/engine/timeOfDay';

// hoursElapsed → hour-of-day = hoursElapsed % 24.
const at = (hourOfDay: number, day = 3) => day * 24 + hourOfDay;

describe('#6 — stealthTimeBonus (day/night)', () => {
  it('is +1 through the night window (18:00–05:59)', () => {
    expect(stealthTimeBonus(at(18))).toBe(1); // dusk
    expect(stealthTimeBonus(at(22))).toBe(1); // deep night
    expect(stealthTimeBonus(at(0))).toBe(1);  // midnight
    expect(stealthTimeBonus(at(5))).toBe(1);  // pre-dawn
  });

  it('is −1 through the day window (06:00–17:59)', () => {
    expect(stealthTimeBonus(at(6))).toBe(-1);  // dawn
    expect(stealthTimeBonus(at(9))).toBe(-1);  // morning
    expect(stealthTimeBonus(at(12))).toBe(-1); // noon
    expect(stealthTimeBonus(at(17))).toBe(-1); // late afternoon
  });

  it('returns 0 defensively when the clock is unknown', () => {
    expect(stealthTimeBonus(undefined)).toBe(0);
  });

  it('the same day/night split drives encounter danger (night riskier)', () => {
    expect(encounterRateMultiplier(at(22))).toBeGreaterThan(1); // night = more danger
    expect(encounterRateMultiplier(at(12))).toBeLessThan(1);    // day = quieter
  });
});
